// Фабрика Fastify-приложения: API + отдача статики фронтенда.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import { config } from './config.js';
import { ensureReady as storageReady } from './services/storage.js';

import authRoutes from './routes/auth.js';
import mediaRoutes from './routes/media.js';
import publicationRoutes from './routes/publications.js';
import ideaRoutes from './routes/ideas.js';
import digestRoutes from './routes/digest.js';
import userRoutes from './routes/users.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function buildApp() {
  const app = Fastify({
    logger: config.env === 'production' ? true : { transport: undefined },
    bodyLimit: 15 * 1024 * 1024,
    trustProxy: true,
  });

  await app.register(fastifyMultipart, {
    limits: { fileSize: 200 * 1024 * 1024 }, // до 200 МБ на видео Reels
  });

  // Пустое тело при content-type: application/json трактуем как {} —
  // POST-действия (смена статуса, генерация дайджеста) могут идти без тела.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (!body || String(body).trim() === '') return done(null, {});
    try {
      done(null, JSON.parse(body));
    } catch (err) {
      err.statusCode = 400;
      done(err);
    }
  });

  await storageReady();

  // API
  await app.register(authRoutes);
  await app.register(mediaRoutes);
  await app.register(publicationRoutes);
  await app.register(ideaRoutes);
  await app.register(digestRoutes);
  await app.register(userRoutes);

  app.get('/api/health', async () => ({ ok: true, ts: Date.now() }));

  // Статика фронтенда (public/index.html).
  const publicDir = config.publicDir || path.resolve(__dirname, '../../public');
  await app.register(fastifyStatic, { root: publicDir, index: ['index.html'] });

  // SPA fallback (не для /api).
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url && req.raw.url.startsWith('/api')) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return reply.sendFile('index.html');
  });

  return app;
}
