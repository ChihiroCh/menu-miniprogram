import 'dotenv/config';
import path from 'node:path';

export function getConfig() {
  const production = process.env.NODE_ENV === 'production';
  const webUrl = process.env.WEB_URL || 'http://localhost:5173';
  const apiUrl = process.env.API_PUBLIC_URL || 'http://localhost:3000';
  const devLogin = process.env.DEV_LOGIN === 'true' && !production;
  const storage = process.env.STORAGE_DRIVER || 'local';
  if (production && process.env.DEV_LOGIN === 'true') throw new Error('生产环境禁止开启 DEV_LOGIN');
  if (production && (!webUrl.startsWith('https://') || !apiUrl.startsWith('https://'))) throw new Error('生产环境必须配置 HTTPS 地址');
  if (production && storage !== 's3') throw new Error('生产环境必须配置 S3 对象存储');
  if (!['local', 's3'].includes(storage)) throw new Error('未知的 STORAGE_DRIVER');
  if (storage === 's3' && ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_URL'].some(k => !process.env[k])) throw new Error('S3 配置不完整');
  return { production, webUrl, apiUrl, devLogin, storage, uploadDir: path.resolve(process.env.UPLOAD_DIR || './uploads') };
}
export type Config = ReturnType<typeof getConfig>;
