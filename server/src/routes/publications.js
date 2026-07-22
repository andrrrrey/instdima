// Раздел «План»: CRUD публикаций, статусы, комментарии, история, медиа.
import { z } from 'zod';
import { prisma } from '../db.js';
import { authGuard } from '../auth/session.js';
import { config } from '../config.js';
import { putObject } from '../services/storage.js';
import { extractFrame } from '../services/ffmpeg.js';
import { serializePublication } from '../serializers.js';
import { fmtD, dateKey } from '../util/format.js';
import {
  canCreatePub,
  canEditPub,
  canViewPub,
  canApprove,
  allowedStatusTransitions,
  pubVisibilityWhere,
  isOwner,
  isMaker,
} from '../permissions.js';

const INCLUDE = {
  media: true,
  owner: true,
  comments: { orderBy: { createdAt: 'asc' } },
  history: { orderBy: { createdAt: 'desc' } },
};

const ST_LABEL = {
  draft: 'Черновик', work: 'В работе', review: 'На согласовании', fixes: 'На правках',
  ready: 'Готово к выходу', published: 'Опубликовано', canceled: 'Отменено',
};

async function logHistory(pubId, actorId, text) {
  await prisma.publicationHistory.create({ data: { publicationId: pubId, actorId, text } });
}

async function loadPub(id) {
  return prisma.publication.findUnique({ where: { id }, include: INCLUDE });
}

const createSchema = z.object({
  title: z.string().max(300).optional(),
  type: z.enum(['post', 'reels']).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  ownerId: z.string().nullable().optional(),
});

const patchSchema = z.object({
  title: z.string().max(300).optional(),
  type: z.enum(['post', 'reels']).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  ownerId: z.string().nullable().optional(),
  text: z.string().optional(),
  alt: z.string().optional(),
  tags: z.array(z.string()).optional(),
  track: z.string().optional(),
  trackAt: z.string().optional(),
  dur: z.string().nullable().optional(),
  g: z.number().int().optional(),
});

