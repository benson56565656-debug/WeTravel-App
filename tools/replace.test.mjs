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
// 來源是全不透明的 RGBA（有 alpha 通道但沒有一個透明像素）＝一般照片的樣態。
// 規格要透明卻餵這種圖，app 裡會出現實心方塊，必須警告（只驗通道存在會漏掉）。
assert.ok(
  warnings.some((w) => w.includes('不透明')),
  '全不透明來源配需透明規格應有警告，實得：' + JSON.stringify(warnings),
);

console.log('PASS replace.test.mjs');

// 真的帶透明像素的來源＝正常情況，不該有透明相關警告
const clearPath = path.join(dir, 'clear.png');
writeFileSync(
  clearPath,
  await sharp({
    create: { width: 96, height: 83, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).png().toBuffer(),
);
const clear = await encodeToSpec(clearPath, spec);
assert.ok(
  !clear.warnings.some((w) => w.includes('不透明')),
  '帶透明像素的來源不應有透明警告，實得：' + JSON.stringify(clear.warnings),
);

console.log('PASS 透明來源不誤報');

// 超標自動壓縮：照片類來源存 PNG 常爆大小上限（BG_Loading 實測 4988KB/1536KB），
// 應自動降級 palette 量化壓到達標，而不是只警告然後照寫超大檔。
// 用雜訊圖模擬照片（幾乎不可壓）：RGBA 版遠超 200KB、palette 版可壓進去。
const noise = Buffer.alloc(400 * 400 * 4);
for (let i = 0; i < noise.length; i++) noise[i] = (Math.random() * 256) | 0;
const noisyPath = path.join(dir, 'noisy.png');
writeFileSync(
  noisyPath,
  await sharp(noise, { raw: { width: 400, height: 400, channels: 4 } }).png().toBuffer(),
);
const bigSpec = { file: 'big.png', w: 300, h: 300, alpha: false, maxBytes: 200 * 1024 };
const big = await encodeToSpec(noisyPath, bigSpec);
assert.ok(
  big.buf.length <= bigSpec.maxBytes,
  `應自動壓到 ${bigSpec.maxBytes} 內，實得 ${big.buf.length}`,
);
assert.ok(
  big.warnings.some((w) => w.includes('自動壓縮')),
  '應告知有自動壓縮，實得：' + JSON.stringify(big.warnings),
);
assert.ok(
  !big.warnings.some((w) => w.includes('超過上限')),
  '壓到達標就不該再警告超上限，實得：' + JSON.stringify(big.warnings),
);
const bigMeta = await sharp(big.buf).metadata();
assert.strictEqual(bigMeta.width, 300, '壓縮不可動到尺寸');

// 真的壓不下去（上限給到離譜小）→ 保留超上限警告，不無限硬壓
const hopeless = await encodeToSpec(noisyPath, { ...bigSpec, maxBytes: 5 * 1024 });
assert.ok(
  hopeless.warnings.some((w) => w.includes('超過上限')),
  '壓不進去仍應警告超上限，實得：' + JSON.stringify(hopeless.warnings),
);

// 帶透明的來源走 palette 壓縮後 alpha 不可丟（tRNS 保透明，check 端認得）
const alphaNoise = Buffer.alloc(400 * 400 * 4);
for (let i = 0; i < alphaNoise.length; i++) alphaNoise[i] = (Math.random() * 256) | 0;
const alphaNoisyPath = path.join(dir, 'alpha-noisy.png');
writeFileSync(
  alphaNoisyPath,
  await sharp(alphaNoise, { raw: { width: 400, height: 400, channels: 4 } }).png().toBuffer(),
);
const alphaBig = await encodeToSpec(alphaNoisyPath, { ...bigSpec, alpha: true });
const alphaMeta = await sharp(alphaBig.buf).metadata();
assert.ok(alphaMeta.hasAlpha, '自動壓縮後 alpha 通道不可丟失');

console.log('PASS 超標自動壓縮（達標/壓不下/保 alpha）');
