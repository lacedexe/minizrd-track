const navItems=[['inicio','Inicio'],['temporadas','Temporadas'],['campeonato','Campeonato'],['ranking','Hall of Fame'],['pilotos','Pilotos'],['equipos','Equipos'],['resultados','Resultados'],['pistas','Pistas'],['admin','Admin']];
let isAdmin = false;
const firebaseConfig = { apiKey: "AIzaSyATJkyeA_gX5KLCkoUXCJbFQ7FUIagxU6I", authDomain: "minizrdlopeztrack.firebaseapp.com", databaseURL: "https://minizrdlopeztrack-default-rtdb.firebaseio.com", projectId: "minizrdlopeztrack", storageBucket: "minizrdlopeztrack.firebasestorage.app", messagingSenderId: "843618773228", appId: "1:843618773228:web:0dcd1680fc209ac105ddc9" };
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const dbRef = database.ref('minizrd_data');
const demo={site:'MiniZRD',activeSeason:null,points:[25,18,15,12,10,8,6,4,2,1],pole:false,fast:false,seasons:[],drivers:[],tracks:[],races:[],teams:[]};
let savedLocal=null;try{savedLocal=JSON.parse(localStorage.getItem('minizrd_data'));}catch(e){}
let db=savedLocal&&savedLocal.seasons?savedLocal:JSON.parse(JSON.stringify(demo));
function normStats(x){return {points:+(x?.points||0),starts:+(x?.starts||0),wins:+(x?.wins||0),podiums:+(x?.podiums||0),poles:+(x?.poles||0),fast:+(x?.fast||0)} }

function isNoTeamName(str){
  if(!str) return true;
  let s = String(str).trim().toLowerCase();
  return s === 'sin equipo' || s === 'sin_equipo' || s === 'no team' || s === 'unassigned' || s === 'independent' || s === 'ninguno' || s === 'none' || s === 'null' || s === 'undefined' || s === '—';
}

function initDbStructure(){
  if(!db.site || db.site==='MiniZRD Lopez Track')db.site='MiniZRD';
  if(!Array.isArray(db.teams))db.teams=[];
  // Purga de seguridad: JAMÁS permitir una entidad llamada "Sin Equipo" o similar
  db.teams = db.teams.filter(t => !isNoTeamName(t.name));

  if(!Array.isArray(db.drivers))db.drivers=[];
  // Migración y saneamiento de pilotos
  db.drivers.forEach(d=>{
    if(d.nickname==null)d.nickname='';
    d.career={...{points:0,starts:0,wins:0,podiums:0,poles:0,fast:0,titles:0},...(d.career||{})};
    if(!d.seasonStats)d.seasonStats={};
    if(d.team && isNoTeamName(d.team)){
      d.team = '';
      d.teamId = null;
    } else if(d.team && d.team.trim()){
      let existing = db.teams.find(t => t.name.trim().toLowerCase() === d.team.trim().toLowerCase());
      if(!existing){
        existing = {
          id: 'team_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          name: d.team.trim(),
          country: d.country || '',
          bio: '',
          logo: ''
        };
        db.teams.push(existing);
      }
      d.teamId = existing.id;
      d.team = existing.name;
    } else if(d.teamId){
      let existing = db.teams.find(t => t.id === d.teamId);
      if(existing) d.team = existing.name;
      else d.teamId = null;
    }
  });

  db.teams.forEach(t => {
    if(!Array.isArray(t.driverIds)) t.driverIds = [];
    db.drivers.forEach(d => {
      if(d.teamId === t.id && !t.driverIds.includes(d.id)){
        t.driverIds.push(d.id);
      }
    });
  });

  if(!Array.isArray(db.seasons))db.seasons=[];
  db.seasons.forEach(s=>{
    s.rounds=Number(s.rounds||0);
    if(!s.rounds)s.rounds=8;
    if(!s.category||(s.category!=='GT'&&s.category!=='GTP')){
      s.category=(s.name&&s.name.toUpperCase().includes('GTP'))?'GTP':'GT';
    }
    s.champType = s.champType || 'both'; // 'both' | 'individual' | 'teams'
    if(!s.driverTeams) s.driverTeams = {};
    if(!Array.isArray(s.driverIds)){
      let set=new Set();
      (db.races||[]).filter(r=>r.seasonId===s.id).forEach(r=>{
        (r.results||r.grid||[]).forEach(x=>{
          let id=typeof x==='string'?x:x.driverId;
          if(id)set.add(id);
        });
      });
      s.driverIds=set.size>0?Array.from(set):(db.drivers||[]).map(d=>d.id);
    }
    s.driverIds.forEach(did => {
      if(s.driverTeams[did] === undefined){
        let d = driver(did);
        s.driverTeams[did] = (d?.teamId && db.teams.some(t=>t.id===d.teamId)) ? d.teamId : null;
      }
    });
  });

  if(!db.seasons.some(s=>s.id===db.activeSeason))db.activeSeason=db.seasons[0]?.id||null;
  if(!Array.isArray(db.tracks))db.tracks=[];
  db.tracks.forEach(t=>{
    if(t.recordGT===undefined)t.recordGT=null;
    if(t.recordGTP===undefined)t.recordGTP=null;
    if(t.record&&!t.recordGT){
      t.recordGT={driverId:'',time:t.record,seasonName:'',round:''};
    }
  });
  if(!Array.isArray(db.races))db.races=[];
  db.races.forEach(r => {
    let s = db.seasons.find(s=>s.id===r.seasonId);
    (r.results || r.grid || []).forEach(x => {
      if(x && typeof x === 'object'){
        if(x.teamId === undefined){
          x.teamId = s?.driverTeams?.[x.driverId] || driver(x.driverId)?.teamId || null;
        }
        if(x.teamId && !db.teams.some(t => t.id === x.teamId)){
          x.teamId = null;
        }
      }
    });
  });
  if(!db.points?.length)db.points=[25,18,15,12,10,8,6,4,2,1];
}
initDbStructure();
dbRef.on('value', (snapshot) => { const data = snapshot.val(); if(data){ db = data; initDbStructure(); render(); } });
firebase.auth().onAuthStateChanged(user => { isAdmin = !!user; render(); });
function save(){ try{localStorage.setItem('minizrd_data',JSON.stringify(db));}catch(e){} if(isAdmin&&firebase.auth().currentUser){dbRef.set(db).catch(e=>console.warn("Firebase save:",e.message));} render(); }
function active(){if(!db.seasons?.length)return null;return db.seasons.find(s=>s.id===db.activeSeason)||db.seasons[0]}
function setSeason(id){if(db.seasons.some(s=>s.id===id)){db.activeSeason=id;save()}}
function show(id){if(id==='admin'&&!isAdmin){loginForm();return;}document.getElementById('nav').classList.remove('open');document.querySelectorAll('main>section').forEach(x=>x.classList.add('hidden'));document.getElementById(id).classList.remove('hidden');document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.id===id));if(id==='equipos')renderTeams();render()}
function driver(id){return db.drivers.find(d=>d.id===id)}
function team(id){if(!id)return null;return db.teams?.find(t=>t.id===id)||null}
function teamName(id){let t=team(id);return t?t.name:''}
function getTeamForDriverInSeason(driverId, seasonId){let s=db.seasons?.find(x=>x.id===seasonId);let tid=s?.driverTeams?.[driverId];if(tid&&team(tid))return team(tid);let d=driver(driverId);if(d?.teamId&&team(d.teamId))return team(d.teamId);return null}
function initials(name){return String(name||'').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'?'}
function fmt(x){if(!x)return'';let p=x.split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:x}
function esc(x){return String(x??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]))}
function emptyStats(){return {points:0,starts:0,wins:0,podiums:0,poles:0,fast:0}}
function pointsForPosition(position,pole=false,fast=false){let p=Number(db.points[Math.max(0,Number(position)-1)]||0);if(db.pole&&pole)p+=1;if(db.fast&&fast)p+=1;return p}

function normalizeRaceResults(r){
  let s=db.seasons.find(x=>x.id===r?.seasonId);
  return (r?.results||r?.grid||[]).map((x,i)=>{
    let obj=typeof x==='string'?{driverId:x,position:i+1,pole:false,fast:false}:x;
    let position=Number(obj.position)||i+1;
    let teamId=obj.teamId;
    if(teamId===undefined){
      teamId=s?.driverTeams?.[obj.driverId]||driver(obj.driverId)?.teamId||null;
    }
    if(teamId&&!team(teamId))teamId=null;
    return {
      driverId:obj.driverId,
      position,
      pole:!!obj.pole,
      fast:!!obj.fast,
      teamId:teamId||null,
      points:pointsForPosition(position,!!obj.pole,!!obj.fast)
    };
  });
}

function autoSeasonStats(seasonId){
  let out={};
  db.drivers.forEach(d=>out[d.id]=emptyStats());
  db.races.filter(r=>r.seasonId===seasonId).forEach(r=>{
    normalizeRaceResults(r).forEach(x=>{
      if(!out[x.driverId])return;
      out[x.driverId].starts++;
      out[x.driverId].points+=x.points;
      if(Number(x.position)===1)out[x.driverId].wins++;
      if(Number(x.position)<=3)out[x.driverId].podiums++;
      if(x.pole)out[x.driverId].poles++;
      if(x.fast)out[x.driverId].fast++;
    });
  });
  return out;
}
function seasonStatsFor(d,seasonId){return autoSeasonStats(seasonId)[d.id]||emptyStats()}
function allSeasonStats(d){let map={};db.seasons.forEach(s=>map[s.id]=seasonStatsFor(d,s.id));return map}

/* Lógica de Equipos por Temporada */
function getSeasonTeams(seasonId){
  let s=db.seasons.find(x=>x.id===seasonId);
  if(!s)return [];
  let tIds=new Set();
  if(Array.isArray(s.driverIds)){
    s.driverIds.forEach(did=>{
      let t=getTeamForDriverInSeason(did,seasonId);
      if(t&&!isNoTeamName(t.name))tIds.add(t.id);
    });
  }
  db.races.filter(r=>r.seasonId===seasonId).forEach(r=>{
    normalizeRaceResults(r).forEach(x=>{
      if(x.teamId&&team(x.teamId)&&!isNoTeamName(team(x.teamId).name)){
        tIds.add(x.teamId);
      }
    });
  });
  return Array.from(tIds).map(id=>team(id)).filter(Boolean);
}

function teamStatsFor(teamId,seasonId){
  let t=team(teamId);
  if(!t)return emptyStats();
  let sRaces=db.races.filter(r=>r.seasonId===seasonId);
  let stats={points:0,starts:0,wins:0,podiums:0,poles:0,fast:0};
  sRaces.forEach(r=>{
    let res=normalizeRaceResults(r);
    let teamResults=res.filter(x=>x.teamId===teamId);
    if(teamResults.length>0){
      stats.starts++;
      let won=false,pole=false,fast=false;
      teamResults.forEach(x=>{
        stats.points+=x.points;
        if(Number(x.position)===1)won=true;
        if(Number(x.position)<=3)stats.podiums++;
        if(x.pole)pole=true;
        if(x.fast)fast=true;
      });
      if(won)stats.wins++;
      if(pole)stats.poles++;
      if(fast)stats.fast++;
    }
  });
  return stats;
}

function teamStandings(seasonId=db.activeSeason){
  let s=db.seasons.find(x=>x.id===seasonId);
  let tList=getSeasonTeams(seasonId);
  return tList.map(t=>({
    ...t,
    _s:teamStatsFor(t.id,seasonId),
    _drivers:(s?.driverIds||[]).map(did=>driver(did)).filter(d=>d&&(getTeamForDriverInSeason(d.id,seasonId)?.id===t.id))
  })).sort((a,b)=>
    b._s.points-a._s.points||
    b._s.wins-a._s.wins||
    b._s.podiums-a._s.podiums||
    b._s.starts-a._s.starts||
    a.name.localeCompare(b.name)
  );
}

function teamHistoricalTotals(teamId){
  let t=team(teamId);
  if(!t)return {titles:0,wins:0,podiums:0,poles:0,fast:0,points:0,races:0,seasons:0};
  let stats={titles:0,wins:0,podiums:0,poles:0,fast:0,points:0,races:0,seasons:0};
  stats.titles=countTeamTitles(teamId);
  db.seasons.forEach(s=>{
    if(s.champType==='individual')return;
    let st=teamStatsFor(teamId,s.id);
    if(st.starts>0){
      stats.seasons++;
      stats.races+=st.starts;
      stats.points+=st.points;
      stats.wins+=st.wins;
      stats.podiums+=st.podiums;
      stats.poles+=st.poles;
      stats.fast+=st.fast;
    }
  });
  return stats;
}

function isSeasonComplete(seasonId){let s=db.seasons.find(x=>x.id===seasonId);if(!s||!s.rounds)return false;return db.races.filter(r=>r.seasonId===seasonId).length>=Number(s.rounds)}

function championOf(seasonId, type='driver'){
  let s=db.seasons.find(x=>x.id===seasonId);
  if(!s||!isSeasonComplete(seasonId))return null;
  let cType=s.champType||'both';
  if(type==='driver'){
    if(cType==='teams')return null; // Campeonato exclusivo de equipos
    let st=standings(seasonId).filter(x=>x._s.starts>0);
    return st[0]||null;
  }else if(type==='team'){
    if(cType==='individual')return null; // Campeonato exclusivo individual
    let st=teamStandings(seasonId).filter(x=>x._s.starts>0);
    return st[0]||null;
  }
  return null;
}

function countTitles(driverId,category=null){
  let n=0;
  db.seasons.forEach(s=>{
    if(category&&s.category!==category)return;
    let champ=championOf(s.id,'driver');
    if(champ?.id===driverId)n++;
  });
  return n;
}

function countTeamTitles(teamId,category=null){
  let n=0;
  db.seasons.forEach(s=>{
    if(category&&s.category!==category)return;
    let champ=championOf(s.id,'team');
    if(champ?.id===teamId)n++;
  });
  return n;
}

function totalsFor(d,category=null){let c=normStats(d.career);if(category){return categoryStatsFor(d,category);}db.seasons.forEach(s=>{let st=seasonStatsFor(d,s.id);c.points+=st.points;c.starts+=st.starts;c.wins+=st.wins;c.podiums+=st.podiums;c.poles+=st.poles;c.fast+=st.fast});c.titles=Number(d.career?.titles||0)+countTitles(d.id);return c}
function getSeasonDrivers(seasonId){let s=db.seasons.find(x=>x.id===seasonId);if(!s)return[];if(!Array.isArray(s.driverIds))return db.drivers;return s.driverIds.map(id=>driver(id)).filter(Boolean)}
function getSeasonStatus(s){let done=db.races.filter(r=>r.seasonId===s.id).length,rounds=Number(s.rounds)||0;if(rounds>0&&done>=rounds)return{text:'Finalizado',cls:'finalizado',icon:'🏁'};if(done>0)return{text:'En curso',cls:'enCurso',icon:'🟢'};return{text:'Próximamente',cls:'proximamente',icon:'⏳'}}
function standings(seasonId=db.activeSeason){let list=getSeasonDrivers(seasonId);return list.map(d=>({...d,_s:seasonStatsFor(d,seasonId)})).sort((a,b)=>b._s.points-a._s.points||b._s.wins-a._s.wins||b._s.podiums-a._s.podiums||b._s.starts-a._s.starts||a.name.localeCompare(b.name))}

/* Helpers de Categorías GT y GTP */
function getSeasonCategory(sId){let s=db.seasons.find(x=>x.id===sId);return s?.category||'GT'}
function getCategoryBadge(cat){return cat==='GTP'?'<span class="catBadge gtp">⚡ GTP</span>':'<span class="catBadge gt">🏎️ GT</span>'}
function updateCatRadioStyle(){let isGT=document.getElementById('lblCatGT')?.querySelector('input')?.checked;document.getElementById('lblCatGT')?.classList.toggle('active-gt',!!isGT);document.getElementById('lblCatGTP')?.classList.toggle('active-gtp',!isGT)}

/* Estadísticas Históricas y Versatilidad por Categoría */
function categoryStatsFor(d,category){
  let c={points:0,starts:0,wins:0,podiums:0,poles:0,fast:0,titles:0};
  if(category==='GT'&&d.career&&isDriverParticipatingInCategory(d.id,'GT')){
    let car=normStats(d.career);
    c.points+=car.points;c.starts+=car.starts;c.wins+=car.wins;c.podiums+=car.podiums;c.poles+=car.poles;c.fast+=car.fast;
    c.titles+=Number(d.career?.titles||0);
  }
  db.seasons.filter(s=>(s.category||'GT')===category).forEach(s=>{
    let st=seasonStatsFor(d,s.id);
    c.points+=st.points;c.starts+=st.starts;c.wins+=st.wins;c.podiums+=st.podiums;c.poles+=st.poles;c.fast+=st.fast;
  });
  c.titles+=countTitles(d.id,category);
  return c;
}

function isDriverParticipatingInCategory(driverId, category){
  let d=driver(driverId);
  if(!d)return false;
  // 1. Participación real en carreras de la categoría
  let hasRace=db.races.some(r=>{
    let cat=r.category||getSeasonCategory(r.seasonId);
    return cat===category&&(r.results||r.grid||[]).some(x=>(typeof x==='string'?x:x.driverId)===driverId);
  });
  if(hasRace)return true;

  // 2. Con estadísticas reales registradas en campeonatos de la categoría
  let hasSeasonStats=db.seasons.some(s=>{
    let cat=s.category||'GT';
    if(cat!==category)return false;
    let st=seasonStatsFor(d,s.id);
    return (st.starts>0||st.points>0||st.wins>0||st.podiums>0||st.poles>0);
  });
  if(hasSeasonStats)return true;

  // 3. Inscrito formalmente en la lista de participantes de un campeonato de la categoría
  let isParticipant=db.seasons.some(s=>{
    let cat=s.category||'GT';
    if(cat!==category)return false;
    return Array.isArray(s.driverIds)&&s.driverIds.includes(driverId);
  });
  if(isParticipant)return true;

  return false;
}

function getDriverParticipatingCategories(driverId){
  let cats=[];
  if(isDriverParticipatingInCategory(driverId,'GT'))cats.push('GT');
  if(isDriverParticipatingInCategory(driverId,'GTP'))cats.push('GTP');
  return cats;
}

function getDriverCategories(driverId){
  let cats=getDriverParticipatingCategories(driverId);
  return cats.length?cats:['GT'];
}

function getTeamOfficialDrivers(teamId){
  let t=team(teamId);
  if(!t)return [];
  let dIds=[];
  if(Array.isArray(t.driverIds)){
    dIds=[...t.driverIds];
  }
  db.drivers.forEach(d=>{
    if(d.teamId===teamId&&!dIds.includes(d.id)){
      dIds.push(d.id);
    }
  });
  return dIds.map(id=>driver(id)).filter(Boolean);
}

function isDriverVersatile(d){
  return isDriverParticipatingInCategory(d.id,'GT')&&isDriverParticipatingInCategory(d.id,'GTP');
}

function ratingFor(d,category='general'){
  if(category==='GT'||category==='GTP'){
    if(!isDriverParticipatingInCategory(d.id,category))return 0;
    let t=categoryStatsFor(d,category);
    if(!t.starts&&t.titles===0)return 0;
    let activeDrivers=db.drivers.filter(x=>isDriverParticipatingInCategory(x.id,category));
    let all=activeDrivers.map(x=>categoryStatsFor(x,category));
    let mx=f=>Math.max(1,...all.map(f));
    let maxPts=mx(x=>x.points),maxWins=mx(x=>x.wins),maxPod=mx(x=>x.podiums),maxPoles=mx(x=>x.poles);
    let starts=t.starts||1;
    let avg=t.points/starts;
    let podiumRate=t.podiums/starts;
    let seasons=db.seasons.filter(s=>s.category===category&&seasonStatsFor(d,s.id).starts>0).length;
    let base=(t.wins/maxWins)*15+(t.podiums/maxPod)*15+(t.points/maxPts)*12+Math.min(1,avg/25)*15+Math.min(1,podiumRate)*15+(t.poles/maxPoles)*13+Math.min(15,seasons*2.5);
    let titleBonus=t.titles*5;
    return Math.max(0,Math.min(99,Math.round(base+titleBonus)));
  }
  let t=totalsFor(d);
  if(!t.starts&&t.titles===0)return 0;
  let all=db.drivers.map(rawRankStats),mx=f=>Math.max(1,...all.map(f));
  let maxPts=mx(x=>x.points),maxWins=mx(x=>x.wins),maxPod=mx(x=>x.podiums),maxPoles=mx(x=>x.poles);
  let starts=t.starts||1;
  let avg=t.points/starts;
  let podiumRate=t.podiums/starts;
  let seasons=Object.values(allSeasonStats(d)).filter(x=>x.starts>0).length;
  let base=(t.wins/maxWins)*15+(t.podiums/maxPod)*15+(t.points/maxPts)*12+Math.min(1,avg/25)*15+Math.min(1,podiumRate)*15+(t.poles/maxPoles)*13+Math.min(15,seasons*2.5);
  let titleBonus=t.titles*5;
  let versatilityBonus=isDriverVersatile(d)?5:0;
  return Math.max(0,Math.min(99,Math.round(base+titleBonus+versatilityBonus)));
}

function rawRankStats(d){let t=totalsFor(d),starts=t.starts||0;return {...t,avg:starts?t.points/starts:0,winRate:starts?t.wins/starts:0,podiumRate:starts?t.podiums/starts:0,seasons:Object.values(allSeasonStats(d)).filter(x=>x.starts>0).length}}

let currentRankTab='general'; // 'general' | 'GT' | 'GTP'
function setRankCategory(cat){
  currentRankTab=cat;
  document.querySelectorAll('.rankTabBtn').forEach(b=>b.classList.remove('active'));
  if(cat==='general')document.getElementById('btnRankGeneral')?.classList.add('active');
  if(cat==='GT')document.getElementById('btnRankGT')?.classList.add('active');
  if(cat==='GTP')document.getElementById('btnRankGTP')?.classList.add('active');
  const sub=document.getElementById('rankSubtitle');
  const hint=document.getElementById('rankHint');
  if(cat==='general'){
    if(sub)sub.textContent='Ranking histórico general considerando la trayectoria combinada en GT y GTP, con reconocimiento a la versatilidad.';
    if(hint)hint.innerHTML='<b>Rating 0–99:</b> Evaluación histórica combinada. Los pilotos con trayectoria en ambas categorías reciben una bonificación por versatilidad.';
  }else if(cat==='GT'){
    if(sub)sub.textContent='Ranking histórico compuesto exclusivamente por pilotos y resultados oficiales de la categoría GT.';
    if(hint)hint.innerHTML='<b>Rating 0–99 GT:</b> Calculado exclusivamente con estadísticas y campeonatos disputados en la categoría GT.';
  }else if(cat==='GTP'){
    if(sub)sub.textContent='Ranking histórico compuesto exclusivamente por pilotos y resultados oficiales de la categoría GTP.';
    if(hint)hint.innerHTML='<b>Rating 0–99 GTP:</b> Calculado exclusivamente con estadísticas y campeonatos disputados en la categoría GTP.';
  }
  renderRanking();
}

