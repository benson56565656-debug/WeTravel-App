// tools/check.mjs
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSETS, ICONS } from './assets-spec.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 讀 PNG header：寬、高、是否帶透明（逐 chunk 走到 IDAT 前，找 tRNS）
function pngInfo(buf) {
  if (buf.length < 26 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是合法 PNG');
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const colorType = buf.readUInt8(25);
  let hasTRNS = false;
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'tRNS') { hasTRNS = true; break; }
    if (type === 'IDAT') break;
    off += 12 + len; // 4 len + 4 type + data + 4 crc
  }
  const alpha = colorType === 4 || colorType === 6 || (colorType === 3 && hasTRNS);
  return { w, h, alpha };
}

export function checkAll(root) {
  const specs = [
    ...ASSETS.map((s) => ({ ...s, dir: 'assets' })),
    ...ICONS.map((s) => ({ ...s, dir: '.' })),
  ];
  const results = [];
  for (const s of specs) {
    const p = path.join(root, s.dir, s.file);
    const problems = [];
    try {
      const buf = readFileSync(p);
      const { w, h, alpha } = pngInfo(buf);
      if (w !== s.w || h !== s.h) problems.push(`尺寸 ${w}x${h}，應為 ${s.w}x${s.h}`);
      if (s.alpha && !alpha) problems.push('需透明背景但無 alpha 通道');
      if (buf.length > s.maxBytes) {
        problems.push(`${(buf.length / 1024).toFixed(0)}KB 超過上限 ${(s.maxBytes / 1024).toFixed(0)}KB`);
      }
    } catch (e) {
      problems.push(e.code === 'ENOENT' ? '檔案不存在' : e.message);
    }
    results.push({ file: s.file, ok: problems.length === 0, problems });
  }
  // 孤兒檔：assets/*.png 不在規格表內，或 root 出現非 icon 的 *.png
  // （死檔歷史上兩處都有過：assets/icn_bear.png、根目錄 travel_icon.png）
  const knownAssets = new Set(ASSETS.map((s) => s.file));
  const knownIcons = new Set(ICONS.map((s) => s.file));
  const orphans = [
    ...readdirSync(path.join(root, 'assets'))
      .filter((f) => f.toLowerCase().endsWith('.png') && !knownAssets.has(f))
      .map((f) => `assets/${f}`),
    ...readdirSync(root)
      .filter((f) => f.toLowerCase().endsWith('.png') && !knownIcons.has(f)),
  ];
  return { results, orphans };
}

// CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { results, orphans } = checkAll(REPO_ROOT);
  for (const r of results) {
    console.log(r.ok ? `✓ ${r.file}` : `✗ ${r.file} — ${r.problems.join('；')}`);
  }
  for (const o of orphans) console.log(`✗ 孤兒檔（不在規格表）：${o}`);
  const failed = results.filter((r) => !r.ok).length + orphans.length;
  if (failed > 0) {
    console.error(`\n${failed} 項不通過`);
    process.exit(1);
  }
  console.log(`\n全部 ${results.length} 張通過，無孤兒檔`);
}
