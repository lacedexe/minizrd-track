(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  else root.MiniZRDCategoryDifficulty = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const CATEGORY_DIFFICULTY = Object.freeze({
    GTS: 4,
    GTP: 3,
    'LM GYRO': 2,
    'PRO/AM': 1
  });
  const MAX_CATEGORY_DIFFICULTY = Math.max(...Object.values(CATEGORY_DIFFICULTY));
  const COMPETITIVE_FIELDS = Object.freeze(['points', 'wins', 'podiums', 'poles', 'fast', 'titles']);

  function difficultyCategoryLabel(category){
    const value = String(category || '').trim().toUpperCase().replace(/[\s\/-]+/g, '_');
    if(value === 'GT' || value === 'GTS') return 'GTS';
    if(value === 'GTP') return 'GTP';
    if(value === 'LMGYRO' || value === 'LM_GYRO') return 'LM GYRO';
    if(value === 'PROAM' || value === 'PRO_AM') return 'PRO/AM';
    return null;
  }

  function getCategoryDifficulty(category){
    return CATEGORY_DIFFICULTY[difficultyCategoryLabel(category)] ?? 1;
  }

  function emptyWeightedStats(){
    return {points:0,starts:0,wins:0,podiums:0,poles:0,fast:0,titles:0};
  }

  function weightCompetitiveStats(stats, category){
    const source = stats || {};
    const factor = getCategoryDifficulty(category);
    const weighted = emptyWeightedStats();
    weighted.starts = Number(source.starts) || 0;
    COMPETITIVE_FIELDS.forEach(field => {
      weighted[field] = (Number(source[field]) || 0) * factor;
    });
    return weighted;
  }

  function combineDifficultyWeightedStats(groups){
    return (Array.isArray(groups) ? groups : []).reduce((total, group) => {
      const weighted = weightCompetitiveStats(group?.stats, group?.category);
      total.starts += weighted.starts;
      COMPETITIVE_FIELDS.forEach(field => { total[field] += weighted[field]; });
      return total;
    }, emptyWeightedStats());
  }

  function calculateRatingFromStats(stats, peerStats, seasons, difficultyScale = 1){
    const current = stats || emptyWeightedStats();
    const peers = Array.isArray(peerStats) && peerStats.length ? peerStats : [current];
    const maximum = field => Math.max(1, ...peers.map(item => Number(item?.[field]) || 0));
    const starts = Number(current.starts) || 1;
    const averagePoints = (Number(current.points) || 0) / starts;
    const podiumRate = (Number(current.podiums) || 0) / starts;
    const performance =
      ((Number(current.wins) || 0) / maximum('wins')) * 15 +
      ((Number(current.podiums) || 0) / maximum('podiums')) * 15 +
      ((Number(current.points) || 0) / maximum('points')) * 12 +
      Math.min(1, averagePoints / 25) * 15 +
      Math.min(1, podiumRate) * 15 +
      ((Number(current.poles) || 0) / maximum('poles')) * 13;
    const titleValue = (Number(current.titles) || 0) * 5;
    const experience = Math.min(15, (Number(seasons) || 0) * 2.5);
    const score = (performance + titleValue) * Math.max(0, Number(difficultyScale) || 0) + experience;
    return Math.max(0, Math.min(99, Math.round(score)));
  }

  return {
    CATEGORY_DIFFICULTY,
    MAX_CATEGORY_DIFFICULTY,
    COMPETITIVE_FIELDS,
    difficultyCategoryLabel,
    getCategoryDifficulty,
    weightCompetitiveStats,
    combineDifficultyWeightedStats,
    calculateRatingFromStats
  };
});
