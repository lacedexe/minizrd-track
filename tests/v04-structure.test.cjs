const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const analysis = fs.readFileSync(path.join(root, 'analysis.js'), 'utf8');

test('LM GYRO is an official data category', () => {
  assert.match(script, /LM_GYRO:\{key:'LM_GYRO'/);
  assert.match(script, /CATEGORY_KEYS=Object\.keys\(CATEGORIES\)/);
  assert.match(script, /recordLMGYRO/);
});

test('general rating has no versatility bonus', () => {
  assert.doesNotMatch(script, /versatilityBonus/);
  assert.match(script, /difficultyWeightedRatingStatsFor/);
  assert.match(script, /calculateRatingFromStats/);
});

test('v0.4 derived modules are present', () => {
  for (const name of [
    'getDriverTimeline',
    'getDriverRecentForm',
    'teamHallRanking',
    'calculateBestDuo',
    'calculateHallRecords',
    'automaticNews',
    'projectionForSchedule'
  ]) assert.match(script, new RegExp(`function ${name}\\(`));
});

test('public UI exposes filters, forecast, news and Hall of Fame modules', () => {
  for (const id of ['homeNewsHero', 'homeNews', 'resultsForecast', 'bestDuo', 'hallRecords', 'btnRankLMGYRO', 'btnRankTeams']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /PRONÓSTICOS DE LA SIGUIENTE RONDA/);
  assert.match(html, /MiniZRD Newsroom/);
  assert.match(html, /data-driver-category="LM_GYRO"/);
});

test('newsroom is derived from official sporting events', () => {
  for (const event of ['first-win', 'win-streak', 'first-pole', 'pole-streak', 'new-leader', 'champion']) {
    assert.match(script, new RegExp(`['"]${event}['"]`));
  }
  assert.match(script, /normalizeRaceResults/);
  assert.match(script, /raceStandingsSnapshot/);
  assert.match(script, /No se mostrarán pilotos ni proyecciones inventadas/);
});

test('next-race forecast is scoped to the selected championship', () => {
  assert.match(script, /function getNextScheduledRace\(seasonId=db\.activeSeason\)/);
  assert.match(script, /getNextScheduledRace\(season\?\.id\)/);
  assert.match(script, /Rating de categoría 42%/);
  assert.match(script, /Historial en pista 18%/);
});

test('head to head compares only shared official races', () => {
  assert.match(analysis, /versusRaces/);
  assert.match(analysis, /a&&b\?/);
  assert.match(analysis, /No existen carreras oficiales/);
});

test('newsroom classifies updates and publishes a persistent daily edition', () => {
  for (const cat of ['carreras', 'campeonatos', 'pilotos', 'equipos', 'estadisticas', 'anuncios']) {
    assert.match(script, new RegExp(`${cat}:\\{key:'${cat}'`));
  }
  assert.match(script, /function ensureDailyNews\(\)/);
  assert.match(script, /limit:3,categories:CATEGORY_KEYS/);
  assert.match(script, /db\.newsHistory\.push/);
  assert.match(script, /visibleNewsroomStories/);
  assert.match(script, /slice\(0,10\)/);
  assert.match(script, /newsCategoryTag/);
});

test('PRO/AM is a native blue category across data, UI and records', () => {
  assert.match(script, /PRO_AM:\{key:'PRO_AM',label:'PRO\/AM',icon:'🔵',className:'proam'\}/);
  assert.match(script, /v==='PROAM'\|\|v==='PRO_AM'/);
  assert.match(script, /recordPROAM/);
  assert.match(script, /btnRankPROAM/);
  assert.match(script, /data-driver-category=\"PRO_AM\"/);
  assert.match(script, /data-news-category=\"PRO_AM\"/);
  assert.match(script, /RATING PRO\/AM/);
  assert.match(script, /categories=CATEGORY_KEYS/);
  assert.match(script, /categories:CATEGORY_KEYS/);
  assert.match(script, /category:normalizeCategory\(r\.category\)/);
  assert.match(script, /x\.category=r\.category/);
});

test('PRO/AM uses its own blue visual identity', () => {
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  assert.match(css, /\.catBadge\.proam\{[^}]*#2563eb/);
  assert.match(css, /\.active-proam\{/);
  assert.match(css, /\.profileRatingCard\.proam/);
  assert.match(css, /\.recordBox\.proam/);
  assert.match(css, /\.btn-proam/);
});

test('driver category visibility requires real results or historical starts', () => {
  const fn = script.slice(script.indexOf('function isDriverParticipatingInCategory'), script.indexOf('function getDriverParticipatingCategories'));
  assert.doesNotMatch(fn, /d\.categories/);
  assert.doesNotMatch(fn, /isParticipant/);
  assert.match(fn, /hasRace/);
  assert.match(fn, /hasSeasonStats/);
});

test('Hall of Fame exposes Categorias Mas Competitivas with automated difficulty rating', () => {
  assert.match(script, /function calculateCategoryCompetitiveDifficulty\(/);
  assert.match(script, /function renderCompetitiveCategories\(/);
  assert.match(html, /id="competitiveCategories"/);
  assert.match(html, /id="competitiveCategoriesList"/);
  assert.match(html, /CATEGORÍAS MÁS COMPETITIVAS/);
  assert.match(script, /DIFICULTAD COMPETITIVA/);
  const hall=html.slice(html.indexOf('<section id="ranking"'),html.indexOf('<section id="competitiveCategories"'));
  assert.doesNotMatch(hall, /class="btn secondary" onclick="show\('competitiveCategories'\)"/);
  assert.match(hall, /class="btn compTeaserBtn"[^>]*>Ver Categorías más competitivas/);
});

test('PRO/AM category is enabled in round scheduler and championship configuration', () => {
  assert.match(html, /<option value="PRO_AM">Categoría PRO\/AM<\/option>/);
  assert.match(html, /id="lblCatPROAM"/);
  assert.match(script, /id="scheduleCategoryV04"/);
  assert.match(script, /value="PRO_AM"[^>]*>🔵 PRO\/AM/);
  assert.match(script, /category=catVal\?normalizeCategory\(catVal\):\(season\.category\|\|'PRO_AM'\)/);
});
