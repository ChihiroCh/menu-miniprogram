<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { onShareAppMessage } from '@dcloudio/uni-app';
import { api, notify, confirm, prompt, isMini } from '../api';
import type { Family, Role } from '../types';
const props = defineProps<{ family: Family; user: { id: string; name: string } }>();
const emit = defineEmits<{ refresh: []; create: []; join: []; logout: [] }>();
const members = ref<{ userId: string; role: Role; user: { name: string } }[]>([]);
const invites = ref<{ id: string; code: string; expiresAt: string }[]>([]);
const loading = ref(true);
const busy = ref(false);
const error = ref('');
const admin = computed(() => props.family.role !== 'MEMBER');
const names: Record<Role, string> = { OWNER: '家庭所有者', ADMIN: '管理员', MEMBER: '家庭成员' };
async function load() {
  loading.value = true; error.value = '';
  try { [members.value, invites.value] = await Promise.all([api(`/families/${props.family.id}/members`), admin.value ? api(`/families/${props.family.id}/invites`) : Promise.resolve([])]); }
  catch (e) { error.value = (e as Error).message; } finally { loading.value = false; }
}
async function run(fn: () => Promise<void>) { if (busy.value) return; busy.value = true; try { await fn(); await load(); } catch (e) { notify((e as Error).message); } finally { busy.value = false; } }
async function invite() { await run(async () => { await api(`/families/${props.family.id}/invites`, 'POST'); }); }
function copyInvite(item: { code: string }) {
  let value = item.code;
  // #ifdef H5
  value = `${window.location.origin}${window.location.pathname}#/pages/index/index?invite=${encodeURIComponent(item.code)}`;
  // #endif
  uni.setClipboardData({ data: value, success: () => notify(isMini ? '邀请码已复制，发给家人即可' : '邀请链接已复制，发给家人即可') });
}
async function revoke(item: { id: string }) { if (await confirm('撤销后，家人将无法再通过这份邀请加入。')) await run(async () => { await api(`/families/${props.family.id}/invites/${item.id}`, 'DELETE'); }); }
async function role(member: { userId: string; role: Role; user: { name: string } }) {
  const next = member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN';
  if (!await confirm(`将「${member.user.name}」设为${names[next]}？`)) return;
  await run(async () => { await api(`/families/${props.family.id}/members/${member.userId}`, 'PATCH', { role: next }); });
}
async function remove(member: { userId: string; user: { name: string } }) {
  if (!await confirm(`确定将「${member.user.name}」移出当前家庭吗？`)) return;
  await run(async () => { await api(`/families/${props.family.id}/members/${member.userId}`, 'DELETE'); });
}
async function leave() {
  if (!await confirm('退出后将无法查看该家庭的菜品和菜单，需要新的邀请才能重新加入。')) return;
  if (busy.value) return; busy.value = true;
  try { await api(`/families/${props.family.id}/members/${props.user.id}`, 'DELETE'); emit('refresh'); } catch (e) { notify((e as Error).message); } finally { busy.value = false; }
}
async function rename() {
  const name = await prompt('修改昵称', props.user.name); if (!name) return;
  await run(async () => { await api('/me', 'PATCH', { name }); props.user.name = name; });
}
onShareAppMessage(() => ({ title: `来「${props.family.name}」，一起安排一日三餐`, path: `/pages/index/index?invite=${invites.value[0]?.code || ''}` }));
onMounted(load);
</script>
<template>
  <view class="page-heading"><view><view class="eyebrow">A PLACE TO CALL HOME</view><view class="page-title">一家人，一张餐桌<text class="title-leaf">⌂</text></view><view class="subtitle">一起想，一起做，一起把日子过得有滋有味。</view></view><view class="heading-actions"><button class="btn secondary" @click="$emit('join')">加入家庭</button><button class="btn primary" @click="$emit('create')">＋ 创建家庭</button></view></view>
  <view v-if="loading" class="loading-card">正在等家人入座…</view><view v-else-if="error" class="error-card"><text>{{ error }}</text><button class="btn secondary" @click="load">重试</button></view>
  <view v-else class="family-layout"><view><view class="family-summary card"><view class="family-house">⌂</view><view><text class="eyebrow">OUR LITTLE KITCHEN</text><view class="section-title">{{ family.name }}</view><view class="helper">{{ members.length }} 位家人 · {{ names[family.role] }}</view></view></view>
    <view class="card member-card"><view class="panel-heading"><text class="section-title">餐桌旁的家人</text><text class="helper">{{ members.length }} 位</text></view><view v-for="member in members" :key="member.userId" class="member-row"><view class="member-info"><view class="avatar">{{ member.user.name.slice(0, 1) }}</view><view><view class="dish-name">{{ member.user.name }}<text v-if="member.userId === user.id" class="self-tag">我</text></view><text class="helper">{{ names[member.role] }}</text></view></view><view v-if="family.role === 'OWNER' && member.role !== 'OWNER'" class="row-actions"><button class="text-button" :disabled="busy" @click="role(member)">{{ member.role === 'ADMIN' ? '取消管理员' : '设为管理员' }}</button><button class="text-button danger" :disabled="busy" @click="remove(member)">移除</button></view></view></view>
    <view v-if="admin" class="card invite-card"><view class="panel-heading"><view><view class="section-title">邀请家人入座</view><text class="helper">邀请有效期 7 天，仅限信任的家人使用。</text></view><button class="btn primary small" :disabled="busy" @click="invite">＋ 新建邀请</button></view><view v-if="!invites.length" class="empty-state compact-empty">还没有有效邀请，创建一个发给家人吧。</view><view v-for="item in invites" :key="item.id" class="invite-row"><view><view class="invite-code">{{ item.code }}</view><text class="helper">有效至 {{ new Date(item.expiresAt).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }) }}</text></view><view class="row-actions"><button class="text-button" @click="copyInvite(item)">{{ isMini ? '复制邀请码' : '复制链接' }}</button><button class="text-button danger" :disabled="busy" @click="revoke(item)">撤销</button></view></view><button v-if="isMini && invites.length" open-type="share" class="btn secondary full">分享最新邀请给家人</button></view>
  </view><view><view class="card account-card"><view class="small-label">我的账号</view><view class="account-profile"><view class="avatar large">{{ user.name.slice(0, 1) }}</view><view class="section-title">{{ user.name }}</view></view><button class="btn secondary full" :disabled="busy" @click="rename">修改昵称</button><button class="text-button logout-button" @click="$emit('logout')">退出登录</button></view><view class="permission-note"><view class="small-label">一起照顾这个家</view><view>管理员负责收藏和上下架菜品；每一位家人都能参与安排每日三餐。</view><view>家庭间的菜谱和菜单独立保存，只与本家庭成员共享。</view></view><button v-if="family.role !== 'OWNER'" class="text-button danger leave-button" :disabled="busy" @click="leave">退出当前家庭</button></view></view>
</template>
