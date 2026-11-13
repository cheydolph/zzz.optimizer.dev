// Checks every animated W-Engine icon against the encoding build-scripts/compress-wengine-videos.js
// produces: H.264, yuv420p, at most 320x320, 24 fps, no audio track, MP4 index at the front
// (faststart), and a clean full decode. Needs ffprobe and ffmpeg on PATH.
// Usage: node test-harness/video-check.mjs [--no-decode]
import { execFileSync } from 'node:child_process';
import { openSync, readSync, closeSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './lib.mjs';

const DIR = join(REPO_ROOT, 'src', 'assets', 'data', 'images', 'wengine-gifs');
const MAX_SIZE = 320;
const FPS = '24/1';
const decode = !process.argv.includes('--no-decode');

/** The MP4 is "faststart" when its moov box comes before mdat. */
function moovFirst(file) {
  const fd = openSync(file, 'r');
  try {
    const header = Buffer.alloc(8);
    let offset = 0;
    const size = statSync(file).size;
    while (offset + 8 <= size) {
      readSync(fd, header, 0, 8, offset);
      const boxSize = header.readUInt32BE(0);
      const type = header.toString('latin1', 4, 8);
      if (type === 'moov') return true;
      if (type === 'mdat') return false;
      if (boxSize < 8) return false;
      offset += boxSize;
    }
    return false;
  } finally {
    closeSync(fd);
  }
}

function probe(file) {
  const out = execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate',
      '-of',
      'json',
      file,
    ],
    { encoding: 'utf8' },
  );
  return JSON.parse(out).streams;
}

const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.mp4'))
  .sort();
const problems = [];
let bytes = 0;
for (const name of files) {
  const file = join(DIR, name);
  bytes += statSync(file).size;
  const streams = probe(file);
  const video = streams.filter((s) => s.codec_type === 'video');
  if (streams.some((s) => s.codec_type === 'audio')) problems.push(`${name}: has an audio track`);
  if (video.length !== 1) {
    problems.push(`${name}: ${video.length} video streams`);
    continue;
  }
  const v = video[0];
  if (v.codec_name !== 'h264') problems.push(`${name}: codec ${v.codec_name}`);
  if (v.pix_fmt !== 'yuv420p') problems.push(`${name}: pix_fmt ${v.pix_fmt}`);
  if (v.width > MAX_SIZE || v.height > MAX_SIZE) problems.push(`${name}: ${v.width}x${v.height}`);
  if (v.r_frame_rate !== FPS) problems.push(`${name}: ${v.r_frame_rate} fps`);
  if (!moovFirst(file)) problems.push(`${name}: not faststart (moov after mdat)`);
  if (decode) {
    try {
      execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-'], { stdio: 'pipe' });
    } catch (error) {
      problems.push(`${name}: decode failed (${String(error).slice(0, 120)})`);
    }
  }
}

const mib = (bytes / 1048576).toFixed(1);
if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(`FAIL: ${problems.length} problems in ${files.length} videos (${mib} MiB)`);
  process.exit(1);
}
console.log(
  `PASS: ${files.length} videos, ${mib} MiB, all H.264 yuv420p <= ${MAX_SIZE}px ${FPS} fps, silent, faststart${decode ? ', clean decode' : ''}`,
);
