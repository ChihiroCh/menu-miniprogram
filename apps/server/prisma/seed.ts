import 'dotenv/config';
import { PrismaClient, Prisma, type Dish } from '@prisma/client';
import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getConfig } from '../src/config.js';
import { emptyMeals, type Meals } from '../src/domain.js';

const config = getConfig();
if (!config.devLogin || config.production || config.storage !== 'local') throw new Error('示例数据仅允许在开启 DEV_LOGIN 的本地存储开发环境导入');
const db = new PrismaClient();
try {
  const owner = await db.user.upsert({ where: { devKey: '小满' }, update: {}, create: { name: '小满', devKey: '小满' } });
  const member = await db.user.upsert({ where: { devKey: '阿远' }, update: {}, create: { name: '阿远', devKey: '阿远' } });
  const family = await db.family.upsert({ where: { id: 'demo-family' }, update: {}, create: { id: 'demo-family', name: '林间小家' } });
  await db.membership.upsert({ where: { familyId_userId: { familyId: family.id, userId: owner.id } }, update: {}, create: { familyId: family.id, userId: owner.id, role: 'OWNER' } });
  await db.membership.upsert({ where: { familyId_userId: { familyId: family.id, userId: member.id } }, update: {}, create: { familyId: family.id, userId: member.id, role: 'MEMBER' } });
  const categories: Record<string, string> = {};
  for (const name of ['家常菜', '蔬菜', '汤羹', '主食']) categories[name] = (await db.category.upsert({ where: { familyId_name: { familyId: family.id, name } }, update: {}, create: { familyId: family.id, name } })).id;
  const recipes = [
    { key: 'tomato', name: '番茄炒蛋', category: '家常菜', notes: '酸甜开胃，是家里最熟悉的味道。', ingredients: [{ name: '番茄', amount: '2 个' }, { name: '鸡蛋', amount: '3 个' }, { name: '盐、食用油', amount: '适量' }], steps: ['番茄切块，鸡蛋加少许盐打散。', '热锅下油，将蛋液炒至凝固后盛出。', '炒软番茄，加入鸡蛋翻炒均匀，调味即可。'] },
    { key: 'greens', name: '蒜蓉时蔬', category: '蔬菜', notes: '清爽脆嫩，给餐桌添一点绿色。', ingredients: [{ name: '当季青菜', amount: '300 克' }, { name: '蒜', amount: '3 瓣' }], steps: ['青菜洗净沥干，蒜切末。', '热油爆香蒜末，下青菜大火翻炒。', '加入少许盐，炒至断生后装盘。'] },
    { key: 'soup', name: '玉米菌菇汤', category: '汤羹', notes: '咕嘟一锅鲜甜，喝完胃里暖暖的。', ingredients: [{ name: '玉米', amount: '1 根' }, { name: '鲜菌菇', amount: '200 克' }, { name: '水', amount: '800 毫升' }], steps: ['玉米切段，菌菇洗净。', '锅中加水，放入玉米煮 15 分钟。', '加入菌菇继续煮 8 分钟，按喜好加盐。'] },
    { key: 'rice', name: '缤纷蛋炒饭', category: '主食', notes: '一碗有颜色的满足，也可以是元气早餐。', ingredients: [{ name: '米饭', amount: '2 碗' }, { name: '鸡蛋', amount: '2 个' }, { name: '胡萝卜、豌豆', amount: '各 50 克' }], steps: ['将胡萝卜切丁，鸡蛋打散。', '先炒熟蛋液，再下蔬菜丁翻炒。', '加入米饭炒散，调味后出锅。'] },
    { key: 'chicken', name: '家常宫保鸡丁', category: '家常菜', notes: '鸡丁鲜嫩，花生酥香，记得多煮一点饭。', ingredients: [{ name: '鸡腿肉', amount: '300 克' }, { name: '花生', amount: '50 克' }, { name: '葱、酱油、醋', amount: '适量' }], steps: ['鸡肉切丁，用少量酱油和淀粉腌制。', '热锅炒熟鸡丁，加入葱段和调味汁。', '加入熟花生炒匀，及时出锅。'] },
    { key: 'tofu', name: '香煎豆腐', category: '家常菜', notes: '外皮微焦、里面柔软的家常小菜。', ingredients: [{ name: '北豆腐', amount: '1 块' }, { name: '酱油、葱花', amount: '适量' }], steps: ['豆腐切厚片，吸干表面水分。', '平底锅放少许油，煎至两面金黄。', '淋入少量酱油，撒上葱花。'] }
  ];
  await mkdir(config.uploadDir, { recursive: true });
  const dishes: Dish[] = [];
  for (const recipe of recipes) {
    await copyFile(fileURLToPath(new URL(`./assets/${recipe.key}.png`, import.meta.url)), path.join(config.uploadDir, `demo-${recipe.key}.png`));
    const { key, category, ...data } = recipe;
    dishes.push(await db.dish.upsert({ where: { id: `demo-${key}` }, update: {}, create: { id: `demo-${key}`, ...data, familyId: family.id, categoryId: categories[category], available: key !== 'tofu', image: `${config.apiUrl}/uploads/demo-${key}.png` } }));
  }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const meal = (indexes: number[]) => indexes.map(i => { const d = dishes[i]; return { dishId: d.id, name: d.name, image: d.image, notes: d.notes, ingredients: d.ingredients, steps: d.steps }; });
  const meals = emptyMeals();
  meals.breakfast.dishes = meal([3]) as Meals['breakfast']['dishes'];
  meals.lunch.dishes = meal([0, 1]) as Meals['lunch']['dishes']; meals.lunch.notes = '番茄炒蛋少放糖，青菜清淡一点。';
  meals.dinner.dishes = meal([4, 2]) as Meals['dinner']['dishes']; meals.dinner.notes = '等家人回来，一起开饭。';
  await db.dailyPlan.upsert({ where: { familyId_date: { familyId: family.id, date: today } }, update: {}, create: { familyId: family.id, date: today, meals: meals as unknown as Prisma.InputJsonValue, updatedBy: owner.id } });
  console.log('示例厨房已就绪。开发登录：小满（所有者）、阿远（成员）。');
} finally { await db.$disconnect(); }
