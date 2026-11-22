const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CategoriesLib = require('../categories.js');
const NewsEngine = require('../news-engine.js');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');

test('ensureCategoriesCatalog migrates defaults and recovers orphan historical categories without data loss', () => {
  const db = {
    seasons: [
      { id: 's1', name: 'Copa Classic', category: 'GT' },
      { id: 's_custom', name: 'Master Series', category: 'cat_gtp50' }
    ],
    races: [{ id: 'r1', seasonId: 's_custom', category: 'cat_gtp50', results: [] }],
    drivers: [{ id: 'd1', name: 'Carlos', category: 'GT', career: { categoryTitles: { GT: 2 } } }],
    tracks: [{ id: 't1', name: 'Lopez Track', recordGT: { driverId: 'd1', time: '11.40s' }, records: {} }],
    newsHistory: [{ id: 'n1', cat: 'cat_gtp50', title: 'Noticia' }]
  };

  CategoriesLib.ensureCategoriesCatalog(db);
  const ids = CategoriesLib.getAllCategoryIds(db);

  assert.ok(ids.includes('GT'));
  assert.ok(ids.includes('GTP'));
  assert.ok(ids.includes('LM_GYRO'));
  assert.ok(ids.includes('PRO_AM'));
  assert.ok(ids.includes('cat_gtp50'));
  assert.equal(db.categories.find(c => c.id === 'PRO_AM').color, '#2563eb');
});

test('validateCategoryInput enforces non-empty unique names/acronyms, valid HEX and allows editing self', () => {
  const db = { categories: [] };
  CategoriesLib.ensureCategoriesCatalog(db);
  db.categories.push({
    id: 'cat_gtp50',
    name: 'GTP MASTER 50+',
    acronym: 'GTP50',
    color: '#a855f7',
    description: 'Categoría veteranos',
    archived: false,
    order: 4
  });

  const validNew = CategoriesLib.validateCategoryInput(db, {
    name: 'Touring Pro',
    acronym: 'TCR',
    color: '#06b6d4',
    description: 'Nueva clase'
  });
  assert.equal(validNew.ok, true);
  assert.equal(validNew.data.color, '#06b6d4');

  const validSelfEdit = CategoriesLib.validateCategoryInput(db, {
    name: 'GTP MASTER 50+ PRO',
    acronym: 'GTP50',
    color: '#EC4899',
    description: 'Actualizada'
  }, 'cat_gtp50');
  assert.equal(validSelfEdit.ok, true);
  assert.equal(validSelfEdit.data.color, '#ec4899');

  const dupName = CategoriesLib.validateCategoryInput(db, {
    name: 'gtp',
    acronym: 'OTR',
    color: '#ffffff'
  }, 'cat_gtp50');
  assert.equal(dupName.ok, false);

  const dupAcronym = CategoriesLib.validateCategoryInput(db, {
    name: 'Otra',
    acronym: 'PRO/AM',
    color: '#ffffff'
  });
  assert.equal(dupAcronym.ok, false);

  const badHex = CategoriesLib.validateCategoryInput(db, {
    name: 'Nueva',
    acronym: 'NVA',
    color: 'not-a-color'
  });
  assert.equal(badHex.ok, false);
});

test('normalizeCategoryId preserves custom categories while resolving legacy aliases', () => {
  const db = { categories: [] };
  CategoriesLib.ensureCategoriesCatalog(db);
  db.categories.push({
    id: 'cat_gtp50',
    name: 'GTP MASTER 50+',
    acronym: 'GTP50',
    color: '#a855f7',
    archived: false,
    order: 4
  });

  assert.equal(CategoriesLib.normalizeCategoryId(db, 'GTS'), 'GT');
  assert.equal(CategoriesLib.normalizeCategoryId(db, 'PRO/AM'), 'PRO_AM');
  assert.equal(CategoriesLib.normalizeCategoryId(db, 'cat_gtp50'), 'cat_gtp50');
  assert.equal(CategoriesLib.normalizeCategoryId(db, 'GTP50'), 'cat_gtp50');
  assert.equal(CategoriesLib.normalizeCategoryId(db, 'Future_Custom'), 'Future_Custom');
});

