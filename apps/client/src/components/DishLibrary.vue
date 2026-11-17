<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { api, notify, confirm, prompt } from '../api';
import type { Dish, Family, Recipe } from '../types';
import DishEditor from './DishEditor.vue';
import RecipeDetail from './RecipeDetail.vue';
const props = defineProps<{ family: Family }>();
const admin = computed(() => props.family.role !== 'MEMBER');
const dishes = ref<Dish[]>([]);
const categories = ref<{ id: string; name: string }[]>([]);
const search = ref('');
const category = ref('');
const status = ref('all');
const loading = ref(true);
const busy = ref(false);
const error = ref('');
const editing = ref(false);
const editedDish = ref<Dish>();
const recipe = ref<Recipe | null>(null);
const categoryManager = ref(false);
const shown = computed(() => dishes.value.filter(d => (!category.value || d.categoryId === category.value) && d.name.includes(search.value) && (status.value === 'all' || d.available === (status.value === 'available'))));
const availableCount = computed(() => dishes.value.filter(d => d.available).length);
async function load() {
  loading.value = true; error.value = '';
  try { [dishes.value, categories.value] = await Promise.all([api(`/families/${props.family.id}/dishes?status=${admin.value ? 'all' : 'available'}`), api(`/families/${props.family.id}/categories`)]); }
  catch (e) { error.value = (e as Error).message; } finally { loading.value = false; }
}
function edit(dish?: Dish) { editedDish.value = dish; editing.value = true; }
async function changeStatus(dish: Dish) {
  if (busy.value || !await confirm(dish.available ? `下架「${dish.name}」后，家人将不能把它加入新菜单。已有计划和菜谱会保留。` : `确定上架「${dish.name}」吗？`)) return;
  busy.value = true;
  try { await api(`/families/${props.family.id}/dishes/${dish.id}/status`, 'PATCH', { available: !dish.available }); await load(); notify(dish.available ? '菜品已下架' : '菜品已上架'); }
  catch (e) { notify((e as Error).message); } finally { busy.value = false; }
}
async function categoryAction(action: 'add' | 'edit' | 'delete', item?: { id: string; name: string }) {
  if (busy.value) return;
  let name: string | null = null;
  if (action !== 'delete') { name = await prompt(action === 'add' ? '添加分类' : '重命名分类', item?.name || '例如：快手菜'); if (!name) return; }
  else if (!await confirm(`删除「${item!.name}」后，里面的菜品会变为未分类。`)) return;
  busy.value = true;
  try { await api(`/families/${props.family.id}/categories${item ? `/${item.id}` : ''}`, action === 'add' ? 'POST' : action === 'edit' ? 'PATCH' : 'DELETE', name ? { name } : undefined); category.value = ''; await load(); }
  catch (e) { notify((e as Error).message); } finally { busy.value = false; }
}
onMounted(load);
</script>
<template>
  <view class="page-heading"><view><view class="eyebrow">RECIPES THAT FEEL LIKE HOME</view><view class="page-title">家的味道，都在这里<text class="title-leaf">♧</text></view><view class="subtitle">{{ availableCount }} 道在售菜品，把家人的拿手好菜好好收藏。</view></view><button v-if="admin" class="btn primary" @click="edit()">＋ 添加菜品</button></view>
  <view class="library-toolbar"><view class="search-field"><text>⌕</text><input v-model="search" placeholder="找一道想吃的菜…" maxlength="60"/></view><view v-if="admin" class="status-filters"><view v-for="item in [{id:'all',name:'全部状态'},{id:'available',name:'已上架'},{id:'unavailable',name:'已下架'}]" :key="item.id" :class="{ active: status === item.id }" @click="status = item.id">{{ item.name }}</view></view></view>
  <view class="category-bar"><scroll-view scroll-x class="category-scroll"><view class="category-list"><view :class="['category-pill', { active: !category }]" @click="category = ''">全部菜品</view><view v-for="item in categories" :key="item.id" :class="['category-pill', { active: category === item.id }]" @click="category = item.id">{{ item.name }}</view></view></scroll-view><button v-if="admin" class="text-button" @click="categoryManager = true">管理分类</button></view>
  <view v-if="loading" class="loading-card">正在翻开家里的菜谱…</view><view v-else-if="error" class="error-card"><text>{{ error }}</text><button class="btn secondary small" @click="load">重试</button></view>
  <view v-else-if="!shown.length" class="empty-state card"><view class="empty-icon">♧</view><view class="section-title">{{ dishes.length ? '没有找到符合条件的菜' : '厨房里的第一道菜，等你来添' }}</view><view class="helper">{{ admin ? '记录一份食材与做法，让家的味道有迹可循。' : '请管理员添加并上架菜品，然后一起安排三餐。' }}</view><button v-if="admin && !dishes.length" class="btn primary" @click="edit()">＋ 添加第一道菜</button></view>
  <view v-else class="dish-grid"><view v-for="dish in shown" :key="dish.id" class="dish-card"><view class="dish-image-wrap" @click="recipe = dish"><image v-if="dish.image" :src="dish.image" mode="aspectFill" class="dish-image"/><view v-else class="dish-placeholder">食<text>家的拿手味道</text></view><text :class="['status-tag', { off: !dish.available }]">{{ dish.available ? '● 已上架' : '○ 已下架' }}</text></view><view class="dish-card-body"><view class="dish-card-title" @click="recipe = dish">{{ dish.name }}<text>↗</text></view><view class="dish-description">{{ dish.notes || '一份简单的家常味道，值得好好做。' }}</view><view class="dish-meta"><text>{{ dish.category?.name || '未分类' }}</text><text>{{ dish.ingredients.length }} 种食材 · {{ dish.steps.length }} 步做法</text></view><view v-if="admin" class="dish-actions"><button class="text-button" @click="edit(dish)">✎ 编辑菜谱</button><button :class="['btn', 'small', dish.available ? 'secondary' : 'primary']" :disabled="busy" @click="changeStatus(dish)">{{ dish.available ? '下架' : '上架' }}</button></view></view></view></view>
  <view class="library-bottom-note">— 好好收藏每一道，家人喜欢的味道 —</view>
  <DishEditor v-if="editing" :family-id="family.id" :dish="editedDish" :categories="categories" @close="editing = false" @saved="editing = false; load()"/>
  <RecipeDetail v-if="recipe" :recipe="recipe" @close="recipe = null"/>
  <view v-if="categoryManager" class="modal-backdrop"><view class="modal small-modal"><view class="modal-header"><text class="section-title">管理菜品分类</text><button class="icon-button" :disabled="busy" @click="categoryManager = false">×</button></view><scroll-view scroll-y class="modal-scroll"><view v-for="item in categories" :key="item.id" class="member-row"><text>{{ item.name }}</text><view class="row-actions"><button class="text-button" :disabled="busy" @click="categoryAction('edit', item)">重命名</button><button class="text-button danger" :disabled="busy" @click="categoryAction('delete', item)">删除</button></view></view><view v-if="!categories.length" class="empty-state">还没有分类</view></scroll-view><view class="modal-footer"><button class="btn primary full" :disabled="busy" @click="categoryAction('add')">＋ 添加分类</button></view></view></view>
</template>
