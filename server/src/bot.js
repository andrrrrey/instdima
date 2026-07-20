// Telegram-бот (grammY): меню-кнопка запуска Mini App + проверка доступа.
import { Bot } from 'grammy';
import { config } from './config.js';
import { prisma } from './db.js';

export function createBot() {
  if (!config.telegram.botToken) {
    console.warn('[bot] BOT_TOKEN не задан — бот не запущен.');
    return null;
  }
  const bot = new Bot(config.telegram.botToken);

  async function isAllowed(tgId) {
    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(tgId) } });
    return !!(user && user.active);
  }

  bot.command('start', async (ctx) => {
    const allowed = await isAllowed(ctx.from.id);
    if (!allowed) {
      await ctx.reply(
        'Доступ к приложению ограничен. Обратитесь к владельцу контент-плана, ' +
          'чтобы вас добавили в список пользователей.',
      );
      return;
    }
    await ctx.reply('Контент-план готов. Откройте приложение кнопкой ниже 👇', {
      reply_markup: {
        inline_keyboard: [[{ text: '📅 Открыть контент-план', web_app: { url: config.miniappUrl } }]],
      },
    });
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      'Это Mini App для планирования Instagram-контента.\n' +
        '• /start — открыть приложение\n' +
        'Кнопка меню слева от поля ввода тоже открывает приложение.',
    );
  });

  bot.catch((err) => console.error('[bot] error:', err.error?.message || err.message));

  return bot;
}

// Устанавливает кнопку меню чата = запуск Mini App.
export async function setupBotMenu(bot) {
  try {
    await bot.api.setChatMenuButton({
      menu_button: {
        type: 'web_app',
        text: 'Контент-план',
        web_app: { url: config.miniappUrl },
      },
    });
    await bot.api.setMyCommands([
      { command: 'start', description: 'Открыть контент-план' },
      { command: 'help', description: 'Помощь' },
    ]);
  } catch (e) {
    console.warn('[bot] setup menu:', e.message);
  }
}
