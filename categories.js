(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.MiniZRDCategories = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const DEFAULT_CATEGORIES = Object.freeze([
    Object.freeze({
      id: 'GT',
      name: 'GTS',
      acronym: 'GTS',
      color: '#f59e0b',
      description: 'Categoría oficial GTS de MiniZRD.',
      icon: '🏎️',
      className: 'gt',
      archived: false,
      order: 0
    }),
    Object.freeze({
      id: 'GTP',
      name: 'GTP',
      acronym: 'GTP',
      color: '#ef4444',
      description: 'Categoría oficial GTP de MiniZRD.',
      icon: '⚡',
      className: 'gtp',
      archived: false,
      order: 1
    }),
    Object.freeze({
      id: 'LM_GYRO',
      name: 'LM GYRO',
      acronym: 'LM GYRO',
      color: '#22c55e',
      description: 'Categoría oficial LM GYRO de MiniZRD.',
      icon: '🟢',
      className: 'lmgyro',
      archived: false,
      order: 2
    }),
    Object.freeze({
      id: 'PRO_AM',
      name: 'PRO/AM',
      acronym: 'PRO/AM',
      color: '#2563eb',
      description: 'Categoría oficial PRO/AM de MiniZRD.',
      icon: '🔵',
      className: 'proam',
      archived: false,
      order: 3
    })
  ]);

  const LEGACY_RECORD_FIELDS = Object.freeze({
    GT: 'recordGT',
    GTP: 'recordGTP',
    LM_GYRO: 'recordLMGYRO',
    PRO_AM: 'recordPROAM'
  });

  const LEGACY_TITLE_FIELDS = Object.freeze({
    GT: 'gtTitles',
    GTP: 'gtpTitles',
    PRO_AM: 'proAmTitles'
  });

  const QUICK_COLOR_SWATCHES = Object.freeze([
    '#f59e0b', '#ef4444', '#22c55e', '#2563eb',
    '#a855f7', '#06b6d4', '#ec4899', '#f97316',
    '#84cc16', '#14b8a6', '#eab308', '#6366f1'
  ]);

  function cloneCategory(cat, fallbackOrder = 0){
    const color = normalizeHexColor(cat?.color, '#3b82f6');
    const name = String(cat?.name || cat?.acronym || cat?.id || 'Categoría').trim();
    const acronym = String(cat?.acronym || name).trim();
    return {
      id: String(cat?.id || '').trim(),
      name,
      acronym,
      color,
      description: String(cat?.description || '').trim(),
      icon: String(cat?.icon || '🏁'),
      className: String(cat?.className || '').trim(),
      archived: Boolean(cat?.archived),
      order: Number.isFinite(Number(cat?.order)) ? Number(cat.order) : fallbackOrder,
      createdAt: cat?.createdAt || null,
      updatedAt: cat?.updatedAt || null
    };
  }

  function isValidHexColor(value){
    return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(value || '').trim());
  }

  function normalizeHexColor(value, fallback = '#3b82f6'){
    const raw = String(value || '').trim();
    if(/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
    if(/^#[0-9a-fA-F]{3}$/.test(raw)){
      const r = raw[1], g = raw[2], b = raw[3];
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return isValidHexColor(fallback) ? normalizeHexColor(fallback, '#3b82f6') : '#3b82f6';
  }

  function hexToRgb(hex){
    const norm = normalizeHexColor(hex);
    return {
      r: parseInt(norm.slice(1, 3), 16),
      g: parseInt(norm.slice(3, 5), 16),
      b: parseInt(norm.slice(5, 7), 16)
    };
  }

  function rgbaFromHex(hex, alpha = 1){
    const { r, g, b } = hexToRgb(hex);
    const a = Math.max(0, Math.min(1, Number(alpha) || 0));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  function relativeLuminance(hex){
    const { r, g, b } = hexToRgb(hex);
    const linear = [r, g, b].map(channel => {
      const c = channel / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  }

  function getContrastText(hex){
    return relativeLuminance(hex) > 0.45 ? '#0b0e13' : '#ffffff';
  }

  function getReadableBadgeText(hex){
    const lum = relativeLuminance(hex);
    const { r, g, b } = hexToRgb(hex);
    if(lum < 0.28){
      const mix = (v) => Math.round(v + (255 - v) * 0.48);
      return `#${[mix(r), mix(g), mix(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
    }
    if(lum < 0.42){
      const mix = (v) => Math.round(v + (255 - v) * 0.28);
      return `#${[mix(r), mix(g), mix(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
    }
    return normalizeHexColor(hex);
  }

  function buildCategoryStyleVars(cat){
    const c = normalizeHexColor(cat?.color, '#3b82f6');
    const readable = getReadableBadgeText(c);
    const contrast = getContrastText(c);
    return `--cat-color:${c};--cat-bg:${rgbaFromHex(c, 0.16)};--cat-border:${rgbaFromHex(c, 0.58)};--cat-text:${readable};--cat-contrast:${contrast};`;
  }

  function resolveLegacyAlias(value){
    const raw = String(value || '').trim();
    if(!raw) return '';
    const v = raw.toUpperCase().replace(/[\s\/-]+/g, '_');
    if(v === 'GT' || v === 'GTS') return 'GT';
    if(v === 'GTP') return 'GTP';
    if(v === 'LMGYRO' || v === 'LM_GYRO') return 'LM_GYRO';
    if(v === 'PROAM' || v === 'PRO_AM') return 'PRO_AM';
    return '';
  }

  function defaultCategoryMap(){
    const map = new Map();
    DEFAULT_CATEGORIES.forEach(cat => map.set(cat.id, cloneCategory(cat, cat.order)));
    return map;
  }

  function createCategoryId(){
    return `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }

  function listFromDb(db){
    return Array.isArray(db?.categories) ? db.categories : [];
  }

  function normalizeCategoryId(db, value){
    const raw = String(value ?? '').trim();
    const list = listFromDb(db);
    if(!raw){
      const firstActive = list.find(c => c && !c.archived);
      return firstActive?.id || list[0]?.id || 'GT';
    }

    // 1. Coincidencia exacta por id en catálogo
    const exactId = list.find(c => c && c.id === raw);
    if(exactId) return exactId.id;

    // 2. Alias heredados oficiales (GTS -> GT, LM GYRO -> LM_GYRO, PRO/AM -> PRO_AM)
    const legacy = resolveLegacyAlias(raw);
    if(legacy) return legacy;

    // 3. Coincidencia insensible a mayúsculas por id, acronym o name
    const lower = raw.toLowerCase();
    const byAttr = list.find(c => c && (
      String(c.id || '').trim().toLowerCase() === lower ||
      String(c.acronym || '').trim().toLowerCase() === lower ||
      String(c.name || '').trim().toLowerCase() === lower
    ));
    if(byAttr) return byAttr.id;

    // 4. Conservar cualquier ID personalizado sin colapsarlo a GT
    return raw;
  }

  function ensureCategoriesCatalog(db){
    if(!db || typeof db !== 'object') return [];
    const defaults = defaultCategoryMap();
    const existing = Array.isArray(db.categories) ? db.categories : [];
    const byId = new Map();

    existing.forEach((rawCat, idx) => {
      if(!rawCat || typeof rawCat !== 'object') return;
      const rawId = String(rawCat.id || '').trim();
      const alias = resolveLegacyAlias(rawId);
      const id = alias || rawId;
      if(!id) return;
      const base = defaults.get(id);
      const merged = base ? {
        ...base,
        ...rawCat,
        id,
        name: String(rawCat.name || base.name).trim(),
        acronym: String(rawCat.acronym || rawCat.name || base.acronym).trim(),
        color: normalizeHexColor(rawCat.color, base.color),
        description: rawCat.description != null ? String(rawCat.description).trim() : base.description,
        icon: rawCat.icon != null ? String(rawCat.icon) : base.icon,
        className: rawCat.className || base.className,
        archived: Boolean(rawCat.archived),
        order: Number.isFinite(Number(rawCat.order)) ? Number(rawCat.order) : base.order
      } : cloneCategory({ ...rawCat, id }, idx + DEFAULT_CATEGORIES.length);
      if(!byId.has(id)) byId.set(id, merged);
    });

    // Garantizar que las 4 categorías predeterminadas existan sin sobrescribir cambios ya guardados
    DEFAULT_CATEGORIES.forEach(defCat => {
      if(!byId.has(defCat.id)){
        byId.set(defCat.id, cloneCategory(defCat, defCat.order));
      }
    });

    // Detectar IDs históricos en temporadas, carreras, pilotos, pistas y noticias para no dejar huérfanos
    const referencedIds = new Set();
    const collectId = (val) => {
      if(!val) return;
      const resolved = resolveLegacyAlias(val) || String(val).trim();
      if(resolved) referencedIds.add(resolved);
    };
    (db.seasons || []).forEach(s => collectId(s?.category));
    (db.races || []).forEach(r => collectId(r?.category));
    (db.drivers || []).forEach(d => {
      collectId(d?.category);
      if(Array.isArray(d?.categories)) d.categories.forEach(collectId);
      if(d?.career?.categoryTitles && typeof d.career.categoryTitles === 'object'){
        Object.keys(d.career.categoryTitles).forEach(collectId);
      }
    });
    (db.tracks || []).forEach(t => {
      if(t?.records && typeof t.records === 'object'){
        Object.keys(t.records).forEach(collectId);
      }
    });
    (db.newsHistory || []).forEach(n => {
      collectId(n?.cat);
      if(Array.isArray(n?.categoryIds)) n.categoryIds.forEach(collectId);
    });

    let nextOrder = byId.size;
    referencedIds.forEach(id => {
      if(!byId.has(id)){
        byId.set(id, cloneCategory({
          id,
          name: id.replace(/_/g, ' '),
          acronym: id.replace(/_/g, ' ').slice(0, 12),
          color: '#38bdf8',
          description: 'Categoría recuperada desde registros históricos.',
          icon: '🏁',
          archived: false,
          order: nextOrder++
        }));
      }
    });

    const sorted = Array.from(byId.values())
      .sort((a, b) => (a.order - b.order) || String(a.name).localeCompare(String(b.name)))
      .map((cat, idx) => ({ ...cat, order: idx }));

    db.categories = sorted;
    return db.categories;
  }

  function getAllCategories(db, includeArchived = true){
    const list = Array.isArray(db?.categories) && db.categories.length
      ? db.categories
      : DEFAULT_CATEGORIES.map(c => cloneCategory(c, c.order));
    return (includeArchived ? list : list.filter(c => !c.archived))
      .slice()
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  }

  function getActiveCategories(db){
    return getAllCategories(db, false);
  }

  function getArchivedCategories(db){
    return getAllCategories(db, true).filter(c => c.archived);
  }

  function getActiveCategoryIds(db){
    return getActiveCategories(db).map(c => c.id);
  }

  function getAllCategoryIds(db){
    return getAllCategories(db, true).map(c => c.id);
  }

  function getCategoryById(db, value){
    const id = normalizeCategoryId(db, value);
    const list = getAllCategories(db, true);
    const found = list.find(c => c.id === id);
    if(found) return found;
    const def = DEFAULT_CATEGORIES.find(c => c.id === id);
    if(def) return cloneCategory(def, def.order);
    return cloneCategory({
      id,
      name: String(value || id),
      acronym: String(value || id),
      color: '#38bdf8',
      icon: '🏁'
    });
  }

  function validateCategoryInput(db, input = {}, editingId = null){
    const name = String(input.name || '').trim();
    const acronym = String(input.acronym || '').trim();
    const description = String(input.description || '').trim();
    const rawColor = String(input.color || '').trim();

    if(name.length < 2 || name.length > 60){
      return { ok: false, error: 'El nombre completo de la categoría debe tener entre 2 y 60 caracteres.' };
    }
    if(acronym.length < 1 || acronym.length > 16){
      return { ok: false, error: 'Las siglas deben tener entre 1 y 16 caracteres.' };
    }
    if(!isValidHexColor(rawColor)){
      return { ok: false, error: 'Selecciona un color oficial válido en formato hexadecimal (#RRGGBB).' };
    }
    const color = normalizeHexColor(rawColor);

    const others = getAllCategories(db, true).filter(c => c.id !== editingId);
    const nameLower = name.toLowerCase();
    const acronymLower = acronym.toLowerCase();

    if(others.some(c => String(c.name || '').trim().toLowerCase() === nameLower)){
      return { ok: false, error: `Ya existe otra categoría con el nombre "${name}".` };
    }
    if(others.some(c => String(c.acronym || '').trim().toLowerCase() === acronymLower)){
      return { ok: false, error: `Ya existe otra categoría con las siglas "${acronym}".` };
    }

    return {
      ok: true,
      data: { name, acronym, color, description }
    };
  }

  function getTrackRecord(track, catId){
    if(!track) return null;
    const id = String(catId || '').trim();
    const rec = track.records?.[id] || (LEGACY_RECORD_FIELDS[id] ? track[LEGACY_RECORD_FIELDS[id]] : null);
    if(!rec || (!rec.time && !rec.driverId)) return null;
    return rec;
  }

  function setTrackRecord(track, catId, record){
    if(!track) return;
    const id = String(catId || '').trim();
    if(!id) return;
    if(!track.records || typeof track.records !== 'object') track.records = {};
    const clean = record && (String(record.time || '').trim() || String(record.driverId || '').trim())
      ? {
          driverId: String(record.driverId || '').trim(),
          time: String(record.time || '').trim(),
          championship: String(record.championship || '').trim(),
          round: String(record.round || '').trim()
        }
      : null;

    if(clean){
      track.records[id] = clean;
    }else{
      delete track.records[id];
    }

    const legacyField = LEGACY_RECORD_FIELDS[id];
    if(legacyField){
      track[legacyField] = clean;
    }
  }

  function getDriverLegacyTitlesForCategory(driver, catId){
    if(!driver?.career) return 0;
    const id = String(catId || '').trim();
    const fromMap = driver.career.categoryTitles && driver.career.categoryTitles[id] !== undefined
      ? Number(driver.career.categoryTitles[id])
      : null;
    const legacyField = LEGACY_TITLE_FIELDS[id];
    const fromLegacy = legacyField && driver.career[legacyField] !== undefined
      ? Number(driver.career[legacyField])
      : 0;
    if(fromMap !== null && !Number.isNaN(fromMap)) return Math.max(0, fromMap);
    return Math.max(0, fromLegacy || 0);
  }

  function setDriverLegacyTitlesForCategory(driver, catId, value){
    if(!driver) return;
    if(!driver.career || typeof driver.career !== 'object') driver.career = {};
    if(!driver.career.categoryTitles || typeof driver.career.categoryTitles !== 'object'){
      driver.career.categoryTitles = {};
    }
    const id = String(catId || '').trim();
    const num = Math.max(0, Math.round(Number(value) || 0));
    if(num > 0){
      driver.career.categoryTitles[id] = num;
    }else{
      delete driver.career.categoryTitles[id];
    }
    const legacyField = LEGACY_TITLE_FIELDS[id];
    if(legacyField){
      driver.career[legacyField] = num;
    }
  }

  function getDriverTotalLegacyTitles(db, driver){
    if(!driver?.career) return 0;
    const allIds = getAllCategoryIds(db);
    let perCategorySum = 0;
    const counted = new Set();
    allIds.forEach(id => {
      counted.add(id);
      perCategorySum += getDriverLegacyTitlesForCategory(driver, id);
    });
    if(driver.career.categoryTitles && typeof driver.career.categoryTitles === 'object'){
      Object.keys(driver.career.categoryTitles).forEach(rawId => {
        const id = normalizeCategoryId(db, rawId);
        if(!counted.has(id)){
          counted.add(id);
          perCategorySum += Math.max(0, Number(driver.career.categoryTitles[rawId]) || 0);
        }
      });
    }
    return Math.max(Math.max(0, Number(driver.career.titles) || 0), perCategorySum);
  }

  function getCategoryUsage(db, categoryId){
    const targetId = normalizeCategoryId(db, categoryId);
    const seasonsMap = new Map((db?.seasons || []).map(s => [s.id, s]));

    const seasons = (db?.seasons || []).filter(s => normalizeCategoryId(db, s.category) === targetId).length;
    const races = (db?.races || []).filter(r => {
      const s = seasonsMap.get(r.seasonId);
      return normalizeCategoryId(db, s?.category || r.category) === targetId;
    }).length;

    const driverSet = new Set();
    (db?.races || []).forEach(r => {
      const s = seasonsMap.get(r.seasonId);
      if(normalizeCategoryId(db, s?.category || r.category) === targetId){
        (r.results || r.grid || []).forEach(row => {
          const did = typeof row === 'string' ? row : row?.driverId;
          if(did) driverSet.add(did);
        });
      }
    });
    (db?.drivers || []).forEach(d => {
      if(d.category && normalizeCategoryId(db, d.category) === targetId) driverSet.add(d.id);
      if(Array.isArray(d.categories) && d.categories.some(c => normalizeCategoryId(db, c) === targetId)) driverSet.add(d.id);
      if(getDriverLegacyTitlesForCategory(d, targetId) > 0) driverSet.add(d.id);
    });

    const trackRecords = (db?.tracks || []).filter(t => {
      const rec = getTrackRecord(t, targetId);
      return Boolean(rec && (rec.time || rec.driverId));
    }).length;

    const news = (db?.newsHistory || []).filter(n => {
      const ids = Array.isArray(n.categoryIds) && n.categoryIds.length
        ? n.categoryIds.map(c => normalizeCategoryId(db, c))
        : (n.cat ? [normalizeCategoryId(db, n.cat)] : []);
      return ids.includes(targetId);
    }).length;

    return {
      seasons,
      races,
      drivers: driverSet.size,
      trackRecords,
      news,
      total: seasons + races + driverSet.size + trackRecords + news
    };
  }

  return {
    DEFAULT_CATEGORIES,
    LEGACY_RECORD_FIELDS,
    LEGACY_TITLE_FIELDS,
    QUICK_COLOR_SWATCHES,
    isValidHexColor,
    normalizeHexColor,
    hexToRgb,
    rgbaFromHex,
    getContrastText,
    getReadableBadgeText,
    buildCategoryStyleVars,
    resolveLegacyAlias,
    createCategoryId,
    ensureCategoriesCatalog,
    normalizeCategoryId,
    getAllCategories,
    getActiveCategories,
    getArchivedCategories,
    getActiveCategoryIds,
    getAllCategoryIds,
    getCategoryById,
    validateCategoryInput,
    getTrackRecord,
    setTrackRecord,
    getDriverLegacyTitlesForCategory,
    setDriverLegacyTitlesForCategory,
    getDriverTotalLegacyTitles,
    getCategoryUsage
  };
});
