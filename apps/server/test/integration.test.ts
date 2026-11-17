import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';
import { emptyMeals } from '../src/domain.js';
import path from 'node:path';

test('真实 PostgreSQL API 集成测试', { skip: !process.env.TEST_DATABASE_URL ? '设置 TEST_DATABASE_URL 后运行数据库集成测试' : false }, async t => {
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const app = await createApp({ db, config: { production: false, devLogin: true, webUrl: 'http://localhost:5173', apiUrl: 'http://localhost:3000', storage: 'local', uploadDir: path.resolve('.local/test-uploads') } });
  const prefix = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const familyIds: string[] = [];
  const req = async (token: string, method: any, url: string, payload?: any) => app.inject({ method, url: `/api${url}`, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });
  const login = async (name: string) => { const r = await req('', 'POST', '/auth/dev', { name: `${prefix}-${name}`, mini: true }); assert.equal(r.statusCode, 200, r.body); return r.json(); };
  try {
    const owner = await login('owner'); const other = await login('other'); const member = await login('member');
    const family = (await req(owner.token, 'POST', '/families', { name: `${prefix}-A` })).json(); familyIds.push(family.id);
    const second = (await req(other.token, 'POST', '/families', { name: `${prefix}-B` })).json(); familyIds.push(second.id);
    const base = `/families/${family.id}`;
    let invitation: any;
    let dish: any;
    const meal = (ids: string[] = []) => ({ breakfast: { dishIds: [], notes: '' }, lunch: { dishIds: ids, notes: '少盐' }, dinner: { dishIds: [], notes: '' } });
    const date = '2026-11-17';
    await t.test('匿名访问和跨家庭访问被拒绝', async () => {
      assert.equal((await req('', 'GET', '/families')).statusCode, 401);
      for (const suffix of ['/members', '/categories', '/dishes?status=all', `/plans/${date}`, `/plans?from=${date}&to=${date}`, '/invites']) assert.equal((await req(other.token, 'GET', base + suffix)).statusCode, 403, suffix);
      assert.equal((await req(other.token, 'POST', base + '/dishes', { name: '越权菜品' })).statusCode, 403);
      assert.equal((await req(owner.token, 'DELETE', base + `/members/${owner.user.id}`)).statusCode, 400);
    });
    await t.test('邀请加入幂等，普通成员不能提升权限或管理菜品', async () => {
      invitation = (await req(owner.token, 'POST', base + '/invites')).json();
      assert.ok(new Date(invitation.expiresAt).valueOf() > Date.now() + 6 * 86400000);
      for (let i = 0; i < 2; i++) assert.equal((await req(member.token, 'POST', '/invites/join', { code: invitation.code })).statusCode, 200);
      assert.equal(await db.membership.count({ where: { familyId: family.id, userId: member.user.id } }), 1);
      assert.equal((await req(member.token, 'PATCH', base + `/members/${member.user.id}`, { role: 'ADMIN' })).statusCode, 403);
      assert.equal((await req(member.token, 'POST', base + '/dishes', { name: '越权菜品' })).statusCode, 403);
      assert.equal((await req(member.token, 'POST', base + '/categories', { name: '越权分类' })).statusCode, 403);
      assert.equal((await req(member.token, 'POST', base + '/invites')).statusCode, 403);
    });
    await t.test('创建菜品默认下架，不能绑定其他家庭分类', async () => {
      const categories = (await req(other.token, 'GET', `/families/${second.id}/categories`)).json();
      assert.equal((await req(owner.token, 'POST', base + '/dishes', { name: '错误分类', categoryId: categories[0].id })).statusCode, 400);
      const response = await req(owner.token, 'POST', base + '/dishes', { name: '番茄炒蛋', ingredients: [{ name: '鸡蛋', amount: '2 个' }], steps: ['炒鸡蛋', '加入番茄'] });
      assert.equal(response.statusCode, 200, response.body); dish = response.json(); assert.equal(dish.available, false);
      assert.equal((await req(member.token, 'GET', base + '/dishes?status=all')).json().length, 0);
      assert.equal((await req(member.token, 'PUT', base + `/plans/${date}`, { version: 0, meals: meal([dish.id]) })).statusCode, 400);
      assert.equal((await req(owner.token, 'PATCH', base + `/dishes/${dish.id}/status`, { available: true })).statusCode, 200);
      assert.equal((await req(member.token, 'GET', base + '/dishes?status=all')).json().length, 1);
    });
    await t.test('计划持久化、菜谱快照及下架状态正确', async () => {
      const save = await req(member.token, 'PUT', base + `/plans/${date}`, { version: 0, meals: meal([dish.id]) });
      assert.equal(save.statusCode, 200, save.body); assert.equal(save.json().version, 1);
      assert.equal((await req(owner.token, 'PUT', base + `/dishes/${dish.id}`, { name: '新名字', ingredients: [], steps: ['新步骤'] })).statusCode, 200);
      await req(owner.token, 'PATCH', base + `/dishes/${dish.id}/status`, { available: false });
      const loaded = (await req(member.token, 'GET', base + `/plans/${date}`)).json();
      assert.equal(loaded.meals.lunch.dishes[0].name, '番茄炒蛋'); assert.deepEqual(loaded.meals.lunch.dishes[0].steps, ['炒鸡蛋', '加入番茄']);
      assert.equal(loaded.availability[dish.id], false);
      assert.equal((await req(member.token, 'PUT', base + `/plans/${date}`, { version: 1, meals: meal([dish.id]) })).statusCode, 200);
      assert.equal((await req(member.token, 'PUT', base + '/plans/2026-11-18', { version: 0, meals: meal([dish.id]) })).statusCode, 400);
    });
    await t.test('并发写入仅一个成功，过期版本不能覆盖', async () => {
      const results = await Promise.all([req(member.token, 'PUT', base + `/plans/${date}`, { version: 2, meals: meal([dish.id]) }), req(owner.token, 'PUT', base + `/plans/${date}`, { version: 2, meals: meal([dish.id]) })]);
      assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 409]);
      assert.equal((await req(member.token, 'PUT', base + `/plans/${date}`, { version: 1, meals: meal([]) })).statusCode, 409);
    });
    await t.test('复制保留快照，覆盖必须确认且校验目标版本', async () => {
      const source = (await req(member.token, 'GET', base + `/plans/${date}`)).json();
      const body = { targetDate: '2026-11-19', targetVersion: 0, sourceVersion: source.version, overwrite: false };
      const copy = await req(member.token, 'POST', base + `/plans/${date}/copy`, body);
      assert.equal(copy.statusCode, 200, copy.body); assert.equal(copy.json().meals.lunch.dishes[0].name, '番茄炒蛋');
      assert.equal((await req(member.token, 'POST', base + `/plans/${date}/copy`, { ...body, targetVersion: 1 })).statusCode, 409);
      assert.equal((await req(member.token, 'POST', base + `/plans/${date}/copy`, { ...body, targetVersion: 0, overwrite: true })).statusCode, 409);
      assert.equal((await req(member.token, 'POST', base + `/plans/${date}/copy`, { ...body, targetVersion: 1, overwrite: true })).statusCode, 200);
    });
    await t.test('无效日期、重复菜品及跨家庭菜品被拒绝', async () => {
      assert.equal((await req(member.token, 'GET', base + '/plans/2026-02-30')).statusCode, 400);
      assert.equal((await req(member.token, 'GET', base + '/plans?from=2026-01-01&to=2026-12-31')).statusCode, 400);
      assert.equal((await req(member.token, 'PUT', base + '/plans/2026-11-20', { version: 0, meals: meal([dish.id, dish.id]) })).statusCode, 400);
      const foreign = (await req(other.token, 'POST', `/families/${second.id}/dishes`, { name: '其他家庭的菜' })).json();
      await req(other.token, 'PATCH', `/families/${second.id}/dishes/${foreign.id}/status`, { available: true });
      assert.equal((await req(member.token, 'PUT', base + '/plans/2026-11-20', { version: 0, meals: meal([foreign.id]) })).statusCode, 400);
      assert.equal((await req(owner.token, 'PATCH', base + `/dishes/${foreign.id}/status`, { available: false })).statusCode, 404);
    });
    await t.test('图片上传校验和权限', async () => {
      const boundary = 'test-boundary';
      const multipart = (bytes: Buffer, type: string) => Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.png"\r\nContent-Type: ${type}\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]);
      const send = (token: string, bytes: Buffer, type: string) => app.inject({ method: 'POST', url: `/api${base}/images`, headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: multipart(bytes, type) });
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZxkAAAAASUVORK5CYII=', 'base64');
      const result = await send(owner.token, png, 'image/png'); assert.equal(result.statusCode, 200, result.body); assert.match(result.json().url, /\.png$/);
      assert.equal((await send(member.token, png, 'image/png')).statusCode, 403);
      assert.equal((await send(owner.token, Buffer.from('<html>bad</html>'), 'image/png')).statusCode, 400);
      assert.equal((await send(owner.token, Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png')).statusCode, 413);
    });
    await t.test('管理员授予撤销、邀请失效及成员移除', async () => {
      assert.equal((await req(owner.token, 'PATCH', base + `/members/${member.user.id}`, { role: 'ADMIN' })).statusCode, 200);
      assert.equal((await req(member.token, 'POST', base + '/categories', { name: '新分类' })).statusCode, 200);
      assert.equal((await req(member.token, 'PATCH', base + `/members/${owner.user.id}`, { role: 'MEMBER' })).statusCode, 403);
      await req(owner.token, 'PATCH', base + `/members/${member.user.id}`, { role: 'MEMBER' });
      assert.equal((await req(member.token, 'POST', base + '/categories', { name: '不能创建' })).statusCode, 403);
      await req(owner.token, 'DELETE', base + `/invites/${invitation.id}`);
      assert.equal((await req(other.token, 'POST', '/invites/join', { code: invitation.code })).statusCode, 400);
      const expired = await db.invite.create({ data: { familyId: family.id, code: `${prefix}-expired`, expiresAt: new Date(Date.now() - 1000) } });
      assert.equal((await req(other.token, 'POST', '/invites/join', { code: expired.code })).statusCode, 400);
      assert.equal((await req(owner.token, 'DELETE', base + `/members/${member.user.id}`)).statusCode, 200);
      assert.equal((await req(member.token, 'GET', base + '/dishes')).statusCode, 403);
    });
    await t.test('网页 Cookie 会话、来源检查、退出后令牌失效', async () => {
      const web = await req('', 'POST', '/auth/dev', { name: `${prefix}-web`, mini: false });
      assert.equal(web.json().token, undefined);
      const cookie = web.headers['set-cookie'] as string; assert.match(cookie, /HttpOnly/i);
      const cookieHeader = cookie.split(';')[0];
      assert.equal((await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: cookieHeader } })).statusCode, 200);
      assert.equal((await app.inject({ method: 'POST', url: '/api/families', headers: { cookie: cookieHeader, origin: 'https://evil.example' }, payload: { name: '不允许' } })).statusCode, 403);
      await req(owner.token, 'POST', '/auth/logout');
      assert.equal((await req(owner.token, 'GET', '/me')).statusCode, 401);
    });
  } finally {
    await db.family.deleteMany({ where: { id: { in: familyIds } } });
    await db.user.deleteMany({ where: { devKey: { startsWith: prefix } } });
    await app.close(); await db.$disconnect();
  }
});
