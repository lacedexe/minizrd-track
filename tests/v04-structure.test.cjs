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
  assert.match(script, /Math\.round\(base\+titleBonus\)/);
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

test('newsroom classifies updates across the official categories and limits Actualidad to 1 per category', () => {
  for (const cat of ['carreras', 'campeonatos', 'pilotos', 'equipos', 'estadisticas', 'anuncios']) {
    assert.match(script, new RegExp(`${cat}:\\{key:'${cat}'`));
  }
  assert.match(script, /const categoryOrder=\['GT','GTP','LM_GYRO'\]/);
  assert.match(script, /actualidades\.some\(x=>x\.id===candidate\.id\)/);
  assert.match(script, /newsCategoryTag/);
});

test('Hall of Fame exposes Categorias Mas Competitivas with automated difficulty rating', () => {
  assert.match(script, /function calculateCategoryCompetitiveDifficulty\(/);
  assert.match(script, /function renderCompetitiveCategories\(/);
  assert.match(html, /id="competitiveCategories"/);
  assert.match(html, /id="competitiveCategoriesList"/);
  assert.match(html, /CATEGORÍAS MÁS COMPETITIVAS/);
  assert.match(script, /DIFICULTAD COMPETITIVA/);
});


