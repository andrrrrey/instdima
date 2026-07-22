// Адаптер хранилища медиа: локальный диск (по умолчанию) или S3-совместимое.
// Наружу медиа отдаётся подписанным URL (HMAC-токен в query), чтобы теги
// <img src> / <video src> во фронтенде работали без заголовка Authorization.
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { config } from '../config.js';

const driver = config.storage.driver;

let s3client = null;
function s3() {
  if (!s3client) {
    // Ленивая загрузка, чтобы disk-режим не тянул aws-sdk.
    const { S3Client } = require('@aws-sdk/client-s3');
    s3client = new S3Client({
      region: config.storage.s3.region,
      endpoint: config.storage.s3.endpoint || undefined,
      forcePathStyle: !!config.storage.s3.endpoint,
      credentials: {
        accessKeyId: config.storage.s3.accessKeyId,
        secretAccessKey: config.storage.s3.secretAccessKey,
      },
    });
  }
  return s3client;
}

// require в ESM
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

function diskPath(key) {
  return path.resolve(config.storage.diskDir, key);
}

export async function ensureReady() {
  if (driver === 'disk') {
    await fs.mkdir(path.resolve(config.storage.diskDir), { recursive: true });
  }
}

// Сохранить буфер/поток под ключом key. Возвращает { key, size }.
export async function putObject(key, buffer, contentType = 'application/octet-stream') {
  if (driver === 's3') {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await s3().send(
      new PutObjectCommand({
        Bucket: config.storage.s3.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
    return { key, size: buffer.length };
  }
  const full = diskPath(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buffer);
  return { key, size: buffer.length };
}

// Прочитать объект в буфер (для ffmpeg/vision).
export async function getObjectBuffer(key) {
  if (driver === 's3') {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const res = await s3().send(
      new GetObjectCommand({ Bucket: config.storage.s3.bucket, Key: key }),
    );
    const chunks = [];
    for await (const c of res.Body) chunks.push(c);
    return Buffer.concat(chunks);
  }
  return fs.readFile(diskPath(key));
}

// Node stream для отдачи файла клиенту (disk-режим).
export function getObjectStream(key) {
  if (driver === 's3') return null; // в s3-режиме используем presigned redirect
  return createReadStream(diskPath(key));
}

export async function statObject(key) {
  if (driver === 's3') {
    const { HeadObjectCommand } = require('@aws-sdk/client-s3');
    const r = await s3().send(
      new HeadObjectCommand({ Bucket: config.storage.s3.bucket, Key: key }),
    );
    return { size: r.ContentLength || 0, mime: r.ContentType };
  }
  const st = await fs.stat(diskPath(key));
  return { size: st.size, mime: undefined };
}

// Presigned URL для s3-режима (для больших видео эффективнее отдавать напрямую).
// downloadName — если задан, файл отдаётся как вложение с этим именем.
export async function presignedUrl(key, ttl, downloadName) {
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const cmd = new GetObjectCommand({
    Bucket: config.storage.s3.bucket,
    Key: key,
    ...(downloadName ? { ResponseContentDisposition: `attachment; filename="${downloadName}"` } : {}),
  });
  return getSignedUrl(s3(), cmd, { expiresIn: ttl || config.storage.urlTtlSec });
}

// --- Подписанные ссылки на наш /api/media/:id ---

export function signMediaToken(mediaId, expSec = config.storage.urlTtlSec) {
  const exp = Math.floor(Date.now() / 1000) + expSec;
  const payload = `${mediaId}.${exp}`;
  const sig = crypto
    .createHmac('sha256', config.storage.urlSecret)
    .update(payload)
    .digest('base64url');
  return `${exp}.${sig}`;
}

export function verifyMediaToken(mediaId, token) {
  if (!token) return false;
  const [expStr, sig] = String(token).split('.');
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = crypto
    .createHmac('sha256', config.storage.urlSecret)
    .update(`${mediaId}.${exp}`)
    .digest('base64url');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Публичный подписанный URL медиа для фронтенда.
export function mediaUrl(mediaId) {
  if (!mediaId) return null;
  const token = signMediaToken(mediaId);
  return `/api/media/${mediaId}?token=${token}`;
}

export { driver as storageDriver };
