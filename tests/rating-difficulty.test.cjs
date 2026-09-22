const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  CATEGORY_DIFFICULTY,
  MAX_CATEGORY_DIFFICULTY,
  getCategoryDifficulty,
  weightCompetitiveStats,
  combineDifficultyWeightedStats,
  calculateRatingFromStats
} = require('../rating-difficulty.js');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const result = Object.freeze({points:25,starts:1,wins:1,podiums:1,poles:1,fast:0,titles:0});

test('la jerarquía oficial está centralizada y acepta códigos internos o visibles', () => {
  assert.deepEqual(CATEGORY_DIFFICULTY, {GTS:4,GTP:3,'LM GYRO':2,'PRO/AM':1});
  assert.equal(MAX_CATEGORY_DIFFICULTY, 4);
  assert.equal(getCategoryDifficulty('GT'), 4);
  assert.equal(getCategoryDifficulty('GTS'), 4);
  assert.equal(getCategoryDifficulty('GTP'), 3);
  assert.equal(getCategoryDifficulty('LM_GYRO'), 2);
  assert.equal(getCategoryDifficulty('PRO_AM'), 1);
  assert.equal(getCategoryDifficulty('categoría desconocida'), 1);
});

test('prueba 1: el mismo resultado vale más en GTS que en PRO/AM', () => {
  const gts = weightCompetitiveStats(result, 'GT');
  const proAm = weightCompetitiveStats(result, 'PRO_AM');
  assert.ok(gts.points > proAm.points);
  assert.ok(gts.wins > proAm.wins);
  const peers = [result];
  const gtsRating = calculateRatingFromStats(result, peers, 1, getCategoryDifficulty('GT') / MAX_CATEGORY_DIFFICULTY);
  const proAmRating = calculateRatingFromStats(result, peers, 1, getCategoryDifficulty('PRO_AM') / MAX_CATEGORY_DIFFICULTY);
  assert.ok(gtsRating > proAmRating);
});

test('los campeonatos mantienen la misma jerarquía de dificultad', () => {
  const title = {points:0,starts:0,wins:0,podiums:0,poles:0,fast:0,titles:1};
  assert.equal(weightCompetitiveStats(title,'GT').titles, 4);
  assert.equal(weightCompetitiveStats(title,'GTP').titles, 3);
  assert.equal(weightCompetitiveStats(title,'LM_GYRO').titles, 2);
  assert.equal(weightCompetitiveStats(title,'PRO_AM').titles, 1);
});

test('el rating general conserva el factor de cada resultado al combinar categorías', () => {
  const gtsStats = combineDifficultyWeightedStats([{category:'GT',stats:result}]);
  const proAmStats = combineDifficultyWeightedStats([{category:'PRO_AM',stats:result}]);
  const peers = [gtsStats, proAmStats];
  const gtsGeneral = calculateRatingFromStats(gtsStats, peers, 1, 1);
  const proAmGeneral = calculateRatingFromStats(proAmStats, peers, 1, 1);
  assert.ok(gtsGeneral > proAmGeneral);
});

test('prueba 2: un piloto dominante de GTS no transporta su dificultad a PRO/AM', () => {
  const pilot = {mainCategory:'GT',ratingGT:99};
  const weighted = weightCompetitiveStats({...result,pilot}, 'PRO_AM');
  assert.equal(weighted.wins, 1);
  assert.equal(weighted.points, 25);
  assert.equal(getCategoryDifficulty('PRO_AM'), 1);
});

test('prueba 3: un piloto habitual de PRO/AM recibe dificultad GTS al correr GTS', () => {
  const pilot = {mainCategory:'PRO_AM',ratingPROAM:99};
  const weighted = weightCompetitiveStats({...result,pilot}, 'GT');
  assert.equal(weighted.wins, 4);
  assert.equal(weighted.points, 100);
  assert.equal(getCategoryDifficulty('GT'), 4);
});

test('prueba 4: un piloto multicategoría conserva el factor propio de cada resultado', () => {
  const combined = combineDifficultyWeightedStats([
    {category:'GT',stats:{...result,points:10,poles:0,podiums:0}},
    {category:'GTP',stats:{...result,points:10,poles:0,podiums:0}},
    {category:'LM_GYRO',stats:{...result,points:10,poles:0,podiums:0}},
    {category:'PRO_AM',stats:{...result,points:10,poles:0,podiums:0}}
  ]);
  assert.equal(combined.wins, 4 + 3 + 2 + 1);
  assert.equal(combined.points, 10 * 4 + 10 * 3 + 10 * 2 + 10);
  assert.equal(combined.starts, 4);
});

test('prueba 5: la ponderación no altera estadísticas originales ni multiplica participaciones', () => {
  const original = {points:50,starts:3,wins:2,podiums:2,poles:1,fast:0,titles:1};
  const snapshot = structuredClone(original);
  const weighted = weightCompetitiveStats(original, 'GT');
  assert.deepEqual(original, snapshot);
  assert.equal(weighted.starts, original.starts);
  assert.equal(original.wins, 2);
  assert.equal(original.podiums, 2);
  assert.equal(original.poles, 1);
  assert.equal(original.titles, 1);
  const noResults = {points:0,starts:1,wins:0,podiums:0,poles:0,fast:0,titles:0};
  const gtsParticipation = calculateRatingFromStats(noResults,[noResults],1,getCategoryDifficulty('GT')/4);
  const proAmParticipation = calculateRatingFromStats(noResults,[noResults],1,getCategoryDifficulty('PRO_AM')/4);
  assert.equal(gtsParticipation, proAmParticipation);
});

test('prueba 6: cambiar la categoría recalcula el factor sin duplicar el resultado', () => {
  const groups = [{source:'season-1',category:'PRO_AM',stats:result}];
  const before = combineDifficultyWeightedStats(groups);
  groups[0] = {...groups[0],category:'GTP'};
  const after = combineDifficultyWeightedStats(groups);
  assert.equal(groups.length, 1);
  assert.equal(before.wins, 1);
  assert.equal(after.wins, 3);
  assert.equal(before.starts, after.starts);
});

test('la integración toma la categoría del campeonato y se recalcula de forma derivada', () => {
  assert.match(html, /<script src="rating-difficulty\.js"><\/script>/);
  assert.match(script, /function getCategoryDifficulty\(category\)/);
  assert.match(script, /let seasonCategory=getSeasonCategory\(season\)/);
  assert.match(script, /groups\.push\(\{category:seasonCategory,stats,source:season\.id\}\)/);
  assert.match(script, /syncSeasonCategoryToResults\(s\.id\)/);
  assert.match(script, /syncSeasonCategoryToResults\(a\.id\)/);
  assert.doesNotMatch(script, /mainCategory/);
});
