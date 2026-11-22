const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const analysis = fs.readFileSync(path.join(root, 'analysis.js'), 'utf8');

test('index.html includes responsive boot loader, switcher, deferred Chart.js and dynamic admin panels', () => {
  assert.match(html, /<link rel="preload" as="image" href="logo\.png">/);
  assert.match(html, /id="appBootLoader"/);
  assert.match(html, /Cargando MINIZ RD\.\.\./);
  assert.match(html, /id="btnBootRetry"/);
  assert.match(html, /id="btnBootUseCache"/);
  assert.match(html, /id="localLoadingBar"/);
  assert.match(html, /id="btnSwitchChampionship"[^>]*>.*Ver otro campeonato/);
  assert.match(html, /id="champSwitcherPanel"/);
  assert.match(html, /id="adminCategoriesSection"/);
  assert.match(html, /id="adminNewsSection"/);
  assert.match(html, /cdn\.jsdelivr\.net\/npm\/chart\.js"[^>]*defer/);
  assert.match(html, /<script src="categories\.js"><\/script>/);
});

test('script.js implements boot loader recovery, IndexedDB cache, championship switcher, and dynamic CRUD', () => {
  for (const fnName of [
    'idbGetSnapshot',
    'idbSetSnapshot',
    'setBootLoaderState',
    'finishInitialLoad',
    'retryInitialLoad',
    'continueWithCachedData',
    'triggerLocalLoading',
    'toggleChampionshipSwitcher',
    'selectChampionshipFromMenu',
    'renderChampionshipSwitcher',
    'renderDynamicCategoryControls',
    'renderAdminCategories',
    'addCategory',
    'editCategoryModal',
    'updateCategoryFromForm',
    'toggleArchiveCategory',
    'deleteCategory',
    'renderAdminNews',
    'addManualNews',
    'editNewsModal',
    'updateNewsFromForm',
    'deleteNewsItem'
  ]) {
    assert.match(script, new RegExp(`(?:async\\s+)?function ${fnName}\\(`));
  }
  assert.match(script, /selectedPublicSeasonId/);
  assert.match(script, /card\.dataset\.seasonId\?db\.seasons\.find/);
});

test('analysis.js safely defers Chart rendering and cleans canvases for zero-race championships', () => {
  assert.match(analysis, /if \(typeof Chart === 'undefined'\)\s*return;/);
  assert.match(analysis, /window\.addEventListener\('load'/);
  assert.match(analysis, /clearRect\(0, 0, c\.width \|\| 0, c\.height \|\| 0\)/);
});