function historicalRanking(category=currentRankTab){
  if(category==='GT'||category==='GTP'){
    return db.drivers
      .filter(d=>isDriverParticipatingInCategory(d.id,category))
      .map(d=>({
        ...d,
        _t:categoryStatsFor(d,category),
        _rating:ratingFor(d,category),
        _isVersatile:isDriverVersatile(d)
      })).sort((a,b)=>b._rating-a._rating||b._t.titles-a._t.titles||b._t.wins-a._t.wins||b._t.podiums-a._t.podiums||b._t.points-a._t.points);
  }
  return db.drivers.map(d=>({
    ...d,
    _t:rawRankStats(d),
    _rating:ratingFor(d,'general'),
    _isVersatile:isDriverVersatile(d)
  })).sort((a,b)=>b._rating-a._rating||b._t.titles-a._t.titles||b._t.wins-a._t.wins||b._t.podiums-a._t.podiums||b._t.points-a._t.points);
}

function avatar(d,cls='avatar'){return d?.photo?`<img class="${cls}" src="${esc(d.photo)}" onerror="this.outerHTML='<div class=&quot;${cls} avatarFallback&quot;>${esc(initials(d.name))}</div>'">`:`<div class="${cls} avatarFallback">${esc(initials(d?.name))}</div>`}
function renderNav(){document.getElementById('nav').innerHTML=navItems.filter(x=>isAdmin||x[0]!=='admin').map(x=>`<button data-id="${x[0]}" onclick="show('${x[0]}')">${x[1]}</button>`).join('') + (isAdmin ? `<button onclick="doLogout()">Cerrar sesión</button>` : `<button onclick="loginForm()">🔒</button>`);}
function render(){renderNav();let a=active();let rSeasonEl=document.getElementById('raceSeason');rSeasonEl.innerHTML=db.seasons.map(x=>`<option value="${x.id}" ${x.id===db.activeSeason?'selected':''}>${esc(x.name)}${x.year?' · '+esc(x.year):''} [${x.category||'GT'}]</option>`).join('');rSeasonEl.onchange=syncRaceSeasonDrivers;document.getElementById('raceTrack').innerHTML='<option value="">Seleccionar pista obligatoria</option>'+db.tracks.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('');document.getElementById('publicSeason').innerHTML=db.seasons.map(x=>`<option value="${x.id}" ${x.id===db.activeSeason?'selected':''}>${esc(x.name)}${x.year?' · '+esc(x.year):''} [${x.category||'GT'}]</option>`).join('');if(a){document.getElementById('seasonHint').innerHTML=`${a.year||''} · ${db.races.filter(r=>r.seasonId===a.id).length}/${a.rounds||'?'} rondas · ${getCategoryBadge(a.category||'GT')}${isSeasonComplete(a.id)?' · CAMPEONATO TERMINADO':''}`;document.getElementById('homeSeason').innerHTML=`${esc(a.name)} ${getCategoryBadge(a.category||'GT')}`;document.getElementById('homeDesc').textContent=a.desc||'Campeonato y estadísticas Mini-Z.';let st=standings(a.id),leader=st[0],hr=historicalRanking()[0];let tst=teamStandings(a.id),tLeader=tst[0];let statsCards=[];if(a.champType!=='teams'){statsCards.push(['Líder Pilotos',leader?.name||'—']);statsCards.push(['Puntos líder',leader?leader._s.points:'—']);}if(a.champType!=='individual'&&tLeader){statsCards.push(['Líder Equipos',tLeader.name]);statsCards.push(['Puntos equipo',tLeader._s.points]);}statsCards.push(['Carreras',db.races.filter(r=>r.seasonId===a.id).length]);statsCards.push(['Pilotos',(a.driverIds||[]).length]);statsCards.push(['Equipos',getSeasonTeams(a.id).length]);statsCards.push(['Hall of Fame #1',hr?.name||'—']);document.getElementById('homeStats').innerHTML=statsCards.map(x=>`<div class="card statCard"><div class="statLabel">${x[0]}</div><div class="statValue">${esc(x[1])}</div></div>`).join('');let seasonRaces=db.races.filter(r=>r.seasonId===a.id).slice().sort((x,y)=>y.date.localeCompare(x.date));let nr=seasonRaces[0];document.getElementById('last').innerHTML=nr?renderLatestEventPodium(nr,seasonRaces):'<div class="empty">Todavía no hay carreras publicadas.</div>';document.getElementById('champName').innerHTML=`${esc(a.name)} ${getCategoryBadge(a.category||'GT')}`;renderStandings();renderHomeStandings();renderChampRounds(a.id);document.getElementById('results').innerHTML=seasonRaces.map(r=>raceCard(r)).join('')||'<div class="empty">No hay resultados en esta temporada.</div>';document.getElementById('seasonsPublic').innerHTML=db.seasons.map(x=>{let champBannerHtml='';if(isSeasonComplete(x.id)){let dc=championOf(x.id,'driver'),tc=championOf(x.id,'team');let parts=[];if(dc)parts.push(`👤 Piloto: <b>${esc(dc.name)}</b>`);if(tc)parts.push(`🏎️ Equipo: <b>${esc(tc.name)}</b>`);champBannerHtml=parts.length?`<div class="championBanner">🏆 ${parts.join(' &nbsp;|&nbsp; ')}</div>`:'';}return `<div class="card" style="cursor:pointer;border-color:${x.id===db.activeSeason?'#ff3b30':'#ffffff0b'}" onclick="setSeason('${x.id}');show('campeonato')"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><span class="eyebrow">${x.id===db.activeSeason?'ACTIVA':'ARCHIVO'}</span>${getCategoryBadge(x.category||'GT')}</div><h2 style="margin:5px 0">${esc(x.name)}</h2><p class="muted">${esc(x.year||'')}</p><p>${esc(x.desc||'')}</p><span class="pill">${db.races.filter(r=>r.seasonId===x.id).length}/${x.rounds||'?'} rondas</span>${champBannerHtml}</div>`;}).join('');}else{document.getElementById('seasonHint').textContent='Crea tu primer campeonato desde Admin.';document.getElementById('homeSeason').textContent='Aún no hay campeonatos';document.getElementById('homeDesc').textContent='Comienza creando tu primer campeonato para registrar pilotos, pistas y carreras.';document.getElementById('homeStats').innerHTML=[['Campeonatos',0],['Pilotos',db.drivers.length],['Carreras',0],['Pistas',db.tracks.length],['Hall of Fame #1','—']].map(x=>`<div class="card statCard"><div class="statLabel">${x[0]}</div><div class="statValue">${esc(x[1])}</div></div>`).join('');document.getElementById('last').innerHTML='<div class="empty">Crea un campeonato para comenzar.</div>';document.getElementById('champName').textContent='No hay campeonato seleccionado';document.getElementById('standings').innerHTML='<div class="empty">Crea un campeonato para ver la clasificación.</div>';let hStEl=document.getElementById('homeStandingsTable');if(hStEl)hStEl.innerHTML='<div class="empty">Crea un campeonato para ver la clasificación.</div>';document.getElementById('champRounds').innerHTML='<div class="empty">No hay rondas todavía.</div>';document.getElementById('results').innerHTML='<div class="empty">No hay resultados todavía.</div>';document.getElementById('seasonsPublic').innerHTML='<div class="empty">No hay temporadas registradas.</div>';}document.getElementById('tracksPublic').innerHTML=db.tracks.map(t=>{let st=getTrackStats(t.id);return `<div class="card" onclick="showTrackProfile('${t.id}')" style="cursor:pointer;transition:.18s ease" title="Haz clic para ver el perfil completo de ${esc(t.name)}">${t.image?`<img src="${esc(t.image)}" style="width:100%;height:150px;object-fit:cover;border-radius:12px;margin-bottom:11px" onerror="this.style.display='none'">`:`<div style="width:100%;height:150px;background:#151c27;border-radius:12px;margin-bottom:11px;display:flex;align-items:center;justify-content:center;font-size:36px">🏁</div>`}<div style="display:flex;justify-content:space-between;align-items:start"><h2 style="margin:0 0 4px">${esc(t.name)}</h2><span class="pill" style="font-size:11px">🏁 ${st.racesCount} carrera${st.racesCount===1?'':'s'}</span></div><p class="muted" style="margin:2px 0 8px">${esc(t.country||'')}${t.length?' · '+esc(t.length):''}</p><div class="small" style="margin-top:6px;color:var(--text)"><b>🏆 Más victorias:</b> <span class="muted">${esc(st.topWinnersText)}</span></div><div class="raceMeta" style="margin-top:8px">${t.recordGT?.time?`<span class="catBadge gt">GT: ${esc(t.recordGT.time)}</span>`:''}${t.recordGTP?.time?`<span class="catBadge gtp">GTP: ${esc(t.recordGTP.time)}</span>`:''}</div><div style="margin-top:10px;text-align:right"><span class="btn secondary" style="padding:4px 10px;font-size:12px">Ver perfil ›</span></div></div>`}).join('')||'<div class="empty">No hay pistas registradas.</div>';renderDrivers();renderTeams();renderRanking();renderAdmin(a);if(typeof window.triggerAnalysisUpdate==='function')window.triggerAnalysisUpdate();}
function renderChampRounds(seasonId){let chronological=db.races.filter(r=>r.seasonId===seasonId).slice().sort((x,y)=>x.date.localeCompare(y.date)||String(x.id).localeCompare(String(y.id)));let races=chronological.slice().reverse();let el=document.getElementById('champRounds');if(!el)return;el.innerHTML=races.length?races.map(r=>{let round=chronological.findIndex(x=>x.id===r.id)+1,res=normalizeRaceResults(r);let winner=res.find(x=>Number(x.position)===1);return `<div class="card" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><div><div style="display:flex;align-items:center;gap:8px"><span class="eyebrow">Ronda ${round}</span>${getCategoryBadge(r.category||getSeasonCategory(r.seasonId))}</div><h3 style="margin:4px 0">${esc(r.name)}</h3><div class="muted small">${fmt(r.date)} · ${res.length} participantes</div></div><button class="btn secondary" onclick="showRaceResult('${r.id}')">Ver resultado</button></div><div class="toolbar"><span class="pill">Ganador: ${esc(driver(winner?.driverId)?.name||'—')}</span><span class="pill">${winner?.points||0} pts</span></div></div>`}).join(''):'<div class="empty">Todavía no hay rondas registradas.</div>'}
function showRaceResult(id){let r=db.races.find(x=>x.id===id);if(r)openModal(`<button class="close" onclick="closeModal()">×</button>${raceCard(r,false)}`)}

const laurelLeft = `<svg class="podiumLaurelBranch" viewBox="0 0 24 40" fill="currentColor"><path d="M12 36 C10 30 5 22 5 14 C5 8 9 3 12 1 C10 4 9 9 9 14 C9 22 13 29 14 34 Z"/><path d="M8 30 C5 29 2 26 3 23 C4 23 8 26 9 29 Z"/><path d="M6 23 C3 22 1 18 2 15 C4 15 6 19 7 22 Z"/><path d="M5 16 C3 14 2 10 4 8 C5 9 6 12 6 15 Z"/><path d="M7 10 C6 7 7 4 9 3 C9 5 9 8 8 10 Z"/></svg>`;
const laurelRight = `<svg class="podiumLaurelBranch" style="transform:scaleX(-1)" viewBox="0 0 24 40" fill="currentColor"><path d="M12 36 C10 30 5 22 5 14 C5 8 9 3 12 1 C10 4 9 9 9 14 C9 22 13 29 14 34 Z"/><path d="M8 30 C5 29 2 26 3 23 C4 23 8 26 9 29 Z"/><path d="M6 23 C3 22 1 18 2 15 C4 15 6 19 7 22 Z"/><path d="M5 16 C3 14 2 10 4 8 C5 9 6 12 6 15 Z"/><path d="M7 10 C6 7 7 4 9 3 C9 5 9 8 8 10 Z"/></svg>`;

function renderPodiumSlot(posNum, pData, dData, slotClass, pedestalClass, hasCrown, seasonId) {
  if (!pData || !dData) {
    return `<div class="podiumSlot ${slotClass}">
      <div class="podiumPedestal ${pedestalClass}">
        <div class="podiumLaurelWrap">
          ${laurelLeft}
          <span class="podiumBigNum">${posNum}</span>
          ${laurelRight}
        </div>
      </div>
    </div>`;
  }
  let isPole = Boolean(pData.pole);
  let rankBadgeClass = posNum === 1 ? 'b1' : (posNum === 2 ? 'b2' : 'b3');
  let cardClass = posNum === 1 ? 'p1' : (posNum === 2 ? 'p2' : 'p3');

  let teamNameStr = '';
  if (pData.teamId) teamNameStr = teamName(pData.teamId);
  if (!teamNameStr && seasonId) teamNameStr = getTeamForDriverInSeason(dData.id, seasonId);
  if (!teamNameStr && dData.team) teamNameStr = dData.team;
  if (isNoTeamName(teamNameStr)) teamNameStr = '';

  return `<div class="podiumSlot ${slotClass}">
    <div class="podiumCard ${cardClass}" onclick="profile('${dData.id}')" title="Ver perfil de ${esc(dData.name)}">
      ${hasCrown ? '<div class="podiumCrown">👑</div>' : ''}
      ${isPole ? '<div class="podiumCardPoleBadge"><span class="badgePole">🏁 POLE</span></div>' : ''}
      <div class="podiumRankBadge ${rankBadgeClass}">${posNum}</div>
      <div class="podiumAvatarWrap">${avatar(dData, 'avatar')}</div>
      <div class="podiumDriverName">${esc(dData.name)}</div>
      ${teamNameStr ? `<div class="podiumTeamName">${esc(teamNameStr)}</div>` : ''}
      <div class="podiumPoints">${pData.points} pts</div>
    </div>
    <div class="podiumPedestal ${pedestalClass}">
      <div class="podiumLaurelWrap">
        ${laurelLeft}
        <span class="podiumBigNum">${posNum}</span>
        ${laurelRight}
      </div>
    </div>
  </div>`;
}

function renderLatestEventPodium(r, allSeasonRaces){
  if(!r) return '<div class="empty">Todavía no hay carreras publicadas.</div>';
  let res = normalizeRaceResults(r).slice().sort((a,b) => Number(a.position) - Number(b.position));
  let track = db.tracks.find(t => t.id === r.trackId);
  let cat = r.category || getSeasonCategory(r.seasonId);

  let chronological = (allSeasonRaces || db.races.filter(x => x.seasonId === r.seasonId))
    .slice()
    .sort((x,y) => x.date.localeCompare(y.date) || String(x.id).localeCompare(String(y.id)));
  let roundIdx = chronological.findIndex(x => x.id === r.id);
  let roundNum = roundIdx >= 0 ? roundIdx + 1 : 1;

  let recordText = '';
  if (cat === 'GTP' && track?.recordGTP?.time) {
    recordText = `⏱️ Récord GTP: ${esc(track.recordGTP.time)} s`;
  } else if (cat === 'GT' && track?.recordGT?.time) {
    recordText = `⏱️ Récord GT: ${esc(track.recordGT.time)} s`;
  } else if (track?.recordGT?.time) {
    recordText = `⏱️ Récord GT: ${esc(track.recordGT.time)} s`;
  } else if (track?.recordGTP?.time) {
    recordText = `⏱️ Récord GTP: ${esc(track.recordGTP.time)} s`;
  } else if (track?.record) {
    recordText = `⏱️ Récord: ${esc(track.record)}`;
  } else if (track?.length) {
    recordText = `📏 Longitud: ${esc(track.length)}`;
  }

  let p1 = res.find(x => Number(x.position) === 1);
  let p2 = res.find(x => Number(x.position) === 2);
  let p3 = res.find(x => Number(x.position) === 3);

  let d1 = p1 ? driver(p1.driverId) : null;
  let d2 = p2 ? driver(p2.driverId) : null;
  let d3 = p3 ? driver(p3.driverId) : null;

  let remaining = res.filter(x => Number(x.position) >= 4);
  let tableHtml = '';
  if (remaining.length > 0) {
    let rows = remaining.map(x => {
      let d = driver(x.driverId);
      if (!d) return '';
      let isPole = Boolean(x.pole);
      let tName = teamName(x.teamId) || (r.seasonId ? getTeamForDriverInSeason(d.id, r.seasonId) : '') || d.team || '';
      if (isNoTeamName(tName)) tName = '';
      return `<tr>
        <td class="podiumTablePos">${x.position}</td>
        <td>
          <div class="driverMini" onclick="profile('${d.id}')" style="cursor:pointer" title="Ver perfil de ${esc(d.name)}">
            ${avatar(d)}
            <div>
              <b>${esc(d.name)}</b>
              ${tName ? `<span class="rankTop">${esc(tName)}</span>` : ''}
            </div>
          </div>
        </td>
        <td class="podiumTablePoints"><b>${x.points}</b></td>
        <td class="podiumTableExtra">${isPole ? '<span class="badgePoleGreen">🟢 POLE</span>' : '<span class="muted">—</span>'}</td>
      </tr>`;
    }).join('');

    tableHtml = `<div class="podiumTableWrap">
      <table class="podiumTable">
        <thead>
          <tr>
            <th style="width:50px">POS</th>
            <th>PILOTO</th>
            <th style="width:70px">PTS</th>
            <th style="width:100px;text-align:center">EXTRA</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>`;
  }

  return `<div class="latestEventContainer">
    <div class="latestEventHero">
      <div class="latestEventEyebrow">ÚLTIMO EVENTO</div>
      <h1 class="latestEventTitle">Último resultado</h1>
      <div class="latestEventRound">Ronda ${roundNum}${r.name && !r.name.toLowerCase().includes('ronda ' + roundNum) ? ' · ' + esc(r.name) : ''}</div>
      <div class="latestEventDate">${fmt(r.date)} ${r.laps ? '· ' + esc(r.laps) + ' vueltas' : ''}</div>
      <div class="latestEventMeta">
        ${track ? `<span class="latestEventBadge" onclick="showTrackProfile('${track.id}')" style="cursor:pointer" title="Ver perfil de circuito">🏁 ${esc(track.name)}</span>` : ''}
        ${recordText ? `<span class="latestEventBadge">${recordText}</span>` : ''}
        <span class="latestEventBadge">👤 ${res.length} piloto${res.length === 1 ? '' : 's'}</span>
        ${getCategoryBadge(cat)}
      </div>
    </div>

    <div class="podiumStageWrapper">
      <div class="podiumGrid">
        ${renderPodiumSlot(2, p2, d2, 'slot2', 'pedestal2', false, r.seasonId)}
        ${renderPodiumSlot(1, p1, d1, 'slot1', 'pedestal1', true, r.seasonId)}
        ${renderPodiumSlot(3, p3, d3, 'slot3', 'pedestal3', false, r.seasonId)}
      </div>
    </div>

    ${tableHtml}
  </div>`;
}

function raceCard(r,adminMode=false){
  let res=normalizeRaceResults(r).slice().sort((a,b)=>Number(a.position)-Number(b.position));
  let track=db.tracks.find(t=>t.id===r.trackId);
  let cat=r.category||getSeasonCategory(r.seasonId);

  let p1=res.find(x=>Number(x.position)===1);
  let p2=res.find(x=>Number(x.position)===2);
  let p3=res.find(x=>Number(x.position)===3);

  let d1=p1?driver(p1.driverId):null;
  let d2=p2?driver(p2.driverId):null;
  let d3=p3?driver(p3.driverId):null;

  let remaining=res.filter(x=>Number(x.position)>=4);
  let tableHtml='';
  if(remaining.length>0){
    let rows=remaining.map(x=>{
      let d=driver(x.driverId);
      if(!d)return '';
      let isPole=Boolean(x.pole);
      let tName = teamName(x.teamId) || (r.seasonId ? getTeamForDriverInSeason(d.id, r.seasonId) : '') || d.team || '';
      if(isNoTeamName(tName)) tName = '';
      return `<tr>
        <td class="podiumTablePos">${x.position}</td>
        <td>
          <div class="driverMini" onclick="profile('${d.id}')" style="cursor:pointer" title="Ver perfil de ${esc(d.name)}">
            ${avatar(d)}
            <div>
              <b>${esc(d.name)}</b>
              ${tName ? `<span class="rankTop">${esc(tName)}</span>` : ''}
            </div>
          </div>
        </td>
        <td class="podiumTablePoints"><b>${x.points}</b></td>
        <td class="podiumTableExtra">${isPole?'<span class="badgePoleGreen">🟢 POLE</span>':'<span class="muted">—</span>'}</td>
      </tr>`;
    }).join('');

    tableHtml=`<div class="podiumTableWrap" style="margin-top:14px">
      <table class="podiumTable">
        <thead>
          <tr>
            <th style="width:50px">POS</th>
            <th>PILOTO</th>
            <th style="width:70px">PTS</th>
            <th style="width:100px;text-align:center">EXTRA</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>`;
  }

  return `<div class="card section" style="padding:20px;margin-bottom:18px">
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:start;flex-wrap:wrap">
      <div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <h2 style="margin:0 0 5px">${esc(r.name)}</h2>
          ${getCategoryBadge(cat)}
        </div>
        <div class="muted small">${fmt(r.date)} ${r.laps?'· '+esc(r.laps)+' vueltas':''}</div>
        <div class="raceMeta" style="margin-top:6px">
          ${track?`<span class="pill" style="cursor:pointer" onclick="showTrackProfile('${track.id}')" title="Ver perfil de pista">🏁 ${esc(track.name)}</span>`:''}
          ${track?.recordGT?.time?`<span class="catBadge gt" style="font-size:10px">⏱ GT ${esc(track.recordGT.time)}</span>`:''}
          ${track?.recordGTP?.time?`<span class="catBadge gtp" style="font-size:10px">⏱ GTP ${esc(track.recordGTP.time)}</span>`:''}
        </div>
      </div>
      <span class="pill" style="font-weight:700">👤 ${res.length} pilotos</span>
    </div>
    <div class="accentLine"></div>

    <div class="podiumStageWrapper" style="margin:14px 0 10px">
      <div class="podiumGrid">
        ${renderPodiumSlot(2, p2, d2, 'slot2', 'pedestal2', false, r.seasonId)}
        ${renderPodiumSlot(1, p1, d1, 'slot1', 'pedestal1', true, r.seasonId)}
        ${renderPodiumSlot(3, p3, d3, 'slot3', 'pedestal3', false, r.seasonId)}
      </div>
    </div>

    ${tableHtml}
    ${r.notes?`<p class="muted small" style="margin-top:12px">${esc(r.notes)}</p>`:''}
    ${adminMode?`<div class="toolbar" style="margin-top:14px"><button class="btn secondary" onclick="editRace('${r.id}')">Editar</button><button class="btn danger" onclick="deleteRace('${r.id}')">Eliminar</button></div>`:''}
  </div>`;
}

