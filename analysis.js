// analysis.js

// 1. Navigation for Championship Analysis
function showChampView(view) {
    document.getElementById('champClasificacionView').classList.add('hidden');
    document.getElementById('champRondasView').classList.add('hidden');
    document.getElementById('champAnalisisView').classList.add('hidden');
    
    document.getElementById('btnClasificacion').classList.remove('active');
    document.getElementById('btnRondas').classList.remove('active');
    document.getElementById('btnAnalisis').classList.remove('active');
    
    if (view === 'clasificacion') {
        document.getElementById('champClasificacionView').classList.remove('hidden');
        document.getElementById('btnClasificacion').classList.add('active');
    } else if (view === 'rondas') {
        document.getElementById('champRondasView').classList.remove('hidden');
        document.getElementById('btnRondas').classList.add('active');
    } else if (view === 'analisis') {
        document.getElementById('champAnalisisView').classList.remove('hidden');
        document.getElementById('btnAnalisis').classList.add('active');
        renderChampCharts();
    }
}

// Ensure charts are updated if the analysis view is visible
window.triggerAnalysisUpdate = function() {
    if (document.getElementById('champAnalisisView') && !document.getElementById('champAnalisisView').classList.contains('hidden')) {
        renderChampCharts();
    }
    
    if (document.getElementById('head2head') && !document.getElementById('head2head').classList.contains('hidden')) {
        renderHeadToHead();
    }
    
    updateH2HDropdowns();
};

window.addEventListener('resize', () => {
    let v = document.getElementById('champAnalisisView');
    if (v && !v.classList.contains('hidden')) {
        clearTimeout(window._chartResizeTimer);
        window._chartResizeTimer = setTimeout(() => {
            renderChampCharts();
        }, 150);
    }
});

let champCharts = {};
let posChartMode = 'standings'; // 'standings' | 'races'

window.setPosChartMode = function(mode) {
    posChartMode = mode;
    let b1 = document.getElementById('btnPosCampStandings');
    let b2 = document.getElementById('btnPosCampRaces');
    if (b1 && b2) {
        b1.classList.toggle('active', mode === 'standings');
        b2.classList.toggle('active', mode === 'races');
    }
    renderChampCharts();
};

const CHAMP_PALETTE = [
    '#f59e0b', // 1. Gold / Amber
    '#38bdf8', // 2. Sky Blue / Cyan
    '#ef4444', // 3. Crimson Red
    '#10b981', // 4. Emerald Green
    '#a855f7', // 5. Purple / Violet
    '#d97706', // 6. Bronze / Warm Ochre
    '#3b82f6', // 7. Cobalt Blue
    '#be123c', // 8. Dark Maroon / Rose
    '#f97316', // 9. Bright Orange
    '#14b8a6', // 10. Teal
    '#ec4899', // 11. Pink
    '#8b5cf6', // 12. Indigo
    '#06b6d4', // 13. Bright Cyan
    '#84cc16'  // 14. Lime Green
];

function getDriverChampColor(idx) {
    return CHAMP_PALETTE[idx % CHAMP_PALETTE.length];
}

