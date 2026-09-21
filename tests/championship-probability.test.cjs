const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { calculateChampionshipProbabilities } = require('../championship-probability.js');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function entrant(id, points, options = {}){
  const positions = options.positions || [2, 3, 2, 3, 2, 3];
  return {
    id,
    name: id,
    points,
    wins: options.wins || 0,
    podiums: options.podiums || 0,
    poles: options.poles || 0,
    starts: options.starts == null ? positions.length : options.starts,
    positions,
    recentPositions: options.recentPositions || positions.slice(-3),
    historyScore: options.historyScore == null ? 0.5 : options.historyScore,
    trackScore: options.trackScore == null ? 0.5 : options.trackScore,
    rivalryScore: options.rivalryScore == null ? 0.5 : options.rivalryScore,
    maxPointsPerRound: options.maxPointsPerRound || 25
  };
}

function calculate(entrants, options = {}){
  return calculateChampionshipProbabilities({
    entrants,
    totalRounds: options.totalRounds == null ? 8 : options.totalRounds,
    completedRounds: options.completedRounds == null ? 6 : options.completedRounds,
    maxPointsPerRound: 25,
    fieldSize: entrants.length,
    category: options.category || 'GT',
    type: options.type || 'drivers'
  });
}

function asMap(result){
  return new Map(result.map(item => [item.id, item]));
}

test('prueba 1: un líder claro recibe la probabilidad más alta', () => {
  const result = calculate([
    entrant('A', 150, {wins: 4, podiums: 6, positions: [1, 1, 2, 1, 2, 1]}),
    entrant('B', 115, {wins: 1, podiums: 4, positions: [3, 2, 1, 3, 4, 2]}),
    entrant('C', 100, {wins: 1, podiums: 3})
  ]);
  assert.ok(result[0].roundedProbability > result[1].roundedProbability);
  assert.equal(result.reduce((sum, item) => sum + item.roundedProbability, 0), 100);
});

test('prueba 2: un campeonato cerrado distribuye la probabilidad entre contendientes', () => {
  const result = calculate([
    entrant('A', 120, {wins: 2, podiums: 5, positions: [2, 1, 2, 3, 1, 4]}),
    entrant('B', 117, {wins: 2, podiums: 5, positions: [1, 2, 3, 1, 4, 2]}),
    entrant('C', 114, {wins: 2, podiums: 4, positions: [3, 3, 1, 2, 2, 1]})
  ]);
  assert.ok(result.every(item => item.roundedProbability > 0));
  assert.equal(result.reduce((sum, item) => sum + item.roundedProbability, 0), 100);
});

test('pruebas 3 y 4: las rondas restantes cambian el peso de la ventaja actual', () => {
  const entrants = [
    entrant('A', 120, {wins: 3, podiums: 5}),
    entrant('B', 100, {wins: 2, podiums: 5, recentPositions: [1, 1, 2]})
  ];
  const manyRounds = asMap(calculate(entrants, {totalRounds: 10, completedRounds: 5}));
  const oneRound = asMap(calculate(entrants, {totalRounds: 6, completedRounds: 5}));
  assert.ok(oneRound.get('A').roundedProbability > manyRounds.get('A').roundedProbability);
  assert.equal(oneRound.get('B').mathematicallyAlive, true);
});

test('prueba 5: detecta campeón matemático y fuerza 100 por ciento', () => {
  const result = asMap(calculate([
    entrant('A', 151, {wins: 5}),
    entrant('B', 100, {wins: 1}),
    entrant('C', 90)
  ]));
  assert.equal(result.get('A').status, 'champion');
  assert.equal(result.get('A').roundedProbability, 100);
  assert.equal(result.get('B').roundedProbability, 0);
});

test('prueba 6: un participante eliminado matemáticamente siempre recibe 0', () => {
  const result = asMap(calculate([
    entrant('A', 140, {wins: 4}),
    entrant('B', 120, {wins: 2}),
    entrant('C', 80, {historyScore: 1, trackScore: 1, rivalryScore: 1})
  ]));
  assert.equal(result.get('C').status, 'eliminated');
  assert.equal(result.get('C').roundedProbability, 0);
});