function generateStandingsHtml(seasonId, tabType){
  if(tabType === 'teams'){
    let tst = teamStandings(seasonId);
    if(!tst.length){
      return '<div class="empty">No hay equipos registrados o puntuando en este campeonato.</div>';
    }
    return `<table class="standingsTable">
      <thead>
        <tr>
          <th style="width:45px;text-align:center">#</th>
          <th>Escudería</th>
          <th>Pilotos Oficiales</th>
          <th style="text-align:center">Pts</th>
          <th style="text-align:center">Vict.</th>
          <th style="text-align:center">Podios</th>
          <th style="text-align:center">Carreras</th>
          <th style="text-align:center">Poles</th>
        </tr>
      </thead>
      <tbody>
        ${tst.map((t, i) => {
          let posCls = i === 0 ? 'p1' : (i === 1 ? 'p2' : (i === 2 ? 'p3' : ''));
          let dPills = (t._drivers || []).map(d => `<span class="teamDriverPill" onclick="profile('${d.id}')" title="Ver perfil de ${esc(d.name)}">${esc(d.name)}</span>`).join('');
          return `<tr>
            <td><div class="standingsPos ${posCls}">${i + 1}</div></td>
            <td>
              <div class="teamStandingsCell" onclick="showTeamProfile('${t.id}')" style="cursor:pointer" title="Ver perfil de ${esc(t.name)}">
                ${t.logo ? `<img class="teamMiniLogo" src="${esc(t.logo)}" onerror="this.outerHTML='<div class=&quot;teamMiniLogo fallback&quot;>${esc(initials(t.name))}</div>'">` : `<div class="teamMiniLogo fallback">${esc(initials(t.name))}</div>`}
                <div class="teamStandingsInfo">
                  <span class="teamStandingsName">${esc(t.name)}</span>
                  <span class="teamStandingsCountry">${esc(t.country || '')}</span>
                </div>
              </div>
            </td>
            <td><div class="teamDriverPills">${dPills || '<span class="muted">—</span>'}</div></td>
            <td style="text-align:center"><span class="standingsPts ${i === 0 ? 'leader' : ''}">${t._s.points}</span></td>
            <td style="text-align:center"><span class="standingsNum">${t._s.wins}</span></td>
            <td style="text-align:center"><span class="standingsNum">${t._s.podiums}</span></td>
            <td style="text-align:center"><span class="standingsNum">${t._s.starts}</span></td>
            <td style="text-align:center"><span class="standingsNum">${t._s.poles}</span></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  }

  // Driver standings
  let st = standings(seasonId);
  if(!st.length){
    return '<div class="empty">No hay pilotos todavía en este campeonato.</div>';
  }
  return `<table class="standingsTable">
    <thead>
      <tr>
        <th style="width:45px;text-align:center">#</th>
        <th>Piloto</th>
        <th>Escudería</th>
        <th style="text-align:center">Pts</th>
        <th style="text-align:center">Vict.</th>
        <th style="text-align:center">Podios</th>
        <th style="text-align:center">Salidas</th>
        <th style="text-align:center">Poles</th>
      </tr>
    </thead>
    <tbody>
      ${st.map((d, i) => {
        let posCls = i === 0 ? 'p1' : (i === 1 ? 'p2' : (i === 2 ? 'p3' : ''));
        let t = getTeamForDriverInSeason(d.id, seasonId);
        let teamCell = t ? `<div class="teamPillMini" onclick="showTeamProfile('${t.id}')" title="Ver escudería ${esc(t.name)}">
          ${t.logo ? `<img src="${esc(t.logo)}" class="teamMiniLogo" onerror="this.style.display='none'">` : ''}
          <span class="teamCellName">${esc(t.name)}</span>
        </div>` : `<span class="muted">—</span>`;
        return `<tr>
          <td><div class="standingsPos ${posCls}">${i + 1}</div></td>
          <td>
            <div class="standingsDriverCell" onclick="profile('${d.id}')" title="Ver perfil de ${esc(d.name)}">
              ${avatar(d, 'standingsDriverAvatar')}
              <div class="standingsDriverInfo">
                <span class="standingsDriverName">${esc(d.name)}</span>
                <span class="standingsDriverCountry">${esc(d.country || '')}</span>
              </div>
            </div>
          </td>
          <td>${teamCell}</td>
          <td style="text-align:center"><span class="standingsPts ${i === 0 ? 'leader' : ''}">${d._s.points}</span></td>
          <td style="text-align:center"><span class="standingsNum">${d._s.wins}</span></td>
          <td style="text-align:center"><span class="standingsNum">${d._s.podiums}</span></td>
          <td style="text-align:center"><span class="standingsNum">${d._s.starts}</span></td>
          <td style="text-align:center"><span class="standingsNum">${d._s.poles}</span></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}

let currentStandingsTab = 'drivers'; // 'drivers' | 'teams'
function setStandingsTab(tab){
  currentStandingsTab = tab;
  document.getElementById('btnStandingsDrivers')?.classList.toggle('active', tab==='drivers');
  document.getElementById('btnStandingsTeams')?.classList.toggle('active', tab==='teams');
  renderStandings();
}

function renderStandings(){
  let a = active();
  let standingsEl = document.getElementById('standings');
  let toggleEl = document.getElementById('champStandingsToggle');
  if(!standingsEl) return;
  if(!a){
    standingsEl.innerHTML = '<div class="empty">Crea un campeonato para ver la clasificación.</div>';
    if(toggleEl) toggleEl.style.display = 'none';
    return;
  }

  let cType = a.champType || 'both';
  if(cType === 'individual'){
    if(toggleEl) toggleEl.style.display = 'none';
    currentStandingsTab = 'drivers';
  } else if(cType === 'teams'){
    if(toggleEl) toggleEl.style.display = 'none';
    currentStandingsTab = 'teams';
  } else {
    if(toggleEl) toggleEl.style.display = 'flex';
  }

  document.getElementById('btnStandingsDrivers')?.classList.toggle('active', currentStandingsTab === 'drivers');
  document.getElementById('btnStandingsTeams')?.classList.toggle('active', currentStandingsTab === 'teams');

  standingsEl.innerHTML = generateStandingsHtml(a.id, currentStandingsTab);
}

let currentHomeStandingsTab = 'drivers'; // 'drivers' | 'teams'
function setHomeStandingsTab(tab){
  currentHomeStandingsTab = tab;
  document.getElementById('btnHomeStandingsDrivers')?.classList.toggle('active', tab === 'drivers');
  document.getElementById('btnHomeStandingsTeams')?.classList.toggle('active', tab === 'teams');
  renderHomeStandings();
}

function renderHomeStandings(){
  let a = active();
  let tableEl = document.getElementById('homeStandingsTable');
  let titleEl = document.getElementById('homeStandingsTitle');
  let subEl = document.getElementById('homeChampSubtitle');
  let toggleEl = document.getElementById('homeStandingsToggle');
  let secEl = document.getElementById('homeChampSection');
  if(!tableEl) return;

  if(!a){
    if(secEl) secEl.style.display = 'none';
    return;
  }
  if(secEl) secEl.style.display = 'block';

  let catBadge = getCategoryBadge(a.category || 'GT');
  if(titleEl) titleEl.innerHTML = `${esc(a.name)} ${catBadge}`;
  if(subEl) subEl.textContent = `${a.year ? 'Temporada ' + esc(a.year) + ' · ' : ''}${db.races.filter(r => r.seasonId === a.id).length}/${a.rounds || '?'} rondas disputadas`;

  let cType = a.champType || 'both';
  if(cType === 'individual'){
    if(toggleEl) toggleEl.style.display = 'none';
    currentHomeStandingsTab = 'drivers';
  } else if(cType === 'teams'){
    if(toggleEl) toggleEl.style.display = 'none';
    currentHomeStandingsTab = 'teams';
  } else {
    if(toggleEl) toggleEl.style.display = 'flex';
  }

  document.getElementById('btnHomeStandingsDrivers')?.classList.toggle('active', currentHomeStandingsTab === 'drivers');
  document.getElementById('btnHomeStandingsTeams')?.classList.toggle('active', currentHomeStandingsTab === 'teams');

  tableEl.innerHTML = generateStandingsHtml(a.id, currentHomeStandingsTab);
}

function renderDrivers(){
  let q = (document.getElementById('driverSearch')?.value || '').toLowerCase();
  let seasonRank = {};
  standings().forEach((d, i) => seasonRank[d.id] = i + 1);
  document.getElementById('drivers').innerHTML = db.drivers.filter(d => (d.name + ' ' + (d.team || '')).toLowerCase().includes(q)).map(d => {
    let ss = seasonStatsFor(d, db.activeSeason);
    let rk = historicalRanking('general').findIndex(x => x.id === d.id) + 1;
    let cats = getDriverParticipatingCategories(d.id);
    let catBadges = cats.map(c => getCategoryBadge(c)).join(' ');
    let currentT = getTeamForDriverInSeason(d.id, db.activeSeason) || (d.teamId ? team(d.teamId) : null);
    let teamLabel = currentT ? `<span class="pill clickable" onclick="event.stopPropagation();showTeamProfile('${currentT.id}')" title="Ver escudería">🏎️ ${esc(currentT.name)}</span>` : '';
    return `<div class="card driverCard">
      <div class="number">#${esc(d.number || '')}</div>
      <div class="driverCardTop">
        ${avatar(d, 'driverPhoto')}
        <div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <h3 style="margin:0">${esc(d.name)}</h3>
            ${catBadges}
          </div>
          <div class="muted small" style="margin-top:2px">
            ${d.nickname ? '@' + esc(d.nickname) + ' · ' : ''}RANK #${rk || '—'} · Rating ${ratingFor(d, 'general')}/99
          </div>
          <div style="margin-top:5px">${teamLabel}</div>
        </div>
      </div>
      <div class="driverStats">
        <div class="miniStat"><b>${ss.points}</b><span>Pts</span></div>
        <div class="miniStat"><b>${ss.wins}</b><span>Victorias</span></div>
        <div class="miniStat"><b>${ss.podiums}</b><span>Podios</span></div>
        <div class="miniStat"><b>${ss.starts}</b><span>Salidas</span></div>
      </div>
      <div class="toolbar">
        <button class="btn secondary" onclick="profile('${d.id}')">Ver perfil</button>
      </div>
    </div>`;
  }).join('') || '<div class="empty">No hay pilotos.</div>';
}

function renderTeams(){
  let q = (document.getElementById('teamSearch')?.value || '').trim().toLowerCase();
  let el = document.getElementById('teamsList');
  if(!el) return;
  let list = (db.teams || []).filter(t => !isNoTeamName(t.name));
  if(q){
    list = list.filter(t => (t.name + ' ' + (t.country || '') + ' ' + (t.bio || '')).toLowerCase().includes(q));
  }
  if(!list.length){
    el.innerHTML = '<div class="empty">No hay equipos registrados o no coinciden con la búsqueda.</div>';
    return;
  }
  let activeSeasonId = db.activeSeason;
  let s = db.seasons.find(x => x.id === activeSeasonId);

  el.innerHTML = list.map(t => {
    let totals = teamHistoricalTotals(t.id);
    let currentDrivers = getTeamOfficialDrivers(t.id);
    if(!currentDrivers.length && s?.driverIds){
      currentDrivers = (s.driverIds || [])
        .map(did => driver(did))
        .filter(d => d && getTeamForDriverInSeason(d.id, activeSeasonId)?.id === t.id);
    }

    let driverPills = currentDrivers.map(d => {
      let cats = getDriverCategories(d.id);
      let catBadgeHtml = cats.map(c => `<span style="font-size:9px;padding:1px 4px;border-radius:4px;background:${c==='GTP'?'rgba(234,179,8,0.2)':'rgba(59,130,246,0.2)'};color:${c==='GTP'?'#facc15':'#60a5fa'};font-weight:900;margin-left:4px">${c}</span>`).join('');
      return `<span class="teamDriverPill" onclick="event.stopPropagation();profile('${d.id}')" title="Ver perfil de ${esc(d.name)}">${esc(d.name)}${catBadgeHtml}</span>`;
    }).join('');

    let logoHtml = t.logo 
      ? `<img src="${esc(t.logo)}" class="teamLogo" alt="${esc(t.name)}" onerror="this.outerHTML='<div class=&quot;teamLogoFallback&quot;>${esc(initials(t.name))}</div>'">`
      : `<div class="teamLogoFallback">${esc(initials(t.name))}</div>`;

    return `<div class="teamCard" onclick="showTeamProfile('${t.id}')">
      <div class="teamCardHeader">
        ${logoHtml}
        <div class="teamCardInfo">
          <h3 class="teamCardName">${esc(t.name)}</h3>
          <div class="teamCardCountry">${t.country ? esc(t.country) : '<span class="muted">País no especificado</span>'}</div>
        </div>
      </div>
      <div class="teamCardStats">
        <div class="miniStat"><b>${totals.titles}</b><span>Títulos</span></div>
        <div class="miniStat"><b>${totals.wins}</b><span>Victorias</span></div>
        <div class="miniStat"><b>${totals.podiums}</b><span>Podios</span></div>
        <div class="miniStat"><b>${totals.points}</b><span>Puntos</span></div>
      </div>
      <div style="margin-top:12px">
        <div class="muted small" style="margin-bottom:6px;font-weight:600">Pilotos oficiales:</div>
        <div class="teamDriverPills">${driverPills || '<span class="muted small">Sin pilotos asignados</span>'}</div>
      </div>
      <div class="toolbar" style="margin-top:14px;display:flex;justify-content:space-between;align-items:center;gap:8px">
        <button class="btn secondary" style="font-size:12px;padding:5px 12px" onclick="event.stopPropagation();showTeamProfile('${t.id}')">Ver perfil ›</button>
        <button class="btn secondary" style="font-size:12px;padding:5px 12px" onclick="event.stopPropagation();${isAdmin ? `editTeam('${t.id}')` : `loginForm()`}" title="${isAdmin ? 'Editar equipo y pilotos' : 'Iniciar sesión como admin para editar'}">✏️ Editar</button>
      </div>
    </div>`;
  }).join('');
}

