(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root){
    root.MiniZRDRatingEngine = api;
    root.MiniZRDCategoryDifficulty = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const RATING_WEIGHTS = Object.freeze({
    winRate: 0.22,
    podiumRate: 0.18,
    finishScore: 0.18,
    pointsEfficiency: 0.12,
    consistency: 0.12,
    championshipScore: 0.10,
    poleRate: 0.08
  });

  const SAMPLE_REFERENCE_STARTS = 6;
  const SAMPLE_CONFIDENCE_EXPONENT = 0.55;
  const SAMPLE_NEUTRAL_PRIOR = 0.55;
  const BASE_PERFORMANCE_MAX = 94;
  const MATURITY_BONUS_MAX = 5;
  const MATURITY_FULL_STARTS = 10;
  const CHAMPION_TITLE_BONUS = 5;
  const MAX_RATING = 99;

  // Conservados por compatibilidad con utilidades previas y ranking de dificultad entre categorías
  const CATEGORY_DIFFICULTY = Object.freeze({
    GTS: 4,
    GTP: 3,
    'LM GYRO': 2,
    'PRO/AM': 1
  });
  const MAX_CATEGORY_DIFFICULTY = Math.max(...Object.values(CATEGORY_DIFFICULTY));
  const COMPETITIVE_FIELDS = Object.freeze(['points', 'wins', 'podiums', 'poles', 'fast', 'titles']);

  function clamp01(value){
    const n = Number(value);
    if(!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }

  function average(values){
    if(!Array.isArray(values) || !values.length) return 0;
    return values.reduce((sum, val) => sum + (Number(val) || 0), 0) / values.length;
  }

  function calculateCategoryRating(input = {}){
    const starts = Math.max(0, Number(input.starts) || 0);
    const wins = Math.max(0, Number(input.wins) || 0);
    const podiums = Math.max(0, Number(input.podiums) || 0);
    const poles = Math.max(0, Number(input.poles) || 0);
    const points = Math.max(0, Number(input.points) || 0);
    const titles = Math.max(0, Number(input.titles) || 0);
    const maxPossiblePoints = Math.max(0, Number(input.maxPossiblePoints) || 0);
    const defaultMaxPointsPerRace = Math.max(0, Number(input.defaultMaxPointsPerRace) || 0);

    const racePositions = Array.isArray(input.racePositions)
      ? input.racePositions
          .map(item => ({
            position: Math.max(1, Number(item?.position) || 1),
            fieldSize: Math.max(1, Number(item?.fieldSize) || 1)
          }))
          .filter(item => Number.isFinite(item.position))
      : [];

    const seasonRanks = Array.isArray(input.seasonRanks)
      ? input.seasonRanks
          .map(item => ({
            rank: Math.max(1, Number(item?.rank) || 1),
            entrants: Math.max(1, Number(item?.entrants) || 1)
          }))
          .filter(item => Number.isFinite(item.rank))
      : [];

    if(starts <= 0 && titles <= 0){
      return {
        rating: 0,
        baseScore: 0,
        performanceScore: 0,
        maturityBonus: 0,
        championBonus: 0,
        rawPerformance: 0,
        adjustedPerformance: 0,
        confidence: 0,
        indicators: {},
        activeWeights: {},
        starts: 0,
        titles: 0
      };
    }

    if(starts <= 0 && titles > 0){
      const championBonus = titles * CHAMPION_TITLE_BONUS;
      return {
        rating: Math.max(0, Math.min(MAX_RATING, Math.round(championBonus))),
        baseScore: 0,
        performanceScore: 0,
        maturityBonus: 0,
        championBonus,
        rawPerformance: 0,
        adjustedPerformance: 0,
        confidence: 0,
        indicators: {},
        activeWeights: {},
        starts: 0,
        titles
      };
    }

    const indicators = {};
    const activeWeights = {};

    // 1. Tasa de victorias
    indicators.winRate = clamp01(wins / starts);
    activeWeights.winRate = RATING_WEIGHTS.winRate;

    // 2. Tasa de podios
    indicators.podiumRate = clamp01(podiums / starts);
    activeWeights.podiumRate = RATING_WEIGHTS.podiumRate;

    // 3. Calidad de posición final por carrera (solo cuando hay resultados de carreras)
    if(racePositions.length > 0){
      const finishScores = racePositions.map(r => {
        if(r.fieldSize <= 1) return r.position === 1 ? 1 : 0;
        return clamp01(1 - (r.position - 1) / (r.fieldSize - 1));
      });
      indicators.finishScore = clamp01(average(finishScores));
      activeWeights.finishScore = RATING_WEIGHTS.finishScore;
    }

    // 4. Eficiencia de puntuación respecto al máximo posible real del formato
    const pointsDenom = maxPossiblePoints > 0
      ? maxPossiblePoints
      : (defaultMaxPointsPerRace > 0 ? defaultMaxPointsPerRace * starts : 0);
    if(pointsDenom > 0){
      indicators.pointsEfficiency = clamp01(points / pointsDenom);
      activeWeights.pointsEfficiency = RATING_WEIGHTS.pointsEfficiency;
    }

    // 5. Consistencia de resultados (requiere al menos 2 carreras con posición registrada)
    if(racePositions.length >= 2){
      const topHalfCount = racePositions.filter(r => {
        const halfCutoff = Math.max(1, Math.ceil(r.fieldSize / 2));
        return r.position <= halfCutoff;
      }).length;
      const topHalfRate = topHalfCount / racePositions.length;
      const positions = racePositions.map(r => r.position);
      const mean = average(positions);
      const variance = average(positions.map(pos => Math.pow(pos - mean, 2)));
      const stdDev = Math.sqrt(variance);
      const avgField = average(racePositions.map(r => Math.max(2, r.fieldSize)));
      const stability = clamp01(1 - stdDev / Math.max(1.5, avgField / 2.5));
      indicators.consistency = clamp01(0.5 * topHalfRate + 0.5 * stability);
      activeWeights.consistency = RATING_WEIGHTS.consistency;
    }

    // 6. Rendimiento en campeonatos
    if(seasonRanks.length > 0){
      const rankScores = seasonRanks.map(sr => {
        if(sr.entrants <= 1) return 1;
        return clamp01(1 - (sr.rank - 1) / (sr.entrants - 1));
      });
      indicators.championshipScore = clamp01(average(rankScores));
      activeWeights.championshipScore = RATING_WEIGHTS.championshipScore;
    }

    // 7. Pole positions / TQ (solo si la categoría o el piloto tiene poles registradas)
    const hasPoles = input.categoryHasPoles === true || (input.categoryHasPoles === undefined && poles > 0);
    if(hasPoles){
      indicators.poleRate = clamp01(poles / starts);
      activeWeights.poleRate = RATING_WEIGHTS.poleRate;
    }

    // Normalizar pesos activos (redistribuye proporcionalmente cualquier indicador no disponible)
    const weightSum = Object.values(activeWeights).reduce((sum, w) => sum + w, 0);
    const rawPerformance = weightSum > 0
      ? Object.keys(activeWeights).reduce((sum, key) => sum + indicators[key] * activeWeights[key], 0) / weightSum
      : 0;

    // Ajuste por tamaño de muestra: evita que 1 sola carrera perfecta alcance 99 automáticamente
    const confidence = Math.min(1, Math.pow(starts / SAMPLE_REFERENCE_STARTS, SAMPLE_CONFIDENCE_EXPONENT));
    const adjustedPerformance = rawPerformance > SAMPLE_NEUTRAL_PRIOR
      ? (confidence * rawPerformance + (1 - confidence) * SAMPLE_NEUTRAL_PRIOR)
      : rawPerformance;

    const performanceScore = adjustedPerformance * BASE_PERFORMANCE_MAX;
    const maturityBonus = MATURITY_BONUS_MAX * Math.min(1, starts / MATURITY_FULL_STARTS) * rawPerformance;
    const baseScore = performanceScore + maturityBonus;

    // Bonificación oficial de campeón Hall of Fame (+5 por título, separada del rendimiento)
    const championBonus = titles * CHAMPION_TITLE_BONUS;
    const rating = Math.max(0, Math.min(MAX_RATING, Math.round(baseScore + championBonus)));

    return {
      rating,
      baseScore,
      performanceScore,
      maturityBonus,
      championBonus,
      rawPerformance,
      adjustedPerformance,
      confidence,
      indicators,
      activeWeights,
      starts,
      titles
    };
  }

  function calculateGeneralRating({ categoryBreakdowns = [], totalTitles = 0 } = {}){
    const valid = (Array.isArray(categoryBreakdowns) ? categoryBreakdowns : [])
      .filter(item => Number(item?.starts) > 0);
    const titles = Math.max(0, Number(totalTitles) || 0);
    const championBonus = titles * CHAMPION_TITLE_BONUS;

    if(!valid.length){
      if(titles <= 0){
        return {
          rating: 0,
          baseScore: 0,
          championBonus: 0,
          bestBase: 0,
          weightedBase: 0,
          categoryCount: 0
        };
      }
      return {
        rating: Math.max(0, Math.min(MAX_RATING, Math.round(championBonus))),
        baseScore: 0,
        championBonus,
        bestBase: 0,
        weightedBase: 0,
        categoryCount: 0
      };
    }

    let bestBase = 0;
    let weightedBase = 0;
    let baseScore = 0;

    if(valid.length === 1){
      baseScore = Number(valid[0].baseScore) || 0;
      bestBase = baseScore;
      weightedBase = baseScore;
    }else{
      bestBase = Math.max(...valid.map(item => Number(item.baseScore) || 0));
      const totalStarts = valid.reduce((sum, item) => sum + (Number(item.starts) || 0), 0) || 1;
      weightedBase = valid.reduce((sum, item) => sum + (Number(item.baseScore) || 0) * (Number(item.starts) || 0), 0) / totalStarts;
      baseScore = 0.60 * bestBase + 0.40 * weightedBase;
    }

    const rating = Math.max(0, Math.min(MAX_RATING, Math.round(baseScore + championBonus)));
    return {
      rating,
      baseScore,
      championBonus,
      bestBase,
      weightedBase,
      categoryCount: valid.length
    };
  }

  // Helpers heredados para compatibilidad
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
    return { points: 0, starts: 0, wins: 0, podiums: 0, poles: 0, fast: 0, titles: 0 };
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

  function calculateRatingFromStats(stats, peerStats, seasons, _difficultyScale = 1){
    const current = stats || emptyWeightedStats();
    const starts = Math.max(0, Number(current.starts) || 0);
    const poles = Math.max(0, Number(current.poles) || 0);
    const peers = Array.isArray(peerStats) && peerStats.length ? peerStats : [current];
    const anyPeerPoles = peers.some(p => Number(p?.poles) > 0);
    const maxPtsPerRace = Math.max(25, ...peers.map(p => {
      const st = Number(p?.starts) || 0;
      return st > 0 ? Math.round((Number(p?.points) || 0) / st) : 0;
    }));
    const breakdown = calculateCategoryRating({
      starts,
      wins: Number(current.wins) || 0,
      podiums: Number(current.podiums) || 0,
      poles,
      points: Number(current.points) || 0,
      titles: Number(current.titles) || 0,
      defaultMaxPointsPerRace: maxPtsPerRace,
      categoryHasPoles: anyPeerPoles || poles > 0
    });
    return breakdown.rating;
  }

  return {
    RATING_WEIGHTS,
    SAMPLE_REFERENCE_STARTS,
    SAMPLE_CONFIDENCE_EXPONENT,
    SAMPLE_NEUTRAL_PRIOR,
    BASE_PERFORMANCE_MAX,
    MATURITY_BONUS_MAX,
    MATURITY_FULL_STARTS,
    CHAMPION_TITLE_BONUS,
    MAX_RATING,
    calculateCategoryRating,
    calculateGeneralRating,
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
