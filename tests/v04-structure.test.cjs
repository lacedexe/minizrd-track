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
  for (const id of ['homeForecast', 'homeNews', 'bestDuo', 'hallRecords', 'btnRankLMGYRO', 'btnRankTeams']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /data-driver-category="LM_GYRO"/);
});

test('head to head compares only shared official races', () => {
  assert.match(analysis, /versusRaces/);
  assert.match(analysis, /a&&b\?/);
  assert.match(analysis, /No existen carreras oficiales/);
});
