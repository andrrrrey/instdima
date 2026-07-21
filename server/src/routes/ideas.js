// Раздел «Идея»: разбор публичной ссылки Instagram, список идей, перенос в план.
import { z } from 'zod';
import { prisma } from '../db.js';
import { authGuard } from '../auth/session.js';
import { enqueueIdeaAnalysis } from '../queue.js';
import { parseInstagramUrl } from '../services/scraper.js';
import { getObjectBuffer } from '../services/storage.js';
import { serializeIdea, serializePublication } from '../serializers.js';
import { INCLUDE, logHistory } from './publications.js';
import { dateKey, addDaysKey } from '../util/format.js';
import { isMaker } from '../permissions.js';

export default async function ideaRoutes(app) {
  app.addHook('preHandler', authGuard);

  app.get('/api/ideas', async (req) => {
    const { state, tag } = req.query;
    const where = {};
    if (state) where.state = state;
    const ideas = await prisma.idea.findMany({
      where,
      include: { media: true },
      orderBy: { createdAt: 'desc' },
    });
    let items = ideas.map((i) => serializeIdea(i, req.user));
    if (tag && tag !== 'all') items = items.filter((i) => (i.tags || []).includes(tag));
    return { items };
  });

  app.get('/api/ideas/:id', async (req, reply) => {
    const idea = await prisma.idea.findUnique({ where: { id: req.params.id }, include: { media: true } });
    if (!idea) return reply.code(404).send({ error: 'not_found' });
    return serializeIdea(idea, req.user);
  });

  // Разбор ссылки: создаём идею в статусе processing и ставим job.
  app.post('/api/ideas/analyze', async (req, reply) => {
    const url = String(req.body?.url || '').trim();
    const parsed = parseInstagramUrl(url);
    if (!parsed.ok) return reply.code(400).send({ error: 'bad_link', reason: parsed.reason });

    const idea = await prisma.idea.create({
      data: {
        url: parsed.url,
        state: 'new',
        status: 'processing',
        g: Math.floor(Math.random() * 6),
        type: parsed.kind === 'post' ? 'post' : 'reels',
        tags: isMaker(req.user) ? [] : [],
      },
      include: { media: true },
    });
    await enqueueIdeaAnalysis(idea.id);
    return reply.code(202).send(serializeIdea(idea, req.user));
  });

  const patchSchema = z.object({
    state: z.enum(['new', 'saved', 'work', 'used', 'archived']).optional(),
    title: z.string().max(300).optional(),
    note: z.string().optional(),
    ai: z.string().optional(),
    text: z.string().optional(),
    tags: z.array(z.string()).optional(),
  });

  // Ручное создание идеи (напр. «Сохранить в идеи» из дайджеста).
  const manualSchema = z.object({
    title: z.string().max(300).optional(),
    note: z.string().optional(),
    ai: z.string().optional(),
    text: z.string().optional(),
    hashtags: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    author: z.string().optional(),
    url: z.string().optional(),
    type: z.enum(['post', 'reels']).optional(),
    state: z.enum(['new', 'saved', 'work', 'used', 'archived']).optional(),
  });

  app.post('/api/ideas', async (req, reply) => {
    const parsed = manualSchema.safeParse(req.body || {});
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const b = parsed.data;
    const idea = await prisma.idea.create({
      data: {
        url: b.url || '',
        type: b.type || 'post',
        state: b.state || 'new',
        status: 'ready',
        g: Math.floor(Math.random() * 6),
        title: b.title || '',
        note: b.note || '',
        ai: b.ai || '',
        text: b.text || '',
        hashtags: b.hashtags || [],
        tags: b.tags || [],
        author: b.author || '',
      },
      include: { media: true },
    });
    return reply.code(201).send(serializeIdea(idea, req.user));
  });

  app.patch('/api/ideas/:id', async (req, reply) => {
    const idea = await prisma.idea.findUnique({ where: { id: req.params.id } });
    if (!idea) return reply.code(404).send({ error: 'not_found' });
    const parsed = patchSchema.safeParse(req.body || {});
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const updated = await prisma.idea.update({
      where: { id: idea.id },
      data: parsed.data,
      include: { media: true },
    });
    return serializeIdea(updated, req.user);
  });

  // Перенести идею в контент-план (создать черновик публикации).
  app.post('/api/ideas/:id/to-plan', async (req, reply) => {
    const idea = await prisma.idea.findUnique({ where: { id: req.params.id }, include: { media: true } });
    if (!idea) return reply.code(404).send({ error: 'not_found' });
    const date = String(req.body?.date || dateKey());

    const pub = await prisma.publication.create({
      data: {
        title: idea.title || 'Идея',
        type: idea.type,
        date,
        time: '12:00',
        deadline: addDaysKey(date, -1),
        status: 'draft',
        ownerId: isMaker(req.user) ? req.user.id : null,
        g: idea.g,
        dur: idea.dur,
        text: idea.text || '',
        tags: idea.hashtags || [],
        mediaId: idea.mediaId,
      },
      include: INCLUDE,
    });
    await logHistory(pub.id, req.user.id, `${req.user.name} создал(а) черновик из идеи`);
    await prisma.idea.update({ where: { id: idea.id }, data: { state: 'work' } });
    const fresh = await prisma.publication.findUnique({ where: { id: pub.id }, include: INCLUDE });
    return reply.code(201).send({ publication: serializePublication(fresh, req.user) });
  });

  app.delete('/api/ideas/:id', async (req, reply) => {
    const idea = await prisma.idea.findUnique({ where: { id: req.params.id } });
    if (!idea) return reply.code(404).send({ error: 'not_found' });
    await prisma.idea.delete({ where: { id: idea.id } });
    return { ok: true };
  });

  // Скачивание исходного медиа идеи.
  app.get('/api/ideas/:id/download', async (req, reply) => {
    const idea = await prisma.idea.findUnique({ where: { id: req.params.id }, include: { media: true } });
    if (!idea || !idea.media) return reply.code(404).send({ error: 'no_media' });
    const buf = await getObjectBuffer(idea.media.path);
    const ext = idea.media.kind === 'video' ? 'mp4' : 'jpg';
    reply.header('Content-Type', idea.media.mime || 'application/octet-stream');
    reply.header('Content-Disposition', `attachment; filename="idea-${idea.id}.${ext}"`);
    return reply.send(buf);
  });
}
