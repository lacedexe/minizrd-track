const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../rating-difficulty.js');

test('dominant 10-race veteran achieves 99/99 rating regardless of category', () => {
  const stats = {
    starts: 10,
    wins: 10,
    podiums: 10,
    poles: 10,
    points: 260,
    maxPossiblePoints: 260,
    avgFinishScore: 1,
    consistencyScore: 1,
    championshipScore: 1,
    titles: 0,
    categoryHasPoles: true
  };
  const out = Engine.calculateCategoryRating(stats);
  assert.equal(out.rating, 99);
  assert.equal(out.baseScore, 99);
  assert.equal(out.championBonus, 0);
});

test('Carlos De Moya 8/8 benchmark exceeds old 88 ceiling and hits 98 base / 99 with title', () => {
  const deMoyaNoTitle = Engine.calculateCategoryRating({
    starts: 8,
    wins: 8,
    podiums: 8,
    poles: 8,
    points: 208,
    maxPossiblePoints: 208,
    avgFinishScore: 1,
    consistencyScore: 1,
    championshipScore: 1,
    titles: 0,
    categoryHasPoles: true
  });
  assert.equal(deMoyaNoTitle.rating, 98);

  const deMoyaWithTitle = Engine.calculateCategoryRating({
    starts: 8,
    wins: 8,
    podiums: 8,
    poles: 8,
    points: 208,
    maxPossiblePoints: 208,
    avgFinishScore: 1,
    consistencyScore: 1,
    championshipScore: 1,
    titles: 1,
    categoryHasPoles: true
  });
  assert.equal(deMoyaWithTitle.rating, 99);
});

test('sample confidence prevents 1-race winner from equaling multi-race champion while still rewarding victory', () => {
  const oneRaceWinner = Engine.calculateCategoryRating({
    starts: 1,
    wins: 1,
    podiums: 1,
    poles: 0,
    points: 25,
    maxPossiblePoints: 25,
    avgFinishScore: 1,
    consistencyScore: 1,
    championshipScore: 1,
    titles: 0,
    categoryHasPoles: false
  });
  assert.ok(oneRaceWinner.rating >= 68 && oneRaceWinner.rating <= 76, `unexpected 1-race winner rating ${oneRaceWinner.rating}`);
  assert.ok(oneRaceWinner.rating < 85);
});

test('missing poles never penalize driver when category does not record poles', () => {
  const base = {
    starts: 6,
    wins: 4,
    podiums: 6,
    points: 132,
    maxPossiblePoints: 150,
    avgFinishScore: 0.9,
    consistencyScore: 0.95,
    championshipScore: 0.92,
    titles: 0
  };
  const noPolesRecorded = Engine.calculateCategoryRating({ ...base, poles: 0, categoryHasPoles: false });
  const allPolesNotAvailableFallback = Engine.calculateCategoryRating({ ...base, poles: 0, categoryHasPoles: undefined });
  assert.equal(noPolesRecorded.rating, allPolesNotAvailableFallback.rating);
  assert.ok(noPolesRecorded.rating >= 75);
});

test('Hall of Fame +5 title bonus is applied cleanly and capped at 99', () => {
  const midDriverNoTitle = Engine.calculateCategoryRating({
    starts: 6,
    wins: 1,
    podiums: 3,
    poles: 1,
    points: 90,
    maxPossiblePoints: 150,
    avgFinishScore: 0.65,
    consistencyScore: 0.7,
    championshipScore: 0.75,
    titles: 0,
    categoryHasPoles: true
  });
  const midDriverTwoTitles = Engine.calculateCategoryRating({
    starts: 6,
    wins: 1,
    podiums: 3,
    poles: 1,
    points: 90,
    maxPossiblePoints: 150,
    avgFinishScore: 0.65,
    consistencyScore: 0.7,
    championshipScore: 0.75,
    titles: 2,
    categoryHasPoles: true
  });
  assert.equal(midDriverTwoTitles.championBonus, 10);
  assert.equal(midDriverTwoTitles.rating, Math.min(99, Math.round(midDriverNoTitle.baseScore + 10)));
});

test('Rule 1: 10th place in GTS carries higher global race value than 1st place in PRO/AM', () => {
  const gts10of10 = Engine.calculateGlobalRaceResultValue({
    position: 10,
    fieldSize: 10,
    pointsRatio: 1 / 25,
    categoryWeight: 100
  });
  const gts10of12 = Engine.calculateGlobalRaceResultValue({
    position: 10,
    fieldSize: 12,
    pointsRatio: 1 / 25,
    categoryWeight: 100
  });
  const proAm1of8 = Engine.calculateGlobalRaceResultValue({
    position: 1,
    fieldSize: 8,
    pointsRatio: 1,
    categoryWeight: 43
  });
  assert.ok(gts10of10 > proAm1of8, `Expected 10/10 GTS (${gts10of10.toFixed(1)}) > 1/8 PRO/AM (${proAm1of8.toFixed(1)})`);
  assert.ok(gts10of12 > proAm1of8, `Expected 10/12 GTS (${gts10of12.toFixed(1)}) > 1/8 PRO/AM (${proAm1of8.toFixed(1)})`);
});

