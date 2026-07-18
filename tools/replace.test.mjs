import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { encodeToSpec } from './replace.mjs';

const dir = mkdtempSync(path.join(os.tmpdir(), 'wt-replace-'));

// 造一張 400x400 帶 alpha 的測試圖（長寬比 1.0）
const srcPath = path.join(dir, 'src.png');
writeFileSync(
  srcPath,
  await sharp({
    create: { width: 400, height: 400, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
  }).png().toBuffer(),
);

// 換成 bow_pink（96x83，需透明）——長寬比不同，應觸發裁切警告
const spec = { file: 'bow_pink.png', w: 96, h: 83, alpha: true, maxBytes: 30720 };
const { buf, warnings } = await encodeToSpec(srcPath, spec);
const outMeta = await sharp(buf).metadata();

assert.strictEqual(outMeta.width, 96, '輸出寬應為 96');
assert.strictEqual(outMeta.height, 83, '輸出高應為 83');
assert.ok(outMeta.hasAlpha, '應保留 alpha 通道');
assert.strictEqual(outMeta.format, 'png', '應為 PNG');
// IHDR color type（byte 25）：6=RGBA，3=palette。palette:false 生效才會是 6（Task 1 踩雷點）
assert.strictEqual(buf.readUInt8(25), 6, 'color type 應為 6（RGBA），非 3（palette）');
assert.ok(warnings.some((w) => w.includes('裁切')), '長寬比不符應有裁切警告');
assert.ok(buf.length <= spec.maxBytes, '應在大小上限內');

console.log('PASS replace.test.mjs');
