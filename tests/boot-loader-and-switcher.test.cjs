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
  assert.match(html, /<body class="is-boot-loading">/);
  assert.match(html, /Cargando MINIZ RD\.\.\./);
  assert.match(html, /id="btnBootRetry"/);
  assert.match(html, /id="btnBootUseCache"/);
  assert.match(html, /id="localLoadingBar"/);
  assert.match(html, /id="btnSwitchChampionship"[^>]*>.*Ver otro campeonato/);
  assert.doesNotMatch(html, /Ver TOP histórico/);
  assert.match(html, /id="champSwitcherPanel"/);
  assert.match(html, /id="adminCategoriesSection"/);
  assert.match(html, /id="adminNewsSection"/);
  assert.match(html, /cdn\.jsdelivr\.net\/npm\/chart\.js"[^>]*defer/);
  assert.match(html, /style\.css\?v=/);
  assert.match(html, /<script src="categories\.js\?v=[^"]+"><\/script>/);
  assert.match(html, /<script src="script\.js\?v=[^"]+"><\/script>/);
  assert.match(html, /id="newCatWeight"/);
});

test('script.js implements boot loader recovery, IndexedDB cache, championship switcher, and dynamic CRUD', () => {
  for (const fnName of [
    'idbGetSnapshot',
    'idbSetSnapshot',
    'setBootLoaderState',
    'maybeFinishInitialLoad',
    'waitForInitialViewReady',
    'finishInitialLoad',
    'retryInitialLoad',
    'continueWithCachedData',
    'triggerLocalLoading',
    'toggleChampionshipSwitcher',
    'selectChampionshipFromMenu',
    'renderChampionshipSwitcher',
    'renderDynamicCategoryControls',
    'renderAdminCategories',
    'syncNewCatWeight',
    'syncEditCatWeight',
    'addCategory',
    'editCategoryModal',
    'updateCategoryFromForm',
    'toggleArchiveCategory',
    'deleteCategory',
    'categoryFieldMetrics',
    'categoryOpponentFactorFor',
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

test('boot loader stays visible until Firebase, window load, auth and initial view complete', () => {
  assert.doesNotMatch(script, /if\(savedLocal&&savedLocal\.seasons\?\.length\)\{finishInitialLoad\(\)/);
  assert.doesNotMatch(script, /idbGetSnapshot\(\)\.then\(cached=>\{[\s\S]*?finishInitialLoad\(\)/);
  assert.match(script, /if\(!remoteReady\)return;/);
  assert.match(script, /window\.addEventListener\('load',[\s\S]*?pageWindowLoaded=true;[\s\S]*?maybeFinishInitialLoad\(\)/);
  assert.match(script, /onAuthStateChanged\(user => \{[\s\S]*?authStateReady = true;[\s\S]*?maybeFinishInitialLoad\(\)/);
  assert.match(script, /waitForInitialViewReady\(\(\)=>finishInitialLoad\(\)\)/);
});

test('analysis.js safely defers Chart rendering and cleans canvases for zero-race championships', () => {
  assert.match(analysis, /if \(typeof Chart === 'undefined'\)\s*return;/);
  assert.match(analysis, /window\.addEventListener\('load'/);
  assert.match(analysis, /clearRect\(0, 0, c\.width \|\| 0, c\.height \|\| 0\)/);
});
