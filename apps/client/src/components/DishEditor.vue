<script setup lang="ts">
import { ref } from 'vue';
import { api, upload, notify, confirm } from '../api';
import type { Dish, Ingredient } from '../types';
const props = defineProps<{ familyId: string; dish?: Dish; categories: { id: string; name: string }[] }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const form = ref({ name: props.dish?.name || '', image: props.dish?.image || '', notes: props.dish?.notes || '', categoryId: props.dish?.categoryId || null as string | null, ingredients: props.dish?.ingredients.map(i => ({ ...i })) || [{ name: '', amount: '' }], steps: [...(props.dish?.steps || [''])] });
const busy = ref(false);
const uploading = ref(false);
function chooseImage() {
  if (uploading.value || busy.value) return;
  uni.chooseImage({ count: 1, sizeType: ['compressed'], success: async result => { uploading.value = true; try { form.value.image = await upload(props.familyId, result.tempFilePaths[0]); } catch (e) { notify((e as Error).message); } finally { uploading.value = false; } } });
}
async function save() {
  if (busy.value || uploading.value) return;
  if (!form.value.name.trim()) return notify('请填写菜品名称');
  if (form.value.ingredients.some(i => !i.name.trim() && i.amount.trim())) return notify('请填写对应的食材名称');
  busy.value = true;
  try {
    const data = { ...form.value, ingredients: form.value.ingredients.filter(i => i.name.trim()), steps: form.value.steps.map(s => s.trim()).filter(Boolean) };
    await api(`/families/${props.familyId}/dishes${props.dish ? `/${props.dish.id}` : ''}`, props.dish ? 'PUT' : 'POST', data);
    notify(props.dish ? '菜品已更新' : '已保存为下架菜品，可在菜品库上架'); emit('saved');
  } catch (e) { notify((e as Error).message); } finally { busy.value = false; }
}
async function close() { if (!busy.value && !uploading.value && await confirm('关闭后，尚未保存的修改将丢失。')) emit('close'); }
</script>
<template>
  <view class="modal-backdrop"><view class="modal editor-modal"><view class="modal-header"><view><text class="eyebrow">FAMILY RECIPE</text><view class="section-title">{{ dish ? '编辑这道家常味' : '添一道拿手好菜' }}</view></view><button class="icon-button" :disabled="busy || uploading" @click="close">×</button></view><scroll-view scroll-y class="modal-scroll">
    <view class="cover-picker" @click="chooseImage"><image v-if="form.image" :src="form.image" mode="aspectFill"/><view class="cover-overlay">{{ uploading ? '正在上传…' : form.image ? '更换菜品图片' : '＋ 添加一张菜品图片' }}</view></view><button v-if="form.image" class="text-button" @click="form.image = ''">移除图片</button>
    <view class="form-label">菜品名称 *</view><input v-model="form.name" class="field" maxlength="60" placeholder="例如：番茄炒蛋"/>
    <view class="form-label">菜品分类</view><picker :range="[{ id: '', name: '未分类' }, ...categories]" range-key="name" @change="form.categoryId = Number($event.detail.value) ? categories[Number($event.detail.value) - 1].id : null"><view class="field picker-field">{{ categories.find(c => c.id === form.categoryId)?.name || '未分类' }}<text>⌄</text></view></picker>
    <view class="form-label">一句话介绍</view><textarea v-model="form.notes" class="field textarea short" maxlength="2000" placeholder="这道菜的味道，或家人的偏好…"/>
    <view class="editor-heading"><text class="form-label">食材与用量</text><button class="text-button" @click="form.ingredients.push({ name: '', amount: '' })">＋ 添加食材</button></view>
    <view v-for="(item, i) in form.ingredients" :key="i" class="input-row"><input v-model="item.name" class="field" maxlength="60" placeholder="食材"/><input v-model="item.amount" class="field amount" maxlength="60" placeholder="用量"/><button class="icon-button" @click="form.ingredients.splice(i, 1)">−</button></view>
    <view class="editor-heading"><text class="form-label">烹饪步骤</text><button class="text-button" @click="form.steps.push('')">＋ 添加步骤</button></view>
    <view v-for="(step, i) in form.steps" :key="i" class="input-row step-input"><text class="step-number">{{ i + 1 }}</text><textarea v-model="form.steps[i]" class="field textarea short" maxlength="2000" :placeholder="`第 ${i + 1} 步怎么做？`"/><button class="icon-button" @click="form.steps.splice(i, 1)">−</button></view>
  </scroll-view><view class="modal-footer"><text class="helper">{{ dish ? '已有菜单中的菜谱保持原样' : '新菜品保存后默认为下架状态' }}</text><button class="btn primary" :loading="busy" :disabled="busy || uploading" @click="save">保存菜品</button></view></view></view>
</template>