function renderChampCharts() {
    let a = active();
    if (!a) return;
    
    let races = db.races.filter(r => r.seasonId === a.id).slice().sort((x, y) => x.date.localeCompare(y.date) || String(x.id).localeCompare(String(y.id)));
    let st = standings(a.id);
    let top10 = st.slice(0, 10);
    
    // 1. Summary Cards
    let summaryHtml = '';
    let leader = st[0];
    if (leader) {
        let runnerUp = st[1];
        let gap = runnerUp ? leader._s.points - runnerUp._s.points : leader._s.points;
        summaryHtml += `<div class="card"><div class="statLabel">Líder del Campeonato</div><div class="statValue">${esc(leader.name)}</div><span class="pill">+${gap} pts s/ 2.º</span></div>`;
    }
    let mostWins = [...st].sort((x,y) => y._s.wins - x._s.wins)[0];
    if (mostWins && mostWins._s.wins > 0) {
        summaryHtml += `<div class="card"><div class="statLabel">Más Victorias</div><div class="statValue">${esc(mostWins.name)}</div><span class="pill">${mostWins._s.wins} victorias</span></div>`;
    }
    let totalRaces = races.length;
    summaryHtml += `<div class="card"><div class="statLabel">Rondas Disputadas</div><div class="statValue">${totalRaces} <span style="font-size:16px;color:var(--muted);font-weight:400">/ ${a.rounds||'?'}</span></div><span class="pill">${st.length} pilotos inscritos</span></div>`;
    
    document.getElementById('champAnalysisSummary').innerHTML = summaryHtml;
    
    if (races.length === 0) {
        // Clear all charts if no races
        Object.keys(champCharts).forEach(k => {
            if (champCharts[k]) { champCharts[k].destroy(); delete champCharts[k]; }
        });
        return;
    }
    
    // Common labels for rounds
    let labels = races.map((r, i) => `R${i+1}`);
    
    // Helpers
    const getDriverPointsEvolution = (driverId) => {
        let cumulative = 0;
        return races.map(r => {
            let res = (r.results || r.grid || []).find(x => x.driverId === driverId);
            let pts = res ? pointsForPosition(res.position, !!res.pole, !!res.fast) : 0;
            cumulative += pts;
            return cumulative;
        });
    };
    
    const getDriverPointsPerRound = (driverId) => {
        return races.map(r => {
            let res = (r.results || r.grid || []).find(x => x.driverId === driverId);
            return res ? pointsForPosition(res.position, !!res.pole, !!res.fast) : 0;
        });
    };
    
    // Calculate standings per round (championship table rank evolution)
    let standingsPerRound = [];
    let currentStats = {};
    let seasonPilots = (typeof getSeasonDrivers === 'function' ? getSeasonDrivers(a.id) : db.drivers);
    seasonPilots.forEach(d => currentStats[d.id] = { points: 0, wins: 0, podiums: 0, starts: 0 });
    
    races.forEach((r) => {
        let res = normalizeRaceResults(r);
        res.forEach(x => {
            if (currentStats[x.driverId]) {
                currentStats[x.driverId].starts++;
                currentStats[x.driverId].points += x.points;
                if (x.position === 1) currentStats[x.driverId].wins++;
                if (x.position <= 3) currentStats[x.driverId].podiums++;
            }
        });
        
        let sorted = seasonPilots.map(d => ({ id: d.id, stats: {...currentStats[d.id]} }))
            .sort((x, y) => y.stats.points - x.stats.points || y.stats.wins - x.stats.wins || y.stats.podiums - x.stats.podiums || y.stats.starts - x.stats.starts);
        
        let rankMap = {};
        sorted.forEach((d, i) => {
            if (d.stats.starts > 0) rankMap[d.id] = i + 1;
        });
        standingsPerRound.push(rankMap);
    });
    
    // Race finish position helper
    const getDriverFinishPositions = (driverId) => {
        return races.map(r => {
            let res = (r.results || r.grid || []).find(x => x.driverId === driverId);
            return res ? Number(res.position) : null;
        });
    };
    
    let isLight = document.body.classList.contains('light');
    let maxDrivers = Math.max(8, top10.length);
    
    // =========================================================================
    // 1. chartPosicionCamp: FEATURED POSITION EVOLUTION (Matches Reference Image)
    // =========================================================================
    let positionDatasets = top10.map((d, i) => {
        let color = getDriverChampColor(i);
        let dataSeries = posChartMode === 'standings'
            ? standingsPerRound.map(s => s[d.id] || null)
            : getDriverFinishPositions(d.id);
        
        return {
            label: d.name.toUpperCase(),
            data: dataSeries,
            borderColor: color,
            backgroundColor: 'transparent',
            borderWidth: 2.5,
            tension: 0.15,
            spanGaps: false,
            pointRadius: 4.5,
            pointHoverRadius: 7,
            pointBackgroundColor: '#ffffff',
            pointBorderColor: color,
            pointBorderWidth: 2
        };
    });
    
    createOrUpdateChart('chartPosicionCamp', 'line', {
        labels: labels,
        datasets: positionDatasets
    }, {
        scales: {
            y: {
                reverse: true,
                min: 1,
                max: maxDrivers,
                ticks: {
                    stepSize: 1,
                    precision: 0,
                    color: isLight ? '#475569' : '#9da8b7',
                    font: { weight: 'bold', size: 11 }
                },
                grid: {
                    color: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'
                }
            },
            x: {
                ticks: {
                    color: isLight ? '#475569' : '#9da8b7',
                    font: { weight: 'bold', size: 11 }
                },
                grid: {
                    color: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'
                }
            }
        },
        plugins: {
            legend: {
                display: true,
                position: (window.innerWidth < 640 ? 'bottom' : 'right'),
                align: 'start',
                labels: {
                    boxWidth: 12,
                    boxHeight: 12,
                    padding: 10,
                    color: isLight ? '#334155' : '#c6ced8',
                    font: {
                        family: 'Inter, system-ui, sans-serif',
                        size: 11,
                        weight: '700'
                    }
                }
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        let val = context.parsed.y;
                        return ` ${label}: Posición ${val}`;
                    }
                }
            }
        }
    });
    
    // =========================================================================
    // 2. chartEvolucionPuntos: ACCUMULATED POINTS EVOLUTION (Top 10)
    // =========================================================================
    createOrUpdateChart('chartEvolucionPuntos', 'line', {
        labels: labels,
        datasets: top10.map((d, i) => {
            let color = getDriverChampColor(i);
            return {
                label: d.name.toUpperCase(),
                data: getDriverPointsEvolution(d.id),
                borderColor: color,
                backgroundColor: 'transparent',
                borderWidth: 2.5,
                tension: 0.2,
                pointRadius: 4,
                pointHoverRadius: 6.5,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: color,
                pointBorderWidth: 2
            };
        })
    }, {
        scales: {
            y: {
                beginAtZero: true,
                ticks: {
                    color: isLight ? '#475569' : '#9da8b7',
                    font: { weight: '600', size: 11 }
                },
                grid: {
                    color: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'
                }
            },
            x: {
                ticks: {
                    color: isLight ? '#475569' : '#9da8b7',
                    font: { weight: 'bold', size: 11 }
                },
                grid: {
                    color: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'
                }
            }
        },
        plugins: {
            legend: {
                display: true,
                position: (window.innerWidth < 640 ? 'bottom' : 'right'),
                align: 'start',
                labels: {
                    boxWidth: 12,
                    boxHeight: 12,
                    padding: 10,
                    color: isLight ? '#334155' : '#c6ced8',
                    font: {
                        family: 'Inter, system-ui, sans-serif',
                        size: 11,
                        weight: '700'
                    }
                }
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        return ` ${context.dataset.label}: ${context.parsed.y} pts acumulados`;
                    }
                }
            }
        }
    });
    
    // =========================================================================
    // 3. chartBattle: TOP 5 CHAMPIONSHIP BATTLE
    // =========================================================================
    let top5 = st.slice(0, 5);
    createOrUpdateChart('chartBattle', 'line', {
        labels: labels,
        datasets: top5.map((d, i) => {
            let color = getDriverChampColor(i);
            return {
                label: d.name.toUpperCase(),
                data: standingsPerRound.map(s => s[d.id] || null),
                borderColor: color,
                backgroundColor: 'transparent',
                borderWidth: 2.5,
                tension: 0.15,
                pointRadius: 4.5,
                pointHoverRadius: 7,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: color,
                pointBorderWidth: 2
            };
        })
    }, {
        scales: {
            y: {
                reverse: true,
                min: 1,
                max: 5,
                ticks: {
                    stepSize: 1,
                    precision: 0,
                    color: isLight ? '#475569' : '#9da8b7',
                    font: { weight: 'bold', size: 11 }
                },
                grid: {
                    color: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'
                }
            },
            x: {
                ticks: {
                    color: isLight ? '#475569' : '#9da8b7',
                    font: { weight: 'bold', size: 11 }
                },
                grid: {
                    color: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'
                }
            }
        },
        plugins: {
            legend: {
                display: true,
                position: (window.innerWidth < 640 ? 'bottom' : 'right'),
                align: 'start',
                labels: {
                    boxWidth: 12,
                    boxHeight: 12,
                    padding: 8,
                    color: isLight ? '#334155' : '#c6ced8',
                    font: {
                        family: 'Inter, system-ui, sans-serif',
                        size: 10,
                        weight: '700'
                    }
                }
            }
        }
    });
    
    // =========================================================================
    // 4. chartGap: GAP TO LEADER (Bar)
    // =========================================================================
    if (leader) {
        createOrUpdateChart('chartGap', 'bar', {
            labels: top10.map(d => d.name.toUpperCase()),
            datasets: [{
                label: 'Diferencia de Puntos',
                data: top10.map(d => Math.max(0, leader._s.points - d._s.points)),
                backgroundColor: top10.map((d, i) => i === 0 ? '#10b981' : '#ef4444cc'),
                borderColor: top10.map((d, i) => i === 0 ? '#10b981' : '#ef4444'),
                borderWidth: 1,
                borderRadius: 6
            }]
        }, {
            indexAxis: 'y',
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        color: isLight ? '#475569' : '#9da8b7',
                        font: { weight: '600', size: 10 }
                    },
                    grid: {
                        color: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'
                    }
                },
                y: {
                    ticks: {
                        color: isLight ? '#334155' : '#c6ced8',
                        font: { weight: 'bold', size: 10 }
                    },
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.parsed.x === 0 ? ' Líder del campeonato (0 pts gap)' : ` -${context.parsed.x} pts respecto al líder`;
                        }
                    }
                }
            }
        });
    }
    
    // =========================================================================
    // 5. chartPuntosRonda: POINTS SCORED PER ROUND (Top 5)
    // =========================================================================
    createOrUpdateChart('chartPuntosRonda', 'bar', {
        labels: labels,
        datasets: top5.map((d, i) => ({
            label: d.name.toUpperCase(),
            data: getDriverPointsPerRound(d.id),
            backgroundColor: getDriverChampColor(i),
            borderRadius: 4
        }))
    }, {
        scales: {
            y: {
                beginAtZero: true,
                ticks: {
                    color: isLight ? '#475569' : '#9da8b7',
                    font: { weight: '600', size: 10 }
                },
                grid: {
                    color: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'
                }
            },
            x: {
                ticks: {
                    color: isLight ? '#475569' : '#9da8b7',
                    font: { weight: 'bold', size: 11 }
                },
                grid: { display: false }
            }
        },
        plugins: {
            legend: {
                display: true,
                position: (window.innerWidth < 640 ? 'bottom' : 'right'),
                align: 'start',
                labels: {
                    boxWidth: 12,
                    boxHeight: 12,
                    padding: 8,
                    color: isLight ? '#334155' : '#c6ced8',
                    font: {
                        family: 'Inter, system-ui, sans-serif',
                        size: 10,
                        weight: '700'
                    }
                }
            }
        }
    });
    
    // =========================================================================
    // 6. chartTeamPerf: CONSTRUCTOR / TEAM PERFORMANCE (Bar)
    // =========================================================================
    let teamStats = {};
    st.forEach(d => {
        let team = d.team || 'Sin equipo';
        if (!teamStats[team]) teamStats[team] = 0;
        teamStats[team] += d._s.points;
    });
    let sortedTeams = Object.keys(teamStats).sort((x, y) => teamStats[y] - teamStats[x]);
    let topTeams = sortedTeams.slice(0, 8);
    
    createOrUpdateChart('chartTeamPerf', 'bar', {
        labels: topTeams.map(t => t.toUpperCase()),
        datasets: [{
            label: 'Puntos de Escudería',
            data: topTeams.map(t => teamStats[t]),
            backgroundColor: topTeams.map((t, i) => getDriverChampColor(i)),
            borderRadius: 6
        }]
    }, {
        indexAxis: 'y',
        scales: {
            x: {
                beginAtZero: true,
                ticks: {
                    color: isLight ? '#475569' : '#9da8b7',
                    font: { weight: '600', size: 10 }
                },
                grid: {
                    color: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'
                }
            },
            y: {
                ticks: {
                    color: isLight ? '#334155' : '#c6ced8',
                    font: { weight: 'bold', size: 10 }
                },
                grid: { display: false }
            }
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        return ` ${context.parsed.x} pts acumulados`;
                    }
                }
            }
        }
    });
}

