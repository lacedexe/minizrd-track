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

let champCharts = {};

function renderChampCharts() {
    let a = active();
    if (!a) return;
    
    let races = db.races.filter(r => r.seasonId === a.id).slice().sort((x, y) => x.date.localeCompare(y.date) || String(x.id).localeCompare(String(y.id)));
    let st = standings(a.id);
    let top10 = st.slice(0, 10);
    
    // Summary
    let summaryHtml = '';
    let leader = st[0];
    if (leader) {
        let runnerUp = st[1];
        let gap = runnerUp ? leader._s.points - runnerUp._s.points : leader._s.points;
        summaryHtml += `<div class="card"><div class="statLabel">Líder</div><div class="statValue">${esc(leader.name)}</div><span class="pill">+${gap} pts</span></div>`;
    }
    let mostWins = [...st].sort((a,b)=>b._s.wins - a._s.wins)[0];
    if (mostWins && mostWins._s.wins > 0) {
        summaryHtml += `<div class="card"><div class="statLabel">Más Victorias</div><div class="statValue">${esc(mostWins.name)}</div><span class="pill">${mostWins._s.wins} victorias</span></div>`;
    }
    document.getElementById('champAnalysisSummary').innerHTML = summaryHtml;
    
    // Data structures for charts
    let labels = races.map((r, i) => `R${i+1}`);
    
    // Helper to get points array for a driver
    const getDriverPointsEvolution = (driverId) => {
        let cumulative = 0;
        return races.map(r => {
            let res = (r.results||r.grid||[]).find(x => x.driverId === driverId);
            let pts = res ? pointsForPosition(res.position, !!res.pole, !!res.fast) : 0;
            cumulative += pts;
            return cumulative;
        });
    };
    
    const getDriverPointsPerRound = (driverId) => {
        return races.map(r => {
            let res = (r.results||r.grid||[]).find(x => x.driverId === driverId);
            return res ? pointsForPosition(res.position, !!res.pole, !!res.fast) : 0;
        });
    };
    
    const colors = ['#ff3b30', '#ffb020', '#19b86b', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#64748b'];
    
    // 1. chartEvolucionPuntos (Top 10)
    createOrUpdateChart('chartEvolucionPuntos', 'line', {
        labels: labels,
        datasets: top10.map((d, i) => ({
            label: d.name,
            data: getDriverPointsEvolution(d.id),
            borderColor: colors[i % colors.length],
            backgroundColor: 'transparent',
            tension: 0.3
        }))
    });
    
    // 2. chartBattle (Top 5 positions over rounds)
    let standingsPerRound = [];
    let currentStats = {};
    db.drivers.forEach(d => currentStats[d.id] = { points: 0, wins: 0, podiums: 0, starts: 0 });
    
    races.forEach((r, roundIndex) => {
        let res = normalizeRaceResults(r);
        res.forEach(x => {
            currentStats[x.driverId].starts++;
            currentStats[x.driverId].points += x.points;
            if (x.position === 1) currentStats[x.driverId].wins++;
            if (x.position <= 3) currentStats[x.driverId].podiums++;
        });
        
        let sorted = db.drivers.map(d => ({ id: d.id, stats: {...currentStats[d.id]} }))
            .sort((a,b) => b.stats.points - a.stats.points || b.stats.wins - a.stats.wins || b.stats.podiums - a.stats.podiums || b.stats.starts - a.stats.starts);
        
        let rankMap = {};
        sorted.forEach((d, i) => { if (d.stats.starts > 0) rankMap[d.id] = i + 1; });
        standingsPerRound.push(rankMap);
    });
    
    let top5 = st.slice(0, 5);
    createOrUpdateChart('chartBattle', 'line', {
        labels: labels,
        datasets: top5.map((d, i) => {
            return {
                label: d.name,
                data: standingsPerRound.map(s => s[d.id] || null),
                borderColor: colors[i % colors.length],
                backgroundColor: 'transparent',
                tension: 0
            };
        })
    }, {
        scales: {
            y: {
                reverse: true,
                min: 1,
                ticks: { stepSize: 1 }
            }
        }
    });
    
    // 3. chartGap (Gap to leader)
    if (leader) {
        createOrUpdateChart('chartGap', 'bar', {
            labels: top10.map(d => d.name),
            datasets: [{
                label: 'Diferencia al Líder',
                data: top10.map(d => Math.max(0, leader._s.points - d._s.points)),
                backgroundColor: '#ff3b30'
            }]
        });
    }
    
    // 4. chartPuntosRonda (Top 5)
    createOrUpdateChart('chartPuntosRonda', 'bar', {
        labels: labels,
        datasets: top5.map((d, i) => ({
            label: d.name,
            data: getDriverPointsPerRound(d.id),
            backgroundColor: colors[i % colors.length]
        }))
    });
    
    // 5. chartPosicionCamp (Top 10)
    createOrUpdateChart('chartPosicionCamp', 'line', {
        labels: labels,
        datasets: top10.map((d, i) => ({
            label: d.name,
            data: standingsPerRound.map(s => s[d.id] || null),
            borderColor: colors[i % colors.length],
            backgroundColor: 'transparent',
            tension: 0
        }))
    }, {
        scales: {
            y: { reverse: true, min: 1, ticks: { stepSize: 1 } }
        },
        plugins: {
            legend: { display: false }
        }
    });
    
    // 6. chartTeamPerf (Team points)
    let teamStats = {};
    st.forEach(d => {
        let team = d.team || 'Sin equipo';
        if (!teamStats[team]) teamStats[team] = 0;
        teamStats[team] += d._s.points;
    });
    let sortedTeams = Object.keys(teamStats).sort((a,b) => teamStats[b] - teamStats[a]);
    
    createOrUpdateChart('chartTeamPerf', 'bar', {
        labels: sortedTeams.slice(0, 7), // top 7 teams
        datasets: [{
            label: 'Puntos de Equipo',
            data: sortedTeams.slice(0, 7).map(t => teamStats[t]),
            backgroundColor: '#19b86b'
        }]
    });
}

// Chart.js helper
function createOrUpdateChart(canvasId, type, data, options = {}) {
    let el = document.getElementById(canvasId);
    if (!el) return;
    let ctx = el.getContext('2d');
    
    let defaultOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { labels: { color: '#9da8b7' } }
        },
        scales: {
            x: { ticks: { color: '#9da8b7' }, grid: { color: '#ffffff08' } },
            y: { ticks: { color: '#9da8b7' }, grid: { color: '#ffffff08' } }
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

    if (champCharts[canvasId]) {
        champCharts[canvasId].data = data;
        champCharts[canvasId].options = finalOptions;
        champCharts[canvasId].update();
    } else {
        Chart.defaults.color = '#9da8b7';
        Chart.defaults.font.family = 'Inter';
        champCharts[canvasId] = new Chart(ctx, {
            type: type,
            data: data,
            options: finalOptions
        });
    }
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
