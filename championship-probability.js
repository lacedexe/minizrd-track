(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  else root.MiniZRDChampionshipProbability = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value) || 0));
  const average = values => values.length ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length : 0;

  function positionQuality(positions, fieldSize){
    if(!positions.length) return 0.5;
    const divisor = Math.max(1, Number(fieldSize || 1) - 1);
    return clamp(1 - (average(positions) - 1) / divisor);
  }

  function consistencyQuality(positions, fieldSize){
    if(positions.length < 2) return positions.length ? 0.55 : 0.5;
    const mean = average(positions);
    const deviation = Math.sqrt(average(positions.map(position => Math.pow(Number(position) - mean, 2))));
    return clamp(1 - deviation / Math.max(1, Number(fieldSize || 1) / 2));
  }

  function roundToVisualHundred(entries){
    const eligible = entries.filter(entry => !entry.insufficient);
    if(!eligible.length) return entries.map(entry => ({...entry, roundedProbability: null}));
    const floors = eligible.map(entry => Math.floor(entry.probability));
    let missing = 100 - floors.reduce((sum, value) => sum + value, 0);
    const order = eligible.map((entry, index) => ({
      index,
      fraction: entry.probability - floors[index],
      score: entry.score
    })).sort((a, b) => b.fraction - a.fraction || b.score - a.score || a.index - b.index);
    for(let i = 0; i < missing; i++) floors[order[i % order.length].index]++;
    let cursor = 0;
    return entries.map(entry => entry.insufficient ? {...entry, roundedProbability: null} : {...entry, roundedProbability: floors[cursor++]});
  }

  function calculateChampionshipProbabilities(input){
    const entrants = Array.isArray(input?.entrants) ? input.entrants : [];
    if(!entrants.length) return [];

    const totalRounds = Math.max(0, Number(input.totalRounds) || 0);
    const completedRounds = Math.max(0, Number(input.completedRounds) || 0);
    const remainingRounds = Math.max(0, totalRounds - completedRounds);
    const defaultMax = Math.max(0, Number(input.maxPointsPerRound) || 0);
    const fieldSize = Math.max(entrants.length, Number(input.fieldSize) || 0, 1);
    const leaderPoints = Math.max(...entrants.map(entry => Number(entry.points) || 0));
    const hasResults = completedRounds > 0 && entrants.some(entry => Number(entry.starts) > 0);

    if(!hasResults){
      return entrants.map(entry => ({
        id: entry.id,
        name: entry.name,
        probability: null,
        roundedProbability: null,
        status: 'insufficient',
        insufficient: true,
        mathematicallyAlive: true,
        remainingRounds,
        maxReach: Number(entry.points) || 0,
        score: 0,
        factors: {current: 0, gap: 0, form: 0, performance: 0, history: 0, tracks: 0, rivalry: 0}
      }));
    }

    const prepared = entrants.map((entry, index) => {
      const maxPerRound = Math.max(0, Number(entry.maxPointsPerRound) || defaultMax);
      const points = Number(entry.points) || 0;
      return {...entry, _index: index, points, maxPerRound, maxReach: points + remainingRounds * maxPerRound};
    });

    if(totalRounds > 0 && remainingRounds === 0){
      return prepared.map((entry, index) => ({
        id: entry.id,
        name: entry.name,
        probability: index === 0 ? 100 : 0,
        roundedProbability: index === 0 ? 100 : 0,
        status: index === 0 ? 'champion' : 'eliminated',
        insufficient: false,
        mathematicallyAlive: index === 0,
        remainingRounds,
        maxReach: entry.maxReach,
        score: index === 0 ? 1 : 0,
        factors: {current: index === 0 ? 1 : 0, gap: index === 0 ? 1 : 0, form: 0, performance: 0, history: 0, tracks: 0, rivalry: 0}
      }));
    }

    const secured = prepared.find(entry => prepared.every(rival => rival.id === entry.id || entry.points > rival.maxReach));
    if(secured){
      return prepared.map(entry => ({
        id: entry.id,
        name: entry.name,
        probability: entry.id === secured.id ? 100 : 0,
        roundedProbability: entry.id === secured.id ? 100 : 0,
        status: entry.id === secured.id ? 'champion' : 'eliminated',
        insufficient: false,
        mathematicallyAlive: entry.id === secured.id,
        remainingRounds,
        maxReach: entry.maxReach,
        score: entry.id === secured.id ? 1 : 0,
        factors: {current: 1, gap: 1, form: 0, performance: 0, history: 0, tracks: 0, rivalry: 0}
      }));
    }

    const progress = totalRounds > 0 ? clamp(completedRounds / totalRounds) : 1;
    const widestReach = Math.max(1, ...prepared.map(entry => entry.maxPerRound * Math.max(1, remainingRounds)));
    const scored = prepared.map(entry => {
      const alive = entry.maxReach >= leaderPoints;
      if(!alive){
        return {...entry, alive, score: Number.NEGATIVE_INFINITY, factors: {current: 0, gap: 0, form: 0, performance: 0, history: 0, tracks: 0, rivalry: 0}};
      }
      const positions = (entry.positions || []).map(Number).filter(value => value > 0);
      const recentPositions = (entry.recentPositions || positions.slice(-3)).map(Number).filter(value => value > 0);
      const starts = Math.max(1, Number(entry.starts) || positions.length || completedRounds);
      const current = leaderPoints > 0 ? clamp(entry.points / leaderPoints) : 1;
      const gap = clamp(1 - (leaderPoints - entry.points) / widestReach);
      const finish = positionQuality(positions, fieldSize);
      const recent = positionQuality(recentPositions, fieldSize);
      const consistency = consistencyQuality(positions, fieldSize);
      const wins = clamp((Number(entry.wins) || 0) / starts);
      const podiums = clamp((Number(entry.podiums) || 0) / starts);
      const poles = clamp((Number(entry.poles) || 0) / starts);
      const form = recent * 0.58 + consistency * 0.42;
      const performance = finish * 0.35 + wins * 0.3 + podiums * 0.23 + poles * 0.12;
      const history = clamp(entry.historyScore == null ? 0.5 : entry.historyScore);
      const tracks = clamp(entry.trackScore == null ? 0.5 : entry.trackScore);
      const rivalry = clamp(entry.rivalryScore == null ? 0.5 : entry.rivalryScore);
      const factors = {current, gap, form, performance, history, tracks, rivalry};
      const currentWeight = 0.32 + 0.27 * progress;
      const gapWeight = 0.18 + 0.08 * progress;
      const formWeight = 0.19 - 0.05 * progress;
      const performanceWeight = 0.17 - 0.04 * progress;
      const historyWeight = 0.08 * (1 - 0.7 * progress);
      const trackWeight = 0.035;
      const rivalryWeight = 0.025;
      const score = current * currentWeight + gap * gapWeight + form * formWeight + performance * performanceWeight + history * historyWeight + tracks * trackWeight + rivalry * rivalryWeight;
      return {...entry, alive, score, factors};
    });

    const alive = scored.filter(entry => entry.alive);
    const maxScore = Math.max(...alive.map(entry => entry.score));
    const temperature = 0.12 + 0.2 * (1 - progress);
    const weights = new Map(alive.map(entry => [entry.id, Math.exp((entry.score - maxScore) / temperature)]));
    const totalWeight = Array.from(weights.values()).reduce((sum, value) => sum + value, 0) || 1;
    const result = scored.map(entry => ({
      id: entry.id,
      name: entry.name,
      probability: entry.alive ? weights.get(entry.id) / totalWeight * 100 : 0,
      status: entry.alive ? 'contender' : 'eliminated',
      insufficient: false,
      mathematicallyAlive: entry.alive,
      remainingRounds,
      maxReach: entry.maxReach,
      score: Number.isFinite(entry.score) ? entry.score : 0,
      factors: entry.factors
    }));
    return roundToVisualHundred(result);
  }

  return {calculateChampionshipProbabilities, roundToVisualHundred};
});
