// Точка входа воркера BullMQ: разбор идей и генерация дайджеста.
import { Worker } from 'bullmq';
import { connection, QUEUE_IDEAS, QUEUE_DIGEST } from './queue.js';
import { processAnalyzeIdea } from './jobs/analyzeIdea.js';
import { processGenerateDigest } from './jobs/generateDigest.js';

const ideaWorker = new Worker(QUEUE_IDEAS, processAnalyzeIdea, {
  connection,
  concurrency: 2,
});

const digestWorker = new Worker(QUEUE_DIGEST, processGenerateDigest, {
  connection,
  concurrency: 1,
});

for (const [name, w] of [['ideas', ideaWorker], ['digest', digestWorker]]) {
  w.on('completed', (job) => console.log(`[worker:${name}] job ${job.id} завершён`));
  w.on('failed', (job, err) => console.error(`[worker:${name}] job ${job?.id} упал:`, err.message));
}

console.log('[worker] запущен: analyzeIdea, generateDigest');

const shutdown = async () => {
  await ideaWorker.close();
  await digestWorker.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
