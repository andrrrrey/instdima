// Сбор дайджеста обновлений Instagram: обход источников (RSS/HTML),
// перевод/структурирование через Claude, недельная выжимка.
import { XMLParser } from 'fast-xml-parser';
import { prisma } from '../db.js';
import { analyzeUpdate, summarizeWeek, claudeConfigured } from './claude.js';
import { MONG } from '../util/format.js';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

async function fetchText(url) {
  const res = await fetch(url, {
    // Браузерный User-Agent — иначе многие издатели отдают 403 боту.
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      'Accept-Language': 'ru,en;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
  return res.text();
}

// Извлекает элементы из RSS/Atom.
function parseRss(xml, limit = 5) {
  const doc = parser.parse(xml);
  const channel = doc?.rss?.channel;
  const feed = doc?.feed;
  let items = [];
  if (channel) {
    items = [].concat(channel.item || []).slice(0, limit).map((it) => ({
      title: it.title,
      text: stripHtml(it.description || it['content:encoded'] || ''),
      link: it.link,
      date: it.pubDate,
    }));
  } else if (feed) {
    items = [].concat(feed.entry || []).slice(0, limit).map((it) => ({
      title: typeof it.title === 'object' ? it.title['#text'] : it.title,
      text: stripHtml(it.summary || it.content?.['#text'] || it.content || ''),
      link: it.link?.['@_href'] || it.link,
      date: it.updated || it.published,
    }));
  }
  return items;
}

function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000);
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function weekRangeLabel(d = new Date()) {
  const day = (d.getDay() + 6) % 7; // 0=Пн
  const mon = new Date(d);
  mon.setDate(d.getDate() - day);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return `${mon.getDate()}–${sun.getDate()} ${MONG[sun.getMonth()]}`;
}

function humanDate(raw) {
  const d = raw ? new Date(raw) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONG[d.getMonth()]}`;
}

/**
 * Собирает и сохраняет новый дайджест. Возвращает созданный Digest.
 * Если Claude не настроен — падает с понятной ошибкой (кроме случая, когда
 * переданы сырые элементы без анализа — тогда сохраняем как есть).
 */
export async function buildDigest({ maxPerSource = 3, maxItems = 6 } = {}) {
  const sources = await prisma.digestSource.findMany({ where: { active: true } });
  const collected = [];

  for (const src of sources) {
    try {
      const raw = await fetchText(src.url);
      const items = src.type === 'rss' ? parseRss(raw, maxPerSource) : [];
      for (const it of items) {
        collected.push({ ...it, source: src.title || hostOf(src.url), host: hostOf(it.link || src.url) });
      }
    } catch (e) {
      console.warn(`[digest] источник ${src.url}: ${e.message}`);
    }
  }

  const picked = collected.slice(0, maxItems);
  const analyzed = [];

  for (const it of picked) {
    let a = null;
    if (claudeConfigured()) {
      try {
        a = await analyzeUpdate({ title: it.title, text: it.text, source: it.source });
      } catch (e) {
        console.warn(`[digest] analyze: ${e.message}`);
      }
    }
    analyzed.push({
      cat: a?.cat || 'Новые функции',
      t: a?.t || it.title || 'Обновление',
      ch: a?.ch || it.text?.slice(0, 200) || '',
      me: a?.me || '',
      co: a?.co || '',
      src: it.host,
      d: humanDate(it.date),
    });
  }

  let summary = '';
  if (analyzed.length && claudeConfigured()) {
    try {
      summary = await summarizeWeek(analyzed);
    } catch (e) {
      console.warn(`[digest] summary: ${e.message}`);
    }
  }

  const digest = await prisma.digest.create({
    data: {
      rangeLabel: weekRangeLabel(),
      summary,
      items: { create: analyzed },
    },
    include: { items: true },
  });
  return digest;
}
