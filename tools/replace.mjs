// tools/replace.mjs
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPLACEABLE, ICONS } from './assets-spec.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 純轉換：把來源圖 cover 縮放到 spec 尺寸，回傳 PNG buffer ＋警告清單（不寫檔）
export async function encodeToSpec(srcPath, spec) {
  const warnings = [];
  const meta = await sharp(srcPath).metadata();
  const srcAR = meta.width / meta.height;
  const dstAR = spec.w / spec.h;
  if (Math.abs(srcAR - dstAR) / dstAR > 0.05) {
    warnings.push(`來源長寬比 ${srcAR.toFixed(2)} ≠ 目標 ${dstAR.toFixed(2)}，將置中裁切（cover）`);
  }
  if (spec.alpha && !meta.hasAlpha) {
    warnings.push('規格需透明背景，但來源無 alpha 通道');
  }
  const buf = await sharp(srcPath)
    .resize(spec.w, spec.h, { fit: 'cover', position: 'centre' })
    .png({ palette: false, compressionLevel: 9 }) // 明講關 palette：sharp 0.35 隱性規則
    .toBuffer();
  if (buf.length > spec.maxBytes) {
    warnings.push(`輸出 ${(buf.length / 1024).toFixed(0)}KB 超過上限 ${(spec.maxBytes / 1024).toFixed(0)}KB`);
  }
  return { buf, warnings };
}

function bumpSwCache() {
  const swPath = path.join(REPO_ROOT, 'sw.js');
  const sw = readFileSync(swPath, 'utf8');
  const m = sw.match(/const CACHE_NAME = 'wetravel-v(\d+)';/);
  if (!m) {
    console.warn('⚠ 找不到 CACHE_NAME，未 bump——請手動 bump sw.js');
    return;
  }
  const next = Number(m[1]) + 1;
  writeFileSync(swPath, sw.replace(m[0], `const CACHE_NAME = 'wetravel-v${next}';`));
  console.log(`✓ sw.js CACHE_NAME → wetravel-v${next}`);
}

async function writeOne(srcPath, spec, destPath) {
  const { buf, warnings } = await encodeToSpec(srcPath, spec);
  warnings.forEach((w) => console.warn(`⚠ ${w}`));
  writeFileSync(destPath, buf);
  console.log(`✓ ${path.basename(destPath)} ${spec.w}x${spec.h} ${(buf.length / 1024).toFixed(0)}KB`);
}

function listReplaceable() {
  console.error('  icon（PWA 圖示，一次產出 icon-192 + icon-512）');
  for (const s of REPLACEABLE.values()) {
    if (s.file.startsWith('icon-')) continue;
    console.error(`  ${s.file}  (${s.w}x${s.h})  ${s.use}`);
  }
}

async function main() {
  const [target, src] = process.argv.slice(2);
  if (!target || !src) {
    console.error('用法：node tools/replace.mjs <目標檔名|icon> <新圖路徑>');
    process.exit(1);
  }
  if (target === 'icon') {
    for (const spec of ICONS) {
      await writeOne(src, spec, path.join(REPO_ROOT, spec.file));
    }
    bumpSwCache();
    return;
  }
  const spec = REPLACEABLE.get(target);
  if (!spec || target.startsWith('icon-')) {
    console.error(`✗ 「${target}」不是可替換素材。可換清單：`);
    listReplaceable();
    process.exit(1);
  }
  await writeOne(src, spec, path.join(REPO_ROOT, 'assets', spec.file));
  bumpSwCache();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
