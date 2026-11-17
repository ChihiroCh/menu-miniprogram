<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { api, ApiError, isMini, API_URL, notify, prompt, confirm } from '../../api';
import type { Family } from '../../types';
import PlanBoard from '../../components/PlanBoard.vue';
import DishLibrary from '../../components/DishLibrary.vue';
import FamilyPanel from '../../components/FamilyPanel.vue';

const user = ref<{ id: string; name: string } | null>(null);
const families = ref<Family[]>([]);
const familyId = ref('');
const family = computed(() => families.value.find(f => f.id === familyId.value));
const tab = ref('plan');
const planDirty = ref(false);
async function changeTab(next: string) {
  if (next === tab.value) return;
  if (planDirty.value && !await confirm('当前菜单尚未保存，离开后将放弃这些修改。')) return;
  planDirty.value = false; tab.value = next;
}
const loading = ref(true);
const busy = ref(false);
const error = ref('');
const loginConfig = ref({ devLogin: false, webWechat: false, miniWechat: false });
const devName = ref('小满');
const databaseReady = ref(true);
const joinCode = ref('');
const inviteDraft = ref('');
const tabs = [{ id: 'plan', icon: '▦', label: '菜单计划' }, { id: 'dishes', icon: '♧', label: '菜品库' }, { id: 'family', icon: '⌂', label: '我的家庭' }];
async function loadFamilies(preferred?: string) {
  families.value = await api<Family[]>('/families');
  familyId.value = families.value.some(f => f.id === (preferred || familyId.value)) ? preferred || familyId.value : families.value[0]?.id || '';
  uni.setStorageSync('menu-family', familyId.value);
}
async function init() {
  loading.value = true; error.value = '';
  try {
    loginConfig.value = await api('/auth/config');
    if (loginConfig.value.devLogin) {
      try { await api('/health'); databaseReady.value = true; } catch { databaseReady.value = false; }
    }
    try { user.value = await api('/me'); } catch (e) { if (!(e instanceof ApiError) || e.status !== 401) throw e; user.value = null; }
    if (user.value) await loadFamilies(uni.getStorageSync('menu-family'));
  } catch (e) { error.value = (e as Error).message; }
  finally { loading.value = false; }
}
async function login(dev: boolean) {
  if (busy.value) return; busy.value = true;
  try {
    if (dev) {
      const data = await api('/auth/dev', 'POST', { name: devName.value, mini: isMini });
      if (data.token) uni.setStorageSync('menu-token', data.token);
    } else if (isMini) {
      const code = await new Promise<string>((resolve, reject) => uni.login({ provider: 'weixin', success: r => resolve(r.code), fail: reject }));
      const data = await api('/auth/wechat/mini', 'POST', { code });
      uni.setStorageSync('menu-token', data.token);
    } else {
      // #ifdef H5
      window.location.assign(`${API_URL}/api/auth/wechat/web`);
      // #endif
      return;
    }
    await init();
  } catch (e) { notify((e as Error).message); }
  finally { busy.value = false; }
}
async function createFamily() {
  const name = await prompt('给家庭起个名字', '例如：小满的家'); if (!name) return;
  await run(async () => { const data = await api('/families', 'POST', { name }); await loadFamilies(data.id); });
}
async function joinFamily() {
  const code = inviteDraft.value.trim() || await prompt('加入家人的厨房', '输入家人分享的邀请码'); if (!code) return;
  await run(async () => { const data = await api('/invites/join', 'POST', { code }); await loadFamilies(data.familyId); joinCode.value = ''; inviteDraft.value = ''; notify('已加入家庭'); });
}
async function run(action: () => Promise<void>) { if (busy.value) return; busy.value = true; try { await action(); } catch (e) { notify((e as Error).message); } finally { busy.value = false; } }
async function logout() {
  if (!await confirm('确定退出当前账号吗？')) return;
  await run(async () => { await api('/auth/logout', 'POST'); uni.removeStorageSync('menu-token'); user.value = null; families.value = []; familyId.value = ''; });
}
async function selectFamily(event: any) {
  if (planDirty.value && !await confirm('当前菜单尚未保存，切换家庭将放弃这些修改。')) return;
  planDirty.value = false; familyId.value = families.value[Number(event.detail.value)].id; uni.setStorageSync('menu-family', familyId.value);
}
onLoad((options: any) => { if (options?.invite) { joinCode.value = options.invite; inviteDraft.value = options.invite; } });
onMounted(init);
// Revalidate the session when returning from WeChat or bringing the mini program to the foreground.
onShow(() => { if (!loading.value && user.value) api('/me').catch(e => { if (e instanceof ApiError && e.status === 401) { user.value = null; notify('登录已过期，请重新登录'); } }); });
</script>

