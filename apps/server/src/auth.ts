import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { Config } from './config.js';
import { fail, nameSchema } from './domain.js';

declare module 'fastify' { interface FastifyRequest { userId: string } }
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const cookieName = 'menu_session';
export async function registerAuth(app: FastifyInstance, db: PrismaClient, config: Config) {
  app.decorateRequest('userId', '');
  app.addHook('onRequest', async (req) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin && req.headers.origin !== new URL(config.webUrl).origin) fail(403, '请求来源不受信任');
    if (!req.url.startsWith('/api/') || req.url.startsWith('/api/auth/') || req.url.split('?')[0] === '/api/health') return;
    const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    const token = bearer || req.cookies[cookieName];
    if (!token || token.length > 256) fail(401, '请先登录');
    const session = await db.session.findUnique({ where: { tokenHash: hash(token!) } });
    if (!session || session.expiresAt < new Date()) fail(401, '登录已过期，请重新登录');
    req.userId = session!.userId;
  });
  const issue = async (userId: string, reply: FastifyReply, mini: boolean) => {
    const token = randomBytes(32).toString('base64url');
    await db.session.create({ data: { userId, tokenHash: hash(token), expiresAt: new Date(Date.now() + 30 * 86400000) } });
    if (!mini) reply.setCookie(cookieName, token, { httpOnly: true, secure: config.production, sameSite: 'lax', path: '/', maxAge: 30 * 86400 });
    const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true } });
    return { user, ...(mini ? { token } : {}) };
  };
  app.get('/api/auth/config', async () => ({ devLogin: config.devLogin, webWechat: Boolean(process.env.WECHAT_WEB_APP_ID && process.env.WECHAT_WEB_SECRET), miniWechat: Boolean(process.env.WECHAT_MINI_APP_ID && process.env.WECHAT_MINI_SECRET) }));
  app.post('/api/auth/dev', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    if (!config.devLogin) fail(404, '接口不存在');
    const body = z.object({ name: nameSchema, mini: z.boolean().default(false) }).parse(req.body);
    const user = await db.user.upsert({ where: { devKey: body.name }, create: { devKey: body.name, name: body.name }, update: {} });
    return issue(user.id, reply, body.mini);
  });
  const exchange = async (url: URL) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return fail(502, '微信服务暂时不可用');
    const data = await response.json() as Record<string, any>;
    if (data.errcode || !data.unionid) fail(400, '微信身份关联未完成，请检查应用是否绑定同一开放平台及 UnionID 获取条件');
    return data.unionid as string;
  };
  const wechatUser = async (unionId: string) => db.user.upsert({ where: { unionId }, create: { unionId, name: '微信用户' }, update: {} });
  app.post('/api/auth/wechat/mini', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { code } = z.object({ code: z.string().min(1).max(512) }).parse(req.body);
    if (!process.env.WECHAT_MINI_APP_ID || !process.env.WECHAT_MINI_SECRET) fail(503, '小程序微信登录尚未配置');
    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.search = new URLSearchParams({ appid: process.env.WECHAT_MINI_APP_ID!, secret: process.env.WECHAT_MINI_SECRET!, js_code: code, grant_type: 'authorization_code' }).toString();
    const user = await wechatUser(await exchange(url));
    return issue(user.id, reply, true);
  });
  app.get('/api/auth/wechat/web', async (_req, reply) => {
    if (!process.env.WECHAT_WEB_APP_ID || !process.env.WECHAT_WEB_SECRET) fail(503, '网页微信扫码登录尚未配置');
    const state = randomBytes(24).toString('hex');
    reply.setCookie('wechat_state', state, { httpOnly: true, secure: config.production, sameSite: 'lax', path: '/api/auth/wechat/callback', maxAge: 600 });
    const url = new URL('https://open.weixin.qq.com/connect/qrconnect');
    url.search = new URLSearchParams({ appid: process.env.WECHAT_WEB_APP_ID!, redirect_uri: process.env.WECHAT_CALLBACK_URL || `${config.apiUrl}/api/auth/wechat/callback`, response_type: 'code', scope: 'snsapi_login', state }).toString();
    return reply.redirect(url.toString() + '#wechat_redirect');
  });
  app.get('/api/auth/wechat/callback', async (req, reply) => {
    const { code, state } = z.object({ code: z.string().min(1).max(512), state: z.string().length(48) }).parse(req.query);
    const expected = req.cookies.wechat_state;
    reply.clearCookie('wechat_state', { path: '/api/auth/wechat/callback' });
    if (!expected || expected.length !== state.length || !timingSafeEqual(Buffer.from(state), Buffer.from(expected))) fail(400, '登录校验失败，请重新扫码');
    if (!process.env.WECHAT_WEB_APP_ID || !process.env.WECHAT_WEB_SECRET) fail(503, '网页微信登录尚未配置');
    const url = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
    url.search = new URLSearchParams({ appid: process.env.WECHAT_WEB_APP_ID!, secret: process.env.WECHAT_WEB_SECRET!, code, grant_type: 'authorization_code' }).toString();
    const user = await wechatUser(await exchange(url));
    await issue(user.id, reply, false);
    return reply.redirect(config.webUrl);
  });
  // /auth/ routes bypass the normal auth hook; logout resolves and revokes its session explicitly.
  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1] || req.cookies[cookieName];
    if (token) await db.session.deleteMany({ where: { tokenHash: hash(token) } });
    reply.clearCookie(cookieName, { path: '/' });
    return { ok: true };
  });
}
