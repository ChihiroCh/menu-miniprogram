import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { getConfig, type Config } from './config.js';
import { registerAuth } from './auth.js';
import { AppError, fail, requireRole, nameSchema, dishSchema, dateSchema, mealsSchema, emptyMeals, buildMeals, type Meals } from './domain.js';
import { saveImage } from './storage.js';

const allRoles = ['OWNER', 'ADMIN', 'MEMBER'];
const managers = ['OWNER', 'ADMIN'];
const paramsOf = (value: unknown) => z.object({ familyId: z.string().min(1), id: z.string().optional(), date: dateSchema.optional() }).parse(value);
const json = (data: unknown) => data as Prisma.InputJsonValue;
export async function createApp(options: { db?: PrismaClient; config?: Config; logger?: boolean } = {}) {
  const db = options.db || new PrismaClient();
  const config = options.config || getConfig();
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 256 * 1024 });
  await app.register(cookie);
  await app.register(cors, { origin: new URL(config.webUrl).origin, credentials: true });
  await app.register(rateLimit, { max: 240, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2 } });
  if (config.storage === 'local') {
    await mkdir(config.uploadDir, { recursive: true });
    app.get('/uploads/:filename', async (req, reply) => {
      const { filename } = z.object({ filename: z.string().regex(/^[a-zA-Z0-9-]+\.(png|jpg|webp)$/) }).parse(req.params);
      let bytes: Buffer;
      try { bytes = await readFile(path.join(config.uploadDir, filename)); }
      catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return reply.code(404).send({ message: '图片不存在' }); throw e; }
      return reply.header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'public, max-age=86400').type(filename.endsWith('.jpg') ? 'image/jpeg' : filename.endsWith('.png') ? 'image/png' : 'image/webp').send(bytes);
    });
  }
  await registerAuth(app, db, config);
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof z.ZodError) return reply.code(400).send({ message: error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('；') });
    if (error instanceof AppError) return reply.code(error.statusCode).send({ message: error.message });
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (['P2002', 'P2034'].includes(error.code)) return reply.code(409).send({ message: '数据已变化或名称重复，请刷新后重试' });
      if (error.code === 'P2025') return reply.code(404).send({ message: '内容不存在或已移除' });
    }
    const status = (error as any).statusCode;
    if (status && status >= 400 && status < 500) return reply.code(status).send({ message: status === 413 ? '图片不能超过 5MB' : (error as Error).message });
    reqLog(error);
    return reply.code(500).send({ message: '服务暂时不可用，请稍后重试' });
  });
  function reqLog(error: unknown) { app.log.error(error); }
  async function member(familyId: string, userId: string, roles = allRoles) {
    const membership = await db.membership.findUnique({ where: { familyId_userId: { familyId, userId } } });
    requireRole(membership?.role, roles);
    return membership!;
  }
  app.get('/api/health', async (_req, reply) => {
    try { await db.$queryRaw`SELECT 1`; return { ok: true }; }
    catch { return reply.code(503).send({ ok: false }); }
  });
  app.get('/api/me', async req => db.user.findUniqueOrThrow({ where: { id: req.userId }, select: { id: true, name: true } }));
  app.patch('/api/me', async req => {
    const { name } = z.object({ name: nameSchema }).parse(req.body);
    return db.user.update({ where: { id: req.userId }, data: { name }, select: { id: true, name: true } });
  });
  app.get('/api/families', async req => {
    const rows = await db.membership.findMany({ where: { userId: req.userId }, include: { family: true }, orderBy: { family: { createdAt: 'asc' } } });
    return rows.map(row => ({ ...row.family, role: row.role }));
  });
  app.post('/api/families', async req => {
    const { name } = z.object({ name: nameSchema }).parse(req.body);
    return db.family.create({ data: { name, memberships: { create: { userId: req.userId, role: 'OWNER' } }, categories: { create: ['家常菜', '蔬菜', '汤羹', '主食'].map(name => ({ name })) } } });
  });
  app.post('/api/invites/join', async req => {
    const { code } = z.object({ code: z.string().trim().min(1).max(100) }).parse(req.body);
    return db.$transaction(async tx => {
      const invite = await tx.invite.findUnique({ where: { code } });
      if (!invite || invite.revokedAt || invite.expiresAt <= new Date()) fail(400, '邀请码无效、已撤销或已过期');
      await tx.membership.upsert({ where: { familyId_userId: { familyId: invite!.familyId, userId: req.userId } }, create: { familyId: invite!.familyId, userId: req.userId }, update: {} });
      return { familyId: invite!.familyId };
    }, { isolationLevel: 'Serializable' });
  });
  app.get('/api/families/:familyId/members', async req => {
    const { familyId } = paramsOf(req.params); await member(familyId, req.userId);
    return db.membership.findMany({ where: { familyId }, select: { role: true, userId: true, user: { select: { id: true, name: true } } }, orderBy: { role: 'asc' } });
  });
  app.patch('/api/families/:familyId/members/:id', async req => {
    const { familyId, id } = paramsOf(req.params); await member(familyId, req.userId, ['OWNER']);
    const { role } = z.object({ role: z.enum(['ADMIN', 'MEMBER']) }).parse(req.body);
    const result = await db.membership.updateMany({ where: { familyId, userId: id!, role: { not: 'OWNER' } }, data: { role } });
    if (!result.count) fail(400, '成员不存在或不能修改所有者权限');
    return { ok: true };
  });
  app.delete('/api/families/:familyId/members/:id', async req => {
    const { familyId, id } = paramsOf(req.params);
    await member(familyId, req.userId, id === req.userId ? allRoles : ['OWNER']);
    const result = await db.membership.deleteMany({ where: { familyId, userId: id!, role: { not: 'OWNER' } } });
    if (!result.count) fail(400, '成员不存在，或所有者不能退出家庭');
    return { ok: true };
  });
  app.get('/api/families/:familyId/invites', async req => {
    const { familyId } = paramsOf(req.params); await member(familyId, req.userId, managers);
    return db.invite.findMany({ where: { familyId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
  });
  app.post('/api/families/:familyId/invites', async req => {
    const { familyId } = paramsOf(req.params); await member(familyId, req.userId, managers);
    return db.invite.create({ data: { familyId, code: randomBytes(9).toString('base64url'), expiresAt: new Date(Date.now() + 7 * 86400000) } });
  });
  app.delete('/api/families/:familyId/invites/:id', async req => {
    const { familyId, id } = paramsOf(req.params); await member(familyId, req.userId, managers);
    const result = await db.invite.updateMany({ where: { familyId, id }, data: { revokedAt: new Date() } });
    if (!result.count) fail(404, '邀请不存在');
    return { ok: true };
  });
  app.get('/api/families/:familyId/categories', async req => {
    const { familyId } = paramsOf(req.params); await member(familyId, req.userId);
    return db.category.findMany({ where: { familyId }, orderBy: { name: 'asc' } });
  });
  app.post('/api/families/:familyId/categories', async req => {
    const { familyId } = paramsOf(req.params); await member(familyId, req.userId, managers);
    const { name } = z.object({ name: nameSchema }).parse(req.body);
    return db.category.create({ data: { familyId, name } });
  });
  app.patch('/api/families/:familyId/categories/:id', async req => {
    const { familyId, id } = paramsOf(req.params); await member(familyId, req.userId, managers);
    const { name } = z.object({ name: nameSchema }).parse(req.body);
    const result = await db.category.updateMany({ where: { id, familyId }, data: { name } });
    if (!result.count) fail(404, '分类不存在');
    return { ok: true };
  });
  app.delete('/api/families/:familyId/categories/:id', async req => {
    const { familyId, id } = paramsOf(req.params); await member(familyId, req.userId, managers);
    const result = await db.category.deleteMany({ where: { id, familyId } });
    if (!result.count) fail(404, '分类不存在');
    return { ok: true };
  });
  app.get('/api/families/:familyId/dishes', async req => {
    const { familyId } = paramsOf(req.params); const membership = await member(familyId, req.userId);
    const query = z.object({ search: z.string().max(60).optional(), categoryId: z.string().optional(), status: z.enum(['all', 'available', 'unavailable']).default('available') }).parse(req.query);
    const available = membership.role === 'MEMBER' ? true : query.status === 'all' ? undefined : query.status === 'available';
    return db.dish.findMany({ where: { familyId, available, ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}), ...(query.categoryId ? { categoryId: query.categoryId } : {}) }, include: { category: true }, orderBy: { createdAt: 'desc' } });
  });
  async function checkCategory(familyId: string, id: string | null) {
    if (id && !await db.category.findFirst({ where: { id, familyId } })) fail(400, '分类不属于当前家庭');
  }
  app.post('/api/families/:familyId/dishes', async req => {
    const { familyId } = paramsOf(req.params); await member(familyId, req.userId, managers);
    const data = dishSchema.parse(req.body); await checkCategory(familyId, data.categoryId);
    return db.dish.create({ data: { ...data, familyId, available: false } });
  });
  app.put('/api/families/:familyId/dishes/:id', async req => {
    const { familyId, id } = paramsOf(req.params); await member(familyId, req.userId, managers);
    const data = dishSchema.parse(req.body); await checkCategory(familyId, data.categoryId);
    const result = await db.dish.updateMany({ where: { familyId, id }, data });
    if (!result.count) fail(404, '菜品不存在');
    return db.dish.findUniqueOrThrow({ where: { id } });
  });
  app.patch('/api/families/:familyId/dishes/:id/status', async req => {
    const { familyId, id } = paramsOf(req.params); await member(familyId, req.userId, managers);
    const { available } = z.object({ available: z.boolean() }).parse(req.body);
    const result = await db.dish.updateMany({ where: { familyId, id }, data: { available } });
    if (!result.count) fail(404, '菜品不存在');
    return { ok: true };
  });
  app.post('/api/families/:familyId/images', async req => {
    const { familyId } = paramsOf(req.params); await member(familyId, req.userId, managers);
    const file = await req.file();
    if (!file) fail(400, '请选择图片');
    const bytes = await file!.toBuffer();
    if (file!.file.truncated || bytes.length > 5 * 1024 * 1024) fail(413, '图片不能超过 5MB');
    return { url: await saveImage(bytes, config) };
  });
  app.get('/api/families/:familyId/plans', async req => {
    const { familyId } = paramsOf(req.params); await member(familyId, req.userId);
    const { from, to } = z.object({ from: dateSchema, to: dateSchema }).parse(req.query);
    if (to < from || new Date(to).valueOf() - new Date(from).valueOf() > 31 * 86400000) fail(400, '查询范围不得超过 31 天');
    return db.dailyPlan.findMany({ where: { familyId, date: { gte: from, lte: to } }, orderBy: { date: 'asc' } });
  });
  async function enrichPlan(plan: any) {
    const meals = plan.meals as Meals;
    const ids = Object.values(meals).flatMap(m => m.dishes.map(d => d.dishId));
    const dishes = await db.dish.findMany({ where: { familyId: plan.familyId, id: { in: ids } }, select: { id: true, available: true } });
    const availability = Object.fromEntries(dishes.map(d => [d.id, d.available]));
    return { ...plan, availability };
  }
  app.get('/api/families/:familyId/plans/:date', async req => {
    const { familyId, date } = paramsOf(req.params); await member(familyId, req.userId);
    const plan = await db.dailyPlan.findUnique({ where: { familyId_date: { familyId, date: date! } } });
    return enrichPlan(plan || { familyId, date, version: 0, meals: emptyMeals() });
  });
  app.put('/api/families/:familyId/plans/:date', async req => {
    const { familyId, date } = paramsOf(req.params); await member(familyId, req.userId);
    const input = z.object({ version: z.number().int().min(0), meals: mealsSchema }).parse(req.body);
    const plan = await db.$transaction(async tx => {
      const old = await tx.dailyPlan.findUnique({ where: { familyId_date: { familyId, date: date! } } });
      if ((old?.version || 0) !== input.version) fail(409, '家人刚刚修改了这天的菜单，请刷新后重新编辑');
      const ids = Object.values(input.meals).flatMap(m => m.dishIds);
      const dishes = await tx.dish.findMany({ where: { familyId, id: { in: ids } } });
      const meals = json(buildMeals(input.meals, old ? old.meals as Meals : emptyMeals(), dishes));
      if (!old) return tx.dailyPlan.create({ data: { familyId, date: date!, meals, updatedBy: req.userId } });
      const updated = await tx.dailyPlan.updateMany({ where: { id: old.id, version: input.version }, data: { meals, version: { increment: 1 }, updatedBy: req.userId } });
      if (!updated.count) fail(409, '菜单已更新，请刷新');
      return tx.dailyPlan.findUniqueOrThrow({ where: { id: old.id } });
    }, { isolationLevel: 'Serializable' });
    return enrichPlan(plan);
  });
  app.post('/api/families/:familyId/plans/:date/copy', async req => {
    const { familyId, date } = paramsOf(req.params); await member(familyId, req.userId);
    const { targetDate, targetVersion, overwrite, sourceVersion } = z.object({ targetDate: dateSchema, targetVersion: z.number().int().min(0), sourceVersion: z.number().int().positive(), overwrite: z.boolean().default(false) }).parse(req.body);
    if (date === targetDate) fail(400, '请选择其他日期');
    return db.$transaction(async tx => {
      const source = await tx.dailyPlan.findUnique({ where: { familyId_date: { familyId, date: date! } } });
      if (!source) fail(404, '当天还没有已保存的菜单');
      if (source!.version !== sourceVersion) fail(409, '来源菜单已变化，请刷新');
      const target = await tx.dailyPlan.findUnique({ where: { familyId_date: { familyId, date: targetDate } } });
      if ((target?.version || 0) !== targetVersion) fail(409, '目标日期的菜单已变化，请重新确认');
      if (target && !overwrite) fail(409, '目标日期已有菜单，请确认覆盖');
      if (!target) return tx.dailyPlan.create({ data: { familyId, date: targetDate, meals: json(source!.meals), updatedBy: req.userId } });
      const updated = await tx.dailyPlan.updateMany({ where: { id: target.id, version: targetVersion }, data: { meals: json(source!.meals), version: { increment: 1 }, updatedBy: req.userId } });
      if (!updated.count) fail(409, '目标菜单已变化，请刷新');
      return tx.dailyPlan.findUniqueOrThrow({ where: { id: target.id } });
    }, { isolationLevel: 'Serializable' });
  });
  app.addHook('onClose', async () => { if (!options.db) await db.$disconnect(); });
  return app;
}
