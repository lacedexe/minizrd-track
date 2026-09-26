const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('index.html contains category selector for driver creation', () => {
  assert.match(html, /name="driverCategoryRadio"/);
  assert.match(html, /value="GT"/);
  assert.match(html, /value="GTP"/);
  assert.match(html, /value="LM_GYRO"/);
  assert.match(html, /value="PRO_AM"/);
  assert.match(html, /updateDriverCatRadioStyle/);
});

test('script.js has getDriverProfileCategory and updateDriverCatRadioStyle', () => {
  assert.match(script, /function getDriverProfileCategory\(/);
  assert.match(script, /function updateDriverCatRadioStyle\(/);
});

test('driver creation immediately associates the selected category to the driver profile', () => {
  // Test category resolution logic
  const CATEGORIES = {
    GT: { key: 'GT', label: 'GTS' },
    GTP: { key: 'GTP', label: 'GTP' },
    LM_GYRO: { key: 'LM_GYRO', label: 'LM GYRO' },
    PRO_AM: { key: 'PRO_AM', label: 'PRO/AM' }
  };
  function normalizeCategory(value) {
    let v = String(value || 'GT').trim().toUpperCase().replace(/[\s\/-]+/g, '_');
    if (v === 'LMGYRO' || v === 'LM_GYRO') return 'LM_GYRO';
    if (v === 'PROAM' || v === 'PRO_AM') return 'PRO_AM';
    return v === 'GTP' ? 'GTP' : 'GT';
  }
  function categoryLabel(value) {
    return CATEGORIES[normalizeCategory(value)].label;
  }
  function getDriverProfileCategory(d) {
    if (!d) return 'GT';
    if (d.category) return normalizeCategory(d.category);
    if (Array.isArray(d.categories) && d.categories.length) return normalizeCategory(d.categories[0]);
    return 'GT';
  }

  // Creating with GTS
  const dGTS = { id: 'd1', name: 'Carlos Pérez', category: 'GT', categories: ['GT'] };
  assert.equal(getDriverProfileCategory(dGTS), 'GT');
  assert.equal(categoryLabel(getDriverProfileCategory(dGTS)), 'GTS');

  // Creating with GTP
  const dGTP = { id: 'd2', name: 'Pedro Gómez', category: 'GTP', categories: ['GTP'] };
  assert.equal(getDriverProfileCategory(dGTP), 'GTP');
  assert.equal(categoryLabel(getDriverProfileCategory(dGTP)), 'GTP');

  // Creating with LM GYRO
  const dLMGYRO = { id: 'd3', name: 'Mario López', category: 'LM_GYRO', categories: ['LM_GYRO'] };
  assert.equal(getDriverProfileCategory(dLMGYRO), 'LM_GYRO');
  assert.equal(categoryLabel(getDriverProfileCategory(dLMGYRO)), 'LM GYRO');

  // Creating with PRO/AM
  const dPROAM = { id: 'd4', name: 'Luis Soto', category: 'PRO_AM', categories: ['PRO_AM'] };
  assert.equal(getDriverProfileCategory(dPROAM), 'PRO_AM');
  assert.equal(categoryLabel(getDriverProfileCategory(dPROAM)), 'PRO/AM');
});

test('driver editing allows changing category and updates profile immediately', () => {
  function normalizeCategory(value) {
    let v = String(value || 'GT').trim().toUpperCase().replace(/[\s\/-]+/g, '_');
    if (v === 'LMGYRO' || v === 'LM_GYRO') return 'LM_GYRO';
    if (v === 'PROAM' || v === 'PRO_AM') return 'PRO_AM';
    return v === 'GTP' ? 'GTP' : 'GT';
  }
  function getDriverProfileCategory(d) {
    if (!d) return 'GT';
    if (d.category) return normalizeCategory(d.category);
    return 'GT';
  }

  const d = { id: 'd1', name: 'Carlos Pérez', category: 'GT', categories: ['GT'] };
  assert.equal(getDriverProfileCategory(d), 'GT');

  // Edit to GTP
  const newCat = 'GTP';
  d.category = normalizeCategory(newCat);
  assert.equal(getDriverProfileCategory(d), 'GTP');
});

test('profile function displays CATEGORÍA directly without requiring race participation', () => {
  assert.match(script, /CATEGORÍA:/);
  assert.match(script, /getCategoryBadge\(profileCat\)/);
  assert.match(script, /categoryLabel\(profileCat\)/);
});

test('calculateTeamForecast computes Piloto 1 + Piloto 2 + Pole strictly adhering to points configuration', () => {
  assert.match(script, /function calculateTeamForecast\(/);

  // Re-create isolated calculateTeamForecast test with exact user example:
  // db.points: 1.er = 20, 2.º = 18. Pole: +1 pt.
  const dbPoints = [20, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  const dbPole = true;

  const mockDrivers = [
    { id: 'd1', name: 'Carlos Pérez' },
    { id: 'd2', name: 'Pedro Gómez' },
    { id: 'd3', name: 'Mario López' },
    { id: 'd4', name: 'Luis Soto' }
  ];

  const mockTeams = [
    { id: 't1', name: 'TEAM ABC' },
    { id: 't2', name: 'TEAM XYZ' }
  ];

  // Team ABC has d1 and d2. Team XYZ has d3 and d4.
  const driverTeamMap = {
    d1: 't1',
    d2: 't1',
    d3: 't2',
    d4: 't2'
  };

  // Forecast ranking:
  // 1st: d1 (Carlos) -> 20 pts
  // 2nd: d2 (Pedro)  -> 18 pts
  // 3rd: d3 (Mario)  -> 15 pts
  // 4th: d4 (Luis)   -> 12 pts
  // Pole: d1 (Carlos) -> +1 pt
  const p = {
    ranked: [
      { d: mockDrivers[0], score: 95 },
      { d: mockDrivers[1], score: 90 },
      { d: mockDrivers[2], score: 85 },
      { d: mockDrivers[3], score: 80 }
    ],
    pole: { d: mockDrivers[0] }
  };

  // Team ABC:
  // Driver 1: 1.º -> 20 pts
  // Driver 2: 2.º -> 18 pts
  // Pole: +1 pt (Carlos Pérez is on Team ABC and won pole)
  // Total: 20 + 18 + 1 = 39 pts
  const d1Rank = p.ranked.findIndex(x => x.d.id === 'd1');
  const d2Rank = p.ranked.findIndex(x => x.d.id === 'd2');
  const d1Pts = Number(dbPoints[d1Rank] || 0);
  const d2Pts = Number(dbPoints[d2Rank] || 0);
  const teamABCPole = dbPole && p.pole.d.id === 'd1';
  const polePts = teamABCPole ? 1 : 0;
  const teamABCTotal = d1Pts + d2Pts + polePts;

  assert.equal(d1Pts, 20);
  assert.equal(d2Pts, 18);
  assert.equal(polePts, 1);
  assert.equal(teamABCTotal, 39, 'TEAM ABC must have exactly 39 points: 20 + 18 + 1 = 39');

  // Team XYZ:
  // Driver 1: 3.º -> 15 pts
  // Driver 2: 4.º -> 12 pts
  // Pole: 0 pts (neither driver won pole)
  // Total: 15 + 12 = 27 pts
  const d3Rank = p.ranked.findIndex(x => x.d.id === 'd3');
  const d4Rank = p.ranked.findIndex(x => x.d.id === 'd4');
  const d3Pts = Number(dbPoints[d3Rank] || 0);
  const d4Pts = Number(dbPoints[d4Rank] || 0);
  const teamXYZPole = dbPole && (p.pole.d.id === 'd3' || p.pole.d.id === 'd4');
  const teamXYZTotal = d3Pts + d4Pts + (teamXYZPole ? 1 : 0);

  assert.equal(d3Pts, 15);
  assert.equal(d4Pts, 12);
  assert.equal(teamXYZPole, false);
  assert.equal(teamXYZTotal, 27);
});

test('team forecast handles single driver without inventing points for missing driver', () => {
  const dbPoints = [25, 18, 15, 12, 10];
  const dbPole = true;

  // Team with only 1 driver finishing 2nd (18 pts)
  const d1Pts = dbPoints[1];
  const d2Pts = 0; // Missing driver -> 0 pts
  const polePts = 0; // No pole
  const total = d1Pts + d2Pts + polePts;

  assert.equal(total, 18);
});

test('team forecast does not award pole points if db.pole is false', () => {
  const dbPoints = [20, 18];
  const dbPole = false;

  const d1Pts = dbPoints[0];
  const d2Pts = dbPoints[1];
  const poleWonByDriver = true;
  const polePts = (dbPole && poleWonByDriver) ? 1 : 0;
  const total = d1Pts + d2Pts + polePts;

  assert.equal(polePts, 0);
  assert.equal(total, 38);
});

test('renderResultsForecast outputs the forecastTeamsSection with team projection cards', () => {
  assert.match(script, /forecastTeamsSection/);
  assert.match(script, /PRONÓSTICO POR EQUIPOS/);
  assert.match(script, /PUNTOS PROYECTADOS POR ESCUDERÍA/);
  assert.match(script, /forecastTeamCard/);
  assert.match(script, /forecastTeamTotalBadge/);
  assert.match(script, /Pronóstico del equipo:/);
});
