import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { checkAll } from './check.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { results, orphans } = checkAll(REPO_ROOT);

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
const fx = checkAll(tmp);
assert.ok(fx.orphans.includes('assets/stray_asset.png'), '應抓到 assets 孤兒：' + fx.orphans.join(', '));
assert.ok(fx.orphans.includes('stray_root.png'), '應抓到 root 孤兒：' + fx.orphans.join(', '));
assert.ok(!fx.orphans.some((o) => o.includes('icon-192')), '已知 icon 不應算孤兒');

console.log('PASS 孤兒檔偵測（assets + root 皆抓）');
