import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMeals, dateSchema, emptyMeals, mealsSchema, requireRole } from '../src/domain.js';
import { imageExtension } from '../src/storage.js';
import { getConfig } from '../src/config.js';

test('日期校验拒绝不存在的日期，支持闰日', () => {
  assert.equal(dateSchema.parse('2028-02-29'), '2028-02-29');
  for (const invalid of ['2026-02-29', '2026-13-01', '2026-04-31', '26-01-01']) assert.equal(dateSchema.safeParse(invalid).success, false);
});
test('每餐不允许重复菜品', () => {
  assert.equal(mealsSchema.safeParse({ breakfast: { dishIds: ['a', 'a'] }, lunch: { dishIds: [] }, dinner: { dishIds: [] } }).success, false);
});
test('快照保留原有菜谱；下架菜不能新增到其他餐次', () => {
  const old = emptyMeals();
  old.lunch.dishes.push({ dishId: 'a', name: '原菜名', image: '', notes: '', ingredients: [{ name: '鸡蛋', amount: '2 个' }], steps: ['原做法'] });
  const input = mealsSchema.parse({ breakfast: { dishIds: [] }, lunch: { dishIds: ['a'] }, dinner: { dishIds: [] } });
  const result = buildMeals(input, old, [{ id: 'a', name: '新菜名', available: false }]);
  assert.equal(result.lunch.dishes[0].name, '原菜名');
  assert.deepEqual(result.lunch.dishes[0].steps, ['原做法']);
  input.dinner.dishIds = ['a'];
  assert.throws(() => buildMeals(input, old, [{ id: 'a', available: false }]), /下架/);
});
test('家庭角色不能越权', () => {
  assert.throws(() => requireRole(undefined, ['OWNER']), /不是/);
  assert.throws(() => requireRole('MEMBER', ['OWNER', 'ADMIN']), /权限/);
  assert.doesNotThrow(() => requireRole('ADMIN', ['OWNER', 'ADMIN']));
});
test('上传检查真实文件签名，拒绝 HTML 和 SVG', () => {
  assert.equal(imageExtension(Buffer.from([255, 216, 255, 224])), 'jpg');
  assert.throws(() => imageExtension(Buffer.from('<svg></svg>')), /仅支持/);
  assert.throws(() => imageExtension(Buffer.from('<html>hello</html>')), /仅支持/);
});
test('生产环境强制禁用模拟登录', () => {
  const oldNode = process.env.NODE_ENV; const oldDev = process.env.DEV_LOGIN;
  try { process.env.NODE_ENV = 'production'; process.env.DEV_LOGIN = 'true'; assert.throws(() => getConfig(), /禁止/); }
  finally { if (oldNode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldNode; if (oldDev === undefined) delete process.env.DEV_LOGIN; else process.env.DEV_LOGIN = oldDev; }
});
