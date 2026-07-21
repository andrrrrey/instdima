// Job-процессор: генерация еженедельного дайджеста.
import { buildDigest } from '../services/digest.js';

export async function processGenerateDigest(job) {
  const digest = await buildDigest();
  console.log(`[digest] создан выпуск ${digest.rangeLabel}, тем: ${digest.items.length} (reason=${job.data?.reason})`);
  return { digestId: digest.id, items: digest.items.length };
}
