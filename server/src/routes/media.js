// Отдача медиа по короткоживущему подписанному токену (работает с <img src>).
import { prisma } from '../db.js';
import {
  verifyMediaToken,
  getObjectStream,
  getObjectRangeStream,
  statObject,
  presignedUrl,
  storageDriver,
} from '../services/storage.js';

export default async function mediaRoutes(app) {
  app.get('/api/media/:id', async (req, reply) => {
    const { id } = req.params;
    const { token, frame } = req.query;
    if (!verifyMediaToken(id, token)) return reply.code(403).send({ error: 'bad_token' });

    const media = await prisma.media.findUnique({ where: { id } });
    if (!media) return reply.code(404).send({ error: 'not_found' });

    const wantFrame = (frame === '1' || frame === 'true') && media.framePath;
    const key = wantFrame ? media.framePath : media.path;
    const mime = wantFrame ? 'image/jpeg' : media.mime;

    // ?download=1 → отдать как вложение (кнопка «Скачать»)
    const asDownload = req.query.download === '1' || req.query.download === 'true';
    const filename = `media-${media.id}.${media.kind === 'video' && !wantFrame ? 'mp4' : 'jpg'}`;

    if (storageDriver === 's3') {
      const url = await presignedUrl(key, undefined, asDownload ? filename : undefined);
      return reply.redirect(url);
    }

    // disk-режим: поддержка Range (частичная отдача) — обязательна для <video> на iOS.
    let size;
    try {
      ({ size } = await statObject(key));
    } catch {
      return reply.code(404).send({ error: 'not_found' });
    }

    reply.header('Accept-Ranges', 'bytes');
    reply.header('Content-Type', mime || 'application/octet-stream');
    reply.header('Cache-Control', 'private, max-age=3600');
    if (asDownload) reply.header('Content-Disposition', `attachment; filename="${filename}"`);

    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
      if (Number.isNaN(start)) start = 0;
      if (Number.isNaN(end) || end >= size) end = size - 1;
      if (start > end || start >= size) {
        reply.header('Content-Range', `bytes */${size}`);
        return reply.code(416).send();
      }
      reply.code(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${size}`);
      reply.header('Content-Length', end - start + 1);
      return reply.send(getObjectRangeStream(key, start, end));
    }

    reply.header('Content-Length', size);
    return reply.send(getObjectStream(key));
  });
}
