// Интеграция с Claude через RouterAI (OpenAI-совместимый API).
// Используется для: описания сцены по изображению (vision), перевода
// обновлений Instagram на простой русский и недельной выжимки дайджеста.
import OpenAI from 'openai';
import { config } from '../config.js';

let client = null;
function getClient() {
  if (!client) {
    client = new OpenAI({
      apiKey: config.claude.apiKey,
      baseURL: config.claude.baseUrl,
      timeout: config.claude.timeoutMs,
    });
  }
  return client;
}

async function chat(messages, { model, maxTokens } = {}) {
  const res = await getClient().chat.completions.create({
    model: model || config.claude.model,
    max_tokens: maxTokens || config.claude.maxTokens,
    messages,
  });
  return res.choices?.[0]?.message?.content?.trim() || '';
}

/**
 * Описание сцены по изображению (для раздела «Идея»).
 * @param {Buffer} imageBuffer
 * @param {string} mime  напр. "image/jpeg"
 */
export async function describeImage(imageBuffer, mime = 'image/jpeg') {
  const dataUrl = `data:${mime};base64,${imageBuffer.toString('base64')}`;
  const content = [
    {
      type: 'text',
      text:
        'Опиши кратко (2–4 предложения) что изображено на кадре: сцена, композиция, ' +
        'свет, что делает герой, ключевой приём. Пиши по-русски, без вводных фраз и оценок.',
    },
    { type: 'image_url', image_url: { url: dataUrl } },
  ];
  return chat([{ role: 'user', content }], { model: config.claude.visionModel });
}

/**
 * Перевод/адаптация обновления Instagram на простой русский с разбивкой.
 * Возвращает { ch, me, co } — что изменилось / что значит / что учитывать.
 */
export async function analyzeUpdate({ title, text, source }) {
  const prompt =
    'Ты редактор дайджеста обновлений Instagram для команды контент-мейкеров. ' +
    'На вход — новость об обновлении платформы. Верни СТРОГО JSON без markdown с полями:\n' +
    '{"t": "короткий заголовок по-русски", "cat": "одна из: Алгоритмы, Reels, Посты, Stories, Новые функции, Ограничения", ' +
    '"ch": "что изменилось, 1-2 предложения простым языком", ' +
    '"me": "что это значит для охвата/аудитории, 1-2 предложения", ' +
    '"co": "что учитывать в контенте, практический совет, 1-2 предложения"}\n\n' +
    `Источник: ${source || '—'}\nЗаголовок: ${title || '—'}\nТекст: ${text || '—'}`;
  const raw = await chat([{ role: 'user', content: prompt }]);
  return safeJson(raw);
}

/** Недельная выжимка «Главное за неделю» по списку тем. */
export async function summarizeWeek(items) {
  const list = items.map((i, n) => `${n + 1}. ${i.t}: ${i.ch}`).join('\n');
  const prompt =
    'Собери одно предложение «Главное за неделю» по списку обновлений Instagram. ' +
    'Простой русский, без вводных, до 25 слов.\n\n' +
    list;
  return chat([{ role: 'user', content: prompt }], { maxTokens: 200 });
}

function safeJson(raw) {
  if (!raw) return null;
  let s = raw.trim();
  // срезаем возможные ```json ... ```
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export function claudeConfigured() {
  return !!config.claude.apiKey;
}
