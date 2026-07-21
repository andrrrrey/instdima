// Очереди BullMQ поверх Redis.
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from './config.js';

// BullMQ требует maxRetriesPerRequest=null для блокирующих команд воркера.
export const connection = new IORedis(config.redis.url, {
  maxRetriesPerRequest: null,
});

export const QUEUE_IDEAS = 'analyzeIdea';
export const QUEUE_DIGEST = 'generateDigest';

export const ideaQueue = new Queue(QUEUE_IDEAS, { connection });
export const digestQueue = new Queue(QUEUE_DIGEST, { connection });

export async function enqueueIdeaAnalysis(ideaId) {
  return ideaQueue.add(
    'analyze',
    { ideaId },
    { attempts: 2, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 200 },
  );
}

export async function enqueueDigestGeneration(reason = 'manual') {
  return digestQueue.add(
    'generate',
    { reason },
    { removeOnComplete: 20, removeOnFail: 50 },
  );
}

// Периодическая генерация дайджеста по cron.
export async function scheduleDigestCron(cron) {
  // убираем дубли перед постановкой
  const repeatables = await digestQueue.getRepeatableJobs();
  for (const r of repeatables) {
    await digestQueue.removeRepeatableByKey(r.key);
  }
  if (cron) {
    await digestQueue.add(
      'generate',
      { reason: 'cron' },
      { repeat: { pattern: cron }, removeOnComplete: 20, removeOnFail: 50 },
    );
  }
}
