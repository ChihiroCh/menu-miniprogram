<script setup lang="ts">
import type { Recipe } from '../types';
defineProps<{ recipe: Recipe }>();
defineEmits<{ close: [] }>();
</script>
<template>
  <view class="modal-backdrop" @click.self="$emit('close')"><view class="modal recipe-modal"><view class="modal-header"><text class="section-title">{{ recipe.name }}</text><button class="icon-button" @click="$emit('close')">×</button></view><scroll-view scroll-y class="modal-scroll">
    <image v-if="recipe.image" :src="recipe.image" mode="aspectFill" class="recipe-hero"/>
    <view v-if="recipe.notes" class="recipe-note">{{ recipe.notes }}</view>
    <view class="small-label detail-heading">准备食材</view><view v-if="!recipe.ingredients.length" class="helper">还没有记录食材。</view><view v-for="(item, i) in recipe.ingredients" :key="i" class="ingredient-row"><text>{{ item.name }}</text><text class="muted">{{ item.amount || '适量' }}</text></view>
    <view class="small-label detail-heading">下厨步骤</view><view v-if="!recipe.steps.length" class="helper">还没有记录做法。</view><view v-for="(step, i) in recipe.steps" :key="i" class="recipe-step"><text class="step-number">{{ String(i + 1).padStart(2, '0') }}</text><text>{{ step }}</text></view>
  </scroll-view></view></view>
</template>
