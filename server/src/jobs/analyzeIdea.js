// Job-процессор: разбор идеи по ссылке.
// scrape → скачать медиа → (видео) кадр через ffmpeg → Claude vision → сохранить.
import { prisma } from '../db.js';
import { scrape } from '../services/scraper.js';
import { putObject } from '../services/storage.js';
import { extractFrame } from '../services/ffmpeg.js';
import { describeImage, claudeConfigured } from '../services/claude.js';

async function download(url) {
  // data: URL (mock-режим / self-contained ассеты)
  if (url.startsWith('data:')) {
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
    if (!m) throw new Error('bad_data_url');
    const mime = m[1] || 'application/octet-stream';
    const buf = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]));
    return { buf, mime };
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get('content-type') || 'application/octet-stream';
  return { buf, mime };
}

export async function processAnalyzeIdea(job) {
  const { ideaId } = job.data;
  const idea = await prisma.idea.findUnique({ where: { id: ideaId } });
  if (!idea) return;

  try {
    const result = await scrape(idea.url);
    const first = result.media[0];
    if (!first) throw new Error('no_media');

    // Скачиваем первый медиафайл на сервер.
    const { buf, mime } = await download(first.url);
    const kind = first.kind === 'video' ? 'video' : 'image';
    const ext = kind === 'video' ? 'mp4' : (mime.includes('png') ? 'png' : 'jpg');
    const key = `idea/${idea.id}/media.${ext}`;
    await putObject(key, buf, mime);

    // Для видео извлекаем кадр для vision.
    let framePath = null;
    let visionBuf = buf;
    let visionMime = mime;
    if (kind === 'video') {
      try {
        const frame = await extractFrame(buf, 1);
        framePath = `idea/${idea.id}/frame.jpg`;
        await putObject(framePath, frame, 'image/jpeg');
        visionBuf = frame;
        visionMime = 'image/jpeg';
      } catch (e) {
        console.warn(`[analyzeIdea] ffmpeg: ${e.message}`);
      }
    }

    const media = await prisma.media.create({
      data: { kind, path: key, mime, size: buf.length, framePath },
    });

    // Описание сцены через Claude (если ключ настроен).
    let ai = '';
    if (claudeConfigured() && (kind === 'image' || framePath)) {
      try {
        ai = await describeImage(visionBuf, visionMime);
      } catch (e) {
        console.warn(`[analyzeIdea] vision: ${e.message}`);
      }
    }

    await prisma.idea.update({
      where: { id: idea.id },
      data: {
        status: 'ready',
        type: result.type === 'reels' ? 'reels' : 'post',
        dur: first.duration || idea.dur,
        text: result.caption || '',
        hashtags: result.hashtags || [],
        author: result.author || '',
        ai,
        mediaId: media.id,
        title: idea.title || (result.type === 'reels' ? 'Разбор Reels' : 'Разбор публикации'),
      },
    });
  } catch (e) {
    await prisma.idea.update({
      where: { id: idea.id },
      data: {
        status: 'error',
        error: e.code === 'BAD_LINK' ? 'Ссылка не поддерживается' : `Не удалось разобрать: ${e.message}`,
      },
    });
    throw e;
  }
}