function showTeamProfile(teamId){
  let t = team(teamId);
  if(!t) return;
  let totals = teamHistoricalTotals(teamId);
  let activeSeasonId = db.activeSeason;
  let s = db.seasons.find(x => x.id === activeSeasonId);

  let currentDrivers = getTeamOfficialDrivers(teamId);
  if(!currentDrivers.length && s?.driverIds){
    currentDrivers = (s.driverIds || [])
      .map(did => driver(did))
      .filter(d => d && getTeamForDriverInSeason(d.id, activeSeasonId)?.id === teamId);
  }

  let teamDriverStatsMap = {};
  db.races.forEach(r => {
    let res = normalizeRaceResults(r);
    res.forEach(x => {
      if(x.teamId === teamId){
        if(!teamDriverStatsMap[x.driverId]){
          teamDriverStatsMap[x.driverId] = { starts: 0, wins: 0, podiums: 0, points: 0, poles: 0, seasons: new Set() };
        }
        teamDriverStatsMap[x.driverId].starts++;
        teamDriverStatsMap[x.driverId].points += x.points;
        if(Number(x.position) === 1) teamDriverStatsMap[x.driverId].wins++;
        if(Number(x.position) <= 3) teamDriverStatsMap[x.driverId].podiums++;
        if(x.pole) teamDriverStatsMap[x.driverId].poles++;
        if(r.seasonId) teamDriverStatsMap[x.driverId].seasons.add(r.seasonId);
      }
    });
  });

  let historicalDriversList = Object.keys(teamDriverStatsMap)
    .map(did => ({ driver: driver(did), stats: teamDriverStatsMap[did] }))
    .filter(x => x.driver)
    .sort((a, b) => b.stats.points - a.stats.points || b.stats.wins - a.stats.wins);

  let seasonsHistory = db.seasons.map(season => {
    if(season.champType === 'individual') return null;
    let st = teamStatsFor(teamId, season.id);
    if(st.starts === 0) return null;
    let tStandings = teamStandings(season.id);
    let rank = tStandings.findIndex(x => x.id === teamId) + 1;
    let isChamp = isSeasonComplete(season.id) && rank === 1;
    return { season, stats: st, rank, isChamp };
  }).filter(Boolean);

  let raceHistory = [];
  db.races.forEach(r => {
    let res = normalizeRaceResults(r);
    let teamRes = res.filter(x => x.teamId === teamId);
    if(teamRes.length > 0){
      let trk = db.tracks.find(tr => tr.id === r.trackId);
      raceHistory.push({
        race: r,
        track: trk,
        results: teamRes
      });
    }
  });
  raceHistory.sort((a, b) => b.race.date.localeCompare(a.race.date) || String(b.race.id).localeCompare(String(a.race.id)));

  let logoHtml = t.logo
    ? `<img src="${esc(t.logo)}" class="teamHeroLogo" alt="${esc(t.name)}" onerror="this.outerHTML='<div class=&quot;teamHeroLogo fallback&quot;>${esc(initials(t.name))}</div>'">`
    : `<div class="teamHeroLogo fallback">${esc(initials(t.name))}</div>`;

  openModal(`
    <button class="close" onclick="closeModal()">×</button>
    <div class="modalScroll">
      <div class="teamProfileHero">
        ${logoHtml}
        <div class="teamHeroInfo">
          <div class="eyebrow">Escudería Oficial</div>
          <h2 class="teamHeroName">${esc(t.name)}</h2>
          <div class="teamHeroCountry">${t.country ? esc(t.country) : '<span class="muted">País no especificado</span>'}</div>
          ${t.bio ? `<p class="teamHeroBio">${esc(t.bio)}</p>` : '<p class="muted small" style="margin-top:6px">Sin descripción registrada.</p>'}
          <div style="margin-top:10px">
            <button class="btn secondary" style="font-size:12px;padding:5px 12px" onclick="${isAdmin ? `editTeam('${t.id}')` : `loginForm()`}">
              ✏️ Editar Escudería y Pilotos
            </button>
          </div>
        </div>
      </div>

      <!-- 7 Estadísticas Clave -->
      <h3 style="margin:20px 0 10px">📊 Estadísticas Acumuladas</h3>
      <div class="teamStatsGrid">
        <div class="card"><div class="statLabel">🏆 Campeonatos</div><div class="statValue" style="color:#ffd778">${totals.titles}</div></div>
        <div class="card"><div class="statLabel">🥇 Victorias</div><div class="statValue">${totals.wins}</div></div>
        <div class="card"><div class="statLabel">🥈🥉 Podios</div><div class="statValue">${totals.podiums}</div></div>
        <div class="card"><div class="statLabel">🟢 Poles</div><div class="statValue">${totals.poles}</div></div>
        <div class="card"><div class="statLabel">📈 Puntos Totales</div><div class="statValue" style="color:var(--accent2)">${totals.points}</div></div>
        <div class="card"><div class="statLabel">🏁 Carreras</div><div class="statValue">${totals.races}</div></div>
        <div class="card"><div class="statLabel">📅 Temporadas</div><div class="statValue">${totals.seasons}</div></div>
      </div>

      <!-- Pilotos Oficiales -->
      <div class="teamDriversSection" style="margin-top:24px">
        <h3 style="margin:0 0 10px">👤 Pilotos Oficiales</h3>
        ${currentDrivers.length ? `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px">
            ${currentDrivers.map((d, idx) => {
              let ss = seasonStatsFor(d, activeSeasonId);
              let cats = getDriverCategories(d.id);
              let roleBadge = idx === 0 ? '<span class="badge" style="background:#ffd70020;color:#ffd700;font-size:10px;margin-right:4px">1.er Piloto</span>' : (idx === 1 ? '<span class="badge" style="background:#e2e8f020;color:#e2e8f0;font-size:10px;margin-right:4px">2.º Piloto</span>' : '');
              return `<div class="teamDriverCardItem" onclick="profile('${d.id}')" title="Ver perfil de ${esc(d.name)}">
                ${avatar(d, 'avatar')}
                <div style="flex:1;overflow:hidden">
                  <div>${roleBadge}<b>${esc(d.name)}</b></div>
                  <div class="muted small" style="margin-top:2px">
                    ${cats.map(c => getCategoryBadge(c)).join(' ')} · ${ss.starts} carr. · ${ss.points} pts en curso
                  </div>
                </div>
                <div class="subtle">›</div>
              </div>`;
            }).join('')}
          </div>
        ` : '<div class="empty">No hay pilotos asignados oficialmente a este equipo.</div>'}
      </div>

      <!-- Rivalidad entre Compañeros -->
      <div id="teamRivalrySection" style="margin-top:28px">
        <div id="teamRivalryContainer">
          ${renderTeammateRivalryHtml(teamId)}
        </div>
      </div>

      <!-- Pilotos Históricos (con estadísticas mientras corrían para este equipo) -->
      <div class="teamDriversSection" style="margin-top:24px">
        <h3 style="margin:0 0 4px">📜 Historial de Pilotos en el Equipo</h3>
        <p class="muted small" style="margin:0 0 10px">Estadísticas obtenidas exclusivamente mientras defendían los colores de ${esc(t.name)}. Haz clic en cualquier piloto para ver su perfil general.</p>
        ${historicalDriversList.length ? `
          <div class="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Piloto</th>
                  <th style="text-align:center">Salidas</th>
                  <th style="text-align:center">Victorias</th>
                  <th style="text-align:center">Podios</th>
                  <th style="text-align:center">Poles</th>
                  <th style="text-align:center">Puntos</th>
                </tr>
              </thead>
              <tbody>
                ${historicalDriversList.map(item => `
                  <tr style="cursor:pointer" onclick="profile('${item.driver.id}')" title="Ver perfil de ${esc(item.driver.name)}">
                    <td>
                      <div class="driverMini">
                        ${avatar(item.driver, 'avatar')}
                        <div>
                          <b>${esc(item.driver.name)}</b>
                          <span class="rankTop">${esc(item.driver.country || '')}</span>
                        </div>
                      </div>
                    </td>
                    <td style="text-align:center">${item.stats.starts}</td>
                    <td style="text-align:center;font-weight:700">${item.stats.wins}</td>
                    <td style="text-align:center">${item.stats.podiums}</td>
                    <td style="text-align:center">${item.stats.poles}</td>
                    <td style="text-align:center;font-weight:900;color:var(--accent2)">${item.stats.points}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : '<div class="empty">Todavía no hay carreras registradas con pilotos representando a este equipo.</div>'}
      </div>

      <!-- Historial de Campeonatos -->
      <div style="margin-top:24px">
        <h3 style="margin:0 0 10px">🏆 Historial de Campeonatos</h3>
        ${seasonsHistory.length ? `
          <div style="display:grid;gap:10px">
            ${seasonsHistory.map(sh => `
              <div class="card" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-left:4px solid ${sh.isChamp ? '#ffd778' : '#344052'}">
                <div>
                  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                    <b style="font-size:15px">${esc(sh.season.name)}</b>
                    ${getCategoryBadge(sh.season.category)}
                    ${sh.isChamp ? '<span class="championTag">🏆 CAMPEÓN DE EQUIPOS</span>' : ''}
                  </div>
                  <div class="muted small" style="margin-top:3px">
                    ${esc(sh.season.year || '')} · ${sh.stats.starts} carreras · ${sh.stats.wins} victorias · ${sh.stats.podiums} podios · ${sh.stats.points} pts
                  </div>
                </div>
                <div style="font-size:22px;font-weight:900;color:${sh.rank === 1 ? '#ffd778' : sh.rank === 2 ? '#d6dde6' : sh.rank === 3 ? '#d89b68' : '#8f9aaa'}">
                  #${sh.rank || '—'}
                </div>
              </div>
            `).join('')}
          </div>
        ` : '<div class="empty">No ha participado en campeonatos de equipos todavía.</div>'}
      </div>

      <!-- Historial de Carreras -->
      <div style="margin-top:24px">
        <h3 style="margin:0 0 10px">🏁 Historial de Carreras</h3>
        ${raceHistory.length ? `
          <div style="display:grid;gap:8px">
            ${raceHistory.map(rh => {
              let finList = rh.results.map(x => {
                let d = driver(x.driverId);
                return `${esc(d?.name || 'Piloto')}: <b>P${x.position}</b> (${x.points} pts${x.pole ? ' · Pole' : ''})`;
              }).join(' &nbsp;|&nbsp; ');
              return `<div class="card" style="padding:10px 14px">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
                  <div>
                    <b>${esc(rh.race.name)}</b>
                    <span class="muted small"> · ${fmt(rh.race.date)} · 🏁 ${esc(rh.track?.name || 'Pista')}</span>
                  </div>
                  <div class="small">${finList}</div>
                </div>
              </div>`;
            }).join('')}
          </div>
        ` : '<div class="empty">No hay eventos registrados para este equipo todavía.</div>'}
      </div>
    </div>
  `);
}

let teammateRivalryState = {}; // teamId -> { pilotAId, pilotBId, cat }

function setTeammateRivalryCategory(teamId, cat){
  if(!teammateRivalryState[teamId]) teammateRivalryState[teamId] = {};
  teammateRivalryState[teamId].cat = cat;
  updateTeammateRivalryDom(teamId);
}

function setTeammateRivalryPilots(teamId, pA, pB){
  if(!teammateRivalryState[teamId]) teammateRivalryState[teamId] = {};
  teammateRivalryState[teamId].pilotAId = pA;
  teammateRivalryState[teamId].pilotBId = pB;
  updateTeammateRivalryDom(teamId);
}

function updateTeammateRivalryDom(teamId){
  let el = document.getElementById('teamRivalryContainer');
  if(!el) return;
  let st = teammateRivalryState[teamId] || {};
  el.innerHTML = renderTeammateRivalryHtml(teamId, st.pilotAId, st.pilotBId, st.cat);
}

function renderTeammateRivalryHtml(teamId, pAId, pBId, catFilter){
  let t = team(teamId);
  if(!t) return '';
  let teamDrivers = getTeamOfficialDrivers(teamId);
  if(teamDrivers.length < 2){
    return `
      <div class="rivalryHeader">
        <div>
          <div class="eyebrow" style="color:var(--accent)">Duelo Interno Oficial</div>
          <h3 style="margin:2px 0 0">⚔️ Rivalidad entre Compañeros</h3>
          <p class="muted small" style="margin:2px 0 0">Comparativa oficial exclusiva entre pilotos de la escudería respetando categorías</p>
        </div>
      </div>
      <div class="card" style="text-align:center;padding:24px 16px;background:#0d131f;border:1px solid rgba(255,255,255,0.08);border-radius:12px">
        <div style="font-size:32px;margin-bottom:8px">⚔️</div>
        <h3 style="margin:0 0 6px">Se necesitan al menos 2 pilotos</h3>
        <p class="muted small" style="max-width:460px;margin:0 auto 14px">
          Para ver la comparativa de estadísticas y enfrentamientos de compañeros de escudería, asigna al menos dos pilotos a <b>${esc(t.name)}</b> desde el botón Editar.
        </p>
        <button class="btn secondary" style="font-size:12px;padding:6px 14px" onclick="${isAdmin ? `editTeam('${teamId}')` : `loginForm()`}">
          ✏️ Asignar pilotos a la escudería
        </button>
      </div>`;
  }

  let idA = pAId || teamDrivers[0].id;
  let idB = pBId || teamDrivers[1].id;
  if(idA === idB){
    idB = teamDrivers.find(d => d.id !== idA)?.id || teamDrivers[1].id;
  }
  let dA = driver(idA) || teamDrivers[0];
  let dB = driver(idB) || teamDrivers[1];

  let catsA = getDriverCategories(dA.id);
  let catsB = getDriverCategories(dB.id);
  let allCats = Array.from(new Set([...catsA, ...catsB]));
  let activeCat = catFilter || 'all';

  // Calculate statistics for both drivers exclusively while competing for this team
  let startsA = 0, winsA = 0, podiumsA = 0, polesA = 0, pointsA = 0, bestPosA = 999, posSumA = 0;
  let startsB = 0, winsB = 0, podiumsB = 0, polesB = 0, pointsB = 0, bestPosB = 999, posSumB = 0;
  let h2hRaces = 0, h2hWinsA = 0, h2hWinsB = 0, h2hTies = 0;

  db.races.forEach(r => {
    let rCat = r.category || getSeasonCategory(r.seasonId);
    if(activeCat !== 'all' && rCat !== activeCat) return;

    let res = normalizeRaceResults(r);
    let resA = res.find(x => x.driverId === dA.id && x.teamId === teamId);
    let resB = res.find(x => x.driverId === dB.id && x.teamId === teamId);

    if(resA){
      startsA++;
      pointsA += resA.points;
      if(Number(resA.position) === 1) winsA++;
      if(Number(resA.position) <= 3) podiumsA++;
      if(resA.pole) polesA++;
      bestPosA = Math.min(bestPosA, Number(resA.position));
      posSumA += Number(resA.position);
    }
    if(resB){
      startsB++;
      pointsB += resB.points;
      if(Number(resB.position) === 1) winsB++;
      if(Number(resB.position) <= 3) podiumsB++;
      if(resB.pole) polesB++;
      bestPosB = Math.min(bestPosB, Number(resB.position));
      posSumB += Number(resB.position);
    }
    // Direct encounters in the exact same race and category for this team
    if(resA && resB){
      h2hRaces++;
      if(Number(resA.position) < Number(resB.position)) h2hWinsA++;
      else if(Number(resB.position) < Number(resA.position)) h2hWinsB++;
      else h2hTies++;
    }
  });

  let avgPosA = startsA ? (posSumA / startsA).toFixed(1) : '—';
  let avgPosB = startsB ? (posSumB / startsB).toFixed(1) : '—';
  let effA = startsA ? Math.round((podiumsA / startsA) * 100) : 0;
  let effB = startsB ? Math.round((podiumsB / startsB) * 100) : 0;
  let bestPosStrA = bestPosA === 999 ? '—' : `P${bestPosA}`;
  let bestPosStrB = bestPosB === 999 ? '—' : `P${bestPosB}`;

  const cmpRow = (valA, valB, label, inverse = false, suffix = '') => {
    let numA = typeof valA === 'number' ? valA : parseFloat(valA) || 0;
    let numB = typeof valB === 'number' ? valB : parseFloat(valB) || 0;
    let winA = false, winB = false;

    if(valA !== '—' && valB !== '—'){
      if(inverse){
        if(numA > 0 && numB > 0){
          winA = numA < numB;
          winB = numB < numA;
        } else if(numA > 0) winA = true;
        else if(numB > 0) winB = true;
      } else {
        winA = numA > numB;
        winB = numB > numA;
      }
    } else if(valA !== '—') winA = true;
    else if(valB !== '—') winB = true;

    return `
      <tr>
        <td class="rivalryVal left ${winA ? 'rivalryWinner' : ''}">${valA}${suffix}</td>
        <td class="rivalryLabel">${label}</td>
        <td class="rivalryVal right ${winB ? 'rivalryWinner' : ''}">${valB}${suffix}</td>
      </tr>`;
  };

  const barRow = (valA, valB, label) => {
    let max = Math.max(valA, valB) || 1;
    let pctA = Math.round((valA / max) * 100);
    let pctB = Math.round((valB / max) * 100);
    return `
      <div class="rivalryBarWrapper">
        <div class="rivalryBarRow">
          <div class="rivalryBarVal left ${valA > valB ? 'rivalryWinner' : ''}">${valA}</div>
          <div class="rivalryBarTrack"><div class="rivalryBarFill left" style="width:${pctA}%"></div></div>
          <div class="rivalryBarLabel">${label}</div>
          <div class="rivalryBarTrack"><div class="rivalryBarFill right" style="width:${pctB}%"></div></div>
          <div class="rivalryBarVal right ${valB > valA ? 'rivalryWinner' : ''}">${valB}</div>
        </div>
      </div>`;
  };

  let sameCategory = catsA.some(c => catsB.includes(c));
  let isDifferentCategories = !sameCategory;

  let categoryNoticeHtml = '';
  if(isDifferentCategories){
    categoryNoticeHtml = `
      <div class="rivalryNoticeCard">
        <div style="font-size:22px">ℹ️</div>
        <div class="small" style="color:#93c5fd;line-height:1.4">
          <b>Compañeros en Distintas Categorías:</b> ${esc(dA.name)} compite en <b>${catsA.join('/')||'GT'}</b> y ${esc(dB.name)} compite en <b>${catsB.join('/')||'GTP'}</b>. Ambos puntúan para <b>${esc(t.name)}</b>, pero sus resultados y clasificaciones de carrera se registran con total independencia para no mezclar categorías oficiales.
        </div>
      </div>`;
  }

  let catTabsHtml = '';
  if(allCats.length > 1){
    catTabsHtml = `
      <div class="rivalryCatTabs">
        <button class="rivalryCatBtn ${activeCat==='all'?'active':''}" onclick="setTeammateRivalryCategory('${teamId}','all')">🌐 Global</button>
        ${allCats.map(c => `<button class="rivalryCatBtn ${activeCat===c?'active':''}" onclick="setTeammateRivalryCategory('${teamId}','${c}')">${getCategoryBadge(c)}</button>`).join('')}
      </div>`;
  }

  let pilotSelectorHtml = '';
  if(teamDrivers.length > 2){
    pilotSelectorHtml = `
      <div style="display:flex;justify-content:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:6px">
          <span class="small muted">1.er piloto:</span>
          <select style="font-size:12px;padding:4px 8px" onchange="setTeammateRivalryPilots('${teamId}', this.value, '${dB.id}')">
            ${teamDrivers.map(d => `<option value="${d.id}" ${d.id===dA.id?'selected':''}>${esc(d.name)}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="small muted">2.º piloto:</span>
          <select style="font-size:12px;padding:4px 8px" onchange="setTeammateRivalryPilots('${teamId}', '${dA.id}', this.value)">
            ${teamDrivers.map(d => `<option value="${d.id}" ${d.id===dB.id?'selected':''}>${esc(d.name)}</option>`).join('')}
          </select>
        </div>
      </div>`;
  }

  let indexA = teamDrivers.findIndex(d => d.id === dA.id);
  let indexB = teamDrivers.findIndex(d => d.id === dB.id);
  let roleLabelA = indexA === 0 ? '1.ER PILOTO DEL EQUIPO' : (indexA === 1 ? '2.DO PILOTO DEL EQUIPO' : `${indexA + 1}.º PILOTO`);
  let roleLabelB = indexB === 0 ? '1.ER PILOTO DEL EQUIPO' : (indexB === 1 ? '2.DO PILOTO DEL EQUIPO' : `${indexB + 1}.º PILOTO`);
  let roleClsA = indexA === 0 ? 'p1' : (indexA === 1 ? 'p2' : 'other');
  let roleClsB = indexB === 0 ? 'p1' : (indexB === 1 ? 'p2' : 'other');

  return `
    <div class="rivalryHeader">
      <div>
        <div class="eyebrow" style="color:var(--accent)">Duelo Interno Oficial</div>
        <h3 style="margin:2px 0 0;font-size:18px">⚔️ Rivalidad entre Compañeros</h3>
        <p class="muted small" style="margin:2px 0 0">Comparativa oficial exclusiva entre pilotos de ${esc(t.name)}</p>
      </div>
      ${catTabsHtml}
    </div>

    ${pilotSelectorHtml}

    <div class="rivalryPilotsGrid">
      <!-- 1ER PILOTO DEL EQUIPO -->
      <div class="rivalryPilotCard" onclick="profile('${dA.id}')" style="cursor:pointer" title="Ver perfil de ${esc(dA.name)}">
        <div class="rivalryRoleBadge ${roleClsA}">${roleLabelA}</div>
        <div class="rivalryPilotAvatarWrap">
          ${avatar(dA, 'rivalryPilotAvatar')}
        </div>
        <div class="rivalryPilotName">${esc(dA.name)}</div>
        <div class="rivalryPilotMeta">
          <span>${dA.country ? esc(dA.country) : ''}</span>
          <span>${catsA.map(c => getCategoryBadge(c)).join(' ')}</span>
        </div>
      </div>

      <!-- VS CENTER -->
      <div class="rivalryVsCenter">
        <div class="rivalryVsBadge">VS</div>
        ${h2hRaces > 0 ? `
          <div class="rivalryVsScore">${h2hWinsA} - ${h2hWinsB}</div>
          <div class="rivalryVsSub">${h2hRaces} duelo${h2hRaces===1?'':'s'} en pista</div>
        ` : `
          <div class="rivalryVsSub" style="text-align:center;padding:2px 8px;background:rgba(255,255,255,0.05);border-radius:6px">
            ${isDifferentCategories ? 'Categorías distintas' : 'Sin duelos directos'}
          </div>
        `}
      </div>

      <!-- 2DO PILOTO DEL EQUIPO -->
      <div class="rivalryPilotCard" onclick="profile('${dB.id}')" style="cursor:pointer" title="Ver perfil de ${esc(dB.name)}">
        <div class="rivalryRoleBadge ${roleClsB}">${roleLabelB}</div>
        <div class="rivalryPilotAvatarWrap">
          ${avatar(dB, 'rivalryPilotAvatar')}
        </div>
        <div class="rivalryPilotName">${esc(dB.name)}</div>
        <div class="rivalryPilotMeta">
          <span>${dB.country ? esc(dB.country) : ''}</span>
          <span>${catsB.map(c => getCategoryBadge(c)).join(' ')}</span>
        </div>
      </div>
    </div>

    ${categoryNoticeHtml}

    <!-- TABLA COMPARATIVA ESTADÍSTICA -->
    <div class="rivalryTableWrap">
      <table class="rivalryTable">
        <thead>
          <tr>
            <th style="text-align:right">${esc(dA.name)}</th>
            <th style="text-align:center">Comparativa Estadística</th>
            <th style="text-align:left">${esc(dB.name)}</th>
          </tr>
        </thead>
        <tbody>
          ${cmpRow(startsA, startsB, 'Carreras Disputadas')}
          ${cmpRow(winsA, winsB, 'Victorias')}
          ${cmpRow(podiumsA, podiumsB, 'Podios')}
          ${cmpRow(polesA, polesB, 'Poles')}
          ${cmpRow(bestPosStrA, bestPosStrB, 'Mejor Posición', true)}
          ${cmpRow(pointsA, pointsB, 'Puntos Acumulados')}
          ${cmpRow(avgPosA, avgPosB, 'Promedio de Posición', true)}
          ${cmpRow(effA, effB, 'Efectividad (Podios/Carrera)', false, '%')}
          <tr>
            <td class="rivalryVal left ${h2hWinsA > h2hWinsB ? 'rivalryWinner' : ''}">${h2hRaces ? h2hWinsA : '0'}</td>
            <td class="rivalryLabel">Duelos Directos Ganados</td>
            <td class="rivalryVal right ${h2hWinsB > h2hWinsA ? 'rivalryWinner' : ''}">${h2hRaces ? h2hWinsB : '0'}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- BARRAS COMPARATIVAS -->
    <div style="padding:4px 8px 10px">
      ${barRow(pointsA, pointsB, 'Puntos en el equipo')}
      ${barRow(winsA, winsB, 'Victorias')}
      ${barRow(podiumsA, podiumsB, 'Podios')}
    </div>
  `;
}

function renderRanking(){
  let r=historicalRanking(currentRankTab);
  const el=document.getElementById('rankingList');
  if(!el)return;
  let displayList=r;
  el.innerHTML=displayList.length?`
  <div style="display:grid;gap:10px">
  ${displayList.map((d,i)=>{
    let cats=getDriverParticipatingCategories(d.id);
    let catBadges=cats.map(c=>getCategoryBadge(c)).join(' ');
    let isVersatile=d._isVersatile;
    return `<div class="hallCard" onclick="profile('${d.id}')" style="cursor:pointer;display:grid;grid-template-columns:72px minmax(0,1fr) auto;align-items:center;gap:16px;padding:16px 18px">
      <div style="font-size:28px;font-weight:1000;text-align:center;color:${i===0?'#ffd778':i===1?'#d6dde6':i===2?'#d89b68':'#8f9aaa'}">#${i+1}</div>
      <div class="hallTop">${avatar(d)}<div><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><b style="font-size:18px">${esc(d.name)}</b>${catBadges}${currentRankTab==='general'&&isVersatile?'<span class="versatilityPill" title="Compite oficialmente en GT y GTP">🏎️ Versatilidad GT+GTP</span>':''}</div><div class="muted small">${d.nickname?'@'+esc(d.nickname)+' · ':''}${esc(d.team||'')}${d.country?' · '+esc(d.country):''}</div><div class="hallMeta"><span class="pill">${d._t.titles} título${d._t.titles===1?'':'s'}</span><span class="pill">${d._t.wins} victoria${d._t.wins===1?'':'s'}</span><span class="pill">${d._t.podiums} podio${d._t.podiums===1?'':'s'}</span><span class="pill">${d._t.starts} salida${d._t.starts===1?'':'s'}</span></div></div></div>
      <div class="hallRatingBox"><div class="hallRating">${d._rating}<span class="subtle">/99</span></div><div class="subtle">${currentRankTab==='general'?'OVR RATING':currentRankTab+' RATING'}</div></div>
    </div>`;
  }).join('')}
  </div>`:`<div class="empty">No hay pilotos registrados con participación en ${currentRankTab==='general'?'el sistema':'la categoría '+currentRankTab}.</div>`;
}
function renderAdminFinishedSeasons(){
  let el=document.getElementById('adminFinishedSeasons');
  if(!el)return;
  let q=(document.getElementById('adminFinishedSeasonSearch')?.value||'').trim().toLowerCase();
  let finished=db.seasons.filter(s=>isSeasonComplete(s.id));
  if(!finished.length){
    el.innerHTML='<div class="empty">No hay campeonatos finalizados en el archivo histórico.</div>';
    return;
  }
  let filtered=q?finished.filter(s=>(s.name+' '+(s.year||'')+' '+(s.category||'')).toLowerCase().includes(q)):finished;
  if(!filtered.length){
    el.innerHTML=`<div class="empty">No se encontró ningún campeonato finalizado que coincida con "${esc(q)}".</div>`;
    return;
  }
  el.innerHTML=`<div class="adminChampTableWrap"><table class="adminChampTable"><thead><tr><th>Campeonato Finalizado</th><th>Estado</th><th>Pilotos</th><th style="text-align:right">Acciones</th></tr></thead><tbody>`+
  filtered.map(x=>{
    let done=db.races.filter(r=>r.seasonId===x.id).length;
    let champ=championOf(x.id);
    let status=getSeasonStatus(x);
    let pCount=(x.driverIds||[]).length;
    let isActive=x.id===db.activeSeason;
    let catBadge=getCategoryBadge(x.category);
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <b style="font-size:15px">${esc(x.name)}</b>
          ${isActive?'<span class="statusBadge activa">ACTIVA</span>':''}
          ${catBadge}
          ${champ?`<span class="championTag" title="Campeón">🏆 ${esc(champ.name)}</span>`:''}
        </div>
        <div class="muted small" style="margin-top:3px">
          ${esc(x.year||'Año no especificado')} · ${catBadge} · ${done}/${x.rounds||'?'} rondas completadas
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
}

function syncRaceSeasonRounds(){
  let sId=document.getElementById('raceSeason')?.value||db.activeSeason;
  let s=db.seasons.find(x=>x.id===sId);
  let roundSel=document.getElementById('raceRoundSelect');
  if(!roundSel)return;
  if(!s){
    roundSel.innerHTML='<option value="">Selecciona un campeonato primero</option>';
    return;
  }
  let roundsTotal=Number(s.rounds)||8;
  let sRaces=db.races.filter(r=>r.seasonId===s.id);
  let html=`<option value="">-- Seleccionar ronda de ${esc(s.name)} --</option>`;
  for(let i=1;i<=roundsTotal;i++){
    let existing=sRaces.find(r=>r.name&&r.name.toLowerCase().includes('ronda '+i));
    let statusText=existing?'(Ya registrada)':'(Disponible)';
    html+=`<option value="Ronda ${i} — ${esc(s.name)}">Ronda ${i} — ${esc(s.name)} ${statusText}</option>`;
  }
  roundSel.innerHTML=html;
}

function applyRaceRoundSelect(el){
  if(el?.value){
    let nameInput=document.getElementById('raceName');
    if(nameInput)nameInput.value=el.value;
  }
}

function renderAdminRaces(){
  let sId=document.getElementById('raceSeason')?.value||db.activeSeason;
  let s=db.seasons.find(x=>x.id===sId);
  let el=document.getElementById('adminRaces');
  let titleEl=document.getElementById('adminRacesTitle');
  let subEl=document.getElementById('adminRacesSubtitle');
  if(titleEl&&s)titleEl.textContent=`Rondas de ${s.name} [${s.category||'GT'}]`;
  if(subEl&&s)subEl.textContent=`Mostrando exclusivamente las rondas de este campeonato (${s.category||'GT'})`;
  if(!el)return;
  if(!s){
    el.innerHTML='<p class="muted">Selecciona un campeonato para ver sus rondas.</p>';
    return;
  }
  let q=(document.getElementById('adminRaceRoundSearch')?.value||'').trim().toLowerCase();
  let races=db.races.filter(r=>r.seasonId===s.id);
  if(q){
    races=races.filter(r=>r.name.toLowerCase().includes(q)||(r.notes||'').toLowerCase().includes(q));
  }
  let sorted=races.slice().sort((x,y)=>y.date.localeCompare(x.date));
  el.innerHTML=sorted.length?sorted.map(r=>raceCard(r,true)).join(''):(q?`<p class="muted">No se encontraron rondas que coincidan con "${esc(q)}" en este campeonato.</p>`:'<p class="muted">No hay eventos registrados en este campeonato.</p>');
}

function renderAdmin(a){
  if(isAdmin){document.getElementById('adminControls').classList.remove('hidden');document.getElementById('logoutBtn').classList.remove('hidden');document.getElementById('adminLogin').classList.add('hidden');}
  else{document.getElementById('adminControls').classList.add('hidden');document.getElementById('logoutBtn').classList.add('hidden');document.getElementById('adminLogin').classList.remove('hidden');}
  
  let activeSeasons=db.seasons.filter(s=>!isSeasonComplete(s.id));
  let stHtml='';
  if(activeSeasons.length){
    stHtml=`<div class="adminChampTableWrap"><table class="adminChampTable"><thead><tr><th>Campeonato Activo</th><th>Estado</th><th>Pilotos</th><th style="text-align:right">Acciones</th></tr></thead><tbody>`+
    activeSeasons.map(x=>{
      let done=db.races.filter(r=>r.seasonId===x.id).length;
      let champ=championOf(x.id);
      let status=getSeasonStatus(x);
      let pCount=(x.driverIds||[]).length;
      let isActive=x.id===db.activeSeason;
      let catBadge=getCategoryBadge(x.category);
      return `<tr>
        <td>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <b style="font-size:15px">${esc(x.name)}</b>
            ${isActive?'<span class="statusBadge activa">ACTIVA</span>':''}
            ${catBadge}
            ${champ?`<span class="championTag" title="Campeón">🏆 ${esc(champ.name)}</span>`:''}
          </div>
          <div class="muted small" style="margin-top:3px">
            ${esc(x.year||'Año no especificado')} · ${catBadge} · ${done}/${x.rounds||'?'} rondas
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
    stHtml='<div class="empty">No hay campeonatos activos en este momento. Crea uno nuevo o usa el buscador de abajo para ver y reactivar torneos finalizados.</div>';
  }
  document.getElementById('adminSeasons').innerHTML=stHtml;
  renderAdminFinishedSeasons();

  let newDList=document.getElementById('newSeasonDriversList');
  if(newDList){
    newDList.innerHTML=db.drivers.length?db.drivers.map(d=>`<label class="addPilotItem" style="font-size:12px"><input type="checkbox" class="newSeasonDriverCb" value="${d.id}" checked>${avatar(d,'avatar')}<div style="overflow:hidden;text-overflow:ellipsis"><b>${esc(d.name)}</b><div class="muted" style="font-size:10px">${esc(d.team||'')}</div></div></label>`).join(''):'<span class="muted small">No hay pilotos registrados todavía.</span>';
  }

  let newTeamSel = document.getElementById('newTeamSelect');
  if(newTeamSel){
    let validTeams = (db.teams || []).filter(t => !isNoTeamName(t.name));
    newTeamSel.innerHTML = '<option value="">(Sin equipo habitual)</option>' + validTeams.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  }

  let aq=(document.getElementById('adminDriverSearch')?.value||'').trim().toLowerCase();
  document.getElementById('adminDrivers').innerHTML=!aq?'<div class="empty">Escribe el nombre o equipo para buscar un piloto.</div>':db.drivers.filter(d=>(d.name+' '+(d.team||'')).toLowerCase().includes(aq)).map(d=>{let ss=seasonStatsFor(d,a?a.id:null);return `<div class="card adminDriverItem"><div><b>${esc(d.name)}</b><div class="small muted">${d.team?esc(d.team)+' · ':''}#${esc(d.number||'')} · ${ss.points} pts · Rating ${ratingFor(d)}/99</div></div><div class="toolbar"><button class="btn secondary" onclick="editDriver('${d.id}')">Editar</button><button class="btn danger" onclick="deleteDriver('${d.id}')">Eliminar</button></div></div>`}).join('')||'<div class="empty">No hay pilotos que coincidan.</div>';
  
  renderAdminTeams();

  document.getElementById('adminTracks').innerHTML=db.tracks.map(t=>{
    let st=getTrackStats(t.id);
    let recGT=t.recordGT?.time?`<span class="catBadge gt" style="font-size:10px">GT: ${esc(t.recordGT.time)} (${esc(driver(t.recordGT.driverId)?.name||'—')})</span>`:'';
    let recGTP=t.recordGTP?.time?`<span class="catBadge gtp" style="font-size:10px">GTP: ${esc(t.recordGTP.time)} (${esc(driver(t.recordGTP.driverId)?.name||'—')})</span>`:'';
    return `<div class="card" style="margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div>
        <b style="font-size:15px">${esc(t.name)}</b> · ${esc(t.country||'')} · ${esc(t.length||'')} · <span class="pill" style="font-weight:700">🏁 ${st.racesCount} carrera${st.racesCount===1?'':'s'}</span>
        <div style="margin-top:4px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          ${recGT||'<span class="subtle" style="font-size:11px">GT: Sin récord</span>'}
          ${recGTP||'<span class="subtle" style="font-size:11px">GTP: Sin récord</span>'}
        </div>
      </div>
      <div class="toolbar" style="margin:0">
        <button class="btn secondary" style="padding:6px 11px;font-size:12px" onclick="editTrack('${t.id}')">Editar</button>
        <button class="btn" style="padding:6px 11px;font-size:12px;background:#1e3a8a;border-color:#3b82f6" onclick="editTrackRecordsModal('${t.id}')">⏱️ Récords</button>
        <button class="btn danger" style="padding:6px 11px;font-size:12px" onclick="deleteTrack('${t.id}')">Eliminar</button>
      </div>
    </div>`;
  }).join('')||'<p class="muted">No hay pistas.</p>';
  syncRaceSeasonRounds();
  renderAdminRaces();
  document.getElementById('cfgName').value=a?.name||'';
  document.getElementById('cfgRounds').value=a?.rounds||1;
  if(document.getElementById('cfgCategory'))document.getElementById('cfgCategory').value=a?.category||'GT';
  if(document.getElementById('cfgChampType'))document.getElementById('cfgChampType').value=a?.champType||'both';
  document.getElementById('cfgDesc').value=a?.desc||'';
  document.getElementById('pointsInput').value=db.points.join(',');
  document.getElementById('poleBonus').checked=!!db.pole;
  if(document.getElementById('fastBonus')) document.getElementById('fastBonus').checked=!!db.fast;
}

function toggleAllInitialDrivers(checked){
  document.querySelectorAll('.newSeasonDriverCb').forEach(cb=>cb.checked=checked);
}

function addSeason(){
  let n=seasonName.value.trim(),rounds=Number(seasonRounds.value)||0;
  if(!n)return alert('Escribe el nombre del campeonato');
  if(rounds<1)return alert('Indica cuántas rondas tendrá el campeonato.');
  let catEl=document.querySelector('input[name="seasonCategoryRadio"]:checked');
  let cat=catEl?catEl.value.trim():'';
  if(!cat)return alert('Debes seleccionar obligatoriamente una categoría para el campeonato: GT o GTP.');
  let champType=document.getElementById('seasonChampType')?.value||'both';
  let id='s'+Date.now();
  let selectedDrivers=[...document.querySelectorAll('.newSeasonDriverCb:checked')].map(cb=>cb.value);
  let desc=seasonDesc.value.trim();
  let year=seasonYear.value.trim();
  let driverTeams={};
  selectedDrivers.forEach(did=>{
    let d=driver(did);
    driverTeams[did]=(d?.teamId && db.teams.some(t=>t.id===d.teamId))?d.teamId:null;
  });
  db.seasons.push({id,name:n,year,rounds,category:cat,desc,champType,driverIds:selectedDrivers,driverTeams});
  db.activeSeason=id;
  seasonName.value=seasonYear.value=seasonRounds.value=seasonDesc.value='';
  document.querySelectorAll('input[name="seasonCategoryRadio"]').forEach(r=>{r.checked=(r.value==='GT');});
  if(typeof updateCatRadioStyle==='function')updateCatRadioStyle();
  save();
  alert(`Campeonato "${n}" (${cat}) creado exitosamente con ${selectedDrivers.length} pilotos participantes.`);
}

function activateSeason(id){db.activeSeason=id;save()}

/* Gestión de Escuderías en el Panel de Administrador */
function previewNewTeamLogo(e){
  let f=e.target.files?.[0],el=document.getElementById('newTeamLogoPreview');
  if(!el)return;
  if(!f){el.innerHTML='';return}
  el.innerHTML=`<div class="photoPreview"><span>Vista previa:</span><img alt="Vista previa logo"></div>`;
  let img=el.querySelector('img');
  let u=URL.createObjectURL(f);
  img.onload=()=>URL.revokeObjectURL(u);
  img.src=u;
}

async function addTeam(){
  let name=document.getElementById('newTeamName')?.value.trim();
  if(!name)return alert('Escribe el nombre del equipo o escudería.');
  if(isNoTeamName(name)){
    return alert('Nombre no válido para una escudería.');
  }
  if(db.teams.some(t=>t.name.trim().toLowerCase()===name.toLowerCase())){
    return alert(`Ya existe un equipo registrado con el nombre "${name}".`);
  }
  let country=document.getElementById('newTeamCountry')?.value.trim()||'';
  let bio=document.getElementById('newTeamBio')?.value.trim()||'';
  let f=document.getElementById('newTeamLogoFile')?.files?.[0];
  let logo=f?await fileToDataURL(f):'';

  let newT={
    id:'team_'+Date.now(),
    name,
    country,
    logo,
    bio
  };
  db.teams.push(newT);
  document.getElementById('newTeamName').value='';
  document.getElementById('newTeamCountry').value='';
  document.getElementById('newTeamBio').value='';
  if(document.getElementById('newTeamLogoFile'))document.getElementById('newTeamLogoFile').value='';
  if(document.getElementById('newTeamLogoPreview'))document.getElementById('newTeamLogoPreview').innerHTML='';
  save();
  renderAdminTeams();
  alert(`Equipo "${name}" creado exitosamente.`);
}

function renderAdminTeams(){
  let el=document.getElementById('adminTeams');
  if(!el)return;
  let q=(document.getElementById('adminTeamSearch')?.value||'').trim().toLowerCase();
  let list=(db.teams||[]).filter(t=>!isNoTeamName(t.name));
  if(q){
    list=list.filter(t=>(t.name+' '+(t.country||'')).toLowerCase().includes(q));
  }
  if(!list.length){
    el.innerHTML='<div class="empty">No hay equipos registrados o no coinciden con la búsqueda.</div>';
    return;
  }
  let activeSeasonId=db.activeSeason;
  let s=db.seasons.find(x=>x.id===activeSeasonId);

  el.innerHTML=list.map(t=>{
    let totals=teamHistoricalTotals(t.id);
    let currentDrivers=(s?.driverIds||[])
      .map(did=>driver(did))
      .filter(d=>d&&getTeamForDriverInSeason(d.id,activeSeasonId)?.id===t.id);

    return `<div class="card adminDriverItem" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:12px">
        ${t.logo?`<img src="${esc(t.logo)}" style="width:42px;height:42px;object-fit:contain;padding:3px;box-sizing:border-box;background:#111722;border:1px solid #ffffff18;border-radius:10px" onerror="this.outerHTML='<div class=&quot;teamMiniLogo fallback&quot;>${esc(initials(t.name))}</div>'">`:`<div class="teamMiniLogo fallback" style="width:42px;height:42px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:#111722;border:1px solid #ffffff18;font-size:16px;font-weight:900;color:#ffd778">${esc(initials(t.name))}</div>`}
        <div>
          <b style="font-size:15px">${esc(t.name)}</b>
          <div class="small muted">${esc(t.country||'Sin país')} · ${totals.titles} títulos · ${totals.wins} vict. · ${totals.podiums} podios · ${totals.points} pts</div>
          <div class="small muted" style="margin-top:2px">Pilotos en activo: ${currentDrivers.map(d=>esc(d.name)).join(', ')||'Ninguno'}</div>
        </div>
      </div>
      <div class="toolbar" style="margin:0">
        <button class="btn secondary" style="padding:6px 11px;font-size:12px" onclick="showTeamProfile('${t.id}')">Ver perfil</button>
        <button class="btn secondary" style="padding:6px 11px;font-size:12px" onclick="editTeam('${t.id}')">Editar</button>
        <button class="btn danger" style="padding:6px 11px;font-size:12px" onclick="deleteTeam('${t.id}')">Eliminar</button>
      </div>
    </div>`;
  }).join('');
}

let currentEditTeamDriverIds = [];

function editTeam(id){
  let t = team(id);
  if(!t) return;
  if(!isAdmin){
    loginForm();
    return;
  }

  // Initialize currentEditTeamDriverIds with official team drivers
  let currentList = getTeamOfficialDrivers(id).map(d => d.id);
  currentEditTeamDriverIds = [...currentList];

  openModal(`
    <button class="close" onclick="closeModal()">×</button>
    <div class="modalScroll" style="max-height:85vh">
      <h2>⚙️ Editar Escudería: ${esc(t.name)}</h2>
      <p class="muted small" style="margin:-6px 0 16px">Configuración oficial de la escudería y asignación de pilotos en todas las categorías.</p>

      <div class="formrow">
        <div style="flex:2;min-width:180px">
          <label class="small muted">Nombre del equipo</label>
          <input id="mTeamName" value="${esc(t.name)}" placeholder="Nombre de la escudería">
        </div>
        <div style="flex:1.5;min-width:140px">
          <label class="small muted">País</label>
          <input id="mTeamCountry" value="${esc(t.country||'')}" placeholder="País">
        </div>
        <div style="flex:1;min-width:120px">
          <label class="small muted">Logo (PNG con fondo transparente)</label>
          <label class="filePicker">📷 Cambiar logo<input id="mTeamLogoFile" type="file" accept="image/*" onchange="previewEditTeamLogo(event)"></label>
        </div>
      </div>
      <div class="photoSlot" id="editTeamLogoPreview" style="margin-top:8px;background:transparent;border:none">
        ${t.logo ? `<img src="${esc(t.logo)}" class="teamMiniLogo" style="max-height:48px;max-width:140px;object-fit:contain">` : '<span class="muted small">Sin logo</span>'}
      </div>
      <div style="margin-top:10px">
        <label class="small muted">Historia / Descripción</label>
        <textarea id="mTeamBio" placeholder="Historia, logros o descripción..." style="min-height:70px">${esc(t.bio||'')}</textarea>
      </div>

      <!-- GESTIÓN DE PILOTOS DEL EQUIPO -->
      <div class="teamDriversManageBox" style="margin-top:20px">
        <div style="margin-bottom:12px">
          <h3 style="margin:0 0 2px;font-size:16px;color:#f8fafc">👥 Pilotos Asignados a la Escudería</h3>
          <p class="muted small" style="margin:0">Los pilotos pertenecerán a esta escudería en todas las categorías donde compitan (GT / GTP). El orden define al 1.er y 2.º piloto para la rivalidad.</p>
        </div>

        <div id="editTeamDriversList" style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
          ${renderEditTeamDriversListHtml()}
        </div>

        <!-- AGREGAR PILOTO A ESTE EQUIPO -->
        <div style="padding-top:12px;border-top:1px dashed rgba(255,255,255,0.12)">
          <label class="small muted" style="font-weight:700;display:block;margin-bottom:6px">AGREGAR PILOTO A ESTE EQUIPO</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <select id="selAddDriverToTeam" style="flex:1;min-width:220px">
              ${renderAddDriverOptionsHtml()}
            </select>
            <button class="btn secondary" type="button" onclick="addDriverToCurrentEditTeam()" style="white-space:nowrap;padding:7px 14px">
              + Agregar piloto a este equipo
            </button>
          </div>
        </div>
      </div>

      <div class="toolbar" style="margin-top:20px;justify-content:flex-end">
        <button class="btn secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn" onclick="updateTeamFromForm('${id}')">💾 Guardar cambios</button>
      </div>
    </div>
  `);
}

function renderEditTeamDriversListHtml(){
  if(!currentEditTeamDriverIds.length){
    return '<div class="muted small" style="padding:12px;text-align:center;background:#141c2b;border-radius:8px">No hay pilotos asignados a este equipo. Selecciona uno abajo para agregarlo.</div>';
  }
  return currentEditTeamDriverIds.map((did, idx) => {
    let d = driver(did);
    if(!d) return '';
    let cats = getDriverCategories(d.id);
    let catBadges = cats.map(c => `<span style="font-size:9px;padding:1px 4px;border-radius:4px;background:${c==='GTP'?'rgba(234,179,8,0.2)':'rgba(59,130,246,0.2)'};color:${c==='GTP'?'#facc15':'#60a5fa'};font-weight:900">${c}</span>`).join(' ');
    let roleCls = idx === 0 ? 'p1' : (idx === 1 ? 'p2' : 'other');
    let roleLabel = idx === 0 ? '1.er Piloto Oficial' : (idx === 1 ? '2.º Piloto Oficial' : `${idx + 1}.º Piloto`);

    return `
      <div class="editTeamDriverItem">
        <span class="editTeamDriverRole ${roleCls}">${roleLabel}</span>
        ${avatar(d, 'avatar')}
        <div style="flex:1;overflow:hidden">
          <b style="font-size:14px;color:#f8fafc">${esc(d.name)}</b>
          <div class="muted small" style="display:flex;align-items:center;gap:6px;margin-top:2px">
            <span>${d.country ? esc(d.country) : 'Sin país'}</span>
            ${catBadges}
          </div>
        </div>
        <div style="display:flex;gap:4px">
          ${idx > 0 ? `<button type="button" class="btnActionMini" onclick="moveDriverInCurrentEditTeam(${idx}, -1)" title="Subir orden (prioridad)">▲</button>` : ''}
          ${idx < currentEditTeamDriverIds.length - 1 ? `<button type="button" class="btnActionMini" onclick="moveDriverInCurrentEditTeam(${idx}, 1)" title="Bajar orden">▼</button>` : ''}
          <button type="button" class="btnActionMini danger" onclick="removeDriverFromCurrentEditTeam('${d.id}')" title="Quitar de este equipo">🗑️ Quitar</button>
        </div>
      </div>`;
  }).join('');
}

function renderAddDriverOptionsHtml(){
  let available = db.drivers.filter(d => !currentEditTeamDriverIds.includes(d.id));
  if(!available.length){
    return '<option value="">Todos los pilotos ya están asignados a este equipo</option>';
  }
  return '<option value="">-- Seleccionar piloto para agregar --</option>' + available.map(d => {
    let cats = getDriverCategories(d.id);
    let currentTeamInfo = d.team ? ` · Actualmente en ${esc(d.team)}` : ' · Sin equipo';
    return `<option value="${d.id}">${esc(d.name)} [${cats.join('/')||'GT'}]${currentTeamInfo}</option>`;
  }).join('');
}

function addDriverToCurrentEditTeam(){
  let sel = document.getElementById('selAddDriverToTeam');
  if(!sel || !sel.value) return alert('Selecciona un piloto de la lista para agregar.');
  let did = sel.value;
  if(!currentEditTeamDriverIds.includes(did)){
    currentEditTeamDriverIds.push(did);
  }
  let listEl = document.getElementById('editTeamDriversList');
  if(listEl) listEl.innerHTML = renderEditTeamDriversListHtml();
  sel.innerHTML = renderAddDriverOptionsHtml();
}

function removeDriverFromCurrentEditTeam(did){
  currentEditTeamDriverIds = currentEditTeamDriverIds.filter(id => id !== did);
  let listEl = document.getElementById('editTeamDriversList');
  if(listEl) listEl.innerHTML = renderEditTeamDriversListHtml();
  let sel = document.getElementById('selAddDriverToTeam');
  if(sel) sel.innerHTML = renderAddDriverOptionsHtml();
}

function moveDriverInCurrentEditTeam(idx, dir){
  let targetIdx = idx + dir;
  if(targetIdx < 0 || targetIdx >= currentEditTeamDriverIds.length) return;
  let temp = currentEditTeamDriverIds[idx];
  currentEditTeamDriverIds[idx] = currentEditTeamDriverIds[targetIdx];
  currentEditTeamDriverIds[targetIdx] = temp;
  let listEl = document.getElementById('editTeamDriversList');
  if(listEl) listEl.innerHTML = renderEditTeamDriversListHtml();
}

function previewEditTeamLogo(e){
  let f=e.target.files?.[0],el=document.getElementById('editTeamLogoPreview');
  if(!el||!f)return;
  el.innerHTML=`<img alt="Vista previa logo" style="max-height:48px;max-width:140px;object-fit:contain;background:transparent">`;
  let img=el.querySelector('img');
  let u=URL.createObjectURL(f);
  img.onload=()=>URL.revokeObjectURL(u);
  img.src=u;
}

async function updateTeamFromForm(id){
  let t=team(id);
  if(!t)return;
  let newName=document.getElementById('mTeamName')?.value.trim();
  if(!newName)return alert('El nombre del equipo no puede estar vacío.');
  if(isNoTeamName(newName))return alert('Nombre no permitido.');
  let oldName=t.name;
  t.name=newName;
  t.country=document.getElementById('mTeamCountry')?.value.trim()||'';
  t.bio=document.getElementById('mTeamBio')?.value.trim()||'';
  let f=document.getElementById('mTeamLogoFile')?.files?.[0];
  if(f){
    t.logo=await fileToDataURL(f);
  }

  // Update drivers
  let oldAssigned = db.drivers.filter(d => d.teamId === id || d.team === oldName);
  t.driverIds = [...currentEditTeamDriverIds];

  // Set team for assigned drivers
  t.driverIds.forEach(did => {
    let d = driver(did);
    if(d){
      d.teamId = id;
      d.team = newName;
    }
  });

  // Unset team for removed drivers
  oldAssigned.forEach(od => {
    if(!t.driverIds.includes(od.id)){
      od.teamId = null;
      od.team = '';
    }
  });

  // Update season driverTeams maps
  db.seasons.forEach(s => {
    if(s.driverTeams){
      t.driverIds.forEach(did => {
        s.driverTeams[did] = id;
      });
      oldAssigned.forEach(od => {
        if(!t.driverIds.includes(od.id) && s.driverTeams[od.id] === id){
          s.driverTeams[od.id] = null;
        }
      });
    }
  });

  closeModal();
  save();
  renderTeams();
  renderAdminTeams();
  alert(`Equipo "${newName}" y sus pilotos actualizados correctamente.`);
}

async function deleteTeam(id){
  let t=team(id);
  if(!t)return;
  let confirmed=await confirmAdminPassword(
    'Eliminar Escudería',
    `¿Estás seguro de que deseas eliminar permanentemente la escudería <b>"${esc(t.name)}"</b>?<br><br>Los pilotos que pertenecían a este equipo quedarán como pilotos independientes (sin equipo asignado).`
  );
  if(!confirmed)return;
  let tName=t.name;
  db.drivers.forEach(d=>{
    if(d.teamId===id||d.team===tName){
      d.teamId=null;
      d.team='';
    }
  });
  db.seasons.forEach(s=>{
    if(s.driverTeams){
      Object.keys(s.driverTeams).forEach(did=>{
        if(s.driverTeams[did]===id)s.driverTeams[did]=null;
      });
    }
  });
  db.races.forEach(r=>{
    (r.results||r.grid||[]).forEach(x=>{
      if(x&&x.teamId===id)x.teamId=null;
    });
  });
  db.teams=db.teams.filter(x=>x.id!==id);
  save();
  renderAdminTeams();
  alert(`Equipo "${tName}" eliminado correctamente.`);
}

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
          <label class="small muted">Categoría (obligatoria)</label>
          <select id="mSC">
            <option value="GT" ${(s._tempCategory!=null?s._tempCategory:s.category)==='GT'?'selected':''}>GT</option>
            <option value="GTP" ${(s._tempCategory!=null?s._tempCategory:s.category)==='GTP'?'selected':''}>GTP</option>
          </select>
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
                  <div class="muted small">${d.team?esc(d.team)+' · ':''}${d.number?'#'+esc(d.number):''}</div>
                </div>
                <button type="button" class="btn green" style="padding:4px 9px;font-size:11px;border-radius:6px">+ Añadir</button>
              </div>
            `).join(''):'<div class="empty" style="grid-column:1/-1;padding:15px">Todos los pilotos registrados ya forman parte de este campeonato.</div>'}
          </div>
        </div>
      `:''}

      <!-- Grid de participantes actuales -->
      <div class="participantGrid">
        ${enrolledDrivers.length?enrolledDrivers.map(d=>{
          let currentTeamId = (s.driverTeams && s.driverTeams[d.id] !== undefined) ? s.driverTeams[d.id] : (d.teamId || null);
          let teamOpts = '<option value="">(Sin equipo en este torneo)</option>' + (db.teams||[]).filter(t=>!isNoTeamName(t.name)).map(t=>`<option value="${t.id}" ${currentTeamId===t.id?'selected':''}>🏎️ ${esc(t.name)}</option>`).join('');
          return `<div class="participantCard">
            <div class="participantInfo" style="width:100%">
              ${avatar(d,'avatar')}
              <div style="overflow:hidden;flex:1">
                <div class="participantName">${esc(d.name)} ${d.number?'<span class="muted small">#'+esc(d.number)+'</span>':''}</div>
                <div style="margin-top:4px">
                  <select class="participantTeamSelect" onchange="setSeasonDriverTeam('${s.id}','${d.id}',this.value)" style="background:#090d13;color:#ffd778;border:1px solid #344052;font-size:11px;padding:3px 6px;border-radius:6px;width:100%;max-width:190px">
                    ${teamOpts}
                  </select>
                </div>
              </div>
            </div>
            <button type="button" class="removeParticipantBtn" title="Quitar del campeonato" onclick="removePilotFromSeason('${d.id}')">✕</button>
          </div>`;
        }).join(''):'<div class="empty" style="grid-column:1/-1;padding:18px">No hay pilotos inscritos en este campeonato todavía. Pulsa <b>+ Añadir piloto</b> para incorporar competidores.</div>'}
      </div>
    </div>

    <!-- Botones de guardar / cancelar -->
    <div class="toolbar" style="margin-top:20px;justify-content:flex-end">
      <button class="btn secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn" style="padding:10px 22px" onclick="updateSeason('${editingSeasonId}')">Guardar cambios</button>
    </div>
  `);
}

function setSeasonDriverTeam(seasonId, driverId, teamId){
  let s = db.seasons.find(x => x.id === seasonId);
  if(!s) return;
  if(!s.driverTeams) s.driverTeams = {};
  if(teamId && isNoTeamName(teamId)) teamId = null;
  s.driverTeams[driverId] = teamId || null;
  db.races.filter(r => r.seasonId === seasonId).forEach(r => {
    (r.results || r.grid || []).forEach(x => {
      if(x.driverId === driverId){
        x.teamId = teamId || null;
      }
    });
  });
  save();
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
        <div class="muted small">${d.team?esc(d.team)+' · ':''}${d.number?'#'+esc(d.number):''}</div>
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
  let sc=document.getElementById('mSC')?.value?.trim()||s._tempCategory||s.category||'GT';
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
  s.category=(sc==='GTP'?'GTP':'GT');
  s.desc=sd;
  s.driverIds=[...editingSeasonParticipants];

  closeModal();
  save();
  alert(`Campeonato "${s.name}" (${s.category}) actualizado correctamente (${s.driverIds.length} pilotos participantes).`);
}

async function deleteSeason(id){
  let s=db.seasons.find(x=>x.id===id);
  let name=s?.name||'este campeonato';
  let cat=s?.category||'GT';
  if(db.seasons.length===1)return alert('Debes conservar al menos una temporada.');
  let confirmed=await confirmAdminPassword(
    'Eliminar Campeonato',
    `¿Estás seguro de que deseas eliminar permanentemente el campeonato <b>"${esc(name)}"</b> [${cat}] y todas sus carreras asociadas?`
  );
  if(!confirmed)return;
  db.seasons=db.seasons.filter(x=>x.id!==id);
  db.races=db.races.filter(r=>r.seasonId!==id);
  db.drivers.forEach(d=>{if(d.seasonStats)delete d.seasonStats[id]});
  if(db.activeSeason===id)db.activeSeason=db.seasons[0]?.id||null;
  save();
  alert(`Campeonato "${name}" eliminado correctamente.`);
}

function saveChamp(){
  let a=active();
  if(!a)return alert('No hay campeonato seleccionado. Crea uno primero.');
  let rounds=Number(cfgRounds.value)||a.rounds||1;
  a.name=cfgName.value.trim()||a.name;
  a.rounds=Math.max(1,rounds);
  if(document.getElementById('cfgCategory')){
    let cat=document.getElementById('cfgCategory').value.trim();
    a.category=(cat==='GTP'?'GTP':'GT');
  }
  let newChampType = document.getElementById('cfgChampType')?.value || a.champType || 'both';
  if(newChampType !== a.champType){
    let seasonRaces = db.races.filter(r => r.seasonId === a.id);
    if(seasonRaces.length > 0){
      let typeLabels = {
        both: 'Individual + Equipos (ambas clasificaciones)',
        individual: 'Individual (solo pilotos)',
        teams: 'Por equipos (solo escuderías)'
      };
      if(!confirm(`Este campeonato ya cuenta con ${seasonRaces.length} carrera(s) registrada(s).\n\nCambiar el tipo a "${typeLabels[newChampType]}" afectará las tablas de clasificación, los podios y la coronación oficial de campeones.\n\n¿Deseas continuar?`)){
        document.getElementById('cfgChampType').value = a.champType;
        return;
      }
    }
    a.champType = newChampType;
  }
  a.desc=cfgDesc.value.trim();
  save();
  alert('Campeonato actualizado');
}

async function deleteDriver(id){
  let d=driver(id);
  if(!d)return;
  let confirmed=await confirmAdminPassword(
    'Eliminar Piloto',
    `¿Estás seguro de que deseas eliminar permanentemente al piloto <b>"${esc(d.name)}"</b>? Se removerá del sistema y de las listas de los campeonatos.`
  );
  if(!confirmed)return;
  db.drivers=db.drivers.filter(x=>x.id!==id);
  db.seasons.forEach(s=>{
    if(Array.isArray(s.driverIds))s.driverIds=s.driverIds.filter(x=>x!==id);
  });
  save();
  alert(`Piloto "${d.name}" eliminado correctamente.`);
}
function fileToDataURL(file){return new Promise((resolve,reject)=>{if(!file)return resolve('');let r=new FileReader();r.onload=()=>{let img=new Image();img.onload=()=>{let max=420,w=img.width,h=img.height;if(w>max||h>max){let k=Math.min(max/w,max/h);w=Math.max(1,Math.round(w*k));h=Math.max(1,Math.round(h*k))}let c=document.createElement('canvas');c.width=w;c.height=h;let ctx=c.getContext('2d');ctx.drawImage(img,0,0,w,h);resolve(c.toDataURL('image/jpeg',.78))};img.onerror=()=>resolve(r.result);img.src=r.result};r.onerror=reject;r.readAsDataURL(file)})}
function previewNewPhoto(e){let f=e.target.files?.[0],el=document.getElementById('newPhotoPreview');if(!el)return;if(!f){el.innerHTML='';return}el.innerHTML=`<div class="photoPreview"><span>Vista previa:</span><img alt="Vista previa"></div>`;let img=el.querySelector('img');let u=URL.createObjectURL(f);img.onload=()=>URL.revokeObjectURL(u);img.src=u}
async function addDriver(){
  let n=newName.value.trim();
  if(!n)return alert('Escribe el nombre');
  let photo=await fileToDataURL(document.getElementById('newPhotoFile').files?.[0]);
  let tid=document.getElementById('newTeamSelect')?.value||null;
  if(tid && isNoTeamName(tid)) tid=null;
  let tObj=team(tid);
  let tName=tObj?tObj.name:'';
  db.drivers.push({
    id:'d'+Date.now(),
    name:n,
    nickname:document.getElementById('newNickname').value.trim(),
    teamId:tObj?tObj.id:null,
    team:tName,
    number:newNumber.value.trim(),
    country:newCountry.value.trim(),
    photo,
    bio:newBio.value.trim(),
    career:{points:+newPoints.value||0,starts:+newStarts.value||0,wins:+newWins.value||0,podiums:+newPodiums.value||0,poles:+newPoles.value||0,titles:+newTitles.value||0},
    seasonStats:{}
  });
  ['newName','newNickname','newNumber','newCountry','newPhotoFile','newBio','newPoints','newStarts','newWins','newPodiums','newPoles','newTitles'].forEach(id=>document.getElementById(id).value='');
  if(document.getElementById('newTeamSelect'))document.getElementById('newTeamSelect').value='';
  document.getElementById('newPhotoPreview').innerHTML='';
  save();
}
async function removeDriverPhoto(id){
  let d=driver(id);
  if(!d)return;
  let confirmed=await confirmAdminPassword(
    'Eliminar Foto',
    `¿Deseas eliminar la foto de perfil del piloto <b>"${esc(d.name)}"</b>?`
  );
  if(!confirmed)return;
  d.photo='';
  let fi=document.getElementById('mPhotoFile');
  if(fi)fi.value='';
  let p=document.getElementById('editPhotoPreview');
  if(p)p.innerHTML='<span class="muted small">Sin foto</span>';
  let b=document.querySelector('#modal .btn.danger');
  if(b)b.remove();
  save();
  alert('Foto eliminada correctamente.');
}
async function updateDriverFromForm(id){
  let d=driver(id),file=document.getElementById('mPhotoFile')?.files?.[0];
  d.name=mName.value.trim()||d.name;
  d.nickname=document.getElementById('mNickname').value.trim();
  let tid=document.getElementById('mTeamSelect')?.value||null;
  if(tid && isNoTeamName(tid)) tid=null;
  let tObj=team(tid);
  d.teamId=tObj?tObj.id:null;
  d.team=tObj?tObj.name:'';
  d.number=mNumber.value.trim();
  d.country=mCountry.value.trim();
  if(file)d.photo=await fileToDataURL(file);
  d.bio=mBio.value.trim();
  d.career={
    ...d.career,
    points:+mPoints.value||0,
    starts:+mStarts.value||0,
    wins:+mWins.value||0,
    podiums:+mPodiums.value||0,
    poles:+mPoles.value||0,
    titles:+mTitles.value||0,
    gtTitles:+(document.getElementById('mGTTitles')?.value)||0,
    gtpTitles:+(document.getElementById('mGTPTitles')?.value)||0
  };
  closeModal();
  save();
  alert('Perfil actualizado. Los resultados y títulos se recalculan automáticamente.');
}

function editDriver(id){
  let d=driver(id),c=d.career||{},ss=seasonStatsFor(d,active()?.id),rk=historicalRanking().findIndex(x=>x.id===id)+1;
  let teamOpts = '<option value="">(Sin equipo habitual)</option>' + (db.teams||[]).filter(t=>!isNoTeamName(t.name)).map(t=>`<option value="${t.id}" ${(d.teamId===t.id || d.team===t.name)?'selected':''}>🏎️ ${esc(t.name)}</option>`).join('');
  openModal(`
    <button class="close" onclick="closeModal()">×</button>
    <div class="profileTop">${avatar(d,'profileHeroPhoto')}
      <div>
        <div class="eyebrow">Editar piloto</div>
        <h2 style="margin:4px 0">${esc(d.name)}</h2>
        <div class="muted">Hall of Fame: <b>${ratingFor(d)}/99</b> · RANK #${rk}</div>
      </div>
    </div>
    <div class="formrow">
      <input id="mName" value="${esc(d.name)}" placeholder="Nombre">
      <input id="mNickname" value="${esc(d.nickname||'')}" placeholder="Nickname">
      <select id="mTeamSelect">${teamOpts}</select>
      <input id="mNumber" value="${esc(d.number||'')}" placeholder="Número">
      <input id="mCountry" value="${esc(d.country||'')}" placeholder="País">
      <label class="filePicker">📷 Cambiar foto<input id="mPhotoFile" type="file" accept="image/*"></label>
      ${d.photo?`<button class="btn danger" type="button" onclick="removeDriverPhoto('${id}')">🗑 Eliminar foto</button>`:''}
    </div>
    <div class="photoSlot" id="editPhotoPreview">
      ${d.photo?avatar(d,'avatar'):'<span class="muted small">Sin foto</span>'}
    </div>
    <br>
    <textarea id="mBio" placeholder="Biografía">${esc(d.bio||'')}</textarea>
    <h3>Estadísticas históricas anteriores</h3>
    <div class="hint">Estas casillas sirven para cargar datos que existían antes de registrar las carreras en MiniZRD. Las carreras nuevas se calculan solas.</div>
    <div class="editableGrid">
      <label>Puntos<input id="mPoints" type="number" value="${c.points||0}"></label>
      <label>Salidas<input id="mStarts" type="number" value="${c.starts||0}"></label>
      <label>Victorias<input id="mWins" type="number" value="${c.wins||0}"></label>
      <label>Podios<input id="mPodiums" type="number" value="${c.podiums||0}"></label>
      <label>Poles<input id="mPoles" type="number" value="${c.poles||0}"></label>
      <label>Títulos Totales<input id="mTitles" type="number" value="${c.titles||0}"></label>
      <label>Títulos GT<input id="mGTTitles" type="number" value="${c.gtTitles||0}"></label>
      <label>Títulos GTP<input id="mGTPTitles" type="number" value="${c.gtpTitles||0}"></label>
    </div>
    ${active()?`
      <h3>${esc(active().name)} — automático desde eventos</h3>
      <div class="profileStats">
        <div class="card"><div class="statLabel">Puntos</div><div class="statValue">${ss.points}</div></div>
        <div class="card"><div class="statLabel">Victorias</div><div class="statValue">${ss.wins}</div></div>
        <div class="card"><div class="statLabel">Podios</div><div class="statValue">${ss.podiums}</div></div>
        <div class="card"><div class="statLabel">Salidas</div><div class="statValue">${ss.starts}</div></div>
      </div>
    `:''}
    <div class="toolbar"><button class="btn" onclick="updateDriverFromForm('${id}')">Guardar perfil</button></div>
  `);
}

function getDriverChampionStatus(driverId){
  let d=driver(driverId);
  if(!d) return { isGTChamp: false, isGTPChamp: false, themeClass: '', badgeHtml: '' };

  let isGTChamp=false;
  let isGTPChamp=false;

  // Check complete official championships won
  db.seasons.forEach(s=>{
    if(isSeasonComplete(s.id)){
      let champ=championOf(s.id);
      if(champ && champ.id===driverId){
        let cat=getSeasonCategory(s);
        if(cat==='GTP') isGTPChamp=true;
        else isGTChamp=true;
      }
    }
  });

  // Check career historical titles
  if(d.career?.gtTitles>0) isGTChamp=true;
  if(d.career?.gtpTitles>0) isGTPChamp=true;
  if((d.career?.titles>0) && !d.career.gtTitles && !d.career.gtpTitles){
    let cats=getDriverParticipatingCategories(driverId);
    if(cats.length===1 && cats[0]==='GTP') isGTPChamp=true;
    else isGTChamp=true;
  }

  let themeClass='';
  let badgeHtml='';
  if(isGTChamp && isGTPChamp){
    themeClass='profileChampionDiamond';
    badgeHtml='<div class="champTitleBanner champDiamond">💎 CAMPEÓN BI-CATEGORÍA (GT & GTP)</div>';
  } else if(isGTPChamp){
    themeClass='profileChampionRedDiamond';
    badgeHtml='<div class="champTitleBanner champRedDiamond">⚡ CAMPEÓN HISTÓRICO GTP</div>';
  } else if(isGTChamp){
    themeClass='profileChampionGold';
    badgeHtml='<div class="champTitleBanner champGold">🏆 CAMPEÓN HISTÓRICO GT</div>';
  }

  return { isGTChamp, isGTPChamp, themeClass, badgeHtml };
}

function getDriverBestTrack(driverId){
  let trackWins={};
  db.races.forEach(r=>{
    if(!r.trackId)return;
    let norm=normalizeRaceResults(r);
    let win=norm.find(x=>Number(x.position)===1 && x.driverId===driverId);
    if(win){
      trackWins[r.trackId]=(trackWins[r.trackId]||0)+1;
    }
  });
  let entries=Object.entries(trackWins);
  if(!entries.length) return { hasWins: false, text: 'Sin victorias registradas' };
  entries.sort((a,b)=>b[1]-a[1]);
  let maxWins=entries[0][1];
  let best=entries.filter(e=>e[1]===maxWins);
  let names=best.map(e=>{
    let t=db.tracks.find(tr=>tr.id===e[0]);
    return t?t.name:'Pista desconocida';
  }).join(' / ');
  return {
    hasWins: true,
    wins: maxWins,
    names: names,
    text: `${names} (${maxWins} victoria${maxWins===1?'':'s'})`
  };
}

function getDriverCategoryComp(driverId){
  let d=driver(driverId);
  if(!d) return null;
  let statsGT=categoryStatsFor(d,'GT');
  let statsGTP=categoryStatsFor(d,'GTP');

  if(statsGT.starts===0 || statsGTP.starts===0 || (statsGT.starts+statsGTP.starts)<2){
    return {
      hasComparison: false,
      reason: 'Requiere competir en ambas categorías (GT y GTP) para calcular comparación'
    };
  }

  let rGT=ratingFor(d,'GT');
  let rGTP=ratingFor(d,'GTP');
  let ptsGT=statsGT.starts?(statsGT.points/statsGT.starts):0;
  let ptsGTP=statsGTP.starts?(statsGTP.points/statsGTP.starts):0;

  let strGT=(rGT*0.6)+(ptsGT*2.0);
  let strGTP=(rGTP*0.6)+(ptsGTP*2.0);
  let diff=strGT-strGTP;

  let bestCat='GT';
  let score=7;
  if(Math.abs(diff)<1.5){
    bestCat='Equilibrado';
    score=10;
  }else if(diff>0){
    bestCat='GT';
    score=Math.min(10,Math.max(6,Math.round(6+Math.min(diff/4,4))));
  }else{
    bestCat='GTP';
    score=Math.min(10,Math.max(6,Math.round(6+Math.min(-diff/4,4))));
  }

  return {
    hasComparison: true,
    bestCat,
    score,
    statsGT,
    statsGTP,
    ratingGT: rGT,
    ratingGTP: rGTP
  };
}

function getDriverTrackRecords(driverId){
  let records=[];
  db.tracks.forEach(t=>{
    if(t.recordGT?.driverId===driverId && t.recordGT?.time){
      records.push({
        trackName: t.name,
        category: 'GT',
        time: t.recordGT.time
      });
    }
    if(t.recordGTP?.driverId===driverId && t.recordGTP?.time){
      records.push({
        trackName: t.name,
        category: 'GTP',
        time: t.recordGTP.time
      });
    }
  });
  return records;
}

function profile(id){
  let d=driver(id);
  if(!d)return;
  let t=totalsFor(d),ratingGeneral=ratingFor(d,'general'),rk=historicalRanking('general').findIndex(x=>x.id===id)+1;
  let hasGT=isDriverParticipatingInCategory(id,'GT');
  let hasGTP=isDriverParticipatingInCategory(id,'GTP');
  let ratingGT=hasGT?ratingFor(d,'GT'):null;
  let ratingGTP=hasGTP?ratingFor(d,'GTP'):null;

  let hist=db.seasons.map(s=>({season:s,stats:seasonStatsFor(d,s.id),rank:standings(s.id).findIndex(x=>x.id===id)+1})).filter(x=>x.stats.starts);
  
  let champStatus=getDriverChampionStatus(id);
  let bestTrack=getDriverBestTrack(id);
  let comp=getDriverCategoryComp(id);
  let cats=getDriverParticipatingCategories(id);
  let catsHtml=cats.length?cats.map(c=>getCategoryBadge(c)).join(' ')+(cats.length>1?' <span class="versatilityPill" style="font-size:11px">Ambas categorías</span>':''):'<span class="muted small">Sin participaciones oficiales</span>';
  let records=getDriverTrackRecords(id);

  openModal(`
    <button class="close" onclick="closeModal()">×</button>
    <div class="modalScroll">
      ${champStatus.badgeHtml}
      
      <div class="profileTop" style="flex-wrap:wrap; padding:16px 18px; background:linear-gradient(145deg,#191f29,#10151d); border:1px solid #ffffff0b; border-radius:18px">
        <div style="position:relative">
          ${avatar(d,'profileHeroPhoto')}
          <div style="position:absolute; bottom:-6px; right:-6px; background:#10151d; border:2px solid #344052; border-radius:10px; padding:2px 8px; font-size:16px; font-weight:1000; color:${rk===1?'#ffd778':rk===2?'#d6dde6':rk===3?'#d89b68':'#8f9aaa'}">#${rk}</div>
        </div>
        <div style="flex:1; min-width:200px">
          <div class="eyebrow">Perfil de piloto</div>
          <h2 style="margin:4px 0; font-size:26px">${esc(d.name)}</h2>
          ${(()=>{
            let curT = getTeamForDriverInSeason(id, db.activeSeason) || (d.teamId ? team(d.teamId) : null);
            let tBadge = curT ? `<span class="pill clickable" onclick="event.stopPropagation();showTeamProfile('${curT.id}')" title="Ver perfil de la escudería">🏎️ ${esc(curT.name)}</span>` : '';
            return `<div class="muted small" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              ${d.nickname ? '@' + esc(d.nickname) + ' · ' : ''}${d.country ? esc(d.country) + ' · ' : ''}${d.number ? '#' + esc(d.number) : ''}
              ${tBadge}
            </div>`;
          })()}
          <div style="display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap">
            <span class="small" style="font-weight:700">Categorías:</span>
            ${catsHtml}
          </div>
          <div class="hallMeta" style="margin-top:8px">
            <span class="pill">${t.titles} título${t.titles===1?'':'s'}</span>
            <span class="pill">${t.wins} victoria${t.wins===1?'':'s'}</span>
            <span class="pill">${t.podiums} podio${t.podiums===1?'':'s'}</span>
            <span class="pill">${t.starts} salida${t.starts===1?'':'s'}</span>
          </div>
        </div>
        <div class="profileRatingsGrid">
          <div class="profileRatingCard ovr" title="Rating General Combinado">
            <div class="profileRatingNum" style="color:#ffd778">${ratingGeneral}<span class="subtle" style="font-size:11px">/99</span></div>
            <div class="profileRatingLabel" style="color:#ffd778">RATING GENERAL</div>
          </div>
          <div class="profileRatingCard gt" title="Rendimiento exclusivo en categoría GT">
            ${hasGT?`
              <div class="profileRatingNum" style="color:#60a5fa">${ratingGT}<span class="subtle" style="font-size:11px">/99</span></div>
              <div class="profileRatingLabel" style="color:#60a5fa">RATING GT</div>
            `:`
              <div class="profileRatingInactive">No participa</div>
              <div class="profileRatingLabel" style="color:#8f9aaa">RATING GT</div>
            `}
          </div>
          <div class="profileRatingCard gtp" title="Rendimiento exclusivo en categoría GTP">
            ${hasGTP?`
              <div class="profileRatingNum" style="color:#fb923c">${ratingGTP}<span class="subtle" style="font-size:11px">/99</span></div>
              <div class="profileRatingLabel" style="color:#fb923c">RATING GTP</div>
            `:`
              <div class="profileRatingInactive">No participa</div>
              <div class="profileRatingLabel" style="color:#8f9aaa">RATING GTP</div>
            `}
          </div>
        </div>
      </div>

      <p class="muted" style="margin:12px 0">${esc(d.bio||'Sin biografía.')}</p>

      <!-- SECCIÓN: CIRCUITO CON MÁS VICTORIAS & CATEGORÍA MÁS COMPETITIVA -->
      <div class="driverFeatureGrid" style="margin-bottom:14px">
        <div class="card" style="padding:14px">
          <div class="statLabel">🏆 Circuito con más victorias</div>
          <div style="font-size:16px;font-weight:800;margin-top:4px;color:${bestTrack.hasWins?'#ffd778':'var(--muted)'}">
            ${esc(bestTrack.text)}
          </div>
          <div class="subtle" style="font-size:11px;margin-top:4px">Basado en todas las carreras oficiales del sistema</div>
        </div>

        <div class="card" style="padding:14px">
          <div class="statLabel">📊 Categoría más competitiva (1 a 10)</div>
          ${comp&&comp.hasComparison?`
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:4px">
              <div style="font-size:16px;font-weight:800">
                ${comp.bestCat==='Equilibrado'?'Rendimiento Equilibrado GT / GTP':`Dominio ${comp.bestCat}`}
              </div>
              <span class="compScoreBadge">${comp.score}/10</span>
            </div>
            <div class="compMeter" style="margin-top:6px">
              <div class="compMeterFill" style="width:${comp.score*10}%;background:${comp.bestCat==='GTP'?'var(--accent)':'var(--accent2)'}"></div>
            </div>
            <div class="subtle" style="font-size:11px;margin-top:4px">GT: Rating ${comp.ratingGT} (${comp.statsGT.wins}V/${comp.statsGT.starts}S) · GTP: Rating ${comp.ratingGTP} (${comp.statsGTP.wins}V/${comp.statsGTP.starts}S)</div>
          `:`
            <div class="muted small" style="margin-top:4px">
              ${comp?esc(comp.reason):'Datos insuficientes para comparar'}
            </div>
          `}
        </div>
      </div>

      <!-- SECCIÓN: RÉCORD DE PISTA VIGENTES (SOLO SI POSEE) -->
      ${records.length?`
        <div class="driverRecordSection" style="margin-bottom:14px">
          <div class="driverRecordTitle">🏁 Récords de Pista Vigentes</div>
          <div class="driverRecordGrid">
            ${records.map(rec=>`
              <div class="driverRecordItem">
                <div>
                  <div class="driverRecordTrack">🏁 ${esc(rec.trackName)}</div>
                  <div class="driverRecordTime">⏱️ ${esc(rec.time)}</div>
                </div>
                <div>
                  <span class="catBadge ${rec.category.toLowerCase()}">${rec.category}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `:''}

      <!-- HISTORIAL DE EQUIPOS Y ESCUDERÍAS DEL PILOTO -->
      ${(()=>{
        let teamTimeline = [];
        db.seasons.forEach(s => {
          let t = getTeamForDriverInSeason(id, s.id);
          let st = seasonStatsFor(d, s.id);
          if(t && !isNoTeamName(t.name) && st.starts > 0){
            teamTimeline.push({
              season: s,
              team: t,
              stats: st
            });
          }
        });
        if(!teamTimeline.length) return '';
        return `<div class="driverTeamTimeline" style="margin-bottom:18px">
          <h3 style="margin:0 0 10px;font-size:16px">🏎️ Historial de Equipos y Escuderías</h3>
          <div style="display:grid;gap:8px">
            ${teamTimeline.slice().reverse().map(item => `
              <div class="driverTeamTimelineItem" onclick="showTeamProfile('${item.team.id}')" style="cursor:pointer" title="Ver perfil del equipo ${esc(item.team.name)}">
                <div style="display:flex;align-items:center;gap:10px">
                  ${item.team.logo ? `<img src="${esc(item.team.logo)}" class="driverTeamTimelineLogo" onerror="this.outerHTML='<div class=&quot;driverTeamTimelineLogo fallback&quot;>${esc(initials(item.team.name))}</div>'">` : `<div class="driverTeamTimelineLogo fallback">${esc(initials(item.team.name))}</div>`}
                  <div>
                    <b style="font-size:14px">${esc(item.team.name)}</b>
                    <div class="muted small">${esc(item.season.name)} (${esc(item.season.year || '')}) ${getCategoryBadge(item.season.category)}</div>
                  </div>
                </div>
                <div class="small muted" style="text-align:right">
                  <b>${item.stats.points} pts</b> · ${item.stats.starts} salidas
                </div>
              </div>
            `).join('')}
          </div>
        </div>`;
      })()}

      <div class="profileStats">
        ${[
          ['RATING GENERAL',ratingGeneral+'/99'],
          ['RATING GT',hasGT?ratingGT+'/99':'No participa'],
          ['RATING GTP',hasGTP?ratingGTP+'/99':'No participa'],
          ['WIN RATE',t.starts?Math.round((t.wins/t.starts)*100)+'%':'0%'],
          ['PODIUM RATE',t.starts?Math.round((t.podiums/t.starts)*100)+'%':'0%'],
          ['Puntos',t.points],
          ['Victorias',t.wins],
          ['Podios',t.podiums],
          ['Salidas',t.starts],
          ['Poles',t.poles],
          ['Campeonatos',t.titles]
        ].map(x=>`<div class="card"><div class="statLabel">${x[0]}</div><div class="statValue" style="${x[0].startsWith('RATING')?'color:var(--accent2)':''}">${x[1]}</div></div>`).join('')}
      </div>

      <div class="profileHistory">
        <h3>Historial de campeonatos</h3>
        <p class="muted small">Pulsa un campeonato para abrir toda la información de esa temporada.</p>
        ${hist.length?hist.slice().reverse().map(x=>{
          let won=championOf(x.season.id)?.id===d.id;
          let cat=getSeasonCategory(x.season);
          return `<div class="seasonHistoryCard compact ${won?'champion':''}" onclick="showSeasonDetail('${id}','${x.season.id}')">
            <div class="seasonHistoryCompact">
              <div>
                <div style="display:flex;align-items:center;gap:6px">
                  <span class="eyebrow">${esc(x.season.year||'Temporada')}</span>
                  ${getCategoryBadge(cat)}
                </div>
                <div class="seasonHistoryTitle">${esc(x.season.name)}</div>
                <div class="seasonHistorySub">${x.stats.starts} salidas · ${x.stats.points} puntos ${won?'· 🏆 Campeón':''}</div>
              </div>
              <div class="seasonPosition">#${x.rank||'—'}</div>
              <div class="subtle">Ver ›</div>
            </div>
          </div>`;
        }).join(''):'<div class="empty">Sin participaciones registradas todavía.</div>'}
      </div>

      ${isAdmin?`<div class="toolbar"><button class="btn secondary" onclick="editDriver('${id}')">Editar perfil</button></div>`:''}
    </div>
  `, champStatus.themeClass);
}

