import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * Every frame of the mascot GIFs must cover the whole canvas.
 *
 * A GIF frame carries its own position and size, and encoders shrink each one to just the
 * pixels that changed since the last. That is normally free space saving. It is not free here:
 * the mascot is drawn with a `drop-shadow`, which is computed from the whole image's alpha, and
 * a browser only repaints the frame's own rectangle. Everything outside it keeps the previous
 * frame's glow — so the halo was sliced off along a straight line exactly at each stage's
 * bounding box, worst on the wide stages whose arms reach furthest.
 *
 * Reading the header directly rather than through an image library keeps the check honest: it
 * asserts what is actually in the bytes a browser will read.
 */
const ASSETS = ['turboham-evolution.gif', 'turboham-mark.gif'];

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Walks the GIF block structure and returns every image descriptor, plus the logical screen. */
function readFrames(buf: Buffer): { width: number; height: number; frames: Frame[] } {
  assert.equal(buf.subarray(0, 3).toString('ascii'), 'GIF', 'not a GIF');
  const width = buf.readUInt16LE(6);
  const height = buf.readUInt16LE(8);

  let p = 13;
  const packed = buf[10];
  // Global colour table, if the flag in the packed field says there is one.
  if (packed & 0x80) p += 3 * 2 ** ((packed & 0x07) + 1);

  const skipBlocks = (at: number): number => {
    let i = at;
    while (buf[i] !== 0x00) i += buf[i] + 1;
    return i + 1;
  };

  const frames: Frame[] = [];
  while (p < buf.length) {
    const marker = buf[p];
    if (marker === 0x3b) break; // trailer
    if (marker === 0x21) {
      // extension: label byte, then sub-blocks
      p = skipBlocks(p + 2);
      continue;
    }
    if (marker === 0x2c) {
      frames.push({
        x: buf.readUInt16LE(p + 1),
        y: buf.readUInt16LE(p + 3),
        w: buf.readUInt16LE(p + 5),
        h: buf.readUInt16LE(p + 7),
      });
      const localPacked = buf[p + 9];
      p += 10;
      if (localPacked & 0x80) p += 3 * 2 ** ((localPacked & 0x07) + 1);
      p += 1; // LZW minimum code size
      p = skipBlocks(p);
      continue;
    }
    throw new Error(`unexpected block 0x${marker.toString(16)} at ${p}`);
  }
  return { width, height, frames };
}

for (const name of ASSETS) {
  test(`${name}: every frame covers the full canvas`, () => {
    const buf = readFileSync(join(import.meta.dirname, name));
    const { width, height, frames } = readFrames(buf);

    assert.ok(frames.length > 1, `${name} should be animated, found ${frames.length} frame(s)`);

    const partial = frames
      .map((f, i) => ({ ...f, i }))
      .filter((f) => f.x !== 0 || f.y !== 0 || f.w !== width || f.h !== height);

    assert.deepEqual(
      partial,
      [],
      `${partial.length}/${frames.length} frames are stored as sub-rectangles of ` +
        `${width}x${height}. Re-export with full frames (magick in.gif -coalesce out.gif).`,
    );
  });
}