// Chart.js helper with clean instance destruction and responsive defaults
function createOrUpdateChart(canvasId, type, data, options = {}) {
    let el = document.getElementById(canvasId);
    if (!el) return;
    let ctx = el.getContext('2d');
    
    let isLight = document.body.classList.contains('light');
    
    let defaultOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
            duration: 350
        },
        plugins: {
            legend: {
                labels: {
                    color: isLight ? '#334155' : '#c6ced8',
                    font: { family: 'Inter, system-ui, sans-serif' }
                }
            }
        },
        scales: {
            x: {
                ticks: { color: isLight ? '#475569' : '#9da8b7' },
                grid: { color: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)' }
            },
            y: {
                ticks: { color: isLight ? '#475569' : '#9da8b7' },
                grid: { color: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)' }
            }
        }
    };
    
    // Deep merge options
    let finalOptions = { ...defaultOptions, ...options };
    if (options.scales) {
        finalOptions.scales = { ...defaultOptions.scales, ...options.scales };
    }
    if (options.plugins) {
        finalOptions.plugins = { ...defaultOptions.plugins, ...options.plugins };
    }

    // Always destroy previous chart to prevent canvas resize feedback loops and scale state corruption
    if (champCharts[canvasId]) {
        champCharts[canvasId].destroy();
        champCharts[canvasId] = null;
    }
    
    Chart.defaults.color = isLight ? '#475569' : '#9da8b7';
    Chart.defaults.font.family = 'Inter, system-ui, -apple-system, sans-serif';
    champCharts[canvasId] = new Chart(ctx, {
        type: type,
        data: data,
        options: finalOptions
    });
}