function showSeasonDetail(driverId,seasonId){
  let d=driver(driverId),s=db.seasons.find(x=>x.id===seasonId);
  if(!d||!s)return;
  let st=seasonStatsFor(d,seasonId),rk=standings(seasonId).findIndex(x=>x.id===driverId)+1,won=championOf(seasonId)?.id===driverId,races=db.races.filter(r=>r.seasonId===seasonId).slice().sort((a,b)=>a.date.localeCompare(b.date)||String(a.id).localeCompare(String(a.id))),rows=races.map((r,i)=>{let rr=normalizeRaceResults(r).find(x=>x.driverId===driverId);let tr=db.tracks.find(t=>t.id===r.trackId);return rr?{round:i+1,race:r,result:rr,track:tr}:null}).filter(Boolean);
  let cat=getSeasonCategory(s);
  let sTeam=getTeamForDriverInSeason(driverId,seasonId);
  let sTeamHtml=sTeam?`<span class="pill clickable" onclick="showTeamProfile('${sTeam.id}')" style="font-size:11px" title="Ver perfil de la escudería">🏎️ ${esc(sTeam.name)}</span>`:'';
  openModal(`
    <div class="modalScroll">
      <button class="btn secondary backBtn" onclick="profile('${driverId}')">← Volver al perfil</button>
      <div class="seasonDetailHero">
        <div>
          <div style="display:flex;align-items:center;gap:6px">
            <span class="eyebrow">${esc(s.year||'Temporada')}</span>
            ${getCategoryBadge(cat)}
          </div>
          <h2 style="margin:3px 0">${esc(s.name)}</h2>
          <div class="muted" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            Historial de ${esc(d.name)}${d.nickname?' · @'+esc(d.nickname):''}
            ${sTeamHtml}
          </div>
        </div>
        <div class="seasonPosition">#${rk||'—'}</div>
      </div>
      ${won?`<div class="championBanner">🏆 CAMPEÓN DE LA TEMPORADA ${cat}</div>`:''}
      <div class="profileStats">
        <div class="card"><div class="statLabel">Puntos</div><div class="statValue">${st.points}</div></div>
        <div class="card"><div class="statLabel">Victorias</div><div class="statValue">${st.wins}</div></div>
        <div class="card"><div class="statLabel">Podios</div><div class="statValue">${st.podiums}</div></div>
        <div class="card"><div class="statLabel">Salidas</div><div class="statValue">${st.starts}</div></div>
        <div class="card"><div class="statLabel">Poles</div><div class="statValue">${st.poles}</div></div>
        <div class="card"><div class="statLabel">Pts/Salida</div><div class="statValue">${st.starts?Math.round(st.points/st.starts*10)/10:0}</div></div>
      </div>
      <div class="section">
        <h3>Resultados del campeonato</h3>
        <div class="seasonDetailRaces">
          ${rows.length?rows.map(x=>`
            <div class="seasonRaceItem">
              <div class="round">R${x.round}</div>
              <div>
                <div class="raceName">${esc(x.race.name)}</div>
                <div class="raceSub">${esc(x.track?.name||'Pista no especificada')} · ${fmt(x.race.date)}</div>
              </div>
              <div class="racePts">#${x.result.position} · ${x.result.points} pts ${x.result.pole?' · POLE':''}</div>
            </div>
          `).join(''):'<div class="empty">No hay resultados registrados de este piloto en esta temporada.</div>'}
        </div>
      </div>
    </div>
  `);
}

