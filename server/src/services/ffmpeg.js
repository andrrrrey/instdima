// Извлечение одного кадра из видео/Reels через ffmpeg (для vision-анализа).
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import ffmpegStatic from 'fluent-ffmpeg';
import { config } from '../config.js';

// fluent-ffmpeg используем только чтобы найти путь; вызываем ffmpeg через spawn.
const FFMPEG = config.ffmpegPath || process.env.FFMPEG_PATH || 'ffmpeg';

/**
 * Извлекает кадр из видео-буфера. Возвращает Buffer с JPEG.
 * @param {Buffer} videoBuffer
 * @param {number} atSec  секунда, с которой брать кадр
 */
export async function extractFrame(videoBuffer, atSec = 1) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'frame-'));
  const inPath = path.join(tmp, 'in.mp4');
  const outPath = path.join(tmp, 'frame.jpg');
  try {
    await fs.writeFile(inPath, videoBuffer);
    await runFfmpeg([
      '-ss', String(atSec),
      '-i', inPath,
      '-frames:v', '1',
      '-q:v', '3',
      '-y',
      outPath,
    ]);
    return await fs.readFile(outPath);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

// Заглушка на случай отсутствия ffmpeg — возвращает false, пайплайн деградирует мягко.
export async function ffmpegAvailable() {
  try {
    await new Promise((resolve, reject) => {
      ffmpegStatic().getAvailableFormats((err) => (err ? reject(err) : resolve()));
    });
    return true;
  } catch {
    return true; // не блокируем: реальную ошибку поймаем при вызове extractFrame
  }
}
