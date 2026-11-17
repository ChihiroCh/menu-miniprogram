<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue';
import { api, notify, confirm } from '../api';
import { today, addDays, weekFor, emptyPlan, mealKeys, mealLabels, type Plan, type Family, type Dish, type MealKey, type Recipe } from '../types';
import RecipeDetail from './RecipeDetail.vue';
const props = defineProps<{ family: Family }>();
const emit = defineEmits<{ browse: []; dirty: [value: boolean] }>();
const date = ref(today());
const week = computed(() => weekFor(date.value));
const plan = ref<Plan>(emptyPlan(date.value));
const summaries = ref<any[]>([]);
const dishes = ref<Dish[]>([]);
const busy = ref(false);
const loading = ref(true);
const error = ref('');
const dirty = ref(false);
watch(dirty, value => emit('dirty', value));
const conflict = ref(false);
const pickerMeal = ref<MealKey | null>(null);
const search = ref('');
const pickedIds = ref<string[]>([]);
const recipe = ref<Recipe | null>(null);
const copying = ref(false);
const copyDate = ref(addDays(date.value, 1));
const filteredDishes = computed(() => dishes.value.filter(d => d.name.includes(search.value)));
const total = computed(() => mealKeys.reduce((n, key) => n + plan.value.meals[key].dishes.length, 0));
const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const monthTitle = computed(() => `${Number(date.value.slice(0, 4))} 年 ${Number(date.value.slice(5, 7))} 月`);
const dateTitle = computed(() => `${Number(date.value.slice(5, 7))} 月 ${Number(date.value.slice(8))} 日`);
const weekCount = computed(() => new Set([...summaries.value.filter(p => p.date !== date.value && mealKeys.some(k => p.meals[k].dishes.length)).map(p => p.date), ...(total.value ? [date.value] : [])]).size);
let generation = 0;
async function load() {
  const current = ++generation; loading.value = true; error.value = ''; pickerMeal.value = null;
  try {
    const [next, list] = await Promise.all([api<Plan>(`/families/${props.family.id}/plans/${date.value}`), api<any[]>(`/families/${props.family.id}/plans?from=${week.value[0]}&to=${week.value[6]}`)]);
    if (current !== generation) return;
    plan.value = next; summaries.value = list; dirty.value = false; conflict.value = false;
  } catch (e) { if (current === generation) error.value = (e as Error).message; }
  finally { if (current === generation) loading.value = false; }
}
async function navigate(next: string) {
  if (busy.value || loading.value || next === date.value) return;
  if (dirty.value && !await confirm('当前菜单尚未保存，切换日期将放弃这些修改。')) return;
  date.value = next; await load();
}
async function refresh() { if (dirty.value && !await confirm('重新加载将放弃当前未保存的修改，是否继续？')) return; await load(); }
async function save() {
  if (busy.value || loading.value || conflict.value) return;
  busy.value = true;
  try {
    const meals = Object.fromEntries(mealKeys.map(k => [k, { dishIds: plan.value.meals[k].dishes.map(d => d.dishId), notes: plan.value.meals[k].notes }]));
    plan.value = await api(`/families/${props.family.id}/plans/${date.value}`, 'PUT', { version: plan.value.version, meals });
    dirty.value = false;
    summaries.value = [...summaries.value.filter(p => p.date !== date.value), plan.value];
    notify('当天菜单已保存，家人也能看见啦');
  } catch (e) { if ((e as any).status === 409) conflict.value = true; notify((e as Error).message); }
  finally { busy.value = false; }
}
async function openPicker(key: MealKey) {
  if (busy.value) return; busy.value = true;
  try { dishes.value = await api(`/families/${props.family.id}/dishes?status=available`); pickerMeal.value = key; search.value = ''; pickedIds.value = []; }
  catch (e) { notify((e as Error).message); } finally { busy.value = false; }
}
function toggle(id: string) { pickedIds.value = pickedIds.value.includes(id) ? pickedIds.value.filter(v => v !== id) : [...pickedIds.value, id]; }
function alreadyAdded(id: string) { return pickerMeal.value ? plan.value.meals[pickerMeal.value].dishes.some(d => d.dishId === id) : false; }
function addPicked() {
  if (!pickerMeal.value) return;
  for (const dish of dishes.value.filter(d => pickedIds.value.includes(d.id))) {
    if (!alreadyAdded(dish.id)) { const { id, name, image, notes, ingredients, steps } = dish; plan.value.meals[pickerMeal.value].dishes.push({ dishId: id, name, image, notes, ingredients, steps }); plan.value.availability[id] = true; }
  }
  if (pickedIds.value.length) dirty.value = true; pickerMeal.value = null;
}
function remove(key: MealKey, id: string) { plan.value.meals[key].dishes = plan.value.meals[key].dishes.filter(d => d.dishId !== id); dirty.value = true; }
async function openCopy() {
  if (dirty.value) { notify('请先保存当前菜单，再复制到其他日期'); return; }
  if (!plan.value.version) { notify('请先安排并保存当天菜单'); return; }
  copyDate.value = addDays(date.value, 1); copying.value = true;
}
async function copy() {
  if (busy.value) return;
  if (copyDate.value === date.value) return notify('请选择其他日期');
  busy.value = true;
  try {
    const target = await api<Plan>(`/families/${props.family.id}/plans/${copyDate.value}`);
    if (target.version && !await confirm(`${copyDate.value} 已有菜单，确定用当前菜单覆盖吗？`, '覆盖目标菜单')) return;
    await api(`/families/${props.family.id}/plans/${date.value}/copy`, 'POST', { targetDate: copyDate.value, targetVersion: target.version, sourceVersion: plan.value.version, overwrite: target.version > 0 });
    copying.value = false; date.value = copyDate.value; await load(); notify('菜单已复制');
  } catch (e) { notify((e as Error).message); } finally { busy.value = false; }
}
function hasPlan(day: string) { if (day === date.value) return total.value > 0; return summaries.value.some(p => p.date === day && mealKeys.some(k => p.meals[k].dishes.length)); }
onMounted(load);
</script>