function getTrackStats(trackId){
  let tRaces=db.races.filter(r=>r.trackId===trackId);
  let racesCount=tRaces.length;
  let winCountsByDriver={};
  tRaces.forEach(r=>{
    let norm=normalizeRaceResults(r);
    let winnerRow=norm.find(x=>Number(x.position)===1);
    if(winnerRow){
      let did=winnerRow.driverId;
      let cat=r.category||getSeasonCategory(r.seasonId);
      if(!winCountsByDriver[did]){
        winCountsByDriver[did]={ total:0, GT:0, GTP:0, driver:driver(did) };
      }
      winCountsByDriver[did].total++;
      if(cat==='GTP') winCountsByDriver[did].GTP++;
      else winCountsByDriver[did].GT++;
    }
  });
  let winnersList=Object.values(winCountsByDriver).sort((a,b)=>b.total-a.total||(a.driver?.name||'').localeCompare(b.driver?.name||''));
  let topWinner=null;
  let topWinnersText='Sin victorias registradas';
  if(winnersList.length>0 && winnersList[0].total>0){
    let maxWins=winnersList[0].total;
    let tied=winnersList.filter(x=>x.total===maxWins);
    let names=tied.map(x=>x.driver?.name||'Piloto').join(' / ');
    topWinner={ names, wins: maxWins, drivers: tied.map(x=>x.driver) };
    topWinnersText=`${names} (${maxWins} victoria${maxWins===1?'':'s'})`;
  }
  return { racesCount, winCountsByDriver, winnersList, topWinner, topWinnersText };
}

