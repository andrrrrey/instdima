// Скрейпер публичных публикаций Instagram по ссылке.
// Абстрактный интерфейс ScraperAdapter + реализация на Apify.
// Обрабатывается только публичный контент (авторизация в Instagram не нужна).
import { config } from '../config.js';

const IG_HOST = /(?:^|\.)instagram\.com$/i;

/**
 * Разбирает ссылку Instagram и определяет тип.
 * @returns {{ ok: boolean, kind?: 'post'|'reel'|'tv', shortcode?: string, reason?: string }}
 */
export function parseInstagramUrl(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return { ok: false, reason: 'bad_url' };
  }
  if (!IG_HOST.test(u.hostname)) return { ok: false, reason: 'not_instagram' };
  const m = /\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/.exec(u.pathname);
  if (!m) return { ok: false, reason: 'unsupported_path' };
  const seg = m[1].toLowerCase();
  const kind = seg === 'p' ? 'post' : seg === 'tv' ? 'tv' : 'reel';
  return { ok: true, kind, shortcode: m[2], url: `https://www.instagram.com/${seg}/${m[2]}/` };
}

/**
 * @typedef {Object} ScrapeResult
 * @property {'post'|'reels'|'carousel'} type
 * @property {Array<{url:string, kind:'image'|'video', duration?:string}>} media
 * @property {string} caption
 * @property {string[]} hashtags
 * @property {string} author
 */

function extractHashtags(caption = '') {
  const tags = [];
  const re = /#([\p{L}\p{N}_]+)/gu;
  let m;
  while ((m = re.exec(caption))) tags.push(m[1]);
  return tags;
}

function secToDur(sec) {
  if (!sec && sec !== 0) return null;
  const s = Math.round(Number(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// --- Apify adapter ---
async function apifyFetch(url) {
  const { ApifyClient } = await import('apify-client');
  const client = new ApifyClient({ token: config.scraper.apifyToken });

  const run = await client.actor(config.scraper.apifyActor).call(
    {
      directUrls: [url],
      resultsType: 'details',
      resultsLimit: 1,
      addParentData: false,
    },
    {
      // имя опции у apify-client — `timeout` (сек), не `timeoutSecs`
      timeout: Math.floor(config.scraper.timeoutMs / 1000),
      waitSecs: Math.floor(config.scraper.timeoutMs / 1000),
    },
  );

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  const it = items?.[0];
  if (!it) throw new Error('scraper_empty');

  const productType = (it.productType || it.type || '').toLowerCase();
  let type = 'post';
  if (productType.includes('clips') || productType.includes('reel') || it.type === 'Video') type = 'reels';
  if (Array.isArray(it.childPosts) && it.childPosts.length > 1) type = 'carousel';

  const media = [];
  const pushMedia = (node) => {
    if (node.videoUrl) media.push({ url: node.videoUrl, kind: 'video', duration: secToDur(node.videoDuration) });
    else if (node.displayUrl || node.imageUrl) media.push({ url: node.displayUrl || node.imageUrl, kind: 'image' });
  };
  if (Array.isArray(it.childPosts) && it.childPosts.length) it.childPosts.forEach(pushMedia);
  else pushMedia(it);

  const caption = it.caption || '';
  return {
    type,
    media: media.filter((m) => m.url),
    caption,
    hashtags: it.hashtags?.length ? it.hashtags : extractHashtags(caption),
    author: it.ownerUsername ? `@${it.ownerUsername}` : '',
  };
}

// --- Mock adapter (для локальной разработки без Apify) ---
// Возвращает self-contained data: URL, чтобы пайплайн работал без внешней сети.
const SAMPLE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

async function mockFetch(url) {
  const parsed = parseInstagramUrl(url);
  const isReel = parsed.ok && parsed.kind !== 'post';
  // Для видео в mock-режиме тоже отдаём картинку (ffmpeg/скачивание видео в offline-тесте недоступны).
  return {
    type: isReel ? 'reels' : 'post',
    media: [{ url: SAMPLE_PNG, kind: 'image', duration: isReel ? '0:15' : undefined }],
    caption: 'Демо-подпись публикации #демо #контент',
    hashtags: ['демо', 'контент'],
    author: '@demo.account',
  };
}

export async function scrape(url) {
  const parsed = parseInstagramUrl(url);
  if (!parsed.ok) {
    const err = new Error(parsed.reason);
    err.code = 'BAD_LINK';
    throw err;
  }
  if (config.scraper.driver === 'mock' || !config.scraper.apifyToken) {
    return mockFetch(parsed.url);
  }
  return apifyFetch(parsed.url);
}

export function scraperConfigured() {
  return config.scraper.driver === 'mock' || !!config.scraper.apifyToken;
}
