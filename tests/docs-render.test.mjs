import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match, 'docs/index.html 必須含一個 <script> 區塊');

const sandbox = { document: { addEventListener() {} } };
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox);

const { renderMarkdown } = sandbox;
assert.equal(typeof renderMarkdown, 'function', 'renderMarkdown 必須是 function');

// 標題層級；僅 h2 附 id="ch-N"
assert.equal(renderMarkdown('# 標題一').trim(), '<h1>標題一</h1>');
assert.equal(renderMarkdown('## 章節一').trim(), '<h2 id="ch-1">章節一</h2>');
assert.equal(renderMarkdown('### 小節').trim(), '<h3>小節</h3>');
assert.equal(renderMarkdown('#### 更小節').trim(), '<h4>更小節</h4>');

// 連續兩個 h2 → ch-1、ch-2 遞增
assert.equal(
  renderMarkdown('## 第一章\n## 第二章').trim(),
  '<h2 id="ch-1">第一章</h2>\n<h2 id="ch-2">第二章</h2>'
);

// 行內語法：粗體、code
assert.equal(renderMarkdown('這是**粗體**文字').trim(), '<p>這是<strong>粗體</strong>文字</p>');
assert.equal(renderMarkdown('這是`code`文字').trim(), '<p>這是<code>code</code>文字</p>');

// 分隔線
assert.equal(renderMarkdown('---').trim(), '<hr>');

// 一般段落／空行分段
assert.equal(renderMarkdown('普通一行文字').trim(), '<p>普通一行文字</p>');
assert.equal(
  renderMarkdown('第一段\n\n第二段').trim(),
  '<p>第一段</p>\n<p>第二段</p>'
);

// 安全性：先 escape 再套格式——原始碼混入 HTML 標籤不會被執行
assert.equal(
  renderMarkdown('<script>alert(1)</script>').trim(),
  '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>'
);
assert.equal(
  renderMarkdown('用 <b>粗體標籤</b> 測試').trim(),
  '<p>用 &lt;b&gt;粗體標籤&lt;/b&gt; 測試</p>'
);

console.log('docs-render.test.mjs (Task 1): all assertions passed ✓');

// 連結：站外 target=_blank/rel=noopener；站內（相對路徑）不加
assert.equal(
  renderMarkdown('[Google](https://google.com)').trim(),
  '<p><a href="https://google.com" target="_blank" rel="noopener">Google</a></p>'
);
assert.equal(
  renderMarkdown('[設定檔](./firebase-config.js)').trim(),
  '<p><a href="./firebase-config.js">設定檔</a></p>'
);

// 圍欄程式碼區塊：多行、不套用行內格式（**/`` 原樣輸出）
assert.equal(
  renderMarkdown('```\nconst a = 1;\n**not bold**\n```').trim(),
  '<pre><code>const a = 1;\n**not bold**</code></pre>'
);

// 引用：連續行合併成一個 blockquote，內部各自一個 <p>；純 "> " 空行不產生空段落
assert.equal(
  renderMarkdown('> 第一行\n>\n> 第二行').trim(),
  '<blockquote><p>第一行</p><p>第二行</p></blockquote>'
);

// 無序清單：連續行合併成一個 <ul>
assert.equal(
  renderMarkdown('- 項目一\n- 項目二').trim(),
  '<ul><li>項目一</li><li>項目二</li></ul>'
);

// 有序清單：連續行合併成一個 <ol>
assert.equal(
  renderMarkdown('1. 步驟一\n2. 步驟二').trim(),
  '<ol><li>步驟一</li><li>步驟二</li></ol>'
);

console.log('docs-render.test.mjs (Task 2): all assertions passed ✓');