<template>
  <view class="page-heading"><view><view class="eyebrow">OUR EVERYDAY TABLE</view><view class="page-title">把每一餐，安排成期待<text class="title-leaf">✳</text></view><view class="subtitle">和家人一起，认真计划生活里的小美好。</view></view><view class="heading-actions"><button class="btn secondary" :disabled="busy || loading" @click="openCopy">▣ &nbsp;复制当天</button><button class="btn primary" :loading="busy" :disabled="busy || loading || !!error || conflict || !dirty" @click="save">{{ dirty ? '保存菜单' : '✓ 已同步' }}</button></view></view>
  <view class="plan-layout"><view class="plan-main">
    <view class="week-card"><view class="week-toolbar"><view class="section-title">{{ monthTitle }}</view><view class="week-controls"><button class="icon-button" :disabled="loading || busy" @click="navigate(addDays(date, -7))">‹</button><button class="today-button" :disabled="loading || busy" @click="navigate(today())">本周</button><button class="icon-button" :disabled="loading || busy" @click="navigate(addDays(date, 7))">›</button></view></view><view class="week-days"><view v-for="(day, i) in week" :key="day" :class="['day-cell', { selected: day === date, 'is-today': day === today() }]" @click="navigate(day)"><text class="weekday-label">{{ days[i] }}</text><text class="day-number">{{ Number(day.slice(8)) }}</text><view :class="['day-indicator', { filled: hasPlan(day) }]"/><text v-if="day === today()" class="today-label">今天</text></view></view></view>
    <view class="day-heading"><view class="section-title">{{ dateTitle }}<text class="day-heading-sub">的三餐</text></view><view class="small-label">{{ total }} 道菜 · {{ dirty ? '尚未保存' : '与家人共享' }}</view></view>
    <view v-if="loading" class="loading-card">正在准备餐桌…</view>
    <view v-else-if="error" class="error-card"><text>{{ error }}</text><button class="btn secondary small" @click="load">重新加载</button></view>
    <template v-else>
      <view v-if="conflict" class="error-card"><text>家人更新了这份菜单。请重新加载后再编辑。</text><button class="btn secondary small" @click="refresh">重新加载</button></view>
      <view v-for="(key, index) in mealKeys" :key="key" class="meal-card"><view class="meal-header"><view class="meal-heading"><view :class="['meal-symbol', key]">{{ ['☀', '◒', '☾'][index] }}</view><view><view class="meal-title">{{ mealLabels[key] }}<text class="meal-en">{{ ['BREAKFAST', 'LUNCH', 'DINNER'][index] }}</text></view><text class="helper">{{ ['唤醒一天的好心情', '忙里偷闲，好好吃饭', '一桌热饭，等家人回家'][index] }}</text></view></view><button class="add-meal" :disabled="busy || conflict" @click="openPicker(key)">＋ <text>添加菜品</text></button></view>
        <view v-if="!plan.meals[key].dishes.length" class="empty-meal" @click="!conflict && openPicker(key)"><view class="empty-plate">＋</view><view><text>今天的{{ mealLabels[key] }}，想吃点什么？</text><view class="helper">从家人的拿手菜里挑几道吧</view></view></view>
        <view v-else class="planned-dishes"><view v-for="dish in plan.meals[key].dishes" :key="dish.dishId" class="planned-dish"><image v-if="dish.image" :src="dish.image" mode="aspectFill" @click="recipe = dish"/><view v-else class="dish-placeholder compact" @click="recipe = dish">食</view><view class="planned-info" @click="recipe = dish"><view class="dish-name">{{ dish.name }}</view><text v-if="plan.availability[dish.dishId] !== true" class="status-tag off">已下架 · 保留菜谱</text><text v-else class="helper">查看食材与做法 ↗</text></view><button class="icon-button remove-button" :disabled="busy || conflict" @click="remove(key, dish.dishId)">×</button></view></view>
        <view class="meal-notes"><text class="notes-icon">✎</text><input v-model="plan.meals[key].notes" :disabled="busy || conflict" maxlength="1000" placeholder="留个小备注，比如：少放辣椒、晚点开饭…" @input="dirty = true"/></view>
      </view>
      <view v-if="dirty" class="save-reminder"><text>有新的安排，记得保存给家人看。</text><button class="btn primary small" :disabled="busy || conflict" @click="save">保存菜单</button></view>
    </template>
  </view>
  <view class="plan-sidebar"><view class="weekly-note"><text class="eyebrow">LITTLE MOMENTS</text><view class="note-title">生活的答案，<br/>藏在一日三餐里。</view><view class="note-decoration">♧</view><text class="note-bottom">吃得用心，日子就有滋味。</text></view><view class="side-card"><view class="small-label">本周的小计划</view><view class="stat-number">{{ weekCount }}<text>/ 7 天</text></view><view class="progress-track"><view :style="{ width: `${weekCount / 7 * 100}%` }"/></view><text class="helper">提前想好，做饭时就从容一点。</text></view><view class="side-card pantry-teaser" @click="$emit('browse')"><view class="section-title">家里的拿手菜 <text>↗</text></view><text class="helper">去菜品库找一点灵感</text><view class="pantry-art">🥬 <text>🍅</text> 🥕</view></view><view class="sidebar-tip">✳ 菜单由全家共同编辑。保存后，家人在另一端也能看到。</view></view></view>

  <view v-if="pickerMeal" class="modal-backdrop"><view class="modal"><view class="modal-header"><view><text class="eyebrow">PICK SOMETHING DELICIOUS</text><view class="section-title">给{{ mealLabels[pickerMeal] }}加点好味道</view></view><button class="icon-button" @click="pickerMeal = null">×</button></view><view class="modal-search"><input v-model="search" class="field" placeholder="搜索家人的拿手菜…"/></view><scroll-view scroll-y class="modal-scroll"><view v-if="!filteredDishes.length" class="empty-state">{{ search ? '没有找到这道菜，换个名字试试' : '还没有上架的菜品，请管理员先添加并上架' }}</view><view v-for="dish in filteredDishes" :key="dish.id" :class="['pick-dish', { picked: pickedIds.includes(dish.id), disabled: alreadyAdded(dish.id) }]" @click="!alreadyAdded(dish.id) && toggle(dish.id)"><image v-if="dish.image" :src="dish.image" mode="aspectFill"/><view v-else class="dish-placeholder compact">食</view><view class="pick-dish-info"><view class="dish-name">{{ dish.name }}</view><text class="helper">{{ dish.category?.name || '家常味道' }}</text></view><text class="pick-check">{{ alreadyAdded(dish.id) ? '已添加' : pickedIds.includes(dish.id) ? '✓' : '＋' }}</text></view></scroll-view><view class="modal-footer"><text class="helper">已选 {{ pickedIds.length }} 道菜</text><button class="btn primary" :disabled="!pickedIds.length" @click="addPicked">添加到{{ mealLabels[pickerMeal] }}</button></view></view></view>
  <view v-if="copying" class="modal-backdrop"><view class="modal small-modal"><view class="modal-header"><text class="section-title">把好味道延续一天</text><button class="icon-button" :disabled="busy" @click="copying = false">×</button></view><view class="modal-body"><text class="helper">将 {{ date }} 的三餐和备注复制到：</text><picker mode="date" :value="copyDate" @change="copyDate = $event.detail.value"><view class="field copy-date">{{ copyDate }} <text>⌄</text></view></picker><text class="helper">已有菜单需要确认后才会被覆盖。</text></view><view class="modal-footer"><button class="btn primary full" :disabled="busy" :loading="busy" @click="copy">确认复制</button></view></view></view>
  <RecipeDetail v-if="recipe" :recipe="recipe" @close="recipe = null"/>
</template>