// ==========================================
// HEAD TO HEAD
// ==========================================

function updateH2HDropdowns() {
    let hA = document.getElementById('h2hPilotA');
    let hB = document.getElementById('h2hPilotB');
    if (!hA || !hB) return;
    
    let valA = hA.value;
    let valB = hB.value;
    
    let opts = '<option value="">Seleccionar Piloto</option>' + 
        db.drivers.slice().sort((a,b) => a.name.localeCompare(b.name))
        .map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
    
    hA.innerHTML = opts;
    hB.innerHTML = opts;
    
    if (db.drivers.some(d => d.id === valA)) hA.value = valA;
    if (db.drivers.some(d => d.id === valB)) hB.value = valB;
}

function renderHeadToHead() {
    let idA = document.getElementById('h2hPilotA').value;
    let idB = document.getElementById('h2hPilotB').value;
    let container = document.getElementById('h2hContent');
    
    if (!idA || !idB) {
        container.innerHTML = '<div class="empty">Selecciona dos pilotos para comparar.</div>';
        return;
    }
    if (idA === idB) {
        container.innerHTML = '<div class="empty">Por favor, selecciona dos pilotos distintos.</div>';
        return;
    }
    
    let dA = driver(idA);
    let dB = driver(idB);
    
    let tA = totalsFor(dA);
    let tB = totalsFor(dB);
    let ratingA = ratingFor(dA);
    let ratingB = ratingFor(dB);
    let rankA = historicalRanking().findIndex(x => x.id === idA) + 1;
    let rankB = historicalRanking().findIndex(x => x.id === idB) + 1;
    
    // Calculate global stats (Efectividad, Win Rate, Podium Rate)
    let winRateA = tA.starts ? Math.round((tA.wins/tA.starts)*100) : 0;
    let winRateB = tB.starts ? Math.round((tB.wins/tB.starts)*100) : 0;
    let podRateA = tA.starts ? Math.round((tA.podiums/tA.starts)*100) : 0;
    let podRateB = tB.starts ? Math.round((tB.podiums/tB.starts)*100) : 0;
    
    let activeSeason = active();
    let seasonTitle = activeSeason ? activeSeason.name : '';
    let ssA = activeSeason ? seasonStatsFor(dA, activeSeason.id) : emptyStats();
    let ssB = activeSeason ? seasonStatsFor(dB, activeSeason.id) : emptyStats();
    let rkA = activeSeason && ssA.starts > 0 ? standings(activeSeason.id).findIndex(x => x.id === idA) + 1 : 0;
    let rkB = activeSeason && ssB.starts > 0 ? standings(activeSeason.id).findIndex(x => x.id === idB) + 1 : 0;
    
    // Helper to generate a comparison row
    const cmp = (valA, valB, label, inverse = false) => {
        let winA = inverse ? valA < valB : valA > valB;
        let winB = inverse ? valB < valA : valB > valA;
        if(valA === valB) { winA = false; winB = false; }
        // Special case for missing rank
        if(inverse && valA === 0) { winA = false; winB = true; }
        if(inverse && valB === 0) { winA = true; winB = false; }
        if(inverse && valA === 0 && valB === 0) { winA = false; winB = false; }
        
        return `
        <tr>
            <td class="h2hVal ${winA ? 'h2hWinner' : ''}">${valA || (inverse ? '—' : '0')}</td>
            <td class="h2hLabel">${label}</td>
            <td class="h2hVal ${winB ? 'h2hWinner' : ''}">${valB || (inverse ? '—' : '0')}</td>
        </tr>`;
    };
    
    // Bar chart comparison helper
    const bar = (valA, valB, label, isPercent = false) => {
        let max = Math.max(valA, valB) || 1;
        let pctA = (valA / max) * 100;
        let pctB = (valB / max) * 100;
        if(isPercent) { pctA = valA; pctB = valB; }
        
        return `
        <div class="barChartWrapper">
            <div class="barRow">
                <div class="barValue ${valA > valB ? 'h2hWinner' : ''}">${valA}${isPercent?'%':''}</div>
                <div class="barTrack"><div class="barFill" style="width: ${pctA}%; float: right;"></div></div>
                <div class="barLabel" style="text-align: center;">${label}</div>
                <div class="barTrack"><div class="barFill" style="width: ${pctB}%;"></div></div>
                <div class="barValue ${valB > valA ? 'h2hWinner' : ''}" style="text-align: left;">${valB}${isPercent?'%':''}</div>
            </div>
        </div>`;
    };

    let html = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
        <div class="card" style="text-align: center;">
            <div style="display: flex; justify-content: center;">
                ${avatar(dA, 'profileHeroPhoto')}
            </div>
            <h2 style="margin: 10px 0 0;">${esc(dA.name)}</h2>
            <div class="muted small">${esc(dA.team)}</div>
        </div>
        <div class="card" style="text-align: center;">
            <div style="display: flex; justify-content: center;">
                ${avatar(dB, 'profileHeroPhoto')}
            </div>
            <h2 style="margin: 10px 0 0;">${esc(dB.name)}</h2>
            <div class="muted small">${esc(dB.team)}</div>
        </div>
    </div>
    
    <div class="card section" style="background: var(--bg);">
        <h3 style="margin-top: 0; text-align: center;">Comparación Global (Histórica)</h3>
        
        ${bar(ratingA, ratingB, 'OVR Rating', true)}
        ${bar(winRateA, winRateB, 'Win Rate', true)}
        ${bar(podRateA, podRateB, 'Podium Rate', true)}
        
        <table class="h2hTable">
            <tr>
                <th>${esc(dA.name)}</th>
                <th>Estadística</th>
                <th>${esc(dB.name)}</th>
            </tr>
            ${cmp(rankA, rankB, 'Rank Global', true)}
            ${cmp(ratingA, ratingB, 'OVR Rating')}
            ${cmp(tA.titles, tB.titles, 'Campeonatos')}
            ${cmp(tA.points, tB.points, 'Puntos Totales')}
            ${cmp(tA.wins, tB.wins, 'Victorias')}
            ${cmp(tA.podiums, tB.podiums, 'Podios')}
            ${cmp(tA.poles, tB.poles, 'Poles')}
            ${cmp(tA.fast, tB.fast, 'Vueltas Rápidas')}
            ${cmp(tA.starts, tB.starts, 'Carreras Disputadas')}
        </table>
    </div>
    
    ${activeSeason ? `
    <div class="card section" style="background: var(--bg);">
        <h3 style="margin-top: 0; text-align: center;">${esc(seasonTitle)}</h3>
        <table class="h2hTable">
            <tr>
                <th>${esc(dA.name)}</th>
                <th>En esta temporada</th>
                <th>${esc(dB.name)}</th>
            </tr>
            ${cmp(rkA, rkB, 'Posición Campeonato', true)}
            ${cmp(ssA.points, ssB.points, 'Puntos')}
            ${cmp(ssA.wins, ssB.wins, 'Victorias')}
            ${cmp(ssA.podiums, ssB.podiums, 'Podios')}
            ${cmp(ssA.poles, ssB.poles, 'Poles')}
            ${cmp(ssA.fast, ssB.fast, 'Vueltas Rápidas')}
            ${cmp(ssA.starts, ssB.starts, 'Carreras Disputadas')}
        </table>
    </div>
    ` : ''}
    `;
    
    container.innerHTML = html;
}