test('buildCategoryStyleVars produces readable CSS tokens for dark/light colors', () => {
  const darkVars = CategoriesLib.buildCategoryStyleVars({ color: '#1e3a8a' });
  const lightVars = CategoriesLib.buildCategoryStyleVars({ color: '#facc15' });
  assert.match(darkVars, /--cat-color:#1e3a8a;/);
  assert.match(darkVars, /--cat-contrast:#ffffff;/);
  assert.match(lightVars, /--cat-contrast:#0b0e13;/);
});

test('track records and legacy driver titles stay synchronized for both built-in and custom categories', () => {
  const db = { categories: [] };
  CategoriesLib.ensureCategoriesCatalog(db);

  const track = { id: 't1', name: 'Pista 1', records: {} };
  CategoriesLib.setTrackRecord(track, 'GT', { driverId: 'd1', time: '11.120s', championship: 'Copa', round: 'R1' });
  CategoriesLib.setTrackRecord(track, 'cat_gtp50', { driverId: 'd2', time: '12.345s', championship: 'Master', round: 'R2' });

  assert.equal(track.recordGT.time, '11.120s');
  assert.equal(CategoriesLib.getTrackRecord(track, 'GT').time, '11.120s');
  assert.equal(CategoriesLib.getTrackRecord(track, 'cat_gtp50').driverId, 'd2');

  const driver = { id: 'd2', career: { titles: 0 } };
  CategoriesLib.setDriverLegacyTitlesForCategory(driver, 'GT', 1);
  CategoriesLib.setDriverLegacyTitlesForCategory(driver, 'cat_gtp50', 2);
  assert.equal(driver.career.gtTitles, 1);
  assert.equal(CategoriesLib.getDriverLegacyTitlesForCategory(driver, 'cat_gtp50'), 2);
  assert.equal(CategoriesLib.getDriverTotalLegacyTitles(db, driver), 3);
});

test('getCategoryUsage accurately reports historical dependencies to guard against destructive delete', () => {
  const db = {
    categories: [
      { id: 'GT', name: 'GTS', acronym: 'GTS', color: '#f59e0b', order: 0 },
      { id: 'cat_used', name: 'Usada', acronym: 'USD', color: '#a855f7', order: 1 },
      { id: 'cat_empty', name: 'Vacia', acronym: 'VCA', color: '#14b8a6', order: 2 }
    ],
    seasons: [{ id: 's1', category: 'cat_used' }],
    races: [{ id: 'r1', seasonId: 's1', category: 'cat_used', results: [{ driverId: 'd1', position: 1 }] }],
    drivers: [{ id: 'd1', name: 'Piloto 1', categories: ['cat_used'], career: {} }],
    tracks: [{ id: 't1', records: { cat_used: { driverId: 'd1', time: '10.5s' } } }],
    newsHistory: [{ id: 'n1', cat: 'GT', categoryIds: ['GT', 'cat_used'], title: 'Multi' }]
  };

  const used = CategoriesLib.getCategoryUsage(db, 'cat_used');
  assert.equal(used.seasons, 1);
  assert.equal(used.races, 1);
  assert.equal(used.drivers, 1);
  assert.equal(used.trackRecords, 1);
  assert.equal(used.news, 1);
  assert.equal(used.total, 5);

  const empty = CategoriesLib.getCategoryUsage(db, 'cat_empty');
  assert.equal(empty.total, 0);
});

test('news engine supports multi-category stories and custom categories cleanly', () => {
  const multi = { id: 'n1', cat: 'cat_gtp50', categoryIds: ['cat_gtp50', 'GT'], publicationDate: '2026-11-22' };
  const cats = NewsEngine.storyCategories(multi);
  assert.deepEqual(cats, ['cat_gtp50', 'GT']);

  const filtered = NewsEngine.selectTrackUpdates({
    stories: [multi, { id: 'n2', cat: 'GTP', categoryIds: ['GTP'], publicationDate: '2026-11-21' }],
    category: 'GT',
    categories: ['GT', 'GTP', 'cat_gtp50'],
    limit: 3
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'n1');
});

test('competitiveWeight validates range 10..100, preserves defaults and allows admin overrides', () => {
  const db = { categories: [] };
  CategoriesLib.ensureCategoriesCatalog(db);
  assert.equal(CategoriesLib.getCategoryCompetitiveWeight(db, 'GT'), 100);
  assert.equal(CategoriesLib.getCategoryCompetitiveWeight(db, 'GTP'), 78);
  assert.equal(CategoriesLib.getCategoryCompetitiveWeight(db, 'LM_GYRO'), 58);
  assert.equal(CategoriesLib.getCategoryCompetitiveWeight(db, 'PRO_AM'), 43);

  const validWeight = CategoriesLib.validateCategoryInput(db, {
    name: 'Master 50+',
    acronym: 'M50',
    color: '#a855f7',
    competitiveWeight: 84
  });
  assert.equal(validWeight.ok, true);
  assert.equal(validWeight.data.competitiveWeight, 84);

  const tooLow = CategoriesLib.validateCategoryInput(db, {
    name: 'Invalid Low',
    acronym: 'LOW',
    color: '#a855f7',
    competitiveWeight: 5
  });
  assert.equal(tooLow.ok, false);

  const tooHigh = CategoriesLib.validateCategoryInput(db, {
    name: 'Invalid High',
    acronym: 'HI',
    color: '#a855f7',
    competitiveWeight: 120
  });
  assert.equal(tooHigh.ok, false);

  db.categories.find(c => c.id === 'PRO_AM').competitiveWeight = 52;
  CategoriesLib.ensureCategoriesCatalog(db);
  assert.equal(CategoriesLib.getCategoryCompetitiveWeight(db, 'PRO_AM'), 52);
});

test('script.js integrates validateCategoryInput correctly and preserves rollback contract', () => {
  assert.match(script, /validation\.data\.name/);
  assert.match(script, /validateCategoryInput\(db,\{name,acronym,color:rawHex,description,competitiveWeight:rawWeight\},id\)/);
  assert.equal((script.match(/cacheCurrentDb\('rollback'\)/g) || []).length, 5);
});
