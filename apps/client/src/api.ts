export const isMini = import.meta.env.UNI_PLATFORM === 'mp-weixin';
export const API_URL = (import.meta.env.VITE_API_URL || (isMini ? 'http://localhost:3000' : '')).replace(/\/$/, '');
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export function api<T = any>(path: string, method = 'GET', data?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    uni.request({ url: `${API_URL}/api${path}`, method: method as any, data: data as any, withCredentials: true,
      header: { 'Content-Type': 'application/json', ...(isMini && uni.getStorageSync('menu-token') ? { Authorization: `Bearer ${uni.getStorageSync('menu-token')}` } : {}) },
      success: res => { if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data as T); else reject(new ApiError((res.data as any)?.message || '请求失败', res.statusCode)); },
      fail: () => reject(new ApiError('连接失败，请检查网络和服务是否启动', 0))
    });
  });
}
export function upload(familyId: string, filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.uploadFile({ url: `${API_URL}/api/families/${familyId}/images`, filePath, name: 'file',
      // H5 uploadFile uses a same-origin request (Vite/reverse proxy); mini uses bearer authentication.
      header: isMini ? { Authorization: `Bearer ${uni.getStorageSync('menu-token')}` } : {},
      success: res => { try { const data = JSON.parse(res.data); if (res.statusCode !== 200) reject(new ApiError(data.message || '上传失败', res.statusCode)); else resolve(data.url); } catch { reject(new Error('上传失败')); } },
      fail: () => reject(new Error('上传失败，请重试')) });
  });
}
export const notify = (message: string) => uni.showToast({ title: message, icon: 'none', duration: 2500 });
export const confirm = (content: string, title = '请确认'): Promise<boolean> => new Promise(resolve => uni.showModal({ title, content, confirmColor: '#567047', success: res => resolve(res.confirm), fail: () => resolve(false) }));
export const prompt = (title: string, placeholderText = ''): Promise<string | null> => new Promise(resolve => uni.showModal({ title, editable: true, placeholderText, confirmColor: '#567047', success: res => resolve(res.confirm ? res.content?.trim() || null : null), fail: () => resolve(null) }));