<template>
  <view class="app-shell">
    <view class="site-header">
      <view class="brand" @click="changeTab('plan')"><view class="brand-mark">食</view><view><view class="brand-name">食日<text class="brand-dot">.</text></view><view class="brand-sub">把日子，过成喜欢的味道</view></view></view>
      <view v-if="user" class="header-right">
        <picker v-if="families.length" :range="families" range-key="name" @change="selectFamily"><view class="family-switch">⌂ &nbsp;{{ family?.name }} <text class="muted">⌄</text></view></picker>
        <view class="avatar" @click="changeTab('family')">{{ user.name.slice(0, 1) }}</view>
      </view>
      <view v-else class="header-tag">FAMILY KITCHEN</view>
    </view>

    <view v-if="loading" class="center-state"><view class="loading-dot"/><text>正在打开你的厨房…</text></view>
    <view v-else-if="error" class="center-state"><view class="empty-icon">☁</view><text>{{ error }}</text><button class="btn primary" @click="init">重新连接</button></view>
    <view v-else-if="!user" class="login-layout">
      <view class="login-story"><text class="eyebrow">A LITTLE PLAN, A LOVELY DAY</text><view class="login-title">今天吃什么，<br/>一起慢慢想。</view><view class="intro-text">收藏家人爱吃的菜，安排一日三餐。<br/>让每一次围坐，都有期待。</view><view class="kitchen-art"><view class="art-leaf leaf-one"/><view class="art-leaf leaf-two"/><view class="art-plate"><view class="art-rice"/><view class="art-tomato"/><view class="art-greens"/></view><view class="art-chopstick"/><view class="art-chopstick second"/><text class="art-label">好好吃饭 · 好好生活</text></view></view>
      <view class="login-card"><text class="eyebrow">WELCOME HOME</text><view class="section-title">欢迎来到食日</view><view class="muted paragraph">一家人的菜单，一起安排。</view>
        <button class="btn primary full" :disabled="busy || !(isMini ? loginConfig.miniWechat : loginConfig.webWechat)" @click="login(false)">{{ isMini ? '微信一键登录' : '微信扫码登录' }}</button>
        <view v-if="!(isMini ? loginConfig.miniWechat : loginConfig.webWechat)" class="helper">微信登录正在准备中。</view>
        <view v-if="loginConfig.devLogin" class="dev-login"><view class="small-label">开发体验</view><view class="helper">输入同一昵称可在两端进入同一测试账号。</view><view v-if="!databaseReady" class="dev-readiness"><text>数据库尚未连接，请先按项目说明启动并初始化 PostgreSQL。</text><button class="text-button" @click="init">重新检查连接</button></view><input v-model="devName" class="field" maxlength="60" placeholder="你的测试昵称" @confirm="databaseReady && login(true)"/><button class="btn secondary full" :loading="busy" :disabled="busy || !devName.trim() || !databaseReady" @click="login(true)">进入体验厨房 →</button></view>
        <view class="login-note">菜单与回忆，都留在自己的家里。</view>
      </view>
    </view>

    <template v-else>
      <view v-if="joinCode" class="invite-banner"><text>家人邀请你加入厨房 · {{ joinCode }}</text><button class="btn primary small" :disabled="busy" @click="joinFamily">接受邀请</button></view>
      <view v-if="!family" class="onboard"><text class="eyebrow">YOUR FAMILY TABLE</text><view class="page-title">给家人留一张餐桌</view><view class="intro-text">创建一个家庭厨房，或加入家人的邀请，<br/>开始一起安排每天的好味道。</view><view class="onboard-actions"><button class="btn primary" :disabled="busy" @click="createFamily">＋ 创建家庭</button><button class="btn secondary" :disabled="busy" @click="joinFamily">邀请码加入</button></view><button class="text-button" @click="logout">退出登录</button></view>
      <template v-else>
        <view class="desktop-nav"><view v-for="item in tabs" :key="item.id" :class="['nav-item', { active: tab === item.id }]" @click="changeTab(item.id)"><text class="nav-icon">{{ item.icon }}</text>{{ item.label }}</view><text class="nav-aside">一屋两人三餐四季，认真对待每一餐。</text></view>
        <view class="main-content">
          <PlanBoard v-if="tab === 'plan'" :key="family.id" :family="family" @browse="changeTab('dishes')" @dirty="planDirty = $event"/>
          <DishLibrary v-else-if="tab === 'dishes'" :key="family.id" :family="family"/>
          <FamilyPanel v-else :key="family.id" :family="family" :user="user" @refresh="loadFamilies()" @create="createFamily" @join="joinFamily" @logout="logout"/>
        </view>
        <view class="bottom-nav"><view v-for="item in tabs" :key="item.id" :class="['bottom-item', { active: tab === item.id }]" @click="changeTab(item.id)"><text class="nav-icon">{{ item.icon }}</text><text>{{ item.label }}</text></view></view>
      </template>
    </template>
    <view class="site-footer"><text>食日 SHÍ RÌ</text><text>用心计划，好好吃饭。</text><text>MADE FOR YOUR FAMILY</text></view>
  </view>
</template>
