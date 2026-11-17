export type Role = 'OWNER' | 'ADMIN' | 'MEMBER';
export interface Family { id: string; name: string; role: Role }
export interface Ingredient { name: string; amount: string }
export interface Recipe { name: string; image: string; notes: string; ingredients: Ingredient[]; steps: string[] }
export interface Dish extends Recipe { id: string; available: boolean; categoryId: string | null; category?: { id: string; name: string } }
export interface Snapshot extends Recipe { dishId: string }
export type MealKey = 'breakfast' | 'lunch' | 'dinner';
export const mealKeys: MealKey[] = ['breakfast', 'lunch', 'dinner'];
export const mealLabels: Record<MealKey, string> = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' };
export interface Plan { date: string; version: number; meals: Record<MealKey, { dishes: Snapshot[]; notes: string }>; availability: Record<string, boolean> }
export const emptyPlan = (date: string): Plan => ({ date, version: 0, availability: {}, meals: { breakfast: { dishes: [], notes: '' }, lunch: { dishes: [], notes: '' }, dinner: { dishes: [], notes: '' } } });
export function today() { return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10); }
export function addDays(value: string, count: number) { const d = new Date(`${value}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + count); return d.toISOString().slice(0, 10); }
export function weekFor(value: string) { const weekday = new Date(`${value}T12:00:00Z`).getUTCDay(); const monday = addDays(value, -(weekday === 0 ? 6 : weekday - 1)); return Array.from({ length: 7 }, (_, i) => addDays(monday, i)); }
