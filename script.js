const navItems=[['inicio','Inicio'],['temporadas','Temporadas'],['campeonato','Campeonato'],['ranking','Hall of Fame'],['pilotos','Pilotos'],['resultados','Resultados'],['pistas','Pistas'],['admin','Admin']];
let isAdmin = (typeof window !== 'undefined' && (window.location.search.includes('admin=1') || window.location.hash.includes('admin')));
const firebaseConfig = { apiKey: "AIzaSyATJkyeA_gX5KLCkoUXCJbFQ7FUIagxU6I", authDomain: "minizrdlopeztrack.firebaseapp.com", databaseURL: "https://minizrdlopeztrack-default-rtdb.firebaseio.com", projectId: "minizrdlopeztrack", storageBucket: "minizrdlopeztrack.firebasestorage.app", messagingSenderId: "843618773228", appId: "1:843618773228:web:0dcd1680fc209ac105ddc9" };
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const dbRef = database.ref('minizrd_data');
const demo={site:'MiniZRD Lopez Track',activeSeason:null,points:[25,18,15,12,10,8,6,4,2,1],pole:false,fast:false,seasons:[],drivers:[],tracks:[],races:[]};
let savedLocal=null;try{savedLocal=JSON.parse(localStorage.getItem('minizrd_data'));}catch(e){}
let db=savedLocal&&savedLocal.seasons?savedLocal:JSON.parse(JSON.stringify(demo));
function normStats(x){return {points:+(x?.points||0),starts:+(x?.starts||0),wins:+(x?.wins||0),podiums:+(x?.podiums||0),poles:+(x?.poles||0),fast:+(x?.fast||0)} }
function initDbStructure(){if(!db.site)db.site='MiniZRD Lopez Track';if(!Array.isArray(db.seasons))db.seasons=[];db.seasons.forEach(s=>{s.rounds=Number(s.rounds||0);if(!s.rounds)s.rounds=8;if(s.category==null)s.category='';if(!Array.isArray(s.driverIds)){let set=new Set();(db.races||[]).filter(r=>r.seasonId===s.id).forEach(r=>{(r.results||r.grid||[]).forEach(x=>{let id=typeof x==='string'?x:x.driverId;if(id)set.add(id);});});s.driverIds=set.size>0?Array.from(set):(db.drivers||[]).map(d=>d.id);}});if(!db.seasons.some(s=>s.id===db.activeSeason))db.activeSeason=db.seasons[0]?.id||null;if(!db.drivers)db.drivers=[];db.drivers.forEach(d=>{if(d.nickname==null)d.nickname='';d.career={...{points:0,starts:0,wins:0,podiums:0,poles:0,fast:0,titles:0},...(d.career||{})};if(!d.seasonStats)d.seasonStats={};});if(!db.tracks)db.tracks=[];if(!db.races)db.races=[];if(!db.points?.length)db.points=[25,18,15,12,10,8,6,4,2,1];}
initDbStructure();
dbRef.on('value', (snapshot) => { const data = snapshot.val(); if(data){ db = data; initDbStructure(); render(); } });
firebase.auth().onAuthStateChanged(user => { isAdmin = !!user || (typeof window !== 'undefined' && (window.location.search.includes('admin=1') || window.location.hash.includes('admin'))); render(); });
function save(){ try{localStorage.setItem('minizrd_data',JSON.stringify(db));}catch(e){} if(isAdmin&&firebase.auth().currentUser){dbRef.set(db).catch(e=>console.warn("Firebase save:",e.message));} render(); }
function active(){if(!db.seasons?.length)return null;return db.seasons.find(s=>s.id===db.activeSeason)||db.seasons[0]}
function setSeason(id){if(db.seasons.some(s=>s.id===id)){db.activeSeason=id;save()}}
function show(id){document.getElementById('nav').classList.remove('open');document.querySelectorAll('main>section').forEach(x=>x.classList.add('hidden'));document.getElementById(id).classList.remove('hidden');document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.id===id));render()}
function driver(id){return db.drivers.find(d=>d.id===id)}
function initials(name){return String(name||'').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'?'}
function fmt(x){if(!x)return'';let p=x.split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:x}
function esc(x){return String(x??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]))}
function emptyStats(){return {points:0,starts:0,wins:0,podiums:0,poles:0,fast:0}}
function pointsForPosition(position,pole=false,fast=false){let p=Number(db.points[Math.max(0,Number(position)-1)]||0);if(db.pole&&pole)p+=1;if(db.fast&&fast)p+=1;return p}
function normalizeRaceResults(r){return (r.results||r.grid||[]).map((x,i)=>{let obj=typeof x==='string'?{driverId:x,position:i+1,pole:false,fast:false}:x;let position=Number(obj.position)||i+1;return {driverId:obj.driverId,position,pole:!!obj.pole,fast:!!obj.fast,points:pointsForPosition(position,!!obj.pole,!!obj.fast)}})}
function autoSeasonStats(seasonId){let out={};db.drivers.forEach(d=>out[d.id]=emptyStats());db.races.filter(r=>r.seasonId===seasonId).forEach(r=>normalizeRaceResults(r).forEach(x=>{if(!out[x.driverId])return;out[x.driverId].starts++;out[x.driverId].points+=x.points;if(Number(x.position)===1)out[x.driverId].wins++;if(Number(x.position)<=3)out[x.driverId].podiums++;if(x.pole)out[x.driverId].poles++;if(x.fast)out[x.driverId].fast++;}));return out}
function seasonStatsFor(d,seasonId){return autoSeasonStats(seasonId)[d.id]||emptyStats()}
function allSeasonStats(d){let map={};db.seasons.forEach(s=>map[s.id]=seasonStatsFor(d,s.id));return map}
function isSeasonComplete(seasonId){let s=db.seasons.find(x=>x.id===seasonId);if(!s||!s.rounds)return false;return db.races.filter(r=>r.seasonId===seasonId).length>=Number(s.rounds)}
function championOf(seasonId){if(!isSeasonComplete(seasonId))return null;let st=standings(seasonId).filter(x=>x._s.starts>0);return st[0]||null}
function countTitles(driverId){let n=0;db.seasons.forEach(s=>{let champ=championOf(s.id);if(champ?.id===driverId)n++});return n}
function totalsFor(d){let c=normStats(d.career);db.seasons.forEach(s=>{let st=seasonStatsFor(d,s.id);c.points+=st.points;c.starts+=st.starts;c.wins+=st.wins;c.podiums+=st.podiums;c.poles+=st.poles;c.fast+=st.fast});c.titles=Number(d.career?.titles||0)+countTitles(d.id);return c}
function getSeasonDrivers(seasonId){let s=db.seasons.find(x=>x.id===seasonId);if(!s)return[];if(!Array.isArray(s.driverIds))return db.drivers;return s.driverIds.map(id=>driver(id)).filter(Boolean)}
function getSeasonStatus(s){let done=db.races.filter(r=>r.seasonId===s.id).length,rounds=Number(s.rounds)||0;if(rounds>0&&done>=rounds)return{text:'Finalizado',cls:'finalizado',icon:'🏁'};if(done>0)return{text:'En curso',cls:'enCurso',icon:'🟢'};return{text:'Próximamente',cls:'proximamente',icon:'⏳'}}
function standings(seasonId=db.activeSeason){let list=getSeasonDrivers(seasonId);return list.map(d=>({...d,_s:seasonStatsFor(d,seasonId)})).sort((a,b)=>b._s.points-a._s.points||b._s.wins-a._s.wins||b._s.podiums-a._s.podiums||b._s.starts-a._s.starts||a.name.localeCompare(b.name))}
function ratingFor(d){let t=totalsFor(d);if(!t.starts&&t.titles===0)return 0;let all=db.drivers.map(rawRankStats),mx=f=>Math.max(1,...all.map(f)),maxPts=mx(x=>x.points),maxWins=mx(x=>x.wins),maxPod=mx(x=>x.podiums),maxPoles=mx(x=>x.poles),maxFast=mx(x=>x.fast),starts=t.starts||1;let avg=t.points/starts,podiumRate=t.podiums/starts,seasons=Object.values(allSeasonStats(d)).filter(x=>x.starts>0).length;let base=(t.wins/maxWins)*15+(t.podiums/maxPod)*15+(t.points/maxPts)*12+Math.min(1,avg/25)*15+Math.min(1,podiumRate)*15+(t.poles/maxPoles)*8+(t.fast/maxFast)*5+Math.min(15,seasons*2.5);let titleBonus=t.titles*5;return Math.max(0,Math.min(99,Math.round(base+titleBonus)))}
function rawRankStats(d){let t=totalsFor(d),starts=t.starts||0;return {...t,avg:starts?t.points/starts:0,winRate:starts?t.wins/starts:0,podiumRate:starts?t.podiums/starts:0,seasons:Object.values(allSeasonStats(d)).filter(x=>x.starts>0).length}}
function historicalRanking(){return db.drivers.map(d=>({...d,_t:rawRankStats(d),_rating:ratingFor(d)})).sort((a,b)=>b._rating-a._rating||b._t.titles-a._t.titles||b._t.wins-a._t.wins||b._t.podiums-a._t.podiums||b._t.points-a._t.points)}
function avatar(d,cls='avatar'){return d?.photo?`<img class="${cls}" src="${esc(d.photo)}" onerror="this.outerHTML='<div class=&quot;${cls} avatarFallback&quot;>${esc(initials(d.name))}</div>'">`:`<div class="${cls} avatarFallback">${esc(initials(d?.name))}</div>`}
function renderNav(){document.getElementById('nav').innerHTML=navItems.filter(x=>isAdmin||x[0]!=='admin').map(x=>`<button data-id="${x[0]}" onclick="show('${x[0]}')">${x[1]}</button>`).join('') + (isAdmin ? `<button onclick="doLogout()">Cerrar sesión</button>` : `<button onclick="loginForm()">🔒</button>`);}
function render(){renderNav();let a=active();let rSeasonEl=document.getElementById('raceSeason');rSeasonEl.innerHTML=db.seasons.map(x=>`<option value="${x.id}" ${x.id===db.activeSeason?'selected':''}>${esc(x.name)}${x.year?' · '+esc(x.year):''}</option>`).join('');rSeasonEl.onchange=syncRaceSeasonDrivers;document.getElementById('raceTrack').innerHTML='<option value="">Seleccionar pista</option>'+db.tracks.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('');document.getElementById('publicSeason').innerHTML=db.seasons.map(x=>`<option value="${x.id}" ${x.id===db.activeSeason?'selected':''}>${esc(x.name)}${x.year?' · '+esc(x.year):''}</option>`).join('');if(a){document.getElementById('seasonHint').textContent=`${a.year||''} · ${db.races.filter(r=>r.seasonId===a.id).length}/${a.rounds||'?'} rondas${isSeasonComplete(a.id)?' · CAMPEONATO TERMINADO':''}`;document.getElementById('homeSeason').textContent=a.name;document.getElementById('homeDesc').textContent=a.desc||'Campeonato y estadísticas Mini-Z.';let st=standings(),leader=st[0],hr=historicalRanking()[0];document.getElementById('homeStats').innerHTML=[['Líder',leader?.name||'—'],['Puntos líder',leader?leader._s.points:'—'],['Carreras',db.races.filter(r=>r.seasonId===a.id).length],['Pilotos',db.drivers.length],['Hall of Fame #1',hr?.name||'—']].map(x=>`<div class="card statCard"><div class="statLabel">${x[0]}</div><div class="statValue">${esc(x[1])}</div></div>`).join('');let seasonRaces=db.races.filter(r=>r.seasonId===a.id).slice().sort((x,y)=>y.date.localeCompare(x.date));let nr=seasonRaces[0];document.getElementById('last').innerHTML=nr?raceCard(nr):'<div class="empty">Todavía no hay carreras publicadas.</div>';document.getElementById('champName').textContent=a.name;renderStandings();renderChampRounds(a.id);document.getElementById('results').innerHTML=seasonRaces.map(r=>raceCard(r)).join('')||'<div class="empty">No hay resultados en esta temporada.</div>';document.getElementById('seasonsPublic').innerHTML=db.seasons.map(x=>`<div class="card" style="cursor:pointer;border-color:${x.id===db.activeSeason?'#ff3b30':'#ffffff0b'}" onclick="setSeason('${x.id}');show('campeonato')"><span class="eyebrow">${x.id===db.activeSeason?'ACTIVA':'ARCHIVO'}</span><h2 style="margin:5px 0">${esc(x.name)}</h2><p class="muted">${esc(x.year||'')}</p><p>${esc(x.desc||'')}</p><span class="pill">${db.races.filter(r=>r.seasonId===x.id).length}/${x.rounds||'?'} rondas</span>${isSeasonComplete(x.id)?`<div class="championBanner">🏆 Campeón: <b>${esc(championOf(x.id)?.name||'—')}</b></div>`:''}</div>`).join('');}else{document.getElementById('seasonHint').textContent='Crea tu primer campeonato desde Admin.';document.getElementById('homeSeason').textContent='Aún no hay campeonatos';document.getElementById('homeDesc').textContent='Comienza creando tu primer campeonato para registrar pilotos, pistas y carreras.';document.getElementById('homeStats').innerHTML=[['Campeonatos',0],['Pilotos',db.drivers.length],['Carreras',0],['Pistas',db.tracks.length],['Hall of Fame #1','—']].map(x=>`<div class="card statCard"><div class="statLabel">${x[0]}</div><div class="statValue">${esc(x[1])}</div></div>`).join('');document.getElementById('last').innerHTML='<div class="empty">Crea un campeonato para comenzar.</div>';document.getElementById('champName').textContent='No hay campeonato seleccionado';document.getElementById('standings').innerHTML='<div class="empty">Crea un campeonato para ver la clasificación.</div>';document.getElementById('champRounds').innerHTML='<div class="empty">No hay rondas todavía.</div>';document.getElementById('results').innerHTML='<div class="empty">No hay resultados todavía.</div>';document.getElementById('seasonsPublic').innerHTML='<div class="empty">No hay temporadas registradas.</div>';}document.getElementById('tracksPublic').innerHTML=db.tracks.map(t=>`<div class="card">${t.image?`<img src="${esc(t.image)}" style="width:100%;height:150px;object-fit:cover;border-radius:12px;margin-bottom:11px" onerror="this.style.display='none'">`:''}<h2 style="margin:0 0 4px">${esc(t.name)}</h2><p class="muted">${esc(t.country)} · ${esc(t.length)}</p>${t.record?`<div class="raceMeta"><span class="pill">⏱ Récord: ${esc(t.record)}</span></div>`:''}</div>`).join('')||'<div class="empty">No hay pistas registradas.</div>';renderDrivers();renderRanking();renderAdmin(a); if(typeof window.triggerAnalysisUpdate === 'function') window.triggerAnalysisUpdate();}
function renderChampRounds(seasonId){let chronological=db.races.filter(r=>r.seasonId===seasonId).slice().sort((x,y)=>x.date.localeCompare(y.date)||String(x.id).localeCompare(String(y.id)));let races=chronological.slice().reverse();let el=document.getElementById('champRounds');if(!el)return;el.innerHTML=races.length?races.map(r=>{let round=chronological.findIndex(x=>x.id===r.id)+1,res=normalizeRaceResults(r);let winner=res.find(x=>Number(x.position)===1);return `<div class="card" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><div><span class="eyebrow">Ronda ${round}</span><h3 style="margin:4px 0">${esc(r.name)}</h3><div class="muted small">${fmt(r.date)} · ${res.length} participantes</div></div><button class="btn secondary" onclick="showRaceResult('${r.id}')">Ver resultado</button></div><div class="toolbar"><span class="pill">Ganador: ${esc(driver(winner?.driverId)?.name||'—')}</span><span class="pill">${winner?.points||0} pts</span></div></div>`}).join(''):'<div class="empty">Todavía no hay rondas registradas.</div>'}
function showRaceResult(id){let r=db.races.find(x=>x.id===id);if(r)openModal(`<button class="close" onclick="closeModal()">×</button>${raceCard(r,false)}`)}
function raceCard(r,adminMode=false){let res=normalizeRaceResults(r).slice().sort((a,b)=>a.position-b.position);let track=db.tracks.find(t=>t.id===r.trackId);let rows=res.map(x=>{let d=driver(x.driverId);return d?`<tr><td class=\"pos\">${x.position}</td><td><div class=\"driverMini\" onclick=\"profile('${d.id}')\" style=\"cursor:pointer\">${avatar(d)}<div><b>${esc(d.name)}</b><span class=\"rankTop\">${esc(d.team)}</span></div></div></td><td><b>${x.points}</b></td><td>${x.pole?'<span class=\"pill\">Pole</span>':''}</td></tr>`:''}).join('');return `<div class=\"card section\"><div style=\"display:flex;justify-content:space-between;gap:12px;align-items:start\"><div><h2 style=\"margin:0 0 5px\">${esc(r.name)}</h2><div class=\"muted\">${fmt(r.date)} ${r.laps?'· '+esc(r.laps)+' vueltas':''}</div><div class=\"raceMeta\">${track?`<span class=\"pill\">🏁 ${esc(track.name)}</span>`:''}${track?.record?`<span class=\"pill\">⏱ Récord ${esc(track.record)}</span>`:''}</div></div><span class=\"pill\">${res.length} pilotos</span></div><div class=\"accentLine\"></div><div class=\"tableWrap\"><table style=\"min-width:0\"><tr><th>Pos</th><th>Piloto</th><th>Pts</th><th>Extra</th></tr>${rows}</table></div>${r.notes?`<p class=\"muted\">${esc(r.notes)}</p>`:''}${adminMode?`<div class=\"toolbar\"><button class=\"btn secondary\" onclick=\"editRace('${r.id}')\">Editar</button><button class=\"btn danger\" onclick=\"deleteRace('${r.id}')\">Eliminar</button></div>`:''}</div>`}

function renderStandings(){let st=standings();document.getElementById('standings').innerHTML=st.length?`<table><tr><th>#</th><th>Piloto</th><th>Equipo</th><th>Pts</th><th>Vict.</th><th>Podios</th><th>Salidas</th><th>Poles</th><th>VR</th></tr>${st.map((d,i)=>`<tr><td class="pos">${i+1}</td><td><div class="driverMini" onclick="profile('${d.id}')" style="cursor:pointer">${avatar(d)}<div><b>${esc(d.name)}</b><span class="rankTop">${esc(d.country||'')}</span></div></div></td><td>${esc(d.team)}</td><td><b>${d._s.points}</b></td><td>${d._s.wins}</td><td>${d._s.podiums}</td><td>${d._s.starts}</td><td>${d._s.poles}</td><td>${d._s.fast}</td></tr>`).join('')}</table>`:'<div class="empty">No hay pilotos todavía.</div>'}
function renderDrivers(){let q=(document.getElementById('driverSearch')?.value||'').toLowerCase();let seasonRank={};standings().forEach((d,i)=>seasonRank[d.id]=i+1);document.getElementById('drivers').innerHTML=db.drivers.filter(d=>(d.name+' '+d.team).toLowerCase().includes(q)).map(d=>{let ss=seasonStatsFor(d,db.activeSeason),rk=historicalRanking().findIndex(x=>x.id===d.id)+1;return `<div class="card driverCard"><div class="number">#${esc(d.number||'')}</div><div class="driverCardTop">${avatar(d,'driverPhoto')}<div><h3>${esc(d.name)}</h3><div class="muted small">${d.nickname?'@'+esc(d.nickname)+' · ':''}${esc(d.team)} · RANK #${rk||'—'} · Rating ${ratingFor(d)}/99</div></div></div><div class="driverStats"><div class="miniStat"><b>${ss.points}</b><span>Pts</span></div><div class="miniStat"><b>${ss.wins}</b><span>Victorias</span></div><div class="miniStat"><b>${ss.podiums}</b><span>Podios</span></div><div class="miniStat"><b>${ss.starts}</b><span>Salidas</span></div></div><div class="toolbar"><button class="btn secondary" onclick="profile('${d.id}')">Ver perfil</button></div></div>`}).join('')||'<div class="empty">No hay pilotos.</div>'}
function renderRanking(){
  let r=historicalRanking();
  const el=document.getElementById('rankingList');
  if(!el)return;
  el.innerHTML=r.length?`
  <div style="display:grid;gap:10px">
  ${r.map((d,i)=>`<div class="hallCard" onclick="profile('${d.id}')" style="cursor:pointer;display:grid;grid-template-columns:72px minmax(0,1fr) auto;align-items:center;gap:16px;padding:16px 18px">
    <div style="font-size:28px;font-weight:1000;text-align:center;color:${i===0?'#ffd778':i===1?'#d6dde6':i===2?'#d89b68':'#8f9aaa'}">#${i+1}</div>
    <div class="hallTop">${avatar(d)}<div><b style="font-size:18px">${esc(d.name)}</b><div class="muted small">${d.nickname?'@'+esc(d.nickname)+' · ':''}${esc(d.team||'')}${d.country?' · '+esc(d.country):''}</div><div class="hallMeta"><span class="pill">${d._t.titles} títulos</span><span class="pill">${d._t.wins} victorias</span><span class="pill">${d._t.podiums} podios</span><span class="pill">${d._t.starts} salidas</span></div></div></div>
    <div class="hallRatingBox"><div class="hallRating">${d._rating}<span class="subtle">/99</span></div><div class="subtle">RATING</div></div>
  </div>`).join('')}
  </div>`:'<div class="empty">No hay pilotos registrados.</div>';
}
function renderAdmin(a){
  if(isAdmin){document.getElementById('adminControls').classList.remove('hidden');document.getElementById('logoutBtn').classList.remove('hidden');document.getElementById('adminLogin').classList.add('hidden');}
  else{document.getElementById('adminControls').classList.add('hidden');document.getElementById('logoutBtn').classList.add('hidden');document.getElementById('adminLogin').classList.remove('hidden');}
  
  let stHtml='';
  if(db.seasons.length){
    stHtml=`<div class="adminChampTableWrap"><table class="adminChampTable"><thead><tr><th>Campeonato</th><th>Estado</th><th>Pilotos</th><th style="text-align:right">Acciones</th></tr></thead><tbody>`+
    db.seasons.map(x=>{
      let done=db.races.filter(r=>r.seasonId===x.id).length;
      let champ=championOf(x.id);
      let status=getSeasonStatus(x);
      let pCount=(x.driverIds||[]).length;
      let isActive=x.id===db.activeSeason;
      return `<tr>
        <td>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <b style="font-size:15px">${esc(x.name)}</b>
            ${isActive?'<span class="statusBadge activa">ACTIVA</span>':''}
            ${champ?`<span class="championTag" title="Campeón">🏆 ${esc(champ.name)}</span>`:''}
          </div>
          <div class="muted small" style="margin-top:3px">
            ${esc(x.year||'Año no especificado')}${x.category?' · '+esc(x.category):''} · ${done}/${x.rounds||'?'} rondas
          </div>
        </td>
        <td>
          <span class="statusBadge ${status.cls}">${status.icon} ${status.text}</span>
        </td>
        <td>
          <span class="pill" style="font-weight:700">👤 ${pCount} participantes</span>
        </td>
        <td style="text-align:right">
          <div class="toolbar" style="justify-content:flex-end;margin:0">
            <button class="btn green" style="padding:6px 11px;font-size:12px" onclick="activateSeason('${x.id}')">Usar</button>
            <button class="btn secondary" style="padding:6px 11px;font-size:12px" onclick="editSeason('${x.id}')">Editar</button>
            ${db.seasons.length>1?`<button class="btn danger" style="padding:6px 11px;font-size:12px" onclick="deleteSeason('${x.id}')">Eliminar</button>`:''}
          </div>
        </td>
      </tr>`;
    }).join('')+`</tbody></table></div>`;
  }else{
    stHtml='<div class="empty">No hay campeonatos creados. Crea el primero arriba.</div>';
  }
  document.getElementById('adminSeasons').innerHTML=stHtml;

  let newDList=document.getElementById('newSeasonDriversList');
  if(newDList){
    newDList.innerHTML=db.drivers.length?db.drivers.map(d=>`<label class="addPilotItem" style="font-size:12px"><input type="checkbox" class="newSeasonDriverCb" value="${d.id}" checked>${avatar(d,'avatar')}<div style="overflow:hidden;text-overflow:ellipsis"><b>${esc(d.name)}</b><div class="muted" style="font-size:10px">${esc(d.team||'Sin equipo')}</div></div></label>`).join(''):'<span class="muted small">No hay pilotos registrados todavía.</span>';
  }

  let aq=(document.getElementById('adminDriverSearch')?.value||'').trim().toLowerCase();
  document.getElementById('adminDrivers').innerHTML=!aq?'<div class="empty">Escribe el nombre o equipo para buscar un piloto.</div>':db.drivers.filter(d=>(d.name+' '+d.team).toLowerCase().includes(aq)).map(d=>{let ss=seasonStatsFor(d,a?a.id:null);return `<div class="card adminDriverItem"><div><b>${esc(d.name)}</b><div class="small muted">${esc(d.team)} · #${esc(d.number||'')} · ${ss.points} pts · Rating ${ratingFor(d)}/99</div></div><div class="toolbar"><button class="btn secondary" onclick="editDriver('${d.id}')">Editar</button><button class="btn danger" onclick="deleteDriver('${d.id}')">Eliminar</button></div></div>`}).join('')||'<div class="empty">No hay pilotos que coincidan.</div>';
  document.getElementById('adminTracks').innerHTML=db.tracks.map(t=>`<div class="card" style="margin-top:10px"><b>${esc(t.name)}</b> · ${esc(t.country)} · ${esc(t.length)}${t.record?` · Récord: ${esc(t.record)}`:''} <button class="btn secondary" onclick="editTrack('${t.id}')">Editar</button> <button class="btn danger" onclick="deleteTrack('${t.id}')">Eliminar</button></div>`).join('')||'<p class="muted">No hay pistas.</p>';
  document.getElementById('adminRaces').innerHTML=a?(db.races.filter(r=>r.seasonId===a.id).slice().sort((x,y)=>y.date.localeCompare(x.date)).map(r=>raceCard(r,true)).join('')||'<p class="muted">No hay eventos en esta temporada.</p>'):'<p class="muted">Crea un campeonato para comenzar a registrar eventos.</p>';
  document.getElementById('cfgName').value=a?.name||'';
  document.getElementById('cfgRounds').value=a?.rounds||1;
  if(document.getElementById('cfgCategory'))document.getElementById('cfgCategory').value=a?.category||'';
  document.getElementById('cfgDesc').value=a?.desc||'';
  document.getElementById('pointsInput').value=db.points.join(',');
  document.getElementById('poleBonus').checked=!!db.pole;
  document.getElementById('fastBonus').checked=!!db.fast;
}

function toggleAllInitialDrivers(checked){
  document.querySelectorAll('.newSeasonDriverCb').forEach(cb=>cb.checked=checked);
}

function addSeason(){
  let n=seasonName.value.trim(),rounds=Number(seasonRounds.value)||0;
  if(!n)return alert('Escribe el nombre del campeonato');
  if(rounds<1)return alert('Indica cuántas rondas tendrá el campeonato.');
  let id='s'+Date.now();
  let selectedDrivers=[...document.querySelectorAll('.newSeasonDriverCb:checked')].map(cb=>cb.value);
  let cat=document.getElementById('seasonCategory')?.value.trim()||'';
  let desc=seasonDesc.value.trim();
  let year=seasonYear.value.trim();
  db.seasons.push({id,name:n,year,rounds,category:cat,desc,driverIds:selectedDrivers});
  db.activeSeason=id;
  seasonName.value=seasonYear.value=seasonRounds.value=seasonDesc.value='';
  if(document.getElementById('seasonCategory'))document.getElementById('seasonCategory').value='';
  save();
  alert(`Campeonato "${n}" creado exitosamente con ${selectedDrivers.length} pilotos participantes.`);
}

function activateSeason(id){db.activeSeason=id;save()}

let editingSeasonId=null;
let editingSeasonParticipants=[];
let addPilotDrawerOpen=false;

function editSeason(id){
  let s=db.seasons.find(x=>x.id===id);
  if(!s)return;
  editingSeasonId=id;
  editingSeasonParticipants=Array.isArray(s.driverIds)?[...s.driverIds]:db.drivers.map(d=>d.id);
  addPilotDrawerOpen=false;
  renderEditSeasonModal();
}

function renderEditSeasonModal(){
  let s=db.seasons.find(x=>x.id===editingSeasonId);
  if(!s)return closeModal();
  let status=getSeasonStatus(s);
  let done=db.races.filter(r=>r.seasonId===s.id).length;
  let enrolledDrivers=editingSeasonParticipants.map(id=>driver(id)).filter(Boolean);
  let availableDrivers=db.drivers.filter(d=>!editingSeasonParticipants.includes(d.id));

  openModal(`
    <button class="close" onclick="closeModal()">×</button>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">
      <h2 style="margin:0">Editar campeonato</h2>
      <span class="statusBadge ${status.cls}">${status.icon} ${status.text} (${done}/${s.rounds||'?'} rondas)</span>
      ${s.id===db.activeSeason?'<span class="statusBadge activa">ACTIVA</span>':''}
    </div>

    <!-- Sección 1: Información del campeonato -->
    <div class="editSectionBox">
      <div class="editSectionTitle">
        <h3>📋 Información general del campeonato</h3>
      </div>
      <div class="formrow">
        <div style="flex:2;min-width:200px">
          <label class="small muted">Nombre</label>
          <input id="mSN" value="${esc(s._tempName!=null?s._tempName:s.name)}" placeholder="Nombre del campeonato">
        </div>
        <div style="flex:1;min-width:100px">
          <label class="small muted">Año / Fecha</label>
          <input id="mSY" value="${esc(s._tempYear!=null?s._tempYear:(s.year||''))}" placeholder="Ej. 2026">
        </div>
        <div style="flex:1;min-width:100px">
          <label class="small muted">Rondas totales</label>
          <input id="mSR" type="number" min="1" value="${s._tempRounds!=null?s._tempRounds:(s.rounds||1)}" placeholder="Rondas">
        </div>
        <div style="flex:1.5;min-width:150px">
          <label class="small muted">Categoría</label>
          <input id="mSC" value="${esc(s._tempCategory!=null?s._tempCategory:(s.category||''))}" placeholder="Ej. Box Stock, Open...">
        </div>
      </div>
      <div style="margin-top:10px">
        <label class="small muted">Reglamento / Descripción</label>
        <textarea id="mSD" placeholder="Reglamento, descripción o notas del torneo..." style="min-height:70px">${esc(s._tempDesc!=null?s._tempDesc:(s.desc||''))}</textarea>
      </div>
    </div>

    <!-- Sección 2: Pilotos participantes -->
    <div class="editSectionBox" style="margin-top:14px">
      <div class="editSectionTitle">
        <div>
          <h3>🏎️ Pilotos participantes (${enrolledDrivers.length})</h3>
          <p class="muted small" style="margin:3px 0 0">Solo estos pilotos aparecen en la tabla de clasificación. Puedes añadir pilotos en cualquier momento.</p>
        </div>
        <button type="button" class="btn ${addPilotDrawerOpen?'secondary':'green'}" style="padding:8px 14px;font-size:13px" onclick="toggleAddPilotDrawer()">
          ${addPilotDrawerOpen?'✕ Cerrar selector':'+ Añadir piloto'}
        </button>
      </div>

      <!-- Panel para Añadir Piloto -->
      ${addPilotDrawerOpen?`
        <div class="addPilotDrawer">
          <div class="addPilotHeader">
            <div>
              <b style="font-size:14px">Seleccionar pilotos registrados para incorporar</b>
              <div class="muted small">Mostrando pilotos registrados que todavía no forman parte de este campeonato</div>
            </div>
            <div style="display:flex;gap:6px;align-items:center">
              ${availableDrivers.length>1?`
                <button type="button" class="btn secondary" style="padding:5px 9px;font-size:11px" onclick="addAllAvailablePilots()">Añadir todos (${availableDrivers.length})</button>
              `:''}
            </div>
          </div>
          <div style="margin-bottom:10px">
            <input id="addPilotSearchInput" class="addPilotSearch" placeholder="Buscar piloto por nombre o equipo..." oninput="filterAvailablePilots(this.value)">
          </div>
          <div id="addPilotListContainer" class="addPilotList">
            ${availableDrivers.length?availableDrivers.map(d=>`
              <div class="addPilotItem" onclick="addSinglePilotToSeason('${d.id}')" title="Haz clic para añadir a ${esc(d.name)}">
                ${avatar(d,'avatar')}
                <div style="flex:1;overflow:hidden;text-overflow:ellipsis">
                  <b>${esc(d.name)}</b>
                  <div class="muted small">${esc(d.team||'Sin equipo')}${d.number?' · #'+esc(d.number):''}</div>
                </div>
                <button type="button" class="btn green" style="padding:4px 9px;font-size:11px;border-radius:6px">+ Añadir</button>
              </div>
            `).join(''):'<div class="empty" style="grid-column:1/-1;padding:15px">Todos los pilotos registrados ya forman parte de este campeonato.</div>'}
          </div>
        </div>
      `:''}

      <!-- Grid de participantes actuales -->
      <div class="participantGrid">
        ${enrolledDrivers.length?enrolledDrivers.map(d=>`
          <div class="participantCard">
            <div class="participantInfo">
              ${avatar(d,'avatar')}
              <div style="overflow:hidden">
                <div class="participantName">${esc(d.name)}</div>
                <div class="participantMeta">${esc(d.team||'Sin equipo')}${d.number?' · #'+esc(d.number):''}</div>
              </div>
            </div>
            <button type="button" class="removeParticipantBtn" title="Quitar del campeonato" onclick="removePilotFromSeason('${d.id}')">✕</button>
          </div>
        `).join(''):'<div class="empty" style="grid-column:1/-1;padding:18px">No hay pilotos inscritos en este campeonato todavía. Pulsa <b>+ Añadir piloto</b> para incorporar competidores.</div>'}
      </div>
    </div>

    <!-- Botones de guardar / cancelar -->
    <div class="toolbar" style="margin-top:20px;justify-content:flex-end">
      <button class="btn secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn" style="padding:10px 22px" onclick="updateSeason('${editingSeasonId}')">Guardar cambios</button>
    </div>
  `);
}

function syncCurrentEditSeasonInputs(){
  let s=db.seasons.find(x=>x.id===editingSeasonId);
  if(!s)return;
  let sn=document.getElementById('mSN')?.value;
  let sy=document.getElementById('mSY')?.value;
  let sr=document.getElementById('mSR')?.value;
  let sc=document.getElementById('mSC')?.value;
  let sd=document.getElementById('mSD')?.value;
  if(sn!==undefined)s._tempName=sn;
  if(sy!==undefined)s._tempYear=sy;
  if(sr!==undefined)s._tempRounds=sr;
  if(sc!==undefined)s._tempCategory=sc;
  if(sd!==undefined)s._tempDesc=sd;
}

function toggleAddPilotDrawer(){
  syncCurrentEditSeasonInputs();
  addPilotDrawerOpen=!addPilotDrawerOpen;
  renderEditSeasonModal();
}

function addSinglePilotToSeason(driverId){
  if(!editingSeasonParticipants.includes(driverId)){
    editingSeasonParticipants.push(driverId);
  }
  syncCurrentEditSeasonInputs();
  renderEditSeasonModal();
}

function addAllAvailablePilots(){
  db.drivers.forEach(d=>{
    if(!editingSeasonParticipants.includes(d.id))editingSeasonParticipants.push(d.id);
  });
  syncCurrentEditSeasonInputs();
  renderEditSeasonModal();
}

function removePilotFromSeason(driverId){
  let d=driver(driverId);
  let hasRaces=db.races.some(r=>r.seasonId===editingSeasonId&&(r.results||r.grid||[]).some(x=>(typeof x==='string'?x:x.driverId)===driverId));
  if(hasRaces){
    if(!confirm(`El piloto "${d?.name||''}" tiene carreras registradas en este campeonato. Si lo quitas de los participantes, ya no aparecerá en la tabla de clasificación. ¿Deseas quitarlo?`))return;
  }
  editingSeasonParticipants=editingSeasonParticipants.filter(id=>id!==driverId);
  syncCurrentEditSeasonInputs();
  renderEditSeasonModal();
}

function filterAvailablePilots(query){
  let q=(query||'').trim().toLowerCase();
  let availableDrivers=db.drivers.filter(d=>!editingSeasonParticipants.includes(d.id));
  let filtered=availableDrivers.filter(d=>(d.name+' '+(d.team||'')).toLowerCase().includes(q));
  let container=document.getElementById('addPilotListContainer');
  if(!container)return;
  container.innerHTML=filtered.length?filtered.map(d=>`
    <div class="addPilotItem" onclick="addSinglePilotToSeason('${d.id}')" title="Haz clic para añadir a ${esc(d.name)}">
      ${avatar(d,'avatar')}
      <div style="flex:1;overflow:hidden;text-overflow:ellipsis">
        <b>${esc(d.name)}</b>
        <div class="muted small">${esc(d.team||'Sin equipo')}${d.number?' · #'+esc(d.number):''}</div>
      </div>
      <button type="button" class="btn green" style="padding:4px 9px;font-size:11px;border-radius:6px">+ Añadir</button>
    </div>
  `).join(''):'<div class="empty" style="grid-column:1/-1;padding:15px">No se encontraron pilotos que coincidan.</div>';
}

function updateSeason(id){
  let s=db.seasons.find(x=>x.id===id);
  if(!s)return;
  let sn=document.getElementById('mSN')?.value.trim()||s._tempName||s.name;
  let sy=document.getElementById('mSY')?.value.trim();
  if(sy===undefined)sy=s._tempYear||s.year||'';
  let sr=Number(document.getElementById('mSR')?.value||s._tempRounds||s.rounds)||1;
  let sc=document.getElementById('mSC')?.value.trim();
  if(sc===undefined)sc=s._tempCategory||s.category||'';
  let sd=document.getElementById('mSD')?.value.trim();
  if(sd===undefined)sd=s._tempDesc||s.desc||'';

  delete s._tempName;
  delete s._tempYear;
  delete s._tempRounds;
  delete s._tempCategory;
  delete s._tempDesc;

  s.name=sn;
  s.year=sy;
  s.rounds=Math.max(1,sr);
  s.category=sc;
  s.desc=sd;
  s.driverIds=[...editingSeasonParticipants];

  closeModal();
  save();
  alert(`Campeonato "${s.name}" actualizado correctamente (${s.driverIds.length} pilotos participantes).`);
}

function deleteSeason(id){
  if(db.seasons.length===1)return alert('Debes conservar al menos una temporada.');
  if(!confirm('¿Eliminar esta temporada y todas sus carreras?'))return;
  db.seasons=db.seasons.filter(x=>x.id!==id);
  db.races=db.races.filter(r=>r.seasonId!==id);
  db.drivers.forEach(d=>{if(d.seasonStats)delete d.seasonStats[id]});
  if(db.activeSeason===id)db.activeSeason=db.seasons[0]?.id||null;
  save();
}

function saveChamp(){
  let a=active();
  if(!a)return alert('No hay campeonato seleccionado. Crea uno primero.');
  let rounds=Number(cfgRounds.value)||a.rounds||1;
  a.name=cfgName.value.trim()||a.name;
  a.rounds=Math.max(1,rounds);
  if(document.getElementById('cfgCategory'))a.category=document.getElementById('cfgCategory').value.trim();
  a.desc=cfgDesc.value.trim();
  save();
  alert('Campeonato actualizado');
}

function deleteDriver(id){
  let d=driver(id);
  if(!d)return;
  if(!confirm(`¿Eliminar al piloto "${d.name}"? Se removerá del sistema y de las listas de los campeonatos.`))return;
  db.drivers=db.drivers.filter(x=>x.id!==id);
  db.seasons.forEach(s=>{
    if(Array.isArray(s.driverIds))s.driverIds=s.driverIds.filter(x=>x!==id);
  });
  save();
  alert(`Piloto "${d.name}" eliminado.`);
}
function fileToDataURL(file){return new Promise((resolve,reject)=>{if(!file)return resolve('');let r=new FileReader();r.onload=()=>{let img=new Image();img.onload=()=>{let max=420,w=img.width,h=img.height;if(w>max||h>max){let k=Math.min(max/w,max/h);w=Math.max(1,Math.round(w*k));h=Math.max(1,Math.round(h*k))}let c=document.createElement('canvas');c.width=w;c.height=h;let ctx=c.getContext('2d');ctx.drawImage(img,0,0,w,h);resolve(c.toDataURL('image/jpeg',.78))};img.onerror=()=>resolve(r.result);img.src=r.result};r.onerror=reject;r.readAsDataURL(file)})}
function previewNewPhoto(e){let f=e.target.files?.[0],el=document.getElementById('newPhotoPreview');if(!el)return;if(!f){el.innerHTML='';return}el.innerHTML=`<div class="photoPreview"><span>Vista previa:</span><img alt="Vista previa"></div>`;let img=el.querySelector('img');let u=URL.createObjectURL(f);img.onload=()=>URL.revokeObjectURL(u);img.src=u}
async function addDriver(){let n=newName.value.trim();if(!n)return alert('Escribe el nombre');let photo=await fileToDataURL(document.getElementById('newPhotoFile').files?.[0]);db.drivers.push({id:'d'+Date.now(),name:n,nickname:document.getElementById('newNickname').value.trim(),team:newTeam.value.trim()||'Sin equipo',number:newNumber.value.trim(),country:newCountry.value.trim(),photo,bio:newBio.value.trim(),career:{points:+newPoints.value||0,starts:+newStarts.value||0,wins:+newWins.value||0,podiums:+newPodiums.value||0,poles:+newPoles.value||0,titles:+newTitles.value||0},seasonStats:{}});['newName','newNickname','newTeam','newNumber','newCountry','newPhotoFile','newBio','newPoints','newStarts','newWins','newPodiums','newPoles','newTitles'].forEach(id=>document.getElementById(id).value='');document.getElementById('newPhotoPreview').innerHTML='';save()}
function removeDriverPhoto(id){let d=driver(id);if(!d)return;if(!confirm('¿Eliminar la foto de este piloto?'))return;d.photo='';document.getElementById('mPhotoFile').value='';let p=document.getElementById('editPhotoPreview');if(p)p.innerHTML='<span class=\"muted small\">Sin foto</span>';let b=document.querySelector('#modal .btn.danger');if(b)b.remove();save();}
async function updateDriverFromForm(id){let d=driver(id),file=document.getElementById('mPhotoFile')?.files?.[0];d.name=mName.value.trim()||d.name;d.nickname=document.getElementById('mNickname').value.trim();d.team=mTeam.value.trim()||'Sin equipo';d.number=mNumber.value.trim();d.country=mCountry.value.trim();if(file)d.photo=await fileToDataURL(file);d.bio=mBio.value.trim();d.career={...d.career,points:+mPoints.value||0,starts:+mStarts.value||0,wins:+mWins.value||0,podiums:+mPodiums.value||0,poles:+mPoles.value||0,titles:+mTitles.value||0};closeModal();save();alert('Perfil actualizado. Los resultados y títulos se recalculan automáticamente.')}
function editDriver(id){let d=driver(id),c=d.career||{},ss=seasonStatsFor(d,active().id),rk=historicalRanking().findIndex(x=>x.id===id)+1;openModal(`<button class="close" onclick="closeModal()">×</button><div class="profileTop">${avatar(d,'profileHeroPhoto')}<div><div class="eyebrow">Editar piloto</div><h2 style="margin:4px 0">${esc(d.name)}</h2><div class="muted">Hall of Fame: <b>${ratingFor(d)}/99</b> · RANK #${rk}</div></div></div><div class="formrow"><input id="mName" value="${esc(d.name)}" placeholder="Nombre"><input id="mNickname" value="${esc(d.nickname||'')}" placeholder="Nickname"><input id="mTeam" value="${esc(d.team)}" placeholder="Equipo"><input id="mNumber" value="${esc(d.number||'')}" placeholder="Número"><input id="mCountry" value="${esc(d.country||'')}" placeholder="País"><label class="filePicker">📷 Cambiar foto<input id="mPhotoFile" type="file" accept="image/*"></label>${d.photo?`<button class="btn danger" type="button" onclick="removeDriverPhoto('${id}')">🗑 Eliminar foto</button>`:''}</div><div class="photoSlot" id="editPhotoPreview">${d.photo?avatar(d,'avatar'):'<span class=\"muted small\">Sin foto</span>'}</div><br><textarea id="mBio" placeholder="Biografía">${esc(d.bio||'')}</textarea><h3>Estadísticas históricas anteriores</h3><div class="hint">Estas casillas sirven para cargar datos que existían antes de registrar las carreras en MiniZRD. Las carreras nuevas se calculan solas.</div><div class="editableGrid"><label>Puntos<input id="mPoints" type="number" value="${c.points||0}"></label><label>Salidas<input id="mStarts" type="number" value="${c.starts||0}"></label><label>Victorias<input id="mWins" type="number" value="${c.wins||0}"></label><label>Podios<input id="mPodiums" type="number" value="${c.podiums||0}"></label><label>Poles<input id="mPoles" type="number" value="${c.poles||0}"></label><label>Títulos<input id="mTitles" type="number" value="${c.titles||0}"></label></div><h3>${esc(active().name)} — automático desde eventos</h3><div class="profileStats"><div class="card"><div class="statLabel">Puntos</div><div class="statValue">${ss.points}</div></div><div class="card"><div class="statLabel">Victorias</div><div class="statValue">${ss.wins}</div></div><div class="card"><div class="statLabel">Podios</div><div class="statValue">${ss.podiums}</div></div><div class="card"><div class="statLabel">Salidas</div><div class="statValue">${ss.starts}</div></div></div><div class="toolbar"><button class="btn" onclick="updateDriverFromForm('${id}')">Guardar perfil</button></div>`)}
function profile(id){let d=driver(id),t=totalsFor(d),rating=ratingFor(d),rk=historicalRanking().findIndex(x=>x.id===id)+1,hist=db.seasons.map(s=>({season:s,stats:seasonStatsFor(d,s.id),rank:standings(s.id).findIndex(x=>x.id===id)+1})).filter(x=>x.stats.starts);document.body.classList.add('modal-open');openModal(`<button class="close" onclick="closeModal()">×</button><div class="modalScroll"><div class="profileTop" style="flex-wrap:wrap; padding:16px 18px; background:linear-gradient(145deg,#191f29,#10151d); border:1px solid #ffffff0b; border-radius:18px"><div style="position:relative">${avatar(d,'profileHeroPhoto')}<div style="position:absolute; bottom:-6px; right:-6px; background:#10151d; border:2px solid #344052; border-radius:10px; padding:2px 8px; font-size:16px; font-weight:1000; color:${rk===1?'#ffd778':rk===2?'#d6dde6':rk===3?'#d89b68':'#8f9aaa'}">#${rk}</div></div><div style="flex:1; min-width:200px"><div class="eyebrow">Perfil de piloto</div><h2 style="margin:4px 0; font-size:26px">${esc(d.name)}</h2><div class="muted small">${d.nickname?'@'+esc(d.nickname)+' · ':''}${esc(d.team||'Sin equipo')}${d.country?' · '+esc(d.country):''}${d.number?' · #'+esc(d.number):''}</div><div class="hallMeta" style="margin-top:8px"><span class="pill">${t.titles} títulos</span><span class="pill">${t.wins} victorias</span><span class="pill">${t.podiums} podios</span><span class="pill">${t.starts} salidas</span></div></div><div class="hallRatingBox" style="margin-left:auto"><div class="hallRating">${rating}<span class="subtle">/99</span></div><div class="subtle">RATING</div></div></div><p class="muted">${esc(d.bio||'Sin biografía.')}</p><div class="profileStats">${[['EFECTIVIDAD',rating+'/99'],['WIN RATE',t.starts?Math.round((t.wins/t.starts)*100)+'%':'0%'],['PODIUM RATE',t.starts?Math.round((t.podiums/t.starts)*100)+'%':'0%'],['Puntos',t.points],['Victorias',t.wins],['Podios',t.podiums],['Salidas',t.starts],['Poles',t.poles],['Campeonatos',t.titles]].map(x=>`<div class="card"><div class="statLabel">${x[0]}</div><div class="statValue" style="${x[0]==='EFECTIVIDAD'?'color:var(--accent2)':''}">${x[1]}</div></div>`).join('')}</div><div class="profileHistory"><h3>Historial de campeonatos</h3><p class="muted small">Pulsa un campeonato para abrir toda la información de esa temporada.</p>${hist.length?hist.slice().reverse().map(x=>{let won=championOf(x.season.id)?.id===d.id;return `<div class="seasonHistoryCard compact ${won?'champion':''}" onclick="showSeasonDetail('${id}','${x.season.id}')"><div class="seasonHistoryCompact"><div><div class="eyebrow">${esc(x.season.year||'Temporada')}</div><div class="seasonHistoryTitle">${esc(x.season.name)}</div><div class="seasonHistorySub">${x.stats.starts} salidas · ${x.stats.points} puntos ${won?'· 🏆 Campeón':''}</div></div><div class="seasonPosition">#${x.rank||'—'}</div><div class="subtle">Ver ›</div></div></div>`}).join(''):'<div class="empty">Sin participaciones registradas todavía.</div>'}</div>${isAdmin?`<div class="toolbar"><button class="btn secondary" onclick="editDriver('${id}')">Editar perfil</button></div>`:''}</div>`)}
function showSeasonDetail(driverId,seasonId){let d=driver(driverId),s=db.seasons.find(x=>x.id===seasonId);if(!d||!s)return;let st=seasonStatsFor(d,seasonId),rk=standings(seasonId).findIndex(x=>x.id===driverId)+1,won=championOf(seasonId)?.id===driverId,races=db.races.filter(r=>r.seasonId===seasonId).slice().sort((a,b)=>a.date.localeCompare(b.date)||String(a.id).localeCompare(String(b.id))),rows=races.map((r,i)=>{let rr=normalizeRaceResults(r).find(x=>x.driverId===driverId);let tr=db.tracks.find(t=>t.id===r.trackId);return rr?{round:i+1,race:r,result:rr,track:tr}:null}).filter(Boolean);openModal(`<div class="modalScroll"><button class="btn secondary backBtn" onclick="profile('${driverId}')">← Volver al perfil</button><div class="seasonDetailHero"><div><div class="eyebrow">${esc(s.year||'Temporada')}</div><h2 style="margin:3px 0">${esc(s.name)}</h2><div class="muted">Historial de ${esc(d.name)}${d.nickname?' · @'+esc(d.nickname):''}</div></div><div class="seasonPosition">#${rk||'—'}</div></div>${won?'<div class="championBanner">🏆 CAMPEÓN DE LA TEMPORADA</div>':''}<div class="profileStats"><div class="card"><div class="statLabel">Puntos</div><div class="statValue">${st.points}</div></div><div class="card"><div class="statLabel">Victorias</div><div class="statValue">${st.wins}</div></div><div class="card"><div class="statLabel">Podios</div><div class="statValue">${st.podiums}</div></div><div class="card"><div class="statLabel">Salidas</div><div class="statValue">${st.starts}</div></div><div class="card"><div class="statLabel">Poles</div><div class="statValue">${st.poles}</div></div><div class="card"><div class="statLabel">Pts/Salida</div><div class="statValue">${st.starts?Math.round(st.points/st.starts*10)/10:0}</div></div></div><div class="section"><h3>Resultados del campeonato</h3><div class="seasonDetailRaces">${rows.length?rows.map(x=>`<div class="seasonRaceItem"><div class="round">R${x.round}</div><div><div class="raceName">${esc(x.race.name)}</div><div class="raceSub">${esc(x.track?.name||'Pista no especificada')} · ${fmt(x.race.date)}</div></div><div class="racePts">#${x.result.position} · ${x.result.points} pts ${x.result.pole?' · POLE':''}</div></div>`).join(''):'<div class="empty">No hay resultados registrados de este piloto en esta temporada.</div>'}</div></div></div>`)}

async function addTrack(){let n=document.getElementById('trackName').value.trim();if(!n)return alert('Escribe el nombre de la pista');let f=document.getElementById('trackImageFile')?.files?.[0];let img=f?await fileToDataURL(f):'';db.tracks.push({id:'t'+Date.now(),name:n,country:document.getElementById('trackCountry').value.trim(),length:document.getElementById('trackLength').value.trim(),record:document.getElementById('trackRecord').value.trim(),image:img});document.getElementById('trackName').value='';document.getElementById('trackCountry').value='';document.getElementById('trackLength').value='';document.getElementById('trackRecord').value='';document.getElementById('trackImageFile').value='';save();alert('Pista agregada')}
function editTrack(id){let t=db.tracks.find(x=>x.id===id);openModal(`<button class="close" onclick="closeModal()">×</button><h2>Editar pista</h2><div class="formrow"><input id="mTN" value="${esc(t.name)}" placeholder="Nombre"><input id="mTC" value="${esc(t.country)}" placeholder="País"><input id="mTL" value="${esc(t.length)}" placeholder="Piloto"><input id="mTR" value="${esc(t.record||'')}" placeholder="Récord de pista"><label class="filePicker">📷 Cambiar foto<input id="mTIF" type="file" accept="image/*"></label></div>${t.image?`<div class="photoSlot"><img src="${esc(t.image)}" style="width:58px;height:58px;border-radius:12px;object-fit:cover"></div>`:''}<br><button class="btn" onclick="updateTrack('${id}')">Guardar</button>`)}
async function updateTrack(id){let t=db.tracks.find(x=>x.id===id);t.name=mTN.value.trim();t.country=mTC.value.trim();t.length=mTL.value.trim();t.record=mTR.value.trim();let f=document.getElementById('mTIF')?.files?.[0];if(f)t.image=await fileToDataURL(f);closeModal();save()}
function deleteTrack(id){if(confirm('¿Eliminar esta pista?')){db.tracks=db.tracks.filter(t=>t.id!==id);save()}}
function getDriverSelectOptions(selectedId='',seasonId=null){
  let sid=seasonId||document.getElementById('raceSeason')?.value||db.activeSeason;
  let s=db.seasons.find(x=>x.id===sid);
  let seasonDriverIds=s?.driverIds||[];
  let seasonList=db.drivers.filter(d=>seasonDriverIds.includes(d.id));
  let otherList=db.drivers.filter(d=>!seasonDriverIds.includes(d.id));
  let html='<option value="">Seleccionar piloto</option>';
  if(seasonList.length>0){
    html+=`<optgroup label="Pilotos del campeonato (${seasonList.length})">`+seasonList.map(d=>`<option value="${d.id}" ${d.id===selectedId?'selected':''}>${esc(d.name)} (${esc(d.team||'Sin equipo')})</option>`).join('')+`</optgroup>`;
    if(otherList.length>0){
      html+=`<optgroup label="Otros pilotos registrados">`+otherList.map(d=>`<option value="${d.id}" ${d.id===selectedId?'selected':''}>${esc(d.name)} (${esc(d.team||'Sin equipo')})</option>`).join('')+`</optgroup>`;
    }
  }else{
    html+=db.drivers.map(d=>`<option value="${d.id}" ${d.id===selectedId?'selected':''}>${esc(d.name)}</option>`).join('');
  }
  return html;
}
function syncRaceSeasonDrivers(){
  document.querySelectorAll('#gridEditor .gridDriver').forEach(sel=>{
    let currentVal=sel.value;
    sel.innerHTML=getDriverSelectOptions(currentVal);
    sel.value=currentVal;
  });
}
function addGridRow(id='',position='',points='',pole=false,fast=false){let div=document.createElement('div');div.className='raceRow';div.innerHTML=`<div class="racePos rowNo"></div><select class="gridDriver" onchange="syncRaceRow(this)">${getDriverSelectOptions(id)}</select><div class="teamCol muted small rowTeam">—</div><input class="gridPosition" type="number" min="1" placeholder="1" value="${position||''}" oninput="syncRacePoints(this)"><div class="gridPointsDisplay badge">${position?pointsForPosition(position,pole,fast):'—'}</div><div class="small extraText"><label title="Pole"><input type="checkbox" class="gridPole" ${pole?'checked':''} onchange="syncRacePoints(this)"> P</label> <label title="Vuelta rápida"><input type="checkbox" class="gridFast" ${fast?'checked':''} onchange="syncRacePoints(this)"> VR</label></div><button class="btn danger" style="padding:7px 9px" onclick="this.parentElement.remove();renumberRaceRows()">×</button>`;gridEditor.appendChild(div);syncRaceRow(div.querySelector('.gridDriver'));renumberRaceRows()}
function syncRacePoints(el){let row=el?.closest('.raceRow');if(!row)return;let pos=Number(row.querySelector('.gridPosition')?.value)||0;let pole=!!row.querySelector('.gridPole')?.checked,fast=!!row.querySelector('.gridFast')?.checked;row.querySelector('.gridPointsDisplay').textContent=pos?pointsForPosition(pos,pole,fast):'—'}
function syncRaceRow(el){let row=el?.closest('.raceRow');if(!row)return;let d=driver(row.querySelector('select')?.value);row.querySelector('.rowTeam').textContent=d?.team||'—'}
function renumberRaceRows(){document.querySelectorAll('#gridEditor .raceRow').forEach((r,i)=>r.querySelector('.rowNo').textContent=i+1)}
function collectRaceRows(containerSelector='#gridEditor',modalMode=false){return [...document.querySelectorAll(containerSelector+' .raceRow')].map(r=>{let sel=modalMode?'.modalDriver':'.gridDriver',posSel=modalMode?'.modalPosition':'.gridPosition',poleSel=modalMode?'.modalPole':'.gridPole',fastSel=modalMode?'.modalFast':'.gridFast';let id=r.querySelector(sel).value,pos=Number(r.querySelector(posSel).value)||0,pole=r.querySelector(poleSel)?.checked||false,fast=r.querySelector(fastSel)?.checked||false;return id?{driverId:id,position:pos,points:pointsForPosition(pos,pole,fast),pole,fast}:null}).filter(Boolean)}
function addRace(){if(!active())return alert('Crea un campeonato y selecciónalo antes de registrar una carrera.');let name=raceName.value.trim(),results=collectRaceRows();if(!name||!results.length)return alert('Escribe el nombre del evento y añade al menos un piloto.');if(results.some(x=>!x.position))return alert('Pon la posición de cada piloto.');if(new Set(results.map(x=>x.driverId)).size!==results.length)return alert('No repitas un piloto en la misma carrera.');let trackId=document.getElementById('raceTrack')?.value||'';if(!trackId)return alert('Selecciona la pista donde se corrió la ronda.');let sId=(document.getElementById('raceSeason')?.value||db.activeSeason);let s=db.seasons.find(x=>x.id===sId);if(s&&Array.isArray(s.driverIds)){results.forEach(r=>{if(!s.driverIds.includes(r.driverId))s.driverIds.push(r.driverId);});}db.races.push({id:'r'+Date.now(),seasonId:sId,trackId,name,date:raceDate.value||new Date().toISOString().slice(0,10),laps:raceLaps.value.trim(),notes:raceNotes.value.trim(),results:results.sort((a,b)=>a.position-b.position)});raceName.value=raceDate.value=raceLaps.value=raceNotes.value='';document.getElementById('raceTrack').value='';gridEditor.innerHTML='';addGridRow();save();alert('Resultado guardado. Se actualizaron campeonato, perfiles y Hall of Fame.')}
function getRaceResults(id){let rr=db.races.find(r=>r.id===id);return normalizeRaceResults(rr)}
function loginAdmin(){let e=document.getElementById('adminEmail').value,p=document.getElementById('adminPass').value;if(!e||!p)return document.getElementById('loginError').textContent='Rellena ambos campos';document.getElementById('loginError').textContent='Iniciando sesión...';firebase.auth().signInWithEmailAndPassword(e,p).then(()=>{document.getElementById('loginError').textContent='';document.getElementById('adminEmail').value='';document.getElementById('adminPass').value='';}).catch(err=>{document.getElementById('loginError').textContent='Error: '+err.message});}
function logoutAdmin(){firebase.auth().signOut().then(()=>{document.getElementById('loginError').textContent='';});}
function editRace(id){let r=db.races.find(x=>x.id===id),res=normalizeRaceResults(r);openModal(`<button class="close" onclick="closeModal()">×</button><h2>Editar evento</h2><div class="formrow"><select id="mRT"><option value="">Seleccionar pista</option>${db.tracks.map(t=>`<option value="${t.id}" ${t.id===r.trackId?'selected':''}>${esc(t.name)}</option>`).join('')}</select><input id="mRN" value="${esc(r.name)}"><input id="mRD" type="date" value="${r.date}"><input id="mRL" value="${esc(r.laps||'')}" placeholder="Vueltas"><input id="mRO" value="${esc(r.notes||'')}" placeholder="Notas"></div><div class="raceBuilder" style="margin-top:15px"><div class="raceHead"><div>#</div><div>Piloto</div><div class="teamCol">Equipo</div><div>Posición</div><div>Puntos</div><div>Extra</div><div></div></div><div id="modalGrid"></div></div><div class="toolbar"><button class="btn secondary" onclick="addModalGrid('','','',false,false,'${r.seasonId}')">+ Añadir piloto</button><button class="btn" onclick="updateRace('${id}')">Guardar cambios</button></div>`);res.forEach(x=>addModalGrid(x.driverId,x.position,x.points,x.pole,x.fast,r.seasonId))}
function addModalGrid(id='',position='',points='',pole=false,fast=false,seasonId=null){let div=document.createElement('div');div.className='raceRow';div.innerHTML=`<div class="racePos rowNo"></div><select class="modalDriver" onchange="syncRaceRow(this)">${getDriverSelectOptions(id,seasonId)}</select><div class="teamCol muted small rowTeam">—</div><input class="modalPosition" type="number" min="1" placeholder="1" value="${position||''}" oninput="syncModalPoints(this)"><div class="modalPoints badge">${position?pointsForPosition(position,pole,fast):'—'}</div><div class="small extraText"><label><input type="checkbox" class="modalPole" ${pole?'checked':''} onchange="syncModalPoints(this)"> P</label> <label><input type="checkbox" class="modalFast" ${fast?'checked':''} onchange="syncModalPoints(this)"> VR</label></div><button class="btn danger" style="padding:7px 9px" onclick="this.parentElement.remove();renumberModalRows()">×</button>`;modalGrid.appendChild(div);syncRaceRow(div.querySelector('.modalDriver'));renumberModalRows()}
function syncModalPoints(el){let row=el?.closest('.raceRow');if(!row)return;let pos=Number(row.querySelector('.modalPosition')?.value)||0,pole=!!row.querySelector('.modalPole')?.checked,fast=!!row.querySelector('.modalFast')?.checked;row.querySelector('.modalPoints').textContent=pos?pointsForPosition(pos,pole,fast):'—'}
function renumberModalRows(){document.querySelectorAll('#modalGrid .raceRow').forEach((r,i)=>r.querySelector('.rowNo').textContent=i+1)}
function updateRace(id){let r=db.races.find(x=>x.id===id),rows=collectRaceRows('#modalGrid',true);if(!rows.length||rows.some(x=>!x.position))return alert('Cada participante necesita piloto y posición.');if(new Set(rows.map(x=>x.driverId)).size!==rows.length)return alert('No repitas un piloto.');if(!mRT.value)return alert('Selecciona la pista.');let s=db.seasons.find(x=>x.id===r.seasonId);if(s&&Array.isArray(s.driverIds)){rows.forEach(x=>{if(!s.driverIds.includes(x.driverId))s.driverIds.push(x.driverId);});}r.trackId=mRT.value;r.name=mRN.value.trim()||r.name;r.date=mRD.value;r.laps=mRL.value.trim();r.notes=mRO.value.trim();r.results=rows.sort((a,b)=>a.position-b.position);delete r.grid;closeModal();save()}
function deleteRace(id){if(confirm('¿Eliminar este evento? Se recalcularán todos los resultados asociados.')){db.races=db.races.filter(r=>r.id!==id);save()}}
function saveScoring(){let pts=pointsInput.value.split(',').map(x=>Number(x.trim())).filter(x=>!isNaN(x));if(!pts.length)return alert('Introduce una puntuación válida');db.points=pts;db.pole=poleBonus.checked;db.fast=fastBonus.checked;save();alert('Puntuación guardada')}
function openModal(html){document.body.classList.add('modal-open');modal.innerHTML='<div class="modal" onclick="if(event.target===this)closeModal()"><div class="modalbox" onclick="event.stopPropagation()">'+html+'</div></div>'}function closeModal(){modal.innerHTML='';document.body.classList.remove('modal-open')}
function loginForm() { openModal(`<button class="close" onclick="closeModal()">×</button><h2>Admin Login</h2><p class="muted">Solo para administradores.</p><div class="formrow" style="flex-direction:column; max-width:300px"><input type="email" id="authEmail" placeholder="Correo electrónico"><input type="password" id="authPass" placeholder="Contraseña"><button class="btn" style="margin-top:10px" onclick="doLogin()">Ingresar</button></div>`); }
function doLogin() { let e = document.getElementById('authEmail').value.trim(); let p = document.getElementById('authPass').value.trim(); if(!e || !p) return alert('Ingresa correo y contraseña'); firebase.auth().signInWithEmailAndPassword(e, p).then(() => { closeModal(); }).catch(err => alert("Error: " + err.message)); }
function doLogout() { firebase.auth().signOut(); }
function exportData(){let a=document.createElement('a');a.href='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(db,null,2));a.download='minizrd-lopez-track-datos.json';a.click()}
function importData(e){let f=e.target.files[0];if(!f)return;let r=new FileReader();r.onload=()=>{try{db=JSON.parse(r.result);db.drivers?.forEach(d=>{if(!d.seasonStats)d.seasonStats={}});save();alert('Datos importados')}catch(x){alert('JSON inválido')}};r.readAsText(f)}
function resetDemo(){if(confirm('Esto borrará tus datos locales y dejará MiniZRD Lopez Track en blanco para comenzar de cero. ¿Continuar?')){db=JSON.parse(JSON.stringify(demo));save()}}
applyTheme(localStorage.getItem('minizrd_theme')||'dark');
db.races=db.races.map((r,i)=>{let seasonId=r.seasonId||db.seasons[0]?.id;let results=(r.results||r.grid||[]).map((x,j)=>{let obj=typeof x==='string'?{driverId:x,position:j+1,pole:false,fast:false}:x;let position=Number(obj.position)||j+1;return {driverId:obj.driverId,position,pole:!!obj.pole,fast:!!obj.fast,points:pointsForPosition(position,!!obj.pole,!!obj.fast)}});return {...r,id:r.id||('r'+Date.now()+i),seasonId,trackId:r.trackId||'',results};});localStorage.setItem('minizrd_data',JSON.stringify(db));render();addGridRow();show('inicio');

function applyTheme(mode){const light=mode==='light';document.body.classList.toggle('light',light);const b=document.getElementById('themeToggle');if(b){b.textContent=light?'☀️ Claro':'🌙 Oscuro';b.title=light?'Cambiar a modo oscuro':'Cambiar a modo claro';}localStorage.setItem('minizrd_theme',light?'light':'dark')}
function toggleTheme(){applyTheme(document.body.classList.contains('light')?'dark':'light')}