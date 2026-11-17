import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';
import path from 'node:path';

test('HTTP 安全边界无需数据库也能验证', async t => {
  // Any database access makes this suite fail. Auth failures must be handled before data access.
  const db = new Proxy({}, { get(_target, key) { throw new Error(`Unexpected database access: ${String(key)}`); } }) as PrismaClient;
  const app = await createApp({ db, config: { production: false, devLogin: false, webUrl: 'http://localhost:5173', apiUrl: 'http://localhost:3000', storage: 'local', uploadDir: path.resolve('.local/http-test-uploads') } });
  try {
    await t.test('未登录不能读取或更改家庭数据', async () => {
      for (const [method, url] of [['GET', '/api/families'], ['GET', '/api/me'], ['POST', '/api/families'], ['PUT', '/api/families/foreign/plans/2026-11-17'], ['POST', '/api/families/foreign/images']] as const) {
        const response = await app.inject({ method, url }); assert.equal(response.statusCode, 401, response.body);
      }
    });
    await t.test('关闭开发模式后不能模拟登录', async () => {
      const response = await app.inject({ method: 'POST', url: '/api/auth/dev', payload: { name: 'admin' } });
      assert.equal(response.statusCode, 404); assert.equal(response.json().message, '接口不存在');
      assert.equal((await app.inject('/api/auth/config')).json().devLogin, false);
    });
    await t.test('跨来源写请求被拒绝', async () => {
      const response = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { origin: 'https://evil.example' } });
      assert.equal(response.statusCode, 403);
      const allowed = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { origin: 'http://localhost:5173' } });
      assert.equal(allowed.statusCode, 200);
    });
    await t.test('微信回调缺失或不匹配的 state 被拒绝', async () => {
      const url = `/api/auth/wechat/callback?code=test&state=${'a'.repeat(48)}`;
      assert.equal((await app.inject(url)).statusCode, 400);
      assert.equal((await app.inject({ url, headers: { cookie: `wechat_state=${'b'.repeat(48)}` } })).statusCode, 400);
    });
    await t.test('异常不会向客户端泄露内部数据或堆栈', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/me', headers: { authorization: 'Bearer token' } });
      assert.equal(response.statusCode, 500); assert.deepEqual(response.json(), { message: '服务暂时不可用，请稍后重试' });
    });
    await t.test('登录入口具有独立限流', async () => {
      let status = 0;
      for (let i = 0; i < 21; i++) status = (await app.inject({ method: 'POST', url: '/api/auth/dev', payload: { name: 'x' } })).statusCode;
      assert.equal(status, 429);
    });
  } finally { await app.close(); }
});