function showTrackProfile(trackId){
  let t=db.tracks.find(x=>x.id===trackId);
  if(!t)return;
  let st=getTrackStats(trackId);
  openModal(`
    <button class="close" onclick="closeModal()">×</button>
    <div class="modalScroll">
      <div class="trackProfileHero">
        ${t.image?`<img class="trackProfilePhoto" src="${esc(t.image)}" onerror="this.outerHTML='<div class=&quot;trackProfilePhoto&quot; style=&quot;display:flex;align-items:center;justify-content:center;font-size:48px;background:#141b25&quot;>🏁</div>'">`:`<div class="trackProfilePhoto" style="display:flex;align-items:center;justify-content:center;font-size:48px;background:#141b25">🏁</div>`}
        <div style="flex:1;min-width:200px">
          <div class="eyebrow">Perfil de Pista Oficial</div>
          <h2 style="margin:4px 0;font-size:26px">${esc(t.name)}</h2>
          <div class="muted small">${t.country?'📍 '+esc(t.country)+' · ':''}${t.length?'📏 '+esc(t.length)+' · ':''}<span class="pill" style="font-weight:700">🏁 ${st.racesCount} carrera${st.racesCount===1?'':'s'} realizadas</span></div>
          <div class="trackTopWinnerCard" style="margin-top:12px">
            🏆 Piloto con más victorias: <b style="color:var(--text)">${st.topWinner?esc(st.topWinner.names):'Sin victorias registradas'}</b>
            ${st.topWinner?`<span style="margin-left:6px;color:#ffd778;font-weight:700">(${st.topWinner.wins} victoria${st.topWinner.wins===1?'':'s'})</span>`:''}
          </div>
        </div>
      </div>

      <!-- SECCIÓN INDEPENDIENTE: RÉCORDS DE PISTA GT Y GTP -->
      <div style="margin-top:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
          <h3 style="margin:0">🏁 Récords Oficiales de Pista</h3>
          <span class="subtle" style="font-size:11px">La pole position no modifica automáticamente el récord de pista</span>
        </div>
        <div class="trackRecordGrid">
          <!-- RÉCORD GT -->
          <div class="recordBox gt">
            <div class="recordHeader">
              <span class="catBadge gt">RÉCORD GT</span>
              <span class="recordTimeBadge">${t.recordGT?.time?esc(t.recordGT.time):'—'}</span>
            </div>
            ${t.recordGT?.driverId&&t.recordGT?.time?`
              <div class="recordDriverRow" onclick="profile('${t.recordGT.driverId}')" style="cursor:pointer" title="Ver perfil de ${esc(driver(t.recordGT.driverId)?.name||'')}">
                ${avatar(driver(t.recordGT.driverId),'avatar')}
                <div>
                  <b style="font-size:15px">${esc(driver(t.recordGT.driverId)?.name||'Piloto')}</b>
                  <div class="muted small">${driver(t.recordGT.driverId)?.team?esc(driver(t.recordGT.driverId).team):''}</div>
                </div>
              </div>
              <div class="recordMetaInfo">
                ${t.recordGT.championship?`<div>🏆 <b>Campeonato:</b> ${esc(t.recordGT.championship)}</div>`:''}
                ${t.recordGT.round?`<div>🏁 <b>Ronda:</b> ${esc(t.recordGT.round)}</div>`:''}
              </div>
            `:`<div class="subtle" style="padding:14px 0;text-align:center">Sin récord registrado en categoría GT</div>`}
          </div>

          <!-- RÉCORD GTP -->
          <div class="recordBox gtp">
            <div class="recordHeader">
              <span class="catBadge gtp">RÉCORD GTP</span>
              <span class="recordTimeBadge">${t.recordGTP?.time?esc(t.recordGTP.time):'—'}</span>
            </div>
            ${t.recordGTP?.driverId&&t.recordGTP?.time?`
              <div class="recordDriverRow" onclick="profile('${t.recordGTP.driverId}')" style="cursor:pointer" title="Ver perfil de ${esc(driver(t.recordGTP.driverId)?.name||'')}">
                ${avatar(driver(t.recordGTP.driverId),'avatar')}
                <div>
                  <b style="font-size:15px">${esc(driver(t.recordGTP.driverId)?.name||'Piloto')}</b>
                  <div class="muted small">${driver(t.recordGTP.driverId)?.team?esc(driver(t.recordGTP.driverId).team):''}</div>
                </div>
              </div>
              <div class="recordMetaInfo">
                ${t.recordGTP.championship?`<div>🏆 <b>Campeonato:</b> ${esc(t.recordGTP.championship)}</div>`:''}
                ${t.recordGTP.round?`<div>⚡ <b>Ronda:</b> ${esc(t.recordGTP.round)}</div>`:''}
              </div>
            `:`<div class="subtle" style="padding:14px 0;text-align:center">Sin récord registrado en categoría GTP</div>`}
          </div>
        </div>
      </div>

      <!-- HISTORIAL DE GANADORES -->
      <div style="margin-top:24px">
        <h3 style="margin:0 0 10px">🏆 Historial de Ganadores</h3>
        ${st.winnersList.length?`
          <div class="tableWrap">
            <table class="winnersTable">
              <thead>
                <tr>
                  <th>Piloto</th>
                  <th style="text-align:center">Victorias Totales</th>
                  <th>Categorías</th>
                </tr>
              </thead>
              <tbody>
                ${st.winnersList.map(w=>`
                  <tr>
                    <td>
                      <div class="driverMini" onclick="profile('${w.driver?.id}')" style="cursor:pointer">
                        ${avatar(w.driver,'avatar')}
                        <div>
                          <b>${esc(w.driver?.name||'Desconocido')}</b>
                          <span class="rankTop">${w.driver?.team?esc(w.driver.team):''}</span>
                        </div>
                      </div>
                    </td>
                    <td style="text-align:center;font-weight:900;font-size:16px;color:#ffd778">${w.total}</td>
                    <td>
                      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                        ${w.GT?`<span class="catBadge gt" title="${w.GT} victoria${w.GT===1?'':'s'} en GT">GT (${w.GT})</span>`:''}
                        ${w.GTP?`<span class="catBadge gtp" title="${w.GTP} victoria${w.GTP===1?'':'s'} en GTP">GTP (${w.GTP})</span>`:''}
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `:`<div class="empty">No hay victorias oficiales registradas en este circuito todavía.</div>`}
      </div>

      ${isAdmin?`
        <div class="toolbar" style="margin-top:20px;justify-content:flex-end">
          <button class="btn secondary" onclick="editTrack('${t.id}')">Editar Pista</button>
          <button class="btn" style="background:#1e3a8a;border-color:#3b82f6" onclick="editTrackRecordsModal('${t.id}')">⏱️ Gestionar Récords GT/GTP</button>
        </div>
      `:''}
    </div>
  `);
}

function editTrackRecordsModal(trackId){
  let t=db.tracks.find(x=>x.id===trackId);
  if(!t)return;
  let driverOptsGT='<option value="">(Sin récord)</option>'+db.drivers.map(d=>`<option value="${d.id}" ${t.recordGT?.driverId===d.id?'selected':''}>${esc(d.name)} (${esc(d.team||'')})</option>`).join('');
  let driverOptsGTP='<option value="">(Sin récord)</option>'+db.drivers.map(d=>`<option value="${d.id}" ${t.recordGTP?.driverId===d.id?'selected':''}>${esc(d.name)} (${esc(d.team||'')})</option>`).join('');

  openModal(`
    <button class="close" onclick="closeModal()">×</button>
    <h2>⏱️ Récords de Pista: ${esc(t.name)}</h2>
    <p class="muted small">Actualiza de forma manual e independiente los récords oficiales de esta pista para GT y GTP. Nota: Marcar pole en una carrera nunca altera estos datos.</p>

    <!-- FORMULARIO RÉCORD GT -->
    <div class="editSectionBox" style="border-left:4px solid #3b82f6">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span class="catBadge gt">RÉCORD GT</span>
        <b>Parámetros oficiales categoría GT</b>
      </div>
      <div class="formrow">
        <div style="flex:2;min-width:180px">
          <label class="small muted">Piloto poseedor del récord</label>
          <select id="mRecDriverGT">${driverOptsGT}</select>
        </div>
        <div style="flex:1;min-width:120px">
          <label class="small muted">Tiempo (ej. 12.345s)</label>
          <input id="mRecTimeGT" value="${esc(t.recordGT?.time||'')}" placeholder="00.000s">
        </div>
      </div>
      <div class="formrow" style="margin-top:8px">
        <div style="flex:2;min-width:180px">
          <label class="small muted">Campeonato donde se logró</label>
          <input id="mRecChampGT" value="${esc(t.recordGT?.championship||'')}" placeholder="Nombre del campeonato">
        </div>
        <div style="flex:1;min-width:120px">
          <label class="small muted">Ronda</label>
          <input id="mRecRoundGT" value="${esc(t.recordGT?.round||'')}" placeholder="Ej. Ronda 2 / Final">
        </div>
      </div>
    </div>

    <!-- FORMULARIO RÉCORD GTP -->
    <div class="editSectionBox" style="border-left:4px solid #ef4444;margin-top:14px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span class="catBadge gtp">RÉCORD GTP</span>
        <b>Parámetros oficiales categoría GTP</b>
      </div>
      <div class="formrow">
        <div style="flex:2;min-width:180px">
          <label class="small muted">Piloto poseedor del récord</label>
          <select id="mRecDriverGTP">${driverOptsGTP}</select>
        </div>
        <div style="flex:1;min-width:120px">
          <label class="small muted">Tiempo (ej. 11.890s)</label>
          <input id="mRecTimeGTP" value="${esc(t.recordGTP?.time||'')}" placeholder="00.000s">
        </div>
      </div>
      <div class="formrow" style="margin-top:8px">
        <div style="flex:2;min-width:180px">
          <label class="small muted">Campeonato donde se logró</label>
          <input id="mRecChampGTP" value="${esc(t.recordGTP?.championship||'')}" placeholder="Nombre del campeonato">
        </div>
        <div style="flex:1;min-width:120px">
          <label class="small muted">Ronda</label>
          <input id="mRecRoundGTP" value="${esc(t.recordGTP?.round||'')}" placeholder="Ej. Ronda 1 / Clasificación">
        </div>
      </div>
    </div>

    <div class="toolbar" style="margin-top:20px;justify-content:flex-end">
      <button class="btn secondary" onclick="showTrackProfile('${t.id}')">Volver al perfil</button>
      <button class="btn" onclick="saveTrackRecords('${t.id}')">Guardar récords</button>
    </div>
  `);
}

function saveTrackRecords(trackId){
  let t=db.tracks.find(x=>x.id===trackId);
  if(!t)return;
  let dGT=document.getElementById('mRecDriverGT')?.value||'';
  let tGT=document.getElementById('mRecTimeGT')?.value.trim()||'';
  let cGT=document.getElementById('mRecChampGT')?.value.trim()||'';
  let rGT=document.getElementById('mRecRoundGT')?.value.trim()||'';

  let dGTP=document.getElementById('mRecDriverGTP')?.value||'';
  let tGTP=document.getElementById('mRecTimeGTP')?.value.trim()||'';
  let cGTP=document.getElementById('mRecChampGTP')?.value.trim()||'';
  let rGTP=document.getElementById('mRecRoundGTP')?.value.trim()||'';

  t.recordGT={
    driverId: dGT,
    time: tGT,
    championship: cGT,
    round: rGT
  };
  t.recordGTP={
    driverId: dGTP,
    time: tGTP,
    championship: cGTP,
    round: rGTP
  };
  save();
  alert(`Récords de pista actualizados para ${t.name}.`);
  showTrackProfile(trackId);
}

async function addTrack(){
  let n=document.getElementById('trackName').value.trim();
  if(!n)return alert('Escribe el nombre de la pista');
  let f=document.getElementById('trackImageFile')?.files?.[0];
  let img=f?await fileToDataURL(f):'';
  db.tracks.push({
    id:'t'+Date.now(),
    name:n,
    country:document.getElementById('trackCountry').value.trim(),
    length:document.getElementById('trackLength').value.trim(),
    image:img,
    recordGT:null,
    recordGTP:null
  });
  document.getElementById('trackName').value='';
  document.getElementById('trackCountry').value='';
  document.getElementById('trackLength').value='';
  if(document.getElementById('trackRecord'))document.getElementById('trackRecord').value='';
  document.getElementById('trackImageFile').value='';
  save();
  alert('Pista agregada exitosamente');
}

function editTrack(id){
  let t=db.tracks.find(x=>x.id===id);
  if(!t)return;
  openModal(`
    <button class="close" onclick="closeModal()">×</button>
    <h2>Editar pista: ${esc(t.name)}</h2>
    <div class="formrow">
      <div style="flex:2;min-width:180px">
        <label class="small muted">Nombre del circuito</label>
        <input id="mTN" value="${esc(t.name)}" placeholder="Nombre">
      </div>
      <div style="flex:1.5;min-width:140px">
        <label class="small muted">País</label>
        <input id="mTC" value="${esc(t.country||'')}" placeholder="País">
      </div>
      <div style="flex:1.5;min-width:140px">
        <label class="small muted">Longitud / Trazado</label>
        <input id="mTL" value="${esc(t.length||'')}" placeholder="ej. 15m, 4 curvas">
      </div>
      <div style="flex:1;min-width:120px">
        <label class="small muted">Foto</label>
        <label class="filePicker">📷 Cambiar foto<input id="mTIF" type="file" accept="image/*"></label>
      </div>
    </div>
    ${t.image?`<div class="photoSlot"><img src="${esc(t.image)}" style="width:80px;height:55px;border-radius:8px;object-fit:cover"></div>`:''}
    <div class="toolbar" style="margin-top:16px;justify-content:flex-end">
      <button class="btn secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn" onclick="updateTrack('${id}')">Guardar cambios</button>
    </div>
  `);
}

async function updateTrack(id){
  let t=db.tracks.find(x=>x.id===id);
  if(!t)return;
  t.name=mTN.value.trim()||t.name;
  t.country=mTC.value.trim();
  t.length=mTL.value.trim();
  let f=document.getElementById('mTIF')?.files?.[0];
  if(f)t.image=await fileToDataURL(f);
  closeModal();
  save();
  alert('Pista actualizada correctamente');
}

async function deleteTrack(id){
  let t=db.tracks.find(x=>x.id===id);
  let name=t?.name||'esta pista';
  let confirmed=await confirmAdminPassword(
    'Eliminar Pista',
    `¿Estás seguro de que deseas eliminar permanentemente el trazado <b>"${esc(name)}"</b>?`
  );
  if(!confirmed)return;
  db.tracks=db.tracks.filter(t=>t.id!==id);
  save();
  alert(`Pista "${name}" eliminada correctamente.`);
}

function getDriverSelectOptions(selectedId='',seasonId=null){
  let sid=seasonId||document.getElementById('raceSeason')?.value||db.activeSeason;
  let s=db.seasons.find(x=>x.id===sid);
  let seasonDriverIds=s?.driverIds||[];
  let seasonList=db.drivers.filter(d=>seasonDriverIds.includes(d.id));
  let otherList=db.drivers.filter(d=>!seasonDriverIds.includes(d.id));
  let html='<option value="">Seleccionar piloto</option>';
  if(seasonList.length>0){
    html+=`<optgroup label="Pilotos del campeonato (${seasonList.length})">`+seasonList.map(d=>{
      let t=getTeamForDriverInSeason(d.id, sid);
      let tSuffix=t?` [${esc(t.name)}]`:'';
      return `<option value="${d.id}" ${d.id===selectedId?'selected':''}>${esc(d.name)}${tSuffix}</option>`;
    }).join('')+`</optgroup>`;
    if(otherList.length>0){
      html+=`<optgroup label="Otros pilotos registrados">`+otherList.map(d=>{
        let t=d.teamId?team(d.teamId):null;
        let tSuffix=t?` [${esc(t.name)}]`:'';
        return `<option value="${d.id}" ${d.id===selectedId?'selected':''}>${esc(d.name)}${tSuffix}</option>`;
      }).join('')+`</optgroup>`;
    }
  }else{
    html+=db.drivers.map(d=>`<option value="${d.id}" ${d.id===selectedId?'selected':''}>${esc(d.name)}</option>`).join('');
  }
  return html;
}

function syncRaceSeasonDrivers(){
  syncRaceSeasonRounds();
  renderAdminRaces();
  document.querySelectorAll('#gridEditor .gridDriver').forEach(sel=>{
    let currentVal=sel.value;
    sel.innerHTML=getDriverSelectOptions(currentVal);
    sel.value=currentVal;
  });
}

function addGridRow(id='',position='',points='',pole=false,fast=false){
  let div=document.createElement('div');
  div.className='raceRow';
  div.innerHTML=`<div class="racePos rowNo"></div><select class="gridDriver" onchange="syncRaceRow(this)">${getDriverSelectOptions(id)}</select><div class="teamCol muted small rowTeam">—</div><input class="gridPosition" type="number" min="1" placeholder="1" value="${position||''}" oninput="syncRacePoints(this)"><div class="gridPointsDisplay badge">${position?pointsForPosition(position,pole,fast):'—'}</div><div class="small extraText"><label title="Pole"><input type="checkbox" class="gridPole" ${pole?'checked':''} onchange="syncRacePoints(this)"> P</label></div><button class="btn danger" style="padding:7px 9px" onclick="this.parentElement.remove();renumberRaceRows()">×</button>`;
  gridEditor.appendChild(div);
  syncRaceRow(div.querySelector('.gridDriver'));
  renumberRaceRows();
}

function syncRacePoints(el){
  let row=el?.closest('.raceRow');
  if(!row)return;
  let pos=Number(row.querySelector('.gridPosition')?.value)||0;
  let pole=!!row.querySelector('.gridPole')?.checked,fast=!!row.querySelector('.gridFast')?.checked;
  row.querySelector('.gridPointsDisplay').textContent=pos?pointsForPosition(pos,pole,fast):'—';
}

function syncRaceRow(el){
  let row=el?.closest('.raceRow');
  if(!row)return;
  let d=driver(row.querySelector('select')?.value);
  row.querySelector('.rowTeam').textContent=d?.team||'—';
}

function renumberRaceRows(){
  document.querySelectorAll('#gridEditor .raceRow').forEach((r,i)=>r.querySelector('.rowNo').textContent=i+1);
}

function collectRaceRows(containerSelector='#gridEditor',modalMode=false){
  return [...document.querySelectorAll(containerSelector+' .raceRow')].map(r=>{
    let sel=modalMode?'.modalDriver':'.gridDriver',posSel=modalMode?'.modalPosition':'.gridPosition',poleSel=modalMode?'.modalPole':'.gridPole',fastSel=modalMode?'.modalFast':'.gridFast';
    let id=r.querySelector(sel).value,pos=Number(r.querySelector(posSel).value)||0,pole=r.querySelector(poleSel)?.checked||false,fast=r.querySelector(fastSel)?.checked||false;
    return id?{driverId:id,position:pos,points:pointsForPosition(pos,pole,fast),pole,fast}:null;
  }).filter(Boolean);
}

function addRace(){
  if(!active())return alert('Crea un campeonato y selecciónalo antes de registrar una carrera.');
  let name=raceName.value.trim(),results=collectRaceRows();
  if(!name||!results.length)return alert('Escribe el nombre del evento y añade al menos un piloto.');
  if(results.some(x=>!x.position))return alert('Pon la posición de cada piloto.');
  if(new Set(results.map(x=>x.driverId)).size!==results.length)return alert('No repitas un piloto en la misma carrera.');
  let trackId=document.getElementById('raceTrack')?.value||'';
  if(!trackId)return alert('Selecciona obligatoriamente la pista donde se realizó la carrera.');
  let sId=(document.getElementById('raceSeason')?.value||db.activeSeason);
  let s=db.seasons.find(x=>x.id===sId);
  let cat=s?.category||'GT';
  if(s&&Array.isArray(s.driverIds)){
    results.forEach(r=>{
      if(!s.driverIds.includes(r.driverId))s.driverIds.push(r.driverId);
    });
  }
  db.races.push({
    id:'r'+Date.now(),
    seasonId:sId,
    category:cat,
    trackId,
    name,
    date:raceDate.value||new Date().toISOString().slice(0,10),
    laps:raceLaps.value.trim(),
    notes:raceNotes.value.trim(),
    results:results.sort((a,b)=>a.position-b.position)
  });
  raceName.value=raceDate.value=raceLaps.value=raceNotes.value='';
  let roundSel=document.getElementById('raceRoundSelect');
  if(roundSel)roundSel.value='';
  document.getElementById('raceTrack').value='';
  gridEditor.innerHTML='';
  addGridRow();
  save();
  syncRaceSeasonRounds();
  renderAdminRaces();
  alert(`Resultado guardado en categoría ${cat}. Se actualizaron campeonato, pista, perfiles y Hall of Fame.`);
}

function getRaceResults(id){
  let rr=db.races.find(r=>r.id===id);
  return normalizeRaceResults(rr);
}

function loginAdmin(){
  let e=document.getElementById('adminEmail').value,p=document.getElementById('adminPass').value;
  if(!e||!p)return document.getElementById('loginError').textContent='Rellena ambos campos';
  document.getElementById('loginError').textContent='Iniciando sesión...';
  firebase.auth().signInWithEmailAndPassword(e,p).then(()=>{
    document.getElementById('loginError').textContent='';
    document.getElementById('adminEmail').value='';
    document.getElementById('adminPass').value='';
  }).catch(err=>{
    document.getElementById('loginError').textContent='Error: '+err.message;
  });
}

function logoutAdmin(){
  firebase.auth().signOut().then(()=>{
    document.getElementById('loginError').textContent='';
  });
}

function editRace(id){
  let r=db.races.find(x=>x.id===id),res=normalizeRaceResults(r);
  openModal(`
    <button class="close" onclick="closeModal()">×</button>
    <h2>Editar evento</h2>
    <div class="formrow">
      <select id="mRT">
        <option value="">Seleccionar pista obligatoria</option>
        ${db.tracks.map(t=>`<option value="${t.id}" ${t.id===r.trackId?'selected':''}>${esc(t.name)}</option>`).join('')}
      </select>
      <input id="mRN" value="${esc(r.name)}">
      <input id="mRD" type="date" value="${r.date}">
      <input id="mRL" value="${esc(r.laps||'')}" placeholder="Vueltas">
      <input id="mRO" value="${esc(r.notes||'')}" placeholder="Notas">
    </div>
    <div class="raceBuilder" style="margin-top:15px">
      <div class="raceHead">
        <div>#</div><div>Piloto</div><div class="teamCol">Equipo</div><div>Posición</div><div>Puntos</div><div>Extra</div><div></div>
      </div>
      <div id="modalGrid"></div>
    </div>
    <div class="toolbar">
      <button class="btn secondary" onclick="addModalGrid('','','',false,false,'${r.seasonId}')">+ Añadir piloto</button>
      <button class="btn" onclick="updateRace('${id}')">Guardar cambios</button>
    </div>
  `);
  res.forEach(x=>addModalGrid(x.driverId,x.position,x.points,x.pole,x.fast,r.seasonId));
}

function addModalGrid(id='',position='',points='',pole=false,fast=false,seasonId=null){
  let div=document.createElement('div');
  div.className='raceRow';
  div.innerHTML=`<div class="racePos rowNo"></div><select class="modalDriver" onchange="syncRaceRow(this)">${getDriverSelectOptions(id,seasonId)}</select><div class="teamCol muted small rowTeam">—</div><input class="modalPosition" type="number" min="1" placeholder="1" value="${position||''}" oninput="syncModalPoints(this)"><div class="modalPoints badge">${position?pointsForPosition(position,pole,fast):'—'}</div><div class="small extraText"><label><input type="checkbox" class="modalPole" ${pole?'checked':''} onchange="syncModalPoints(this)"> P</label></div><button class="btn danger" style="padding:7px 9px" onclick="this.parentElement.remove();renumberModalRows()">×</button>`;
  modalGrid.appendChild(div);
  syncRaceRow(div.querySelector('.modalDriver'));
  renumberModalRows();
}

function syncModalPoints(el){
  let row=el?.closest('.raceRow');
  if(!row)return;
  let pos=Number(row.querySelector('.modalPosition')?.value)||0,pole=!!row.querySelector('.modalPole')?.checked,fast=!!row.querySelector('.modalFast')?.checked;
  row.querySelector('.modalPoints').textContent=pos?pointsForPosition(pos,pole,fast):'—';
}

function renumberModalRows(){
  document.querySelectorAll('#modalGrid .raceRow').forEach((r,i)=>r.querySelector('.rowNo').textContent=i+1);
}

function updateRace(id){
  let r=db.races.find(x=>x.id===id),rows=collectRaceRows('#modalGrid',true);
  if(!rows.length||rows.some(x=>!x.position))return alert('Cada participante necesita piloto y posición.');
  if(new Set(rows.map(x=>x.driverId)).size!==rows.length)return alert('No repitas un piloto.');
  if(!mRT.value)return alert('Selecciona obligatoriamente la pista.');
  let s=db.seasons.find(x=>x.id===r.seasonId);
  if(s&&Array.isArray(s.driverIds)){
    rows.forEach(x=>{
      if(!s.driverIds.includes(x.driverId))s.driverIds.push(x.driverId);
    });
  }
  r.trackId=mRT.value;
  r.category=s?.category||r.category||'GT';
  r.name=mRN.value.trim()||r.name;
  r.date=mRD.value;
  r.laps=mRL.value.trim();
  r.notes=mRO.value.trim();
  r.results=rows.sort((a,b)=>a.position-b.position);
  delete r.grid;
  closeModal();
  save();
}

let pendingSecResolve = null;

function confirmAdminPassword(title, desc){
  return new Promise((resolve)=>{
    pendingSecResolve = resolve;
    let html = `
      <div class="securityModalBox">
        <div class="securityWarnIcon">⚠️</div>
        <h3 style="color:#ef4444;margin:0 0 8px 0;font-size:18px;text-transform:uppercase;letter-spacing:0.5px">${esc(title)}</h3>
        <div style="color:#cbd5e1;font-size:14px;margin-bottom:14px;line-height:1.4">${desc}</div>
        <p style="color:#94a3b8;font-size:12px;margin-bottom:12px">Esta acción es permanente e irreversible. Ingresa tu contraseña de administrador para autorizar la operación:</p>
        <input type="password" id="adminSecPassInput" class="securityModalPass" placeholder="Contraseña de administrador" autofocus onkeydown="if(event.key==='Enter')executeAdminSecConfirm()" />
        <div id="adminSecError" style="color:#f87171;font-size:12px;margin-top:6px;min-height:16px"></div>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:16px">
          <button type="button" class="btn secondary" onclick="cancelAdminSecConfirm()">Cancelar</button>
          <button type="button" class="btn danger" id="adminSecConfirmBtn" onclick="executeAdminSecConfirm()">Confirmar y Eliminar</button>
        </div>
      </div>
    `;
    openModal(html);
    setTimeout(()=>{
      let inp = document.getElementById('adminSecPassInput');
      if(inp && typeof inp.focus === 'function') inp.focus();
    }, 100);
  });
}

function cancelAdminSecConfirm(){
  if(pendingSecResolve){
    let res = pendingSecResolve;
    pendingSecResolve = null;
    res(false);
  }
  closeModal();
}

async function executeAdminSecConfirm(){
  let passInput = document.getElementById('adminSecPassInput');
  let errEl = document.getElementById('adminSecError');
  let btn = document.getElementById('adminSecConfirmBtn');
  let pass = passInput ? passInput.value : '';
  if(!pass){
    if(errEl) errEl.textContent = 'Ingresa tu contraseña de administrador.';
    return;
  }
  if(errEl) errEl.textContent = '';
  if(btn){ btn.disabled = true; btn.textContent = 'Verificando...'; }

  try {
    let user = firebase.auth().currentUser;
    if(user && user.email){
      let cred = firebase.auth.EmailAuthProvider.credential(user.email, pass);
      await user.reauthenticateWithCredential(cred);
    } else {
      if(!isAdmin){
        throw new Error('No hay una sesión activa de administrador.');
      }
      if(pass.length < 4){
        throw new Error('Contraseña demasiado corta o inválida.');
      }
    }
    
    if(pendingSecResolve){
      let res = pendingSecResolve;
      pendingSecResolve = null;
      res(true);
    }
    closeModal();
  } catch(err) {
    if(btn){ btn.disabled = false; btn.textContent = 'Confirmar y Eliminar'; }
    if(errEl){
      let msg = 'Contraseña incorrecta. Por seguridad, no se realizó ninguna acción.';
      if(err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'){
        msg = 'Contraseña incorrecta. Por seguridad, no se realizó ninguna acción.';
      } else if(err.message){
        msg = 'Error de seguridad: ' + err.message;
      }
      errEl.textContent = msg;
    }
  }
}

async function deleteRace(id){
  let r=db.races.find(x=>x.id===id);
  let name=r?.name||'este evento';
  let confirmed=await confirmAdminPassword(
    'Eliminar Carrera / Evento',
    `¿Estás seguro de que deseas eliminar permanentemente el evento <b>"${esc(name)}"</b>? Se recalcularán todos los resultados y clasificaciones.`
  );
  if(!confirmed)return;
  db.races=db.races.filter(r=>r.id!==id);
  save();
  syncRaceSeasonRounds();
  renderAdminRaces();
  alert(`Evento "${name}" eliminado correctamente.`);
}

function saveScoring(){
  let pts=pointsInput.value.split(',').map(x=>Number(x.trim())).filter(x=>!isNaN(x));
  if(!pts.length)return alert('Introduce una puntuación válida');
  db.points=pts;
  db.pole=poleBonus.checked;
  db.fast=false;
  save();
  alert('Puntuación guardada');
}

function openModal(html, extraClass=''){
  document.body.classList.add('modal-open');
  modal.innerHTML='<div class="modal" onclick="if(event.target===this)closeModal()"><div class="modalbox '+(extraClass||'')+'" onclick="event.stopPropagation()">'+html+'</div></div>';
}
function closeModal(){
  if(pendingSecResolve){
    let res=pendingSecResolve;
    pendingSecResolve=null;
    res(false);
  }
  modal.innerHTML='';
  document.body.classList.remove('modal-open');
}
function loginForm() { openModal(`<button class="close" onclick="closeModal()">×</button><h2>Admin Login</h2><p class="muted">Solo para administradores.</p><div class="formrow" style="flex-direction:column; max-width:300px"><input type="email" id="authEmail" placeholder="Correo electrónico"><input type="password" id="authPass" placeholder="Contraseña"><button class="btn" style="margin-top:10px" onclick="doLogin()">Ingresar</button></div>`); }
function doLogin() { let e = document.getElementById('authEmail').value.trim(); let p = document.getElementById('authPass').value.trim(); if(!e || !p) return alert('Ingresa correo y contraseña'); firebase.auth().signInWithEmailAndPassword(e, p).then(() => { closeModal(); }).catch(err => alert("Error: " + err.message)); }
function doLogout() { firebase.auth().signOut(); }
function exportData(){let a=document.createElement('a');a.href='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(db,null,2));a.download='minizrd-datos.json';a.click()}
function importData(e){let f=e.target.files[0];if(!f)return;let r=new FileReader();r.onload=()=>{try{db=JSON.parse(r.result);db.drivers?.forEach(d=>{if(!d.seasonStats)d.seasonStats={}});save();alert('Datos importados')}catch(x){alert('JSON inválido')}};r.readAsText(f)}
async function resetDemo(){
  let confirmed=await confirmAdminPassword(
    'Restaurar Datos Demo',
    '<b>ATENCIÓN:</b> Esto borrará todos tus datos locales y dejará MiniZRD en blanco para comenzar de cero. Esta acción es destructiva e irreversible.'
  );
  if(!confirmed)return;
  db=JSON.parse(JSON.stringify(demo));
  save();
  alert('Sistema restaurado a valores iniciales de demostración.');
}
applyTheme(localStorage.getItem('minizrd_theme')||'dark');
db.races=db.races.map((r,i)=>{let seasonId=r.seasonId||db.seasons[0]?.id;let results=(r.results||r.grid||[]).map((x,j)=>{let obj=typeof x==='string'?{driverId:x,position:j+1,pole:false,fast:false}:x;let position=Number(obj.position)||j+1;return {driverId:obj.driverId,position,pole:!!obj.pole,fast:!!obj.fast,points:pointsForPosition(position,!!obj.pole,!!obj.fast)}});return {...r,id:r.id||('r'+Date.now()+i),seasonId,trackId:r.trackId||'',results};});localStorage.setItem('minizrd_data',JSON.stringify(db));render();addGridRow();show('inicio');

function applyTheme(mode){const light=mode==='light';document.body.classList.toggle('light',light);const b=document.getElementById('themeToggle');if(b){b.textContent=light?'☀️ Claro':'🌙 Oscuro';b.title=light?'Cambiar a modo oscuro':'Cambiar a modo claro';}localStorage.setItem('minizrd_theme',light?'light':'dark')}
function toggleTheme(){applyTheme(document.body.classList.contains('light')?'dark':'light')}