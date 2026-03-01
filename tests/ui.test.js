const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pages = [
  path.join(root, 'index.html'),
  path.join(root, 'admin', 'index.html'),
  path.join(root, 'admin', 'tests', 'index.html')
];

const requiredIds = [
  'connectView',
  'connectedView',
  'connectBtn',
  'muteBtn',
  'deafenBtn',
  'micSelect',
  'micTestBtn',
  'status'
];

test('las vistas HTML incluyen IDs críticos y estilos compartidos', () => {
  pages.forEach((filePath) => {
    const html = fs.readFileSync(filePath, 'utf8');
    requiredIds.forEach((id) => {
      assert.ok(html.includes(`id="${id}"`), `${path.basename(filePath)} missing ${id}`);
    });
    assert.ok(html.includes('styles.css'));
  });
});
