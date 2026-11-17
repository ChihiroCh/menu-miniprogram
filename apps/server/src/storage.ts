import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import type { Config } from './config.js';
import { fail } from './domain.js';

export function imageExtension(bytes: Buffer): string {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  if (bytes.length >= 12 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') return 'webp';
  return fail(400, '仅支持 JPG、PNG、WebP 图片');
}
export async function saveImage(bytes: Buffer, config: Config) {
  const ext = imageExtension(bytes);
  const key = `${randomUUID()}.${ext}`;
  if (config.storage === 'local') {
    await mkdir(config.uploadDir, { recursive: true });
    await writeFile(path.join(config.uploadDir, key), bytes);
    return `${config.apiUrl}/uploads/${key}`;
  }
  const client = new S3Client({ endpoint: process.env.S3_ENDPOINT || undefined, region: process.env.S3_REGION || 'auto', forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! } });
  await client.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: bytes, ContentType: ext === 'jpg' ? 'image/jpeg' : `image/${ext}` }));
  return `${process.env.S3_PUBLIC_URL!.replace(/\/$/, '')}/${key}`;
}
