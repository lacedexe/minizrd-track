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

test('General rating combines multi-category breakdowns consistently without penalizing multi-class participation', () => {
  const gtpStrong = Engine.calculateCategoryRating({
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
  const gtSolid = Engine.calculateCategoryRating({
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

  const singleClassGeneral = Engine.calculateGeneralRating({
    categoryBreakdowns: [{ category: 'GTP', ...gtpStrong }],
    totalTitles: 1
  });
  const dualClassGeneral = Engine.calculateGeneralRating({
    categoryBreakdowns: [
      { category: 'GTP', ...gtpStrong },
      { category: 'GT', ...gtSolid }
    ],
    totalTitles: 1
  });

  assert.equal(singleClassGeneral.rating, 99);
  assert.ok(dualClassGeneral.rating >= 90 && dualClassGeneral.rating <= 99);
  assert.equal(dualClassGeneral.championBonus, 5);
  assert.equal(Engine.calculateGeneralRating({ categoryBreakdowns: [], totalTitles: 0 }).rating, 0);
});