test('Rule 2 & 3 & 4: PRO/AM 90/99 maps to ~39/99 Global and repeated PRO/AM titles never grant 99 Global', () => {
  const proAm90 = Engine.calculateGeneralRating({
    categoryBreakdowns: [{
      category: 'PRO_AM',
      starts: 8,
      baseScore: 90,
      rating: 90,
      titles: 0,
      avgFieldSize: 8,
      categoryEntrants: 10,
      opponentFactor: 1
    }],
    totalTitles: 0
  });
  assert.equal(proAm90.rating, 39);

  const proAmDominant = Engine.calculateCategoryRating({
    starts: 10,
    wins: 10,
    podiums: 10,
    poles: 10,
    points: 260,
    maxPossiblePoints: 260,
    avgFinishScore: 1,
    consistencyScore: 1,
    championshipScore: 1,
    titles: 2,
    categoryHasPoles: true
  });
  assert.equal(proAmDominant.rating, 99, 'Official category rating can reach 99/99 in PRO/AM');

  const proAmDominantGlobal = Engine.calculateGeneralRating({
    categoryBreakdowns: [{
      category: 'PRO_AM',
      ...proAmDominant,
      avgFieldSize: 8,
      categoryEntrants: 10,
      opponentFactor: 1
    }],
    totalTitles: 2
  });
  assert.ok(proAmDominantGlobal.rating <= 46, `PRO/AM champion global cap exceeded (${proAmDominantGlobal.rating})`);
  assert.ok(proAmDominantGlobal.rating >= 35);
});

test('Rule 5 & 6: Identical results in different tiers produce distinct Global ratings, sensitive to field depth and rivals', () => {
  const perf = {
    starts: 8,
    wins: 8,
    podiums: 8,
    poles: 8,
    points: 208,
    maxPossiblePoints: 208,
    avgFinishScore: 1,
    consistencyScore: 1,
    championshipScore: 1,
    titles: 0,
    categoryHasPoles: true
  };
  const catBd = Engine.calculateCategoryRating(perf);

  const gts = Engine.calculateGeneralRating({ categoryBreakdowns: [{ category: 'GT', ...catBd, avgFieldSize: 10, categoryEntrants: 14, opponentFactor: 1.02 }] }).rating;
  const gtp = Engine.calculateGeneralRating({ categoryBreakdowns: [{ category: 'GTP', ...catBd, avgFieldSize: 10, categoryEntrants: 14, opponentFactor: 1.02 }] }).rating;
  const lm = Engine.calculateGeneralRating({ categoryBreakdowns: [{ category: 'LM_GYRO', ...catBd, avgFieldSize: 10, categoryEntrants: 14, opponentFactor: 1.02 }] }).rating;
  const pro = Engine.calculateGeneralRating({ categoryBreakdowns: [{ category: 'PRO_AM', ...catBd, avgFieldSize: 10, categoryEntrants: 14, opponentFactor: 1.02 }] }).rating;

  assert.ok(gts > gtp && gtp > lm && lm > pro, `Expected GT(${gts}) > GTP(${gtp}) > LM(${lm}) > PRO_AM(${pro})`);

  const fullStrongField = Engine.calculateGeneralRating({
    categoryBreakdowns: [{ category: 'GT', ...catBd, avgFieldSize: 11, categoryEntrants: 16, opponentFactor: 1.04 }]
  }).rating;
  const tinyWeakField = Engine.calculateGeneralRating({
    categoryBreakdowns: [{ category: 'GT', ...catBd, avgFieldSize: 3, categoryEntrants: 3, opponentFactor: 0.94 }]
  }).rating;
  assert.ok(fullStrongField > tinyWeakField, `Expected deep strong field (${fullStrongField}) > tiny weak field (${tinyWeakField})`);
});

test('Rule 7: General rating integrates custom category weights and multi-class participation fairly', () => {
  const gtStrong = Engine.calculateCategoryRating({
    starts: 8,
    wins: 8,
    podiums: 8,
    poles: 8,
    points: 208,
    maxPossiblePoints: 208,
    avgFinishScore: 1,
    consistencyScore: 1,
    championshipScore: 1,
    titles: 1,
    categoryHasPoles: true
  });
  const proSolid = Engine.calculateCategoryRating({
    starts: 6,
    wins: 3,
    podiums: 5,
    poles: 2,
    points: 118,
    maxPossiblePoints: 150,
    avgFinishScore: 0.85,
    consistencyScore: 0.9,
    championshipScore: 0.88,
    titles: 0,
    categoryHasPoles: true
  });

  const singleTopGlobal = Engine.calculateGeneralRating({
    categoryBreakdowns: [{ category: 'GT', categoryWeight: 100, ...gtStrong }],
    totalTitles: 1
  });
  const dualClassGlobal = Engine.calculateGeneralRating({
    categoryBreakdowns: [
      { category: 'GT', categoryWeight: 100, ...gtStrong },
      { category: 'cat_custom', categoryWeight: 55, ...proSolid }
    ],
    totalTitles: 1
  });
  const customHigh = Engine.calculateGeneralRating({
    categoryBreakdowns: [{ category: 'cat_master', categoryWeight: 85, ...proSolid }]
  });
  const customLow = Engine.calculateGeneralRating({
    categoryBreakdowns: [{ category: 'cat_rookie', categoryWeight: 30, ...proSolid }]
  });

  assert.equal(singleTopGlobal.rating, 99);
  assert.ok(dualClassGlobal.rating >= 96 && dualClassGlobal.rating <= 99);
  assert.ok(customHigh.rating > customLow.rating);
  assert.equal(Engine.calculateGeneralRating({ categoryBreakdowns: [], totalTitles: 0 }).rating, 0);
});