export default async function publicationRoutes(app) {
  app.addHook('preHandler', authGuard);

  // Список публикаций (видимость по роли + серверные фильтры).
  app.get('/api/publications', async (req) => {
    const { from, to, status, type, owner, overdue } = req.query;
    const where = pubVisibilityWhere(req.user);
    if (from || to) where.date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    if (status) where.status = { in: String(status).split(',') };
    if (type) where.type = type;
    if (owner) where.ownerId = owner;
    if (overdue === '1') {
      where.deadline = { lt: dateKey(), not: null };
      where.status = { notIn: ['published', 'canceled'] };
    }
    const pubs = await prisma.publication.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
    });
    return { items: pubs.map((p) => serializePublication(p, req.user)) };
  });

  app.get('/api/publications/:id', async (req, reply) => {
    const pub = await loadPub(req.params.id);
    if (!pub || !canViewPub(req.user, pub)) return reply.code(404).send({ error: 'not_found' });
    return serializePublication(pub, req.user);
  });

  // Создание публикации.
  app.post('/api/publications', async (req, reply) => {
    if (!canCreatePub(req.user)) return reply.code(403).send({ error: 'forbidden' });
    const parsed = createSchema.safeParse(req.body || {});
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', details: parsed.error.issues });
    const b = parsed.data;

    // По умолчанию контент-мейкер — ответственный за свою публикацию.
    let ownerId = b.ownerId ?? null;
    if (isMaker(req.user)) ownerId = req.user.id;
    if (ownerId && !isOwner(req.user)) ownerId = req.user.id; // мейкер не назначает других

    const pub = await prisma.publication.create({
      data: {
        title: b.title || '',
        type: b.type || 'post',
        date: b.date,
        time: b.time || '12:00',
        deadline: b.deadline ?? null,
        status: 'draft',
        ownerId,
        g: Math.floor(Math.random() * 6),
        dur: b.type === 'reels' ? '0:15' : null,
      },
      include: INCLUDE,
    });
    await logHistory(pub.id, req.user.id, `${req.user.name} создал(а) черновик`);
    const fresh = await loadPub(pub.id);
    return reply.code(201).send(serializePublication(fresh, req.user));
  });

  // Редактирование полей (автосейв формы).
  app.patch('/api/publications/:id', async (req, reply) => {
    const pub = await loadPub(req.params.id);
    if (!pub) return reply.code(404).send({ error: 'not_found' });
    if (!canEditPub(req.user, pub)) return reply.code(403).send({ error: 'forbidden' });
    const parsed = patchSchema.safeParse(req.body || {});
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', details: parsed.error.issues });
    const b = parsed.data;

    const data = {};
    for (const k of ['title', 'type', 'time', 'text', 'alt', 'track', 'trackAt', 'dur', 'g']) {
      if (b[k] !== undefined) data[k] = b[k];
    }
    if (b.tags !== undefined) data.tags = b.tags;

    // История для значимых изменений.
    if (b.date !== undefined && b.date !== pub.date) {
      data.date = b.date;
      await logHistory(pub.id, req.user.id, `${req.user.name}: выход ${fmtD(pub.date)} → ${fmtD(b.date)}`);
    }
    if (b.deadline !== undefined && b.deadline !== pub.deadline) {
      data.deadline = b.deadline;
      await logHistory(
        pub.id, req.user.id,
        `${req.user.name}: дедлайн ${pub.deadline ? fmtD(pub.deadline) : '—'} → ${b.deadline ? fmtD(b.deadline) : '—'}`,
      );
    }
    // Смена ответственного — только владелец.
    if (b.ownerId !== undefined && isOwner(req.user) && b.ownerId !== pub.ownerId) {
      data.ownerId = b.ownerId || null;
      const oldName = pub.owner?.name || 'никто';
      const newOwner = b.ownerId ? await prisma.user.findUnique({ where: { id: b.ownerId } }) : null;
      await logHistory(pub.id, req.user.id, `Ева: ответственный ${oldName} → ${newOwner?.name || 'никто'}`);
    }

    await prisma.publication.update({ where: { id: pub.id }, data });
    const fresh = await loadPub(pub.id);
    return serializePublication(fresh, req.user);
  });

  // Смена статуса (с проверкой допустимых переходов по роли).
  app.post('/api/publications/:id/status', async (req, reply) => {
    const pub = await loadPub(req.params.id);
    if (!pub) return reply.code(404).send({ error: 'not_found' });
    const { status } = req.body || {};
    if (!ST_LABEL[status]) return reply.code(400).send({ error: 'bad_status' });

    const allowed = allowedStatusTransitions(req.user, pub);
    const isApproveAction = (status === 'ready' || status === 'fixes') && pub.status === 'review';
    if (!allowed.includes(status) && !(isApproveAction && canApprove(req.user))) {
      return reply.code(403).send({ error: 'transition_not_allowed', from: pub.status, to: status });
    }

    const data = { status };
    // При публикации фиксируем просрочку относительно дедлайна.
    if (status === 'published') {
      data.late = !!(pub.deadline && dateKey() > pub.deadline);
    }
    const was = ST_LABEL[pub.status];
    await prisma.publication.update({ where: { id: pub.id }, data });
    await logHistory(pub.id, req.user.id, `${req.user.name}: ${was} → ${ST_LABEL[status]}`);
    const fresh = await loadPub(pub.id);
    return serializePublication(fresh, req.user);
  });

  // Комментарий.
  app.post('/api/publications/:id/comments', async (req, reply) => {
    const pub = await loadPub(req.params.id);
    if (!pub || !canViewPub(req.user, pub)) return reply.code(404).send({ error: 'not_found' });
    const text = String(req.body?.text || '').trim();
    if (!text) return reply.code(400).send({ error: 'empty' });
    await prisma.publicationComment.create({ data: { publicationId: pub.id, authorId: req.user.id, text } });
    await prisma.publication.update({ where: { id: pub.id }, data: { updatedAt: new Date() } });
    const fresh = await loadPub(pub.id);
    return serializePublication(fresh, req.user);
  });

  // Дублирование.
  app.post('/api/publications/:id/duplicate', async (req, reply) => {
    const pub = await loadPub(req.params.id);
    if (!pub) return reply.code(404).send({ error: 'not_found' });
    if (!canEditPub(req.user, pub)) return reply.code(403).send({ error: 'forbidden' });
    const copy = await prisma.publication.create({
      data: {
        title: pub.title ? `${pub.title} (копия)` : '',
        type: pub.type, date: pub.date, time: pub.time, deadline: pub.deadline,
        status: 'draft', ownerId: pub.ownerId, g: pub.g, dur: pub.dur,
        text: pub.text, alt: pub.alt, tags: pub.tags, track: pub.track, trackAt: pub.trackAt,
        mediaId: pub.mediaId,
      },
      include: INCLUDE,
    });
    await logHistory(copy.id, req.user.id, `${req.user.name} дублировал(а) публикацию`);
    const fresh = await loadPub(copy.id);
    return reply.code(201).send(serializePublication(fresh, req.user));
  });

  // Архивирование.
  app.post('/api/publications/:id/archive', async (req, reply) => {
    const pub = await loadPub(req.params.id);
    if (!pub) return reply.code(404).send({ error: 'not_found' });
    if (!canEditPub(req.user, pub)) return reply.code(403).send({ error: 'forbidden' });
    await prisma.publication.update({ where: { id: pub.id }, data: { archived: true } });
    return { ok: true };
  });

  app.delete('/api/publications/:id', async (req, reply) => {
    const pub = await loadPub(req.params.id);
    if (!pub) return reply.code(404).send({ error: 'not_found' });
    if (!canEditPub(req.user, pub)) return reply.code(403).send({ error: 'forbidden' });
    await prisma.publication.delete({ where: { id: pub.id } });
    return { ok: true };
  });

  // Загрузка медиа (пост — изображение, Reels — видео).
  app.post('/api/publications/:id/media', async (req, reply) => {
    const pub = await loadPub(req.params.id);
    if (!pub) return reply.code(404).send({ error: 'not_found' });
    if (!canEditPub(req.user, pub)) return reply.code(403).send({ error: 'forbidden' });

    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'no_file' });
    const buffer = await file.toBuffer();
    const kind = file.mimetype.startsWith('video') ? 'video' : 'image';
    const ext = (file.filename?.split('.').pop() || (kind === 'video' ? 'mp4' : 'jpg')).toLowerCase();
    const key = `pub/${pub.id}/${Date.now()}.${ext}`;
    await putObject(key, buffer, file.mimetype);

    // Для видео извлекаем кадр-постер (надёжное превью на iOS).
    let framePath = null;
    if (kind === 'video') {
      try {
        const frame = await extractFrame(buffer, 1);
        framePath = `pub/${pub.id}/poster-${Date.now()}.jpg`;
        await putObject(framePath, frame, 'image/jpeg');
      } catch (e) {
        req.log?.warn?.(`poster extract failed: ${e.message}`);
      }
    }

    const media = await prisma.media.create({
      data: { kind, path: key, mime: file.mimetype, size: buffer.length, framePath },
    });
    await prisma.publication.update({
      where: { id: pub.id },
      data: { mediaId: media.id, type: kind === 'video' ? 'reels' : pub.type },
    });
    const fresh = await loadPub(pub.id);
    return serializePublication(fresh, req.user);
  });
}

export { logHistory, INCLUDE };