test('prueba 7: registrar una carrera recalcula las probabilidades', () => {
  const before = asMap(calculate([
    entrant('A', 100, {wins: 2, starts: 5}),
    entrant('B', 98, {wins: 2, starts: 5})
  ], {completedRounds: 5}));
  const after = asMap(calculate([
    entrant('A', 125, {wins: 3, starts: 6, positions: [2, 2, 1, 3, 2, 1]}),
    entrant('B', 116, {wins: 2, starts: 6, positions: [1, 3, 2, 2, 1, 2]})
  ], {completedRounds: 6}));
  assert.notEqual(before.get('A').roundedProbability, after.get('A').roundedProbability);
});

test('prueba 8: editar un resultado recalcula forma, puntos y porcentaje', () => {
  const original = asMap(calculate([
    entrant('A', 120, {positions: [1, 2, 2, 1, 3, 2]}),
    entrant('B', 118, {positions: [2, 1, 1, 2, 2, 1]})
  ]));
  const edited = asMap(calculate([
    entrant('A', 108, {positions: [1, 2, 2, 1, 3, 5]}),
    entrant('B', 125, {positions: [2, 1, 1, 2, 2, 1]})
  ]));
  assert.notEqual(original.get('A').roundedProbability, edited.get('A').roundedProbability);
});

test('prueba 9: eliminar un resultado recalcula con una ronda disputada menos', () => {
  const withRace = asMap(calculate([
    entrant('A', 125, {starts: 6, wins: 3}),
    entrant('B', 116, {starts: 6, wins: 2})
  ], {completedRounds: 6}));
  const withoutRace = asMap(calculate([
    entrant('A', 100, {starts: 5, wins: 2, positions: [2, 2, 1, 3, 2]}),
    entrant('B', 98, {starts: 5, wins: 2, positions: [1, 3, 2, 2, 1]})
  ], {completedRounds: 5}));
  assert.notEqual(withRace.get('A').roundedProbability, withoutRace.get('A').roundedProbability);
});

test('prueba 10: el adaptador histórico filtra por la categoría del campeonato', () => {
  assert.match(source, /getSeasonCategory\(race\.seasonId\)===category/);
  assert.match(source, /historyScore:probabilityHistoricalScore/);
  assert.match(source, /category:getSeasonCategory\(seasonId\)/);
  assert.ok(['GT', 'GTP', 'LM_GYRO', 'PRO_AM'].every(category => source.includes(category)));
});

test('los equipos se calculan una vez por entidad y no por cada piloto', () => {
  const result = calculate([
    entrant('team-a', 200, {maxPointsPerRound: 50}),
    entrant('team-b', 190, {maxPointsPerRound: 50})
  ], {type: 'teams'});
  assert.equal(result.length, 2);
  assert.equal(new Set(result.map(item => item.id)).size, 2);
  assert.equal(result.reduce((sum, item) => sum + item.roundedProbability, 0), 100);
});

test('sin resultados muestra datos insuficientes y no inventa porcentajes', () => {
  const result = calculate([
    entrant('A', 0, {starts: 0, positions: []}),
    entrant('B', 0, {starts: 0, positions: []})
  ], {completedRounds: 0});
  assert.ok(result.every(item => item.status === 'insufficient' && item.roundedProbability === null));
});

test('prueba 11: Rondas permanece intacto y la nueva casilla se agrega a su derecha', () => {
  const rounds = '<button class="btn secondary" id="btnRondas" onclick="showChampView(\'rondas\')">Rondas</button>';
  assert.ok(html.includes(rounds));
  const roundsIndex = html.indexOf('id="btnRondas"');
  const probabilityIndex = html.indexOf('id="champProbabilityStatus"');
  const analysisIndex = html.indexOf('id="btnAnalisis"');
  assert.ok(roundsIndex >= 0 && roundsIndex < probabilityIndex && probabilityIndex < analysisIndex);
  assert.match(source, /generateStandingsHtml\(a\.id, currentStandingsTab, true\)/);
  assert.match(source, /generateStandingsHtml\(a\.id, currentHomeStandingsTab\)/);
});
