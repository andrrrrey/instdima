// Раздел «Дайджест обновлений Instagram».
import { prisma } from '../db.js';
import { authGuard, roleGuard } from '../auth/session.js';
import { enqueueDigestGeneration } from '../queue.js';
import { serializeDigest } from '../serializers.js';

async function readSetFor(userId) {
  const reads = await prisma.digestRead.findMany({ where: { userId }, select: { itemId: true } });
  return new Set(reads.map((r) => r.itemId));
}

export default async function digestRoutes(app) {
  app.addHook('preHandler', authGuard);

  // Актуальный (последний) выпуск.
  app.get('/api/digest/current', async (req, reply) => {
    const digest = await prisma.digest.findFirst({
      orderBy: { publishedAt: 'desc' },
      include: { items: true },
    });
    if (!digest) return reply.send({ digest: null });
    const set = await readSetFor(req.user.id);
    return { digest: serializeDigest(digest, set, req.user) };
  });

  // Архив выпусков (список без содержимого).
  app.get('/api/digest/archive', async () => {
    const digests = await prisma.digest.findMany({
      orderBy: { publishedAt: 'desc' },
      skip: 1,
      take: 20,
      include: { _count: { select: { items: true } } },
    });
    return {
      items: digests.map((d) => ({
        id: d.id,
        range: d.rangeLabel,
        count: d._count.items,
        publishedAt: d.publishedAt,
      })),
    };
  });

  app.get('/api/digest/:id', async (req, reply) => {
    const digest = await prisma.digest.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });
    if (!digest) return reply.code(404).send({ error: 'not_found' });
    const set = await readSetFor(req.user.id);
    return { digest: serializeDigest(digest, set, req.user) };
  });

  // Отметить тему прочитанной (персонально).
  app.post('/api/digest/read', async (req, reply) => {
    const itemId = String(req.body?.id || '');
    if (!itemId) return reply.code(400).send({ error: 'no_id' });
    await prisma.digestRead.upsert({
      where: { userId_itemId: { userId: req.user.id, itemId } },
      create: { userId: req.user.id, itemId },
      update: {},
    });
    return { ok: true };
  });

  // Ручной запуск сборки — только владелец.
  app.post('/api/digest/generate', { preHandler: roleGuard('owner') }, async () => {
    await enqueueDigestGeneration('manual');
    return { ok: true, queued: true };
  });

  // Источники дайджеста — только владелец.
  app.get('/api/digest/sources', { preHandler: roleGuard('owner') }, async () => {
    const sources = await prisma.digestSource.findMany({ orderBy: { createdAt: 'asc' } });
    return { items: sources };
  });

  app.put('/api/digest/sources', { preHandler: roleGuard('owner') }, async (req) => {
    const list = Array.isArray(req.body?.sources) ? req.body.sources : [];
    // Полная замена набора источников.
    await prisma.digestSource.deleteMany({});
    for (const s of list) {
      if (!s.url) continue;
      await prisma.digestSource.create({
        data: {
          url: String(s.url),
          type: s.type === 'html' ? 'html' : 'rss',
          title: s.title || s.url,
          active: s.active !== false,
        },
      });
    }
    const sources = await prisma.digestSource.findMany({ orderBy: { createdAt: 'asc' } });
    return { items: sources };
  });
}
