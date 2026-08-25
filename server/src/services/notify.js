// Telegram-уведомления о ключевых событиях согласования.
// Отправка идёт через того же бота, что и меню Mini App; если инстанс бота
// не передан (например, воркер), лениво создаём отдельный на том же токене.
import { Bot } from 'grammy';
import { config } from '../config.js';
import { prisma } from '../db.js';

let botRef = null;

// Вызывается из index.js после createBot(), чтобы переиспользовать инстанс.
export function setNotifyBot(bot) {
  botRef = bot;
}

function getBot() {
  if (botRef) return botRef;
  if (!config.telegram.botToken) return null;
  botRef = new Bot(config.telegram.botToken);
  return botRef;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Отправка одному пользователю по его telegramId. Ошибки не пробрасываем —
// уведомление не должно ломать основной запрос.
async function send(telegramId, text) {
  const bot = getBot();
  if (!bot || !telegramId) return;
  try {
    await bot.api.sendMessage(String(telegramId), text, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: {
        inline_keyboard: [[
          { text: '📅 Открыть контент-план', web_app: { url: config.miniappUrl } },
        ]],
      },
    });
  } catch (e) {
    console.warn('[notify] send failed:', e?.message || e);
  }
}

async function owners() {
  return prisma.user.findMany({ where: { role: 'owner', active: true } });
}

// Уведомления о смене статуса публикации.
// pub — состояние ДО обновления (в нём ещё актуальны ownerId/title),
// actor — тот, кто выполнил переход, newStatus — новый статус.
export async function notifyStatusChange(pub, actor, newStatus) {
  const title = esc(pub.title || 'Без названия');
  const who = esc(actor?.name || 'Кто-то');

  if (newStatus === 'review') {
    // Материал ушёл на согласование — уведомляем владельцев (кроме автора действия).
    const list = await owners();
    for (const o of list) {
      if (o.id === actor?.id) continue;
      await send(
        o.telegramId,
        `🔔 <b>Нужно согласование</b>\n«${title}» — ${who} отправил(а) на согласование.`,
      );
    }
    return;
  }

  if ((newStatus === 'ready' || newStatus === 'fixes') && pub.ownerId && pub.ownerId !== actor?.id) {
    // Решение владельца — уведомляем ответственного за публикацию.
    const owner = await prisma.user.findUnique({ where: { id: pub.ownerId } });
    if (owner && owner.active) {
      const msg = newStatus === 'ready'
        ? `✅ <b>Согласовано</b>\n«${title}» — ${who} согласовал(а). Можно публиковать.`
        : `✏️ <b>Вернули на правки</b>\n«${title}» — ${who} вернул(а) на правки.`;
      await send(owner.telegramId, msg);
    }
  }
}

// Уведомление о новом комментарии: ответственному и владельцам (кроме автора).
export async function notifyComment(pub, actor, text) {
  const title = esc(pub.title || 'Без названия');
  const who = esc(actor?.name || 'Кто-то');
  const snippet = esc(String(text || '').slice(0, 160));

  const seen = new Set();
  const recipients = [];
  const push = (u) => {
    if (u && u.active && u.id !== actor?.id && !seen.has(u.id)) {
      seen.add(u.id);
      recipients.push(u);
    }
  };

  if (pub.ownerId) push(await prisma.user.findUnique({ where: { id: pub.ownerId } }));
  for (const o of await owners()) push(o);

  for (const u of recipients) {
    await send(
      u.telegramId,
      `💬 <b>Новый комментарий</b>\n«${title}» — ${who}:\n${snippet}`,
    );
  }
}
