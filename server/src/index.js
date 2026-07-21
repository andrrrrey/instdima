// Точка входа веб-сервера: Fastify API + Telegram-бот.
import { config } from './config.js';
import { buildApp } from './app.js';
import { createBot, setupBotMenu } from './bot.js';
import { scheduleDigestCron } from './queue.js';

async function main() {
  const app = await buildApp();

  // Telegram-бот
  const bot = createBot();
  if (bot) {
    await setupBotMenu(bot);
    if (config.telegram.useWebhook) {
      // webhook-режим: Telegram шлёт апдейты на /api/tg/webhook
      const { webhookCallback } = await import('grammy');
      app.post('/api/tg/webhook', webhookCallback(bot, 'fastify'));
      console.log('[bot] webhook-режим');
    } else {
      bot.start({ onStart: (u) => console.log(`[bot] long-polling запущен: @${u.username}`) });
    }
  }

  // Cron-расписание дайджеста.
  try {
    await scheduleDigestCron(config.digest.cron);
    console.log(`[digest] cron: ${config.digest.cron}`);
  } catch (e) {
    console.warn('[digest] не удалось поставить cron:', e.message);
  }

  await app.listen({ port: config.port, host: config.host });
  console.log(`[web] слушаю http://${config.host}:${config.port}`);

  const shutdown = async () => {
    console.log('Завершение...');
    if (bot) await bot.stop().catch(() => {});
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error('Фатальная ошибка запуска:', e);
  process.exit(1);
});
