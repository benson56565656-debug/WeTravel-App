import assert from 'node:assert';
import { ASSETS, ICONS, REPLACEABLE } from './assets-spec.mjs';

// 筆數
assert.strictEqual(ASSETS.length, 22, 'ASSETS 應 22 筆');
assert.strictEqual(ICONS.length, 2, 'ICONS 應 2 筆');
assert.strictEqual(REPLACEABLE.size, 24, 'REPLACEABLE 應 24 筆');

// 每筆欄位齊全且型別正確
for (const s of [...ASSETS, ...ICONS]) {
  for (const k of ['file', 'w', 'h', 'alpha', 'maxBytes', 'use']) {
    assert.ok(k in s, `${s.file} 缺欄位 ${k}`);
  }
  assert.ok(s.file.endsWith('.png'), `${s.file} 應為 .png`);
  assert.ok(Number.isInteger(s.w) && s.w > 0, `${s.file} w 非正整數`);
  assert.ok(Number.isInteger(s.h) && s.h > 0, `${s.file} h 非正整數`);
  assert.strictEqual(typeof s.alpha, 'boolean', `${s.file} alpha 非布林`);
  assert.ok(Number.isInteger(s.maxBytes) && s.maxBytes > 0, `${s.file} maxBytes 非正整數`);
}

// 檔名唯一
const files = [...ASSETS, ...ICONS].map((s) => s.file);
assert.strictEqual(new Set(files).size, files.length, '檔名有重複');

console.log('PASS spec.test.mjs');
