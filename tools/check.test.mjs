import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { checkAll } from './check.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { results, orphans } = await checkAll(REPO_ROOT);

const failed = results.filter((r) => !r.ok);
assert.strictEqual(failed.length, 0, '應全綠，未過：' + JSON.stringify(failed, null, 2));
assert.strictEqual(orphans.length, 0, '不應有孤兒檔：' + orphans.join(', '));
assert.strictEqual(results.length, 24, '應檢查 24 張（22 素材 + 2 icon）');

console.log('PASS check.test.mjs（24 張全綠）');

// 孤兒檔偵測：assets/ 與 root 兩處都要抓（死檔歷史上兩處都出現過）
const tmp = mkdtempSync(path.join(os.tmpdir(), 'wt-check-'));
mkdirSync(path.join(tmp, 'assets'));
writeFileSync(path.join(tmp, 'assets', 'stray_asset.png'), 'x'); // assets/ 孤兒
writeFileSync(path.join(tmp, 'stray_root.png'), 'x'); // root 孤兒
writeFileSync(path.join(tmp, 'icon-192.png'), 'x'); // 已知 icon，不算孤兒
const fx = await checkAll(tmp);
assert.ok(fx.orphans.includes('assets/stray_asset.png'), '應抓到 assets 孤兒：' + fx.orphans.join(', '));
assert.ok(fx.orphans.includes('stray_root.png'), '應抓到 root 孤兒：' + fx.orphans.join(', '));
assert.ok(!fx.orphans.some((o) => o.includes('icon-192')), '已知 icon 不應算孤兒');

console.log('PASS 孤兒檔偵測（assets + root 皆抓）');

// 全不透明素材偵測：規格要透明，檔案卻沒有半個透明像素（餵照片進來的典型下場）
const tmp2 = mkdtempSync(path.join(os.tmpdir(), 'wt-opaque-'));
mkdirSync(path.join(tmp2, 'assets'));
const solid = await sharp({
  create: { width: 96, height: 83, channels: 4, background: { r: 0, g: 128, b: 255, alpha: 1 } },
}).png({ palette: false }).toBuffer();
writeFileSync(path.join(tmp2, 'assets', 'bow_pink.png'), solid);
const op = await checkAll(tmp2);
const bow = op.results.find((r) => r.file === 'bow_pink.png');
assert.ok(!bow.ok, '全不透明的 bow_pink 應判不通過');
assert.ok(
  bow.problems.some((p) => p.includes('不透明')),
  '應指出全不透明，實得：' + JSON.stringify(bow.problems),
);

console.log('PASS 全不透明素材偵測');
