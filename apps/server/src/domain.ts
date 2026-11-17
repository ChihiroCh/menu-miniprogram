import { z } from 'zod';

export class AppError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}
export const fail = (status: number, message: string): never => { throw new AppError(status, message); };
export const nameSchema = z.string().trim().min(1).max(60);
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
}, '日期无效');
export const ingredientSchema = z.object({ name: nameSchema, amount: z.string().trim().max(60) });
export const dishSchema = z.object({
  name: nameSchema, categoryId: z.string().min(1).nullable().default(null),
  image: z.union([z.literal(''), z.string().url().max(2000)]).default(''),
  notes: z.string().trim().max(2000).default(''),
  ingredients: z.array(ingredientSchema).max(60).default([]),
  steps: z.array(z.string().trim().min(1).max(2000)).max(40).default([])
});
export const mealKeys = ['breakfast', 'lunch', 'dinner'] as const;
export const mealInput = z.object({ dishIds: z.array(z.string().min(1)).max(30).refine(v => new Set(v).size === v.length, '同一餐不能重复添加菜品'), notes: z.string().max(1000).default('') });
export const mealsSchema = z.object({ breakfast: mealInput, lunch: mealInput, dinner: mealInput });
export type Snapshot = { dishId: string; name: string; image: string; notes: string; ingredients: { name: string; amount: string }[]; steps: string[] };
export type Meals = Record<typeof mealKeys[number], { dishes: Snapshot[]; notes: string }>;
export const emptyMeals = (): Meals => ({ breakfast: { dishes: [], notes: '' }, lunch: { dishes: [], notes: '' }, dinner: { dishes: [], notes: '' } });
export function buildMeals(input: z.infer<typeof mealsSchema>, old: Meals, dishes: any[]): Meals {
  const result = emptyMeals();
  for (const key of mealKeys) {
    result[key].notes = input[key].notes;
    result[key].dishes = input[key].dishIds.map(id => {
      // Only snapshots already in this meal can be retained without checking current availability.
      const existing = old[key].dishes.find(d => d.dishId === id);
      if (existing) return existing;
      const dish = dishes.find(d => d.id === id);
      if (!dish || !dish.available) return fail(400, '部分菜品已下架或不属于当前家庭，请刷新菜品列表');
      return { dishId: dish.id, name: dish.name, image: dish.image, notes: dish.notes, ingredients: dish.ingredients, steps: dish.steps };
    });
  }
  return result;
}
export function requireRole(role: string | undefined, allowed: string[]) {
  if (!role) fail(403, '你不是该家庭的成员');
  if (!allowed.includes(role!)) fail(403, '没有操作权限');
}
