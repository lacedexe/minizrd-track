const navItems=[['inicio','Inicio'],['temporadas','Temporadas'],['campeonato','Campeonato'],['ranking','Hall of Fame'],['pilotos','Pilotos'],['equipos','Equipos'],['resultados','Resultados'],['pistas','Pistas'],['admin','Admin']];
let isAdmin = false;
const firebaseConfig = { apiKey: "AIzaSyATJkyeA_gX5KLCkoUXCJbFQ7FUIagxU6I", authDomain: "minizrdlopeztrack.firebaseapp.com", databaseURL: "https://minizrdlopeztrack-default-rtdb.firebaseio.com", projectId: "minizrdlopeztrack", storageBucket: "minizrdlopeztrack.firebasestorage.app", messagingSenderId: "843618773228", appId: "1:843618773228:web:0dcd1680fc209ac105ddc9" };
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const dbRef = database.ref('minizrd_data');
const CATEGORIES={
  GT:{key:'GT',label:'GT',icon:'🏎️',className:'gt'},
  GTP:{key:'GTP',label:'GTP',icon:'⚡',className:'gtp'},
  LM_GYRO:{key:'LM_GYRO',label:'LM GYRO',icon:'🟢',className:'lmgyro'}
};
const CATEGORY_KEYS=Object.keys(CATEGORIES);
function normalizeCategory(value){let v=String(value||'GT').trim().toUpperCase().replace(/[\s-]+/g,'_');return v==='LMGYRO'||v==='LM_GYRO'?'LM_GYRO':(v==='GTP'?'GTP':'GT')}
function categoryLabel(value){return CATEGORIES[normalizeCategory(value)].label}
const demo={site:'MiniZRD',activeSeason:null,points:[25,18,15,12,10,8,6,4,2,1],pole:false,fast:false,seasons:[],drivers:[],tracks:[],races:[],teams:[]};
let savedLocal=null;try{savedLocal=JSON.parse(localStorage.getItem('minizrd_data'));}catch(e){}
let db=savedLocal&&savedLocal.seasons?savedLocal:JSON.parse(JSON.stringify(demo));
function normStats(x){return {points:+(x?.points||0),starts:+(x?.starts||0),wins:+(x?.wins||0),podiums:+(x?.podiums||0),poles:+(x?.poles||0),fast:+(x?.fast||0),titles:+(x?.titles||0),teamTitles:+(x?.teamTitles||0)} }

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
    d.career={...{points:0,starts:0,wins:0,podiums:0,poles:0,fast:0,titles:0,teamTitles:0},...(d.career||{})};
    if(!d.seasonStats)d.seasonStats={};
    if(Array.isArray(d.categories))d.categories=[...new Set(d.categories.map(normalizeCategory).filter(c=>CATEGORY_KEYS.includes(c)))];
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
    // El cargo se conserva como un dato manual del equipo. Nunca se infiere
    // a partir del orden por rendimiento y sólo puede apuntar a un piloto oficial.
    if(!t.bossDriverId || !t.driverIds.includes(t.bossDriverId)){
      t.bossDriverId = null;
    }
  });

  if(!Array.isArray(db.seasons))db.seasons=[];
  db.seasons.forEach(s=>{
    s.rounds=Number(s.rounds||0);
    if(!s.rounds)s.rounds=8;
    s.category=normalizeCategory(s.category||(s.name&&s.name.toUpperCase().includes('GTP')?'GTP':'GT'));
    if(s.image===undefined)s.image='';
    if(s.rules===undefined)s.rules=s.desc||'';
    if(!Array.isArray(s.schedule))s.schedule=[];
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
      let enrolled=driver(did);if(enrolled){if(!Array.isArray(enrolled.categories))enrolled.categories=[];if(!enrolled.categories.includes(s.category))enrolled.categories.push(s.category)}
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
    if(t.recordLMGYRO===undefined)t.recordLMGYRO=null;
    if(t.record&&!t.recordGT){
      t.recordGT={driverId:'',time:t.record,seasonName:'',round:''};
    }
  });
  if(!Array.isArray(db.races))db.races=[];
  db.races.forEach(r => {
    let s = db.seasons.find(s=>s.id===r.seasonId);
    r.category=normalizeCategory(r.category||s?.category||'GT');
    (r.results || r.grid || []).forEach(x => {
      if(x && typeof x === 'object'){
        if(x.teamId === undefined){
          x.teamId = s?.driverTeams?.[x.driverId] || driver(x.driverId)?.teamId || null;
        }
        if(x.teamId && !db.teams.some(t => t.id === x.teamId)){
          x.teamId = null;
        }
        let raceDriver=driver(x.driverId);if(raceDriver){if(!Array.isArray(raceDriver.categories))raceDriver.categories=[];if(!raceDriver.categories.includes(r.category))raceDriver.categories.push(r.category)}
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

function getDriverTeamChampionships(driverId){
  let d=driver(driverId);
  if(!d)return [];
  let list=[];
  db.seasons.forEach(s=>{
    if(s.champType==='individual')return;
    if(!isSeasonComplete(s.id))return;
    let teamChamp=championOf(s.id,'team');
    if(!teamChamp)return;

    // Verificar si el piloto pertenecía a este equipo campeón en esa temporada
    let teamInSeason=getTeamForDriverInSeason(driverId,s.id);
    let belongsToTeam=(teamInSeason&&teamInSeason.id===teamChamp.id);

    if(!belongsToTeam&&Array.isArray(teamChamp.driverIds)&&teamChamp.driverIds.includes(driverId)){
      belongsToTeam=true;
    }
    if(!belongsToTeam){
      let tObj=team(teamChamp.id);
      if(tObj&&Array.isArray(tObj.driverIds)&&tObj.driverIds.includes(driverId)){
        belongsToTeam=true;
      }
    }
    if(!belongsToTeam)return;

    // Verificar si estaba registrado como participante del campeonato o disputó carreras
    let isParticipant=Array.isArray(s.driverIds)?s.driverIds.includes(driverId):true;
    let st=seasonStatsFor(d,s.id);
    let participated=isParticipant||(st&&st.starts>0);

    if(participated){
      list.push({
        season:s,
        team:teamChamp,
        driverStats:st,
        category:s.category||'GT'
      });
    }
  });
  list.sort((a,b)=>(b.season.year||'').localeCompare(a.season.year||'')||String(b.season.id).localeCompare(String(a.season.id)));
  return list;
}

function countDriverTeamTitles(driverId,category=null){
  let list=getDriverTeamChampionships(driverId);
  if(category){
    list=list.filter(item=>(item.season.category||'GT')===category);
  }
  return list.length;
}

function totalsFor(d,category=null){
  let c=normStats(d.career);
  if(category){return categoryStatsFor(d,category);}
  db.seasons.forEach(s=>{let st=seasonStatsFor(d,s.id);c.points+=st.points;c.starts+=st.starts;c.wins+=st.wins;c.podiums+=st.podiums;c.poles+=st.poles;c.fast+=st.fast});
  c.titles=Number(d.career?.titles||0)+countTitles(d.id);
  c.teamTitles=Number(d.career?.teamTitles||0)+countDriverTeamTitles(d.id);
  return c;
}
function getSeasonDrivers(seasonId){let s=db.seasons.find(x=>x.id===seasonId);if(!s)return[];if(!Array.isArray(s.driverIds))return db.drivers;return s.driverIds.map(id=>driver(id)).filter(Boolean)}
function getSeasonStatus(s){let done=db.races.filter(r=>r.seasonId===s.id).length,rounds=Number(s.rounds)||0;if(rounds>0&&done>=rounds)return{text:'Finalizado',cls:'finalizado',icon:'🏁'};if(done>0)return{text:'En curso',cls:'enCurso',icon:'🟢'};return{text:'Próximamente',cls:'proximamente',icon:'⏳'}}
function standings(seasonId=db.activeSeason){let list=getSeasonDrivers(seasonId);return list.map(d=>({...d,_s:seasonStatsFor(d,seasonId)})).sort((a,b)=>b._s.points-a._s.points||b._s.wins-a._s.wins||b._s.podiums-a._s.podiums||b._s.starts-a._s.starts||a.name.localeCompare(b.name))}

/* Fuente única de categorías oficiales */
function getSeasonCategory(sId){let s=typeof sId==='object'?sId:db.seasons.find(x=>x.id===sId);return normalizeCategory(s?.category||'GT')}
function getCategoryBadge(cat){let c=CATEGORIES[normalizeCategory(cat)];return `<span class="catBadge ${c.className}">${c.icon} ${c.label}</span>`}
function updateCatRadioStyle(){CATEGORY_KEYS.forEach(c=>document.getElementById(`lblCat${c.replace('_','')}`)?.classList.toggle(`active-${CATEGORIES[c].className}`,document.querySelector(`input[name="seasonCategoryRadio"][value="${c}"]`)?.checked))}

/* Estadísticas Históricas y Versatilidad por Categoría */
function categoryStatsFor(d,category){
  let c={points:0,starts:0,wins:0,podiums:0,poles:0,fast:0,titles:0,teamTitles:0};
  if(category==='GT'&&d.career&&isDriverParticipatingInCategory(d.id,'GT')){
    let car=normStats(d.career);
    c.points+=car.points;c.starts+=car.starts;c.wins+=car.wins;c.podiums+=car.podiums;c.poles+=car.poles;c.fast+=car.fast;
    c.titles+=Number(d.career?.titles||0);
    c.teamTitles+=Number(d.career?.teamTitles||0);
  }
  db.seasons.filter(s=>(s.category||'GT')===category).forEach(s=>{
    let st=seasonStatsFor(d,s.id);
    c.points+=st.points;c.starts+=st.starts;c.wins+=st.wins;c.podiums+=st.podiums;c.poles+=st.poles;c.fast+=st.fast;
  });
  c.titles+=countTitles(d.id,category);
  c.teamTitles+=countDriverTeamTitles(d.id,category);
  return c;
}

function isDriverParticipatingInCategory(driverId, category){
  let d=driver(driverId);
  if(!d)return false;
  category=normalizeCategory(category);
  if(Array.isArray(d.categories)&&d.categories.map(normalizeCategory).includes(category))return true;
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
  return CATEGORY_KEYS.filter(c=>isDriverParticipatingInCategory(driverId,c));
}

function getDriverCategories(driverId){
  return getDriverParticipatingCategories(driverId);
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

function isDriverVersatile(d){return getDriverParticipatingCategories(d.id).length>1}

function ratingFor(d,category='general'){
  if(category!=='general'){
    category=normalizeCategory(category);
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
  return Math.max(0,Math.min(99,Math.round(base+titleBonus)));
}

function rawRankStats(d){let t=totalsFor(d),starts=t.starts||0;return {...t,avg:starts?t.points/starts:0,winRate:starts?t.wins/starts:0,podiumRate:starts?t.podiums/starts:0,seasons:Object.values(allSeasonStats(d)).filter(x=>x.starts>0).length}}

/* Desempeño de Piloto en Escudería (define 1.er/2.º piloto, no el Jefe de Equipo) */
function getDriverStatsInTeam(driverId, teamId){
  let stats = { points: 0, wins: 0, podiums: 0, poles: 0, fast: 0, starts: 0 };
  db.races.forEach(r => {
    let res = normalizeRaceResults(r);
    res.forEach(x => {
      if(x.driverId === driverId && x.teamId === teamId){
        stats.starts++;
        stats.points += (x.points || 0);
        if(Number(x.position) === 1) stats.wins++;
        if(Number(x.position) <= 3) stats.podiums++;
        if(x.pole) stats.poles++;
        if(x.fast) stats.fast++;
      }
    });
  });
  return stats;
}

function sortTeamDriversByPerformance(drivers, teamId){
  if(!Array.isArray(drivers)) return [];
  return [...drivers].sort((a, b) => {
    let stA = getDriverStatsInTeam(a.id, teamId);
    let stB = getDriverStatsInTeam(b.id, teamId);

    // 1. Puntos acumulados en la escudería
    if(stB.points !== stA.points) return stB.points - stA.points;
    // 2. Victorias con la escudería
    if(stB.wins !== stA.wins) return stB.wins - stA.wins;
    // 3. Podios con la escudería
    if(stB.podiums !== stA.podiums) return stB.podiums - stA.podiums;
    // 4. Poles con la escudería
    if(stB.poles !== stA.poles) return stB.poles - stA.poles;
    // 5. Salidas / carreras disputadas con la escudería
    if(stB.starts !== stA.starts) return stB.starts - stA.starts;

    // Desempates oficiales del sistema si las estadísticas en el equipo están igualadas:
    // 6. Rating histórico general
    let rA = ratingFor(a, 'general');
    let rB = ratingFor(b, 'general');
    if(rB !== rA) return rB - rA;

    // 7. Puntos históricos totales globales
    let tA = totalsFor(a);
    let tB = totalsFor(b);
    if(tB.points !== tA.points) return tB.points - tA.points;

    // 8. Orden alfabético
    return a.name.localeCompare(b.name);
  });
}

let currentRankTab='general';
function setRankCategory(cat){
  currentRankTab=cat;
  document.querySelectorAll('.rankTabBtn').forEach(b=>b.classList.remove('active'));
  if(cat==='general')document.getElementById('btnRankGeneral')?.classList.add('active');
  if(cat==='GT')document.getElementById('btnRankGT')?.classList.add('active');
  if(cat==='GTP')document.getElementById('btnRankGTP')?.classList.add('active');
  if(cat==='LM_GYRO')document.getElementById('btnRankLMGYRO')?.classList.add('active');
  if(cat==='teams')document.getElementById('btnRankTeams')?.classList.add('active');
  const sub=document.getElementById('rankSubtitle');
  const hint=document.getElementById('rankHint');
  if(cat==='general'){
    if(sub)sub.textContent='Ranking histórico general construido únicamente con rendimiento deportivo oficial, sin bonificación por cantidad de categorías.';
    if(hint)hint.innerHTML='<b>Rating 0–99:</b> evaluación automática de resultados, puntos, victorias, podios, poles y campeonatos oficiales.';
  }else if(cat==='GT'){
    if(sub)sub.textContent='Ranking histórico compuesto exclusivamente por pilotos y resultados oficiales de la categoría GT.';
    if(hint)hint.innerHTML='<b>Rating 0–99 GT:</b> Calculado exclusivamente con estadísticas y campeonatos disputados en la categoría GT.';
  }else if(cat==='GTP'){
    if(sub)sub.textContent='Ranking histórico compuesto exclusivamente por pilotos y resultados oficiales de la categoría GTP.';
    if(hint)hint.innerHTML='<b>Rating 0–99 GTP:</b> Calculado exclusivamente con estadísticas y campeonatos disputados en la categoría GTP.';
  }else if(cat==='LM_GYRO'){
    if(sub)sub.textContent='Ranking histórico compuesto exclusivamente por pilotos y resultados oficiales de LM GYRO.';
    if(hint)hint.innerHTML='<b>Rating 0–99 LM GYRO:</b> calculado exclusivamente con estadísticas y campeonatos LM GYRO.';
  }else if(cat==='teams'){
    if(sub)sub.textContent='Rendimiento histórico de equipos basado en resultados deportivos y eficiencia, no en cantidad de participaciones.';
    if(hint)hint.innerHTML='<b>Rating de equipos:</b> prioriza títulos, victorias, podios, poles y puntos oficiales.';
  }
  renderRanking();
  renderV04(active());
}

function historicalRanking(category=currentRankTab){
  if(category==='teams')category='general';
  if(category!=='general'){
    category=normalizeCategory(category);
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
function showRaceResult(id){let r=db.races.find(x=>x.id===id);if(r)openModal(`<button class="close" onclick="closeModal()">×</button>${raceCard(r,false)}`,'raceResultModal')}

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
  if (cat === 'LM_GYRO' && track?.recordLMGYRO?.time) {
    recordText = `⏱️ Récord LM GYRO: ${esc(track.recordLMGYRO.time)} s`;
  } else if (cat === 'GTP' && track?.recordGTP?.time) {
    recordText = `⏱️ Récord GTP: ${esc(track.recordGTP.time)} s`;
  } else if (cat === 'GT' && track?.recordGT?.time) {
    recordText = `⏱️ Récord GT: ${esc(track.recordGT.time)} s`;
  } else if (track?.recordGT?.time) {
    recordText = `⏱️ Récord GT: ${esc(track.recordGT.time)} s`;
  } else if (track?.recordGTP?.time) {
    recordText = `⏱️ Récord GTP: ${esc(track.recordGTP.time)} s`;
  } else if (track?.recordLMGYRO?.time) {
    recordText = `⏱️ Récord LM GYRO: ${esc(track.recordLMGYRO.time)} s`;
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
          ${track?.recordLMGYRO?.time?`<span class="catBadge lmgyro" style="font-size:10px">⏱ LM GYRO ${esc(track.recordLMGYRO.time)}</span>`:''}
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
  document.getElementById('drivers').innerHTML = db.drivers.filter(d => (d.name + ' ' + (d.team || '')).toLowerCase().includes(q)&&(driverCategoryFilter==='ALL'||isDriverParticipatingInCategory(d.id,driverCategoryFilter))).map(d => {
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
    currentDrivers = sortTeamDriversByPerformance(currentDrivers, t.id);

    let driverPills = currentDrivers.map((d, idx) => {
      let cats = getDriverCategories(d.id);
      let catBadgeHtml = cats.map(c => `<span style="font-size:9px;padding:1px 4px;border-radius:4px;background:${c==='GTP'?'rgba(234,179,8,0.2)':'rgba(59,130,246,0.2)'};color:${c==='GTP'?'#facc15':'#60a5fa'};font-weight:900;margin-left:4px">${c}</span>`).join('');
      let isBoss = (t.bossDriverId && d.id === t.bossDriverId);
      let bossTag = isBoss ? ' <span style="color:#ffd700;font-size:9px;font-weight:900">★ Jefe</span>' : '';
      return `<span class="teamDriverPill ${isBoss ? 'bossPill' : ''}" onclick="event.stopPropagation();profile('${d.id}')" title="Ver perfil de ${esc(d.name)}">${esc(d.name)}${bossTag}${catBadgeHtml}</span>`;
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
  currentDrivers = sortTeamDriversByPerformance(currentDrivers, teamId);

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
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <h3 style="margin:0;font-size:18px">👤 Pilotos Oficiales</h3>
          ${isAdmin && currentDrivers.length ? `
            <div class="teamBossAdminBar" style="display:flex;align-items:center;gap:8px;background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.25);padding:4px 10px;border-radius:8px">
              <span style="font-size:11px;font-weight:900;color:#ffd778">👑 Cargo Jefe de Equipo:</span>
              <select id="selTeamProfileBoss" style="font-size:11px;padding:3px 8px;border-radius:6px;background:#0d121c;color:#f8fafc;border:1px solid rgba(255,215,0,0.4);font-weight:700;cursor:pointer" onchange="setTeamBoss('${t.id}', this.value)">
                <option value="">-- Sin Jefe Asignado --</option>
                ${currentDrivers.map((d, i) => `
                  <option value="${d.id}" ${t.bossDriverId === d.id ? 'selected' : ''}>
                    ${i === 0 ? 'Primer Piloto' : (i === 1 ? 'Segundo Piloto' : `${i + 1}.º Piloto`)}: ${esc(d.name)}
                  </option>
                `).join('')}
              </select>
            </div>
          ` : ''}
        </div>
        ${currentDrivers.length ? `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px">
            ${currentDrivers.map((d, idx) => {
              let cats = getDriverCategories(d.id);
              let teamSt = getDriverStatsInTeam(d.id, teamId);
              let isBoss = Boolean(t.bossDriverId && d.id === t.bossDriverId);
              let bossBadge = isBoss ? '<span class="teamBossBadge">🏆 JEFE DE EQUIPO</span>' : '';
              let roleText = idx === 0 ? 'Primer Piloto' : (idx === 1 ? 'Segundo Piloto' : `${idx + 1}.º Piloto`);
              let roleBadge = `<span class="teamPilotRoleBadge ${idx === 0 ? 'p1' : (idx === 1 ? 'p2' : 'other')}">${roleText}</span>`;
              let adminToggleBtn = isAdmin ? `
                <button class="btn ${isBoss ? 'danger' : 'secondary'}" style="font-size:10px;padding:3px 8px;border-radius:6px;white-space:nowrap;margin-left:auto;${isBoss ? '' : 'border-color:rgba(255,215,0,0.4);color:#ffd778'}" onclick="event.stopPropagation();setTeamBoss('${t.id}', '${isBoss ? '' : d.id}')" title="${isBoss ? 'Quitar cargo de Jefe de Equipo' : 'Asignar como Jefe de Equipo'}">
                  ${isBoss ? '✕ Quitar Jefe' : '👑 Asignar Jefe'}
                </button>
              ` : '';
              return `<div class="teamDriverCardItem ${isBoss ? 'isTeamBoss' : ''}" onclick="profile('${d.id}')" title="Ver perfil de ${esc(d.name)}">
                ${avatar(d, 'avatar')}
                <div style="flex:1;overflow:hidden">
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                    <b>${esc(d.name)}</b>
                    ${roleBadge}
                    ${bossBadge}
                  </div>
                  <div class="muted small" style="margin-top:2px">
                    ${cats.map(c => getCategoryBadge(c)).join(' ')} · ${teamSt.points} pts con el equipo (${teamSt.starts} carr. · ${teamSt.wins} vict.)
                  </div>
                </div>
                ${adminToggleBtn}
                <div class="subtle" style="margin-left:6px">›</div>
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
            ${raceHistory.slice(0,getTeamHistoryLimit(teamId)).map(rh => {
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
          ${raceHistory.length>getTeamHistoryLimit(teamId)?`<button class="btn secondary" style="margin-top:10px" onclick="showMoreTeamHistory('${teamId}')">VER 5 MÁS</button>`:''}
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
  let teamDrivers = sortTeamDriversByPerformance(getTeamOfficialDrivers(teamId), teamId);
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
          <span class="small muted">Piloto 1:</span>
          <select style="font-size:12px;padding:4px 8px" onchange="setTeammateRivalryPilots('${teamId}', this.value, '${dB.id}')">
            ${teamDrivers.map((d, i) => `<option value="${d.id}" ${d.id===dA.id?'selected':''}>${esc(d.name)}${i===0?' [Primer Piloto]':(i===1?' [Segundo Piloto]':'')}${t.bossDriverId===d.id?' (🏆 Jefe)':''}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="small muted">Piloto 2:</span>
          <select style="font-size:12px;padding:4px 8px" onchange="setTeammateRivalryPilots('${teamId}', '${dA.id}', this.value)">
            ${teamDrivers.map((d, i) => `<option value="${d.id}" ${d.id===dB.id?'selected':''}>${esc(d.name)}${i===0?' [Primer Piloto]':(i===1?' [Segundo Piloto]':'')}${t.bossDriverId===d.id?' (🏆 Jefe)':''}</option>`).join('')}
          </select>
        </div>
      </div>`;
  }

  let indexA = teamDrivers.findIndex(d => d.id === dA.id);
  let indexB = teamDrivers.findIndex(d => d.id === dB.id);
  let isBossA = Boolean(t.bossDriverId && dA.id === t.bossDriverId);
  let isBossB = Boolean(t.bossDriverId && dB.id === t.bossDriverId);
  let roleLabelA = indexA === 0 ? 'PRIMER PILOTO' : (indexA === 1 ? 'SEGUNDO PILOTO' : `${indexA + 1}.º PILOTO`);
  let roleLabelB = indexB === 0 ? 'PRIMER PILOTO' : (indexB === 1 ? 'SEGUNDO PILOTO' : `${indexB + 1}.º PILOTO`);
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
      <!-- PILOTO A -->
      <div class="rivalryPilotCard" onclick="profile('${dA.id}')" style="cursor:pointer" title="Ver perfil de ${esc(dA.name)}">
        <div class="rivalryRoleHeader">
          <div class="rivalryRoleBadge ${roleClsA}">${roleLabelA}</div>
          ${isBossA ? '<div class="rivalryBossBadgeWrap"><span class="teamBossBadge">🏆 JEFE DE EQUIPO</span></div>' : ''}
        </div>
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

      <!-- PILOTO B -->
      <div class="rivalryPilotCard" onclick="profile('${dB.id}')" style="cursor:pointer" title="Ver perfil de ${esc(dB.name)}">
        <div class="rivalryRoleHeader">
          <div class="rivalryRoleBadge ${roleClsB}">${roleLabelB}</div>
          ${isBossB ? '<div class="rivalryBossBadgeWrap"><span class="teamBossBadge">🏆 JEFE DE EQUIPO</span></div>' : ''}
        </div>
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
  const el=document.getElementById('rankingList');
  if(!el)return;
  if(currentRankTab==='teams'){
    let teams=teamHallRanking();
    el.innerHTML=teams.length?teams.map((t,i)=>`<div class="hallCard teamHallCard" onclick="showTeamProfile('${t.id}')"><b>#${i+1}</b>${t.logo?`<img src="${esc(t.logo)}" class="avatar">`:`<div class="avatar avatarFallback">${esc(initials(t.name))}</div>`}<div><h3>${esc(t.name)}</h3><span>${t._t.titles} títulos · ${t._t.wins} victorias · ${t._t.podiums} podios · ${t._t.points} puntos</span></div><strong>${t._rating}/99</strong></div>`).join(''):'<div class="empty">No hay equipos con resultados oficiales.</div>';
    return;
  }
  let r=historicalRanking(currentRankTab);
  let displayList=r;
  el.innerHTML=displayList.length?`
  <div style="display:grid;gap:10px">
  ${displayList.map((d,i)=>{
    let cats=getDriverParticipatingCategories(d.id);
    let catBadges=cats.map(c=>getCategoryBadge(c)).join(' ');
    return `<div class="hallCard" onclick="profile('${d.id}')" style="cursor:pointer;display:grid;grid-template-columns:72px minmax(0,1fr) auto;align-items:center;gap:16px;padding:16px 18px">
      <div style="font-size:28px;font-weight:1000;text-align:center;color:${i===0?'#ffd778':i===1?'#d6dde6':i===2?'#d89b68':'#8f9aaa'}">#${i+1}</div>
      <div class="hallTop">${avatar(d)}<div><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><b style="font-size:18px">${esc(d.name)}</b>${catBadges}</div><div class="muted small">${d.nickname?'@'+esc(d.nickname)+' · ':''}${esc(d.team||'')}${d.country?' · '+esc(d.country):''}</div><div class="hallMeta"><span class="pill">${d._t.titles} título${d._t.titles===1?'':'s'}</span><span class="pill">${d._t.wins} victoria${d._t.wins===1?'':'s'}</span><span class="pill">${d._t.podiums} podio${d._t.podiums===1?'':'s'}</span><span class="pill">${d._t.starts} salida${d._t.starts===1?'':'s'}</span></div></div></div>
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
  renderV04(a);
}

function toggleAllInitialDrivers(checked){
  document.querySelectorAll('.newSeasonDriverCb').forEach(cb=>cb.checked=checked);
}

async function addSeason(){
  let n=seasonName.value.trim(),rounds=Number(seasonRounds.value)||0;
  if(!n)return alert('Escribe el nombre del campeonato');
  if(rounds<1)return alert('Indica cuántas rondas tendrá el campeonato.');
  let catEl=document.querySelector('input[name="seasonCategoryRadio"]:checked');
  let cat=catEl?catEl.value.trim():'';
  if(!cat)return alert('Debes seleccionar una categoría oficial.');
  let champType=document.getElementById('seasonChampType')?.value||'both';
  let id='s'+Date.now();
  let selectedDrivers=[...document.querySelectorAll('.newSeasonDriverCb:checked')].map(cb=>cb.value);
  let desc=seasonDesc.value.trim();
  let rules=document.getElementById('seasonRulesV04')?.value.trim()||desc;
  let image=await fileToDataURL(document.getElementById('seasonImageV04')?.files?.[0]);
  let year=seasonYear.value.trim();
  let driverTeams={};
  selectedDrivers.forEach(did=>{
    let d=driver(did);
    driverTeams[did]=(d?.teamId && db.teams.some(t=>t.id===d.teamId))?d.teamId:null;
  });
  db.seasons.push({id,name:n,year,rounds,category:normalizeCategory(cat),desc,rules,image,schedule:[],champType,driverIds:selectedDrivers,driverTeams});
  selectedDrivers.forEach(did=>{let d=driver(did);if(d){d.categories=[...new Set([...(d.categories||[]),normalizeCategory(cat)])]}});
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
  let u=URL.createObjectURL(f);
  el.innerHTML=`<div style="display:flex;align-items:center;gap:12px;margin-top:10px">
    <span class="small muted" style="font-weight:700">Vista previa recuadro:</span>
    <img src="${u}" class="teamLogo" alt="Vista previa logo" onload="URL.revokeObjectURL('${u}')">
  </div>`;
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
    bio,
    driverIds:[],
    bossDriverId:null
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
    let currentDrivers=sortTeamDriversByPerformance(getTeamOfficialDrivers(t.id), t.id);

    return `<div class="card adminDriverItem" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:12px">
        ${t.logo?`<img src="${esc(t.logo)}" class="teamLogo" style="width:84px;height:38px;border-radius:8px;padding:2px 4px" onerror="this.outerHTML='<div class=&quot;teamLogoFallback&quot; style=&quot;width:84px;height:38px;border-radius:8px;font-size:14px&quot;>${esc(initials(t.name))}</div>'">`:`<div class="teamLogoFallback" style="width:84px;height:38px;border-radius:8px;font-size:14px">${esc(initials(t.name))}</div>`}
        <div>
          <b style="font-size:15px">${esc(t.name)}</b>
          <div class="small muted">${esc(t.country||'Sin país')} · ${totals.titles} títulos · ${totals.wins} vict. · ${totals.podiums} podios · ${totals.points} pts</div>
          <div class="small muted" style="margin-top:2px">Pilotos en activo: ${currentDrivers.map((d, idx) => {
            let role = idx === 0 ? '1.er Piloto' : (idx === 1 ? '2.º Piloto' : `${idx + 1}.º Piloto`);
            let isBoss = Boolean(t.bossDriverId && d.id === t.bossDriverId);
            return `${isBoss ? `<b>${esc(d.name)}</b>` : esc(d.name)} (${role}${isBoss ? ' · 🏆 Jefe' : ''})`;
          }).join(', ')||'Ninguno'}</div>
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
let currentEditTeamBossDriverId = '';
let currentEditTeamId = '';

function setTeamBoss(teamId, driverId){
  let t = team(teamId);
  if(!t) return false;
  if(!isAdmin){
    loginForm();
    return false;
  }
  if(driverId && !getTeamOfficialDrivers(teamId).some(d => d.id === driverId)){
    alert('El Jefe de Equipo debe ser uno de los pilotos oficiales de esta escudería.');
    return false;
  }
  t.bossDriverId = driverId || null;
  save();
  showTeamProfile(teamId);
  renderTeams();
  if(document.getElementById('adminTeams')) renderAdminTeams();
  return true;
}

function editTeam(id){
  let t = team(id);
  if(!t) return;
  if(!isAdmin){
    loginForm();
    return;
  }

  // Initialize currentEditTeamDriverIds with official team drivers ordered by performance
  let currentList = sortTeamDriversByPerformance(getTeamOfficialDrivers(id), id).map(d => d.id);
  currentEditTeamId = id;
  currentEditTeamDriverIds = [...currentList];
  currentEditTeamBossDriverId = t.bossDriverId || '';

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
      <div id="editTeamLogoPreview" style="margin-top:8px">
        ${t.logo ? `
          <div style="display:flex;align-items:center;gap:12px">
            <span class="small muted" style="font-weight:700">Logo actual:</span>
            <img src="${esc(t.logo)}" class="teamLogo" alt="${esc(t.name)}">
          </div>
        ` : '<span class="muted small">Sin logo asignado</span>'}
      </div>
      <div style="margin-top:10px">
        <label class="small muted">Historia / Descripción</label>
        <textarea id="mTeamBio" placeholder="Historia, logros o descripción..." style="min-height:70px">${esc(t.bio||'')}</textarea>
      </div>

      <!-- GESTIÓN DE PILOTOS DEL EQUIPO -->
      <div class="teamDriversManageBox" style="margin-top:20px">
        <div style="margin-bottom:12px">
          <h3 style="margin:0 0 2px;font-size:16px;color:#f8fafc">👥 Pilotos Asignados a la Escudería</h3>
          <p class="muted small" style="margin:0">Los pilotos pertenecerán a esta escudería en todas las categorías donde compitan (GT / GTP). El 1.er y 2.º piloto se ordenan según estadísticas acumuladas, mientras que el cargo de Jefe de Equipo es una designación manual.</p>
        </div>

        <div id="editTeamDriversList" style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
          ${renderEditTeamDriversListHtml()}
        </div>

        <!-- ASIGNACIÓN MANUAL DE JEFE DE EQUIPO -->
        <div style="margin-bottom:14px;padding:10px 12px;background:rgba(255,215,0,0.06);border:1px solid rgba(255,215,0,0.25);border-radius:10px">
          <label class="small muted" style="font-weight:800;display:block;margin-bottom:4px;color:#ffd778">👑 ASIGNACIÓN DE JEFE DE EQUIPO (CARGO OFICIAL)</label>
          <p class="muted small" style="margin:0 0 8px">Designa cuál de los pilotos ocupa el cargo de Jefe de Equipo (independiente de quién sea el 1.er o 2.º piloto por rendimiento):</p>
          <select id="mTeamBossDriver" style="width:100%;padding:7px 10px;border-radius:8px;background:#0d1422;color:#f8fafc;border:1px solid rgba(255,255,255,0.15);font-weight:700" onchange="currentEditTeamBossDriverId=this.value;let listEl=document.getElementById('editTeamDriversList');if(listEl)listEl.innerHTML=renderEditTeamDriversListHtml()">
            ${renderEditTeamBossOptionsHtml()}
          </select>
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
  let orderedIds = currentEditTeamId
    ? sortTeamDriversByPerformance(currentEditTeamDriverIds.map(driver).filter(Boolean), currentEditTeamId).map(d => d.id)
    : [...currentEditTeamDriverIds];
  return orderedIds.map((did, idx) => {
    let d = driver(did);
    if(!d) return '';
    let cats = getDriverCategories(d.id);
    let catBadges = cats.map(c => `<span style="font-size:9px;padding:1px 4px;border-radius:4px;background:${c==='GTP'?'rgba(234,179,8,0.2)':'rgba(59,130,246,0.2)'};color:${c==='GTP'?'#facc15':'#60a5fa'};font-weight:900">${c}</span>`).join(' ');
    let isBoss = (currentEditTeamBossDriverId === did);
    let bossTag = isBoss ? '<span class="teamBossBadge" style="font-size:9px;padding:1px 6px;margin-left:4px">🏆 JEFE</span>' : '';
    let roleCls = idx === 0 ? 'p1' : (idx === 1 ? 'p2' : 'other');
    let roleLabel = idx === 0 ? '1.er Piloto' : (idx === 1 ? '2.º Piloto Oficial' : `${idx + 1}.º Piloto`);

    return `
      <div class="editTeamDriverItem ${isBoss ? 'isTeamBoss' : ''}">
        <span class="editTeamDriverRole ${roleCls}">${roleLabel}</span>
        ${avatar(d, 'avatar')}
        <div style="flex:1;overflow:hidden">
          <div style="display:flex;align-items:center;gap:6px">
            <b style="font-size:14px;color:#f8fafc">${esc(d.name)}</b>
            ${bossTag}
          </div>
          <div class="muted small" style="display:flex;align-items:center;gap:6px;margin-top:2px">
            <span>${d.country ? esc(d.country) : 'Sin país'}</span>
            ${catBadges}
          </div>
        </div>
        <div style="display:flex;gap:4px">
          <button type="button" class="btnActionMini danger" onclick="removeDriverFromCurrentEditTeam('${d.id}')" title="Quitar de este equipo">🗑️ Quitar</button>
        </div>
      </div>`;
  }).join('');
}

function renderEditTeamBossOptionsHtml(){
  let orderedIds = currentEditTeamId
    ? sortTeamDriversByPerformance(currentEditTeamDriverIds.map(driver).filter(Boolean), currentEditTeamId).map(d => d.id)
    : [...currentEditTeamDriverIds];
  return '<option value="">-- Sin Jefe de Equipo Asignado --</option>' + orderedIds.map((did, idx) => {
    let d = driver(did);
    return `<option value="${did}" ${currentEditTeamBossDriverId === did ? 'selected' : ''}>${idx === 0 ? 'Primer Piloto' : (idx === 1 ? 'Segundo Piloto' : `${idx + 1}.º Piloto`)}: ${esc(d?.name || did)}</option>`;
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
  let bossSel = document.getElementById('mTeamBossDriver');
  if(bossSel) bossSel.innerHTML = renderEditTeamBossOptionsHtml();
}

function removeDriverFromCurrentEditTeam(did){
  currentEditTeamDriverIds = currentEditTeamDriverIds.filter(id => id !== did);
  if(currentEditTeamBossDriverId === did) currentEditTeamBossDriverId = '';
  let listEl = document.getElementById('editTeamDriversList');
  if(listEl) listEl.innerHTML = renderEditTeamDriversListHtml();
  let sel = document.getElementById('selAddDriverToTeam');
  if(sel) sel.innerHTML = renderAddDriverOptionsHtml();
  let bossSel = document.getElementById('mTeamBossDriver');
  if(bossSel) bossSel.innerHTML = renderEditTeamBossOptionsHtml();
}

function previewEditTeamLogo(e){
  let f=e.target.files?.[0],el=document.getElementById('editTeamLogoPreview');
  if(!el||!f)return;
  let u=URL.createObjectURL(f);
  el.innerHTML=`<div style="display:flex;align-items:center;gap:12px">
    <span class="small muted" style="font-weight:700">Nuevo logo:</span>
    <img src="${u}" class="teamLogo" alt="Vista previa logo" onload="URL.revokeObjectURL('${u}')">
  </div>`;
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
  let bossId = document.getElementById('mTeamBossDriver')?.value || currentEditTeamBossDriverId || null;
  t.bossDriverId = (bossId && t.driverIds.includes(bossId)) ? bossId : null;

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
            <option value="LM_GYRO" ${(s._tempCategory!=null?s._tempCategory:s.category)==='LM_GYRO'?'selected':''}>LM GYRO</option>
          </select>
        </div>
      </div>
      <div style="margin-top:10px">
        <label class="small muted">Descripción breve</label>
        <textarea id="mSD" placeholder="Descripción del torneo" style="min-height:70px">${esc(s._tempDesc!=null?s._tempDesc:(s.desc||''))}</textarea>
        <label class="small muted">Reglamento</label>
        <textarea id="mSRules" placeholder="Reglamento completo" style="min-height:90px">${esc(s.rules||s.desc||'')}</textarea>
        <label class="filePicker">📷 Cambiar foto oficial<input id="mSImage" type="file" accept="image/*"></label>
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

async function updateSeason(id){
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
  s.category=normalizeCategory(sc);
  s.desc=sd;
  s.rules=document.getElementById('mSRules')?.value.trim()||s.rules||sd;
  let seasonImageFile=document.getElementById('mSImage')?.files?.[0];if(seasonImageFile)s.image=await fileToDataURL(seasonImageFile);
  s.driverIds=[...editingSeasonParticipants];
  s.driverIds.forEach(did=>{let d=driver(did);if(d)d.categories=[...new Set([...(d.categories||[]),s.category])]});

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
    a.category=normalizeCategory(cat);
    db.races.filter(r=>r.seasonId===a.id).forEach(r=>r.category=a.category);
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
function fileToDataURL(file){
  return new Promise((resolve, reject) => {
    if(!file) return resolve('');
    let r = new FileReader();
    r.onload = () => {
      let img = new Image();
      img.onload = () => {
        let max = 600, w = img.width, h = img.height;
        if(w > max || h > max){
          let k = Math.min(max / w, max / h);
          w = Math.max(1, Math.round(w * k));
          h = Math.max(1, Math.round(h * k));
        }
        let c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        let ctx = c.getContext('2d');
        let isPng = file.type === 'image/png' || (!file.type && file.name && file.name.toLowerCase().endsWith('.png'));
        if(!isPng){
          // For non-png, draw a clean background if needed or draw directly
          ctx.drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', 0.88));
        } else {
          // Preserve transparency for PNG
          ctx.drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/png'));
        }
      };
      img.onerror = () => resolve(r.result);
      img.src = r.result;
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
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
    categories:[...document.querySelectorAll('input[name="newDriverCategoryV04"]:checked')].map(x=>x.value),
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
  let selectedCategories=[...document.querySelectorAll('input[name="editDriverCategoryV04"]:checked')].map(x=>normalizeCategory(x.value));
  if(selectedCategories.length)d.categories=selectedCategories;
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
    <div class="categoryChecks"><b>Categorías oficiales</b>${CATEGORY_KEYS.map(c=>`<label><input type="checkbox" name="editDriverCategoryV04" value="${c}" ${getDriverParticipatingCategories(id).includes(c)?'checked':''}> ${categoryLabel(c)}</label>`).join('')}</div>
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
  if(!d) return { isGTChamp:false,isGTPChamp:false,isLMGYROChamp:false,themeClass:'',badgeHtml:'' };

  let isGTChamp=false;
  let isGTPChamp=false;
  let isLMGYROChamp=false;

  // Check complete official championships won
  db.seasons.forEach(s=>{
    if(isSeasonComplete(s.id)){
      let champ=championOf(s.id);
      if(champ && champ.id===driverId){
        let cat=getSeasonCategory(s);
        if(cat==='GTP')isGTPChamp=true;
        else if(cat==='LM_GYRO')isLMGYROChamp=true;
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
    else if(cats.length===1 && cats[0]==='LM_GYRO') isLMGYROChamp=true;
    else isGTChamp=true;
  }

  let themeClass='';
  let badgeHtml='';
  let wonCats=[isGTChamp&&'GT',isGTPChamp&&'GTP',isLMGYROChamp&&'LM GYRO'].filter(Boolean);
  if(wonCats.length>1){
    themeClass='profileChampionDiamond';
    badgeHtml=`<div class="champTitleBanner champDiamond">💎 CAMPEÓN MULTICATEGORÍA (${wonCats.join(' · ')})</div>`;
  } else if(isLMGYROChamp){
    themeClass='profileChampionGold';
    badgeHtml='<div class="champTitleBanner champLmGyro">🟢 CAMPEÓN HISTÓRICO LM GYRO</div>';
  } else if(isGTPChamp){
    themeClass='profileChampionRedDiamond';
    badgeHtml='<div class="champTitleBanner champRedDiamond">⚡ CAMPEÓN HISTÓRICO GTP</div>';
  } else if(isGTChamp){
    themeClass='profileChampionGold';
    badgeHtml='<div class="champTitleBanner champGold">🏆 CAMPEÓN HISTÓRICO GT</div>';
  }

  return { isGTChamp,isGTPChamp,isLMGYROChamp,themeClass,badgeHtml };
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
    if(t.recordLMGYRO?.driverId===driverId && t.recordLMGYRO?.time){
      records.push({trackName:t.name,category:'LM_GYRO',time:t.recordLMGYRO.time});
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
  let catsHtml=cats.length?cats.map(c=>getCategoryBadge(c)).join(' '):'<span class="muted small">Sin participaciones oficiales</span>';
  let records=getDriverTrackRecords(id);
  let teamTitlesList = getDriverTeamChampionships(id);
  let teamTitlesCount = teamTitlesList.length;

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
            <span class="pill" title="Campeonatos individuales ganados">🏆 ${t.titles} Camp. Indiv.</span>
            <span class="pill" title="Campeonatos en equipo ganados">🏎️ ${teamTitlesCount} Camp. en Equipo</span>
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

      <!-- SECCIÓN: CAMPEONATOS EN EQUIPO DEL PILOTO -->
      <div class="driverTeamChampsSection" style="margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;flex-wrap:wrap">
          <h3 style="margin:0;font-size:16px;display:flex;align-items:center;gap:8px">
            🏎️🏆 Campeonatos en Equipo
            <span class="teamChampCountBadge ${teamTitlesCount>0?'':'zero'}">${teamTitlesCount}</span>
          </h3>
          <span class="small muted">Títulos oficiales ganados por escudería</span>
        </div>
        ${teamTitlesList.length ? `
          <div class="teamChampsGrid">
            ${teamTitlesList.map(item => `
              <div class="teamChampCard">
                <div class="teamChampTrophyWrap">
                  <div class="teamChampTrophyIcon">🏆</div>
                  <div class="teamChampRoleTag">CAMPEÓN</div>
                </div>
                <div class="teamChampCardBody">
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                    <span class="eyebrow">${esc(item.season.year || 'Temporada')}</span>
                    ${getCategoryBadge(item.category)}
                  </div>
                  <div class="teamChampSeasonName" title="${esc(item.season.name)}">${esc(item.season.name)}</div>
                  <div class="teamChampTeamInfo" onclick="showTeamProfile('${item.team.id}')" style="cursor:pointer" title="Ver perfil de la escudería ${esc(item.team.name)}">
                    ${item.team.logo ? `<img src="${esc(item.team.logo)}" class="teamChampTeamLogo" onerror="this.outerHTML='<div class=&quot;teamChampTeamLogo fallback&quot;>${esc(initials(item.team.name))}</div>'">` : `<div class="teamChampTeamLogo fallback">${esc(initials(item.team.name))}</div>`}
                    <div style="min-width:0">
                      <span class="teamChampTeamLabel">Escudería Campeona</span>
                      <div class="teamChampTeamName">🏎️ ${esc(item.team.name)}</div>
                    </div>
                  </div>
                  <div class="teamChampDriverStats muted small">
                    Participación: <b>${item.driverStats?.points || 0} pts</b> en ${item.driverStats?.starts || 0} carreras ${item.driverStats?.wins ? `· 🥇 ${item.driverStats.wins} vic.` : ''}
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="card" style="padding:14px 16px;text-align:center;background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.08);border-radius:12px">
            <span class="muted small">Este piloto no posee campeonatos por equipos registrados todavía.</span>
          </div>
        `}
      </div>

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
          ['Camp. Individuales',t.titles],
          ['Camp. en Equipo',teamTitlesCount]
        ].map(x=>`<div class="card"><div class="statLabel">${x[0]}</div><div class="statValue" style="${x[0].startsWith('RATING')?'color:var(--accent2)':(x[0].startsWith('Camp.')?'color:#ffd778':'')}">${x[1]}</div></div>`).join('')}
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
        winCountsByDriver[did]={total:0,GT:0,GTP:0,LM_GYRO:0,driver:driver(did)};
      }
      winCountsByDriver[did].total++;
      winCountsByDriver[did][normalizeCategory(cat)]++;
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
  t.recordLMGYRO={driverId:document.getElementById('mRecDriverLMGYRO')?.value||'',time:document.getElementById('mRecTimeLMGYRO')?.value.trim()||'',championship:document.getElementById('mRecChampLMGYRO')?.value.trim()||'',round:document.getElementById('mRecRoundLMGYRO')?.value.trim()||''};
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
    recordGTP:null,
    recordLMGYRO:null
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
    round:Number(document.getElementById('raceRoundSelect')?.value)||null,
    name,
    date:raceDate.value||new Date().toISOString().slice(0,10),
    laps:raceLaps.value.trim(),
    notes:raceNotes.value.trim(),
    results:results.sort((a,b)=>a.position-b.position)
  });
  results.forEach(x=>{let d=driver(x.driverId);if(d)d.categories=[...new Set([...(d.categories||[]),normalizeCategory(cat)])]});
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

/* =========================================================
   ACTUALIZACIÓN 0.4 — VISTAS DERIVADAS DE DATOS OFICIALES
   ========================================================= */
let driverCategoryFilter='ALL';
let teamHistoryLimits={};
let newsCategoryFilter='ALL';
let newsSlideIndex=0;
let currentResultsView='official';
function getTeamHistoryLimit(teamId){return teamHistoryLimits[teamId]||5}
function showMoreTeamHistory(teamId){teamHistoryLimits[teamId]=getTeamHistoryLimit(teamId)+5;showTeamProfile(teamId)}
function setDriverCategoryFilter(category){driverCategoryFilter=category;document.querySelectorAll('[data-driver-category]').forEach(b=>b.classList.toggle('active',b.dataset.driverCategory===category));renderDrivers()}

function getDriverTimeline(driverId){
  return db.seasons.filter(s=>isSeasonComplete(s.id)).map(s=>{
    let st=seasonStatsFor(driver(driverId),s.id),rank=standings(s.id).findIndex(x=>x.id===driverId)+1;
    if(!st.starts||!rank)return null;
    let result=rank===1?'🏆 Campeón':rank===2?'🥈 Subcampeón':`${rank}.º lugar`;
    return {year:s.year||'',name:s.name,category:getSeasonCategory(s),rank,result};
  }).filter(Boolean).sort((a,b)=>String(b.year).localeCompare(String(a.year))||a.rank-b.rank);
}
function getDriverRecentForm(driverId,category=null){
  let cat=category&&category!=='general'?normalizeCategory(category):null;
  return db.races.filter(r=>(!cat||normalizeCategory(r.category||getSeasonCategory(r.seasonId))===cat)&&normalizeRaceResults(r).some(x=>x.driverId===driverId)).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.id).localeCompare(String(a.id))).slice(0,5).map(r=>{let result=normalizeRaceResults(r).find(x=>x.driverId===driverId);return {race:r,position:Number(result.position),category:normalizeCategory(r.category||getSeasonCategory(r.seasonId))}});
}
function getDriverStrengths(driverId){
  let d=driver(driverId);return getDriverParticipatingCategories(driverId).map(category=>{let st=categoryStatsFor(d,category),rating=ratingFor(d,category),avg=st.starts?st.points/st.starts:0;return {category,score:Math.max(1,Math.min(10,Math.round((rating/99)*7+Math.min(3,avg/10)))),rating,stats:st}}).sort((a,b)=>b.score-a.score||b.rating-a.rating);
}
function enhanceDriverProfileV04(driverId){
  let box=document.querySelector('#modal .modalbox');if(!box)return;
  box.querySelectorAll('.profileRatingInactive').forEach(x=>x.closest('.profileRatingCard')?.remove());
  box.querySelectorAll('.profileStats .card').forEach(x=>{if(x.querySelector('.statValue')?.textContent.trim()==='No participa')x.remove()});
  box.querySelectorAll('.statLabel').forEach(x=>{if(x.textContent.includes('Categoría más competitiva'))x.closest('.card')?.remove()});
  let d=driver(driverId),cats=getDriverParticipatingCategories(driverId);
  if(cats.includes('LM_GYRO')){let grid=box.querySelector('.profileRatingsGrid');if(grid&&!grid.querySelector('.lmgyro'))grid.insertAdjacentHTML('beforeend',`<div class="profileRatingCard lmgyro"><div class="profileRatingNum">${ratingFor(d,'LM_GYRO')}<span class="subtle">/99</span></div><div class="profileRatingLabel">RATING LM GYRO</div></div>`)}
  let strengths=getDriverStrengths(driverId),timeline=getDriverTimeline(driverId),forms=cats.map(category=>({category,items:getDriverRecentForm(driverId,category)})).filter(x=>x.items.length);
  let section=document.createElement('div');section.className='v04ProfileSections';section.innerHTML=`
    <div class="card"><div class="eyebrow">Dónde es más fuerte</div><div class="strengthList">${strengths.length?strengths.map(x=>`<div>${getCategoryBadge(x.category)}<b>${x.score}/10</b><span class="muted">Rating ${x.rating} · ${x.stats.wins} victorias / ${x.stats.starts} carreras</span></div>`).join(''):'<span class="muted">Sin datos deportivos suficientes.</span>'}</div></div>
    <div class="card"><div class="eyebrow">Timeline del piloto</div>${timeline.length?timeline.map(x=>`<div class="timelineRow"><b>${esc(x.year||'Temporada')}</b><span>${esc(x.result)} · ${categoryLabel(x.category)} · ${esc(x.name)}</span></div>`).join(''):'<div class="muted">Todavía no tiene campeonatos finalizados.</div>'}</div>
    <div class="card"><div class="eyebrow">Form — últimas 5 carreras</div>${forms.length?forms.map(group=>`<div class="formGroup">${getCategoryBadge(group.category)}<div class="formResults">${group.items.map(x=>`<span class="formPos ${x.position<=3?'good':x.position<=5?'mid':'bad'}">${x.position}.º</span>`).join('')}</div><div class="muted small">Forma actual: ${group.items.filter(x=>x.position<=3).length} podios / ${group.items.length} carreras</div></div>`).join(''):'<div class="muted">Sin carreras oficiales registradas.</div>'}</div>`;
  let scroll=box.querySelector('.modalScroll')||box;scroll.appendChild(section);
}

function getTeamPerformanceExplanation(teamId){
  let ds=sortTeamDriversByPerformance(getTeamOfficialDrivers(teamId),teamId);if(ds.length<2)return 'Se necesitan dos pilotos oficiales para explicar el orden interno.';
  let a=getDriverStatsInTeam(ds[0].id,teamId),b=getDriverStatsInTeam(ds[1].id,teamId),reasons=[];
  if(a.points>b.points)reasons.push(`${a.points} puntos frente a ${b.points}`);if(a.wins>b.wins)reasons.push(`${a.wins} victorias`);if(a.podiums>b.podiums)reasons.push(`${a.podiums} podios`);if(a.poles>b.poles)reasons.push(`${a.poles} poles`);
  return `${ds[0].name} aparece como primer piloto por ${reasons.slice(0,3).join(', ')||'los criterios oficiales de desempate y su rating histórico'}. El cargo de jefe de equipo se asigna por separado.`;
}

function teamHallRanking(){return (db.teams||[]).map(t=>{let s=teamHistoricalTotals(t.id),titles=Number(s.titles||0),races=Number(s.races||0);let score=titles*30+Number(s.wins||0)*8+Number(s.podiums||0)*3+Number(s.poles||0)*2+(races?Number(s.points||0)/races:0);return {...t,_t:s,_rating:Math.min(99,Math.round(score))}}).sort((a,b)=>b._rating-a._rating||b._t.titles-a._t.titles||b._t.wins-a._t.wins)}
function calculateBestDuo(category=currentRankTab){
  let cat=category==='general'||category==='teams'?'general':normalizeCategory(category),pool=db.drivers.filter(d=>cat==='general'||isDriverParticipatingInCategory(d.id,cat)),best=null;
  for(let i=0;i<pool.length;i++)for(let j=i+1;j<pool.length;j++){let a=pool[i],b=pool[j],ra=ratingFor(a,cat),rb=ratingFor(b,cat),score=(ra+rb)/2;if(!best||score>best.score)best={a,b,score,category:cat}}
  return best;
}
function calculateHallRecords(){
  let totals=db.drivers.map(d=>({d,t:totalsFor(d)}));let leader=key=>totals.slice().sort((a,b)=>b.t[key]-a.t[key])[0];
  let seasonPoints=[];db.seasons.forEach(s=>standings(s.id).forEach(d=>seasonPoints.push({d,mark:d._s.points,season:s})));
  let streak=(field)=>{let best={mark:0,d:null,category:null,date:''};CATEGORY_KEYS.forEach(cat=>db.drivers.forEach(d=>{let current=0;db.races.filter(r=>normalizeCategory(r.category||getSeasonCategory(r.seasonId))===cat).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).forEach(r=>{let x=normalizeRaceResults(r).find(v=>v.driverId===d.id),ok=field==='wins'?x&&x.position===1:x&&x.pole;current=ok?current+1:0;if(current>best.mark)best={mark:current,d,category:cat,date:r.date}})}));return best};
  let trackBest={mark:0,d:null,track:null,category:null};db.tracks.forEach(t=>CATEGORY_KEYS.forEach(cat=>db.drivers.forEach(d=>{let mark=db.races.filter(r=>r.trackId===t.id&&normalizeCategory(r.category||getSeasonCategory(r.seasonId))===cat&&normalizeRaceResults(r).some(x=>x.driverId===d.id&&x.position===1)).length;if(mark>trackBest.mark)trackBest={mark,d,track:t,category:cat}})));
  let sp=seasonPoints.sort((a,b)=>b.mark-a.mark)[0],ws=streak('wins'),ps=streak('poles');return [
    ['Más campeonatos',leader('titles')?.d,leader('titles')?.t.titles],['Más poles',leader('poles')?.d,leader('poles')?.t.poles],['Más victorias',leader('wins')?.d,leader('wins')?.t.wins],['Más podios',leader('podiums')?.d,leader('podiums')?.t.podiums],['Más puntos en una temporada',sp?.d,sp?.mark,sp?.season?.category,sp?.season?.name],['Más victorias consecutivas',ws.d,ws.mark,ws.category,ws.date],['Más poles consecutivas',ps.d,ps.mark,ps.category,ps.date],['Más victorias en una pista',trackBest.d,trackBest.mark,trackBest.category,trackBest.track?.name]
  ];
}

function sortOfficialRaces(list=db.races){return list.slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.id).localeCompare(String(b.id)))}
function raceStandingsSnapshot(seasonId,lastRaceIndex){
  let seasonRaces=sortOfficialRaces(db.races.filter(r=>r.seasonId===seasonId)),scores={};
  getSeasonDrivers(seasonId).forEach(d=>scores[d.id]={driver:d,points:0,wins:0,podiums:0,starts:0});
  seasonRaces.slice(0,Math.max(0,lastRaceIndex+1)).forEach(r=>normalizeRaceResults(r).forEach(x=>{let row=scores[x.driverId]||(scores[x.driverId]={driver:driver(x.driverId),points:0,wins:0,podiums:0,starts:0});row.points+=Number(x.points||0);row.starts++;if(x.position===1)row.wins++;if(x.position<=3)row.podiums++}));
  return Object.values(scores).filter(x=>x.driver&&x.starts).sort((a,b)=>b.points-a.points||b.wins-a.wins||b.podiums-a.podiums||a.driver.name.localeCompare(b.driver.name));
}
function consecutiveRaceMark(race,driverId,field){
  let cat=normalizeCategory(race.category||getSeasonCategory(race.seasonId)),series=sortOfficialRaces(db.races.filter(r=>normalizeCategory(r.category||getSeasonCategory(r.seasonId))===cat)),idx=series.findIndex(r=>r.id===race.id),count=0;
  for(let i=idx;i>=0;i--){let x=normalizeRaceResults(series[i]).find(v=>v.driverId===driverId),ok=field==='win'?x?.position===1:!!x?.pole;if(!ok)break;count++}
  return count;
}
const NEWS_CATEGORIES={
  carreras:{key:'carreras',label:'Carreras',icon:'🏁'},
  campeonatos:{key:'campeonatos',label:'Campeonatos',icon:'🏆'},
  pilotos:{key:'pilotos',label:'Pilotos',icon:'👤'},
  equipos:{key:'equipos',label:'Equipos',icon:'🏎️'},
  estadisticas:{key:'estadisticas',label:'Estadísticas',icon:'📊'},
  anuncios:{key:'anuncios',label:'Anuncios',icon:'📢'}
};
function getNewsCategoryByType(type){
  if(['win','first-win','win-streak'].includes(type))return 'carreras';
  if(['champion','new-leader'].includes(type))return 'campeonatos';
  if(['first-pole','pole-streak','climb','drop'].includes(type))return 'pilotos';
  if(['team-leader','team-double','team-win','team-champion'].includes(type))return 'equipos';
  if(['record','best-duo','milestone'].includes(type))return 'estadisticas';
  if(['next-race','announcement','rules'].includes(type))return 'anuncios';
  return 'carreras';
}
function makeNewsItem(type,priority,race,d,title,excerpt,facts=[],extra={}){
  let season=extra.season||(race?.seasonId?db.seasons.find(s=>s.id===race.seasonId):null),
      track=extra.track||(race?.trackId?db.tracks.find(t=>t.id===race.trackId):null),
      cat=normalizeCategory(extra.cat||race?.category||season?.category||'GT'),
      category=extra.category||getNewsCategoryByType(type);
  return {
    id:extra.id||`${race?.id||'event'}_${type}_${d?.id||extra.team?.id||'general'}`,
    type,
    category,
    priority,
    race,
    d,
    team:extra.team||null,
    season,
    track,
    cat,
    date:extra.date||race?.date||new Date().toISOString().slice(0,10),
    title,
    excerpt,
    facts,
    image:extra.image||season?.image||track?.image||d?.photo||extra.team?.logo||'',
    body:extra.body||''
  };
}
function automaticNews(){
  let items=[],recent=sortOfficialRaces(db.races).slice(-14).reverse();
  recent.forEach(r=>{
    let results=normalizeRaceResults(r).sort((a,b)=>a.position-b.position),winnerRow=results.find(x=>x.position===1),poleRow=results.find(x=>x.pole),winner=driver(winnerRow?.driverId),cat=normalizeCategory(r.category||getSeasonCategory(r.seasonId)),catRaces=sortOfficialRaces(db.races.filter(x=>normalizeCategory(x.category||getSeasonCategory(x.seasonId))===cat)),raceIndex=catRaces.findIndex(x=>x.id===r.id),before=catRaces.slice(0,raceIndex);
    if(winner){
      let previousWins=before.filter(x=>normalizeRaceResults(x).some(v=>v.driverId===winner.id&&v.position===1)).length,streak=consecutiveRaceMark(r,winner.id,'win'),trackWinsBefore=before.filter(x=>x.trackId===r.trackId&&normalizeRaceResults(x).some(v=>v.driverId===winner.id&&v.position===1)).length;
      if(previousWins===0)items.push(makeNewsItem('first-win',96,r,winner,`${winner.name} estrena su cuenta de victorias en ${categoryLabel(cat)}`,`El triunfo en ${r.name} es su primera victoria oficial registrada en la categoría.`,[`Resultado: 1.º lugar`,`${winnerRow.points} puntos`,r.trackId?`Primera victoria en ${db.tracks.find(t=>t.id===r.trackId)?.name||'esta pista'}`:'']));
      else if(streak>=2)items.push(makeNewsItem('win-streak',92,r,winner,`${winner.name} extiende su racha a ${streak} victorias consecutivas`,`${r.name} confirma el momento dominante del piloto en ${categoryLabel(cat)}.`,[`Racha vigente: ${streak} victorias`, `Victorias previas en la categoría: ${previousWins}`,`${winnerRow.points} puntos en la ronda`]));
      else items.push(makeNewsItem('win',62,r,winner,`${winner.name} se impone en ${r.name}`,`Victoria oficial en ${categoryLabel(cat)} con ${winnerRow.points} puntos.`,[`Resultado: 1.º lugar`,trackWinsBefore?`Victorias previas en esta pista: ${trackWinsBefore}`:'Primera victoria registrada en esta pista']));
    }
    if(poleRow){let poleDriver=driver(poleRow.driverId),previousPoles=before.filter(x=>normalizeRaceResults(x).some(v=>v.driverId===poleDriver?.id&&v.pole)).length,poleStreak=consecutiveRaceMark(r,poleDriver?.id,'pole');if(poleDriver&&(previousPoles===0||poleStreak>=2))items.push(makeNewsItem(previousPoles===0?'first-pole':'pole-streak',previousPoles===0?82:78,r,poleDriver,previousPoles===0?`${poleDriver.name} firma su primera pole en ${categoryLabel(cat)}`:`${poleDriver.name} encadena ${poleStreak} poles`,`${r.name} suma una nueva referencia de clasificación a su historial.`,[`Pole oficial`,previousPoles?`Poles anteriores: ${previousPoles}`:'Primera pole registrada']))}
    let seasonRaces=sortOfficialRaces(db.races.filter(x=>x.seasonId===r.seasonId)),idx=seasonRaces.findIndex(x=>x.id===r.id),pre=raceStandingsSnapshot(r.seasonId,idx-1),post=raceStandingsSnapshot(r.seasonId,idx),oldLeader=pre[0]?.driver,newLeader=post[0]?.driver;
    if(newLeader&&oldLeader&&newLeader.id!==oldLeader.id)items.push(makeNewsItem('new-leader',90,r,newLeader,`${newLeader.name} toma el liderato del campeonato`,`El resultado de ${r.name} cambia la primera posición de la clasificación de ${categoryLabel(cat)}.`,[`Nuevo líder: ${post[0].points} puntos`,`Anterior líder: ${oldLeader.name}`]));
    if(newLeader&&isSeasonComplete(r.seasonId)&&idx===seasonRaces.length-1)items.push(makeNewsItem('champion',110,r,newLeader,`${newLeader.name} es campeón de ${db.seasons.find(s=>s.id===r.seasonId)?.name||categoryLabel(cat)}`,`La clasificación final confirma el título después de ${seasonRaces.length} rondas oficiales.`,[`Puntos finales: ${post[0].points}`,`Victorias: ${post[0].wins}`,`Podios: ${post[0].podiums}`]));
    let movers=post.map((row,newIndex)=>{let oldIndex=pre.findIndex(x=>x.driver.id===row.driver.id);return oldIndex>=0?{d:row.driver,delta:oldIndex-newIndex,newRank:newIndex+1}:null}).filter(Boolean).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));let mover=movers[0];if(mover&&Math.abs(mover.delta)>=2)items.push(makeNewsItem(mover.delta>0?'climb':'drop',70,r,mover.d,mover.delta>0?`${mover.d.name} recupera ${mover.delta} posiciones en la tabla`:`${mover.d.name} pierde ${Math.abs(mover.delta)} posiciones tras ${r.name}`,mover.delta>0?`La ronda le permite avanzar hasta el ${mover.newRank}.º puesto del campeonato.`:`El resultado lo sitúa ahora en la ${mover.newRank}.ª posición.`,[`Cambio real: ${mover.delta>0?'+':''}${mover.delta} posiciones`,`Posición actual: ${mover.newRank}.º`]));
    if(winnerRow?.teamId&&results[1]?.teamId===winnerRow.teamId&&!isNoTeamName(team(winnerRow.teamId)?.name)){
      let tm=team(winnerRow.teamId);
      items.push(makeNewsItem('team-double',88,r,winner,`Doblete dominante de ${tm.name} en ${r.name}`,`La escudería firma el 1.º y 2.º lugar en ${categoryLabel(cat)} tras una actuación impecable.`,[`Escudería: ${tm.name}`,`Ganador: ${winner.name}`,`Puntos sumados: ${(winnerRow.points||0)+(results[1]?.points||0)}`],{team:tm,category:'equipos'}));
    }
    if(isSeasonComplete(r.seasonId)&&idx===seasonRaces.length-1){
      let tmChamp=championOf(r.seasonId,'team');
      if(tmChamp&&!isNoTeamName(tmChamp.name)){
        items.push(makeNewsItem('team-champion',108,r,winner,`${tmChamp.name} es campeón de escuderías en ${db.seasons.find(s=>s.id===r.seasonId)?.name||categoryLabel(cat)}`,`La escudería asegura el título de constructores tras completarse todas las rondas oficiales.`,[`Escudería campeona: ${tmChamp.name}`,`Puntos finales: ${tmChamp._s?.points||0}`,`Victorias: ${tmChamp._s?.wins||0}`],{team:tmChamp,category:'equipos'}));
      }
    }
  });
  let curSeason=active();
  if(curSeason&&curSeason.champType!=='individual'){
    let tst=teamStandings(curSeason.id).filter(t=>!isNoTeamName(t.name));
    if(tst.length){
      let leadTeam=tst[0],tCat=normalizeCategory(curSeason.category);
      items.push(makeNewsItem('team-leader',76,recent[0]||{id:'team_lead',name:curSeason.name,date:recent[0]?.date||new Date().toISOString().slice(0,10)},null,`${leadTeam.name} comanda la tabla de escuderías en ${categoryLabel(tCat)}`,`Con ${leadTeam._s.points} puntos registrados, lidera la clasificación por equipos en ${curSeason.name}.`,[`Escudería líder: ${leadTeam.name}`,`Puntos acumulados: ${leadTeam._s.points}`,`Victorias: ${leadTeam._s.wins}`],{id:`lead_team_${curSeason.id}_${leadTeam.id}`,team:leadTeam,cat:tCat,season:curSeason,category:'equipos'}));
    }
  }
  let hallRecs=calculateHallRecords().filter(r=>Number(r[2]||0)>0&&r[1]);
  if(hallRecs.length){
    let topRec=hallRecs[0],recDriver=topRec[1],recCat=normalizeCategory(topRec[3]||'GT');
    items.push(makeNewsItem('record',68,recent[0]||{id:'rec_hall',name:'Hall of Fame',date:new Date().toISOString().slice(0,10)},recDriver,`${recDriver.name}: récord histórico de ${String(topRec[0]).toLowerCase()}`,`Marca histórica confirmada en los registros oficiales de MiniZRD con ${topRec[2]} ${topRec[0].includes('puntos')?'puntos':topRec[0].includes('temporada')?'puntos':'registros'}.`,[`Récord: ${topRec[0]}`,`Marca: ${topRec[2]}`,`Piloto: ${recDriver.name}`],{id:`hall_record_${recDriver.id}_${String(topRec[0]).replace(/\s+/g,'_')}`,cat:recCat,category:'estadisticas',d:recDriver,image:recDriver.photo||''}));
  }
  let bDuo=calculateBestDuo(newsCategoryFilter==='ALL'?'general':newsCategoryFilter);
  if(bDuo&&bDuo.a&&bDuo.b){
    let dCat=normalizeCategory(bDuo.category||'GT');
    items.push(makeNewsItem('best-duo',64,recent[0]||{id:'stat_duo',name:'Análisis de Duplas',date:new Date().toISOString().slice(0,10)},bDuo.a,`${bDuo.a.name} y ${bDuo.b.name}: mejor dupla estadística`,`La combinación estadística posiciona a la pareja al frente del ranking combinado${dCat==='GT'?' en GT':` en ${categoryLabel(dCat)}`}.`,[`Piloto 1: ${bDuo.a.name}`,`Piloto 2: ${bDuo.b.name}`,`Valoración media: ${Math.round(bDuo.score)} pts`],{id:`best_duo_${bDuo.a.id}_${bDuo.b.id}_${dCat}`,cat:dCat,category:'estadisticas',d:bDuo.a,image:bDuo.a.photo||bDuo.b.photo||''}));
  }
  let nextSch=getNextScheduledRace();
  if(nextSch&&nextSch.event){
    let ev=nextSch.event,sSeason=nextSch.season,sTrack=db.tracks.find(t=>t.id===ev.trackId),aCat=normalizeCategory(sSeason?.category||'GT');
    items.push(makeNewsItem('next-race',84,{id:`sch_${sSeason.id}_${ev.round}`,name:ev.name||`Ronda ${ev.round}`,seasonId:sSeason.id,trackId:ev.trackId,date:ev.date},null,`Próxima carrera oficial: ${ev.name||('Ronda '+ev.round)}`,`La siguiente cita del campeonato ${sSeason.name} se disputará el ${fmt(ev.date)} en ${sTrack?.name||'pista oficial'}.`,[`Ronda: ${ev.round}`,`Fecha: ${fmt(ev.date)}`,`Pista: ${sTrack?.name||'Por definir'}`],{id:`sch_ann_${sSeason.id}_${ev.round}`,cat:aCat,season:sSeason,track:sTrack,category:'anuncios',date:ev.date,image:sTrack?.image||sSeason?.image||''}));
  }
  let seen=new Set();return items.sort((a,b)=>String(b.date).localeCompare(String(a.date))||b.priority-a.priority).filter(x=>{let key=x.id||`${x.race?.id}_${x.type}_${x.d?.id||x.team?.id}`;if(seen.has(key))return false;seen.add(key);return true}).slice(0,18);
}
function projectionForSchedule(season,event){
  let cat=getSeasonCategory(season),eligible=getSeasonDrivers(season.id).filter(d=>isDriverParticipatingInCategory(d.id,cat));
  let ranked=eligible.map(d=>{let st=categoryStatsFor(d,cat),form=getDriverRecentForm(d.id,cat),categoryRaces=sortOfficialRaces(db.races.filter(r=>normalizeCategory(r.category||getSeasonCategory(r.seasonId))===cat)),trackResults=categoryRaces.filter(r=>r.trackId===event.trackId).map(r=>normalizeRaceResults(r).find(x=>x.driverId===d.id)).filter(Boolean),avgFinish=st.starts?categoryRaces.map(r=>normalizeRaceResults(r).find(x=>x.driverId===d.id)).filter(Boolean).reduce((n,x)=>n+x.position,0)/st.starts:0,formIndex=form.length?form.reduce((n,x)=>n+Math.max(0,11-x.position),0)/(form.length*10):0,trackIndex=trackResults.length?trackResults.reduce((n,x)=>n+Math.max(0,11-x.position),0)/(trackResults.length*10):0,poleRate=st.starts?st.poles/st.starts:0,podiumRate=st.starts?st.podiums/st.starts:0;let score=ratingFor(d,cat)*.42+formIndex*22+trackIndex*18+poleRate*10+podiumRate*8,poleScore=poleRate*55+ratingFor(d,cat)*.25+formIndex*12+trackIndex*8;return {d,score,poleScore,st,form,trackStarts:trackResults.length,avgFinish,sample:st.starts+trackResults.length+form.length}}).filter(x=>x.st.starts>0).sort((a,b)=>b.score-a.score||b.st.wins-a.st.wins);
  let maxSample=Math.max(0,...ranked.map(x=>x.sample)),confidence=maxSample>=15?'Alta':maxSample>=7?'Media':'Limitada';let pole=ranked.slice().sort((a,b)=>b.poleScore-a.poleScore||b.score-a.score)[0];return {cat,ranked,pole,confidence};
}
function getNextScheduledRace(seasonId=db.activeSeason){let today=new Date().toISOString().slice(0,10),seasons=seasonId?db.seasons.filter(s=>s.id===seasonId):db.seasons,events=[];seasons.forEach(s=>(s.schedule||[]).forEach(e=>{let completed=db.races.some(r=>r.seasonId===s.id&&(String(r.round||'')===String(e.round)||r.name===e.name));if(e.date>=today&&!completed&&e.trackId&&e.round)events.push({season:s,event:e})}));return events.sort((a,b)=>a.event.date.localeCompare(b.event.date))[0]||null}

function newsTypeLabel(type){return ({champion:'Campeonato',firstWin:'Primera victoria','first-win':'Primera victoria','win-streak':'Racha','new-leader':'Clasificación','first-pole':'Pole','pole-streak':'Racha de poles',climb:'Remontada',drop:'Cambio de posiciones',win:'Resultado','team-leader':'Líder escuderías','team-double':'Doblete escudería','team-champion':'Campeón escuderías',record:'Récord histórico','best-duo':'Mejor dupla','next-race':'Próxima carrera',announcement:'Anuncio oficial'})[type]||'Actualidad'}
function setNewsCategoryFilter(category){newsCategoryFilter=category;newsSlideIndex=0;document.querySelectorAll('[data-news-category]').forEach(b=>b.classList.toggle('active',b.dataset.newsCategory===category));renderNewsPortal()}
function shiftNewsSlide(delta){let list=automaticNews().filter(n=>newsCategoryFilter==='ALL'||n.cat===newsCategoryFilter);if(!list.length)return;newsSlideIndex=(newsSlideIndex+delta+list.length)%list.length;renderNewsPortal()}
function selectNewsSlide(index){newsSlideIndex=index;renderNewsPortal()}
function renderNewsPortal(){
  let hero=document.getElementById('homeNewsHero'),feed=document.getElementById('homeNews');if(!hero||!feed)return;let all=automaticNews(),list=all.filter(n=>newsCategoryFilter==='ALL'||n.cat===newsCategoryFilter);
  if(!list.length){hero.innerHTML='<div class="newsEmptyHero"><span>MINIZRD NEWSROOM</span><h2>Todavía no hay historias oficiales en esta categoría</h2><p>Las noticias aparecerán automáticamente al registrar resultados verificables.</p></div>';feed.innerHTML='';return}
  newsSlideIndex=((newsSlideIndex%list.length)+list.length)%list.length;let feature=list[newsSlideIndex],side=[list[(newsSlideIndex+1)%list.length],list[(newsSlideIndex+2)%list.length]].filter((x,i,a)=>x&&x.id!==feature.id&&a.findIndex(y=>y.id===x.id)===i),featureImage=feature.image||feature.d?.photo||feature.team?.logo;
  hero.innerHTML=`<div class="newsHeroStage"><article class="newsFeature" onclick="openNewsStory('${feature.id}')">${featureImage?`<img class="newsFeatureMedia" src="${esc(featureImage)}" alt="${esc(feature.title)}">`:'<div class="newsFeatureMedia newsMediaFallback">MINIZRD</div>'}<div class="newsFeatureShade"></div><div class="newsFeatureContent"><div class="newsKicker"><span>DESTACADA</span>${getCategoryBadge(feature.cat)}<span class="newsCategoryTag">${NEWS_CATEGORIES[feature.category||getNewsCategoryByType(feature.type)]?.icon||'📰'} ${NEWS_CATEGORIES[feature.category||getNewsCategoryByType(feature.type)]?.label||'Actualidad'}</span><span>${esc(newsTypeLabel(feature.type))}</span></div><h2>${esc(feature.title)}</h2><p>${esc(feature.excerpt)}</p><div class="newsByline">${feature.d?avatar(feature.d,'avatar'):(feature.team?.logo?`<img class="avatar" style="object-fit:contain;background:#fff;padding:2px" src="${esc(feature.team.logo)}" alt="${esc(feature.team.name)}">`:`<div class="avatar" style="font-size:20px">${NEWS_CATEGORIES[feature.category||getNewsCategoryByType(feature.type)]?.icon||'🏁'}</div>`)}<div><b>${esc(feature.d?.name||feature.team?.name||'MiniZRD')}</b><span>${fmt(feature.date)}${feature.race?.name?` · ${esc(feature.race.name)}`:''}</span></div></div><button class="newsReadButton">LEER HISTORIA <span>→</span></button></div></article><aside class="newsHeroRail">${side.map(n=>`<article class="newsRailCard" onclick="openNewsStory('${n.id}')"><div class="newsRailVisual">${n.d?.photo?`<img src="${esc(n.d.photo)}" alt="${esc(n.d.name)}">`:(n.team?.logo?`<img style="object-fit:contain;background:#fff;padding:4px" src="${esc(n.team.logo)}" alt="${esc(n.team.name)}">`:avatar(n.d,'avatar'))}</div><div><div class="newsRailMeta">${getCategoryBadge(n.cat)}<span class="newsCategoryTag">${NEWS_CATEGORIES[n.category||getNewsCategoryByType(n.type)]?.icon||'📰'} ${NEWS_CATEGORIES[n.category||getNewsCategoryByType(n.type)]?.label||'Actualidad'}</span><span>${fmt(n.date)}</span></div><h3>${esc(n.title)}</h3><p>${esc(n.excerpt)}</p></div></article>`).join('')}</aside></div><div class="newsCarouselControls"><button onclick="shiftNewsSlide(-1)" aria-label="Noticia anterior">‹</button><div>${list.map((_,i)=>`<button class="newsDot ${i===newsSlideIndex?'active':''}" onclick="selectNewsSlide(${i})" aria-label="Ver noticia ${i+1}"></button>`).join('')}</div><button onclick="shiftNewsSlide(1)" aria-label="Noticia siguiente">›</button><span>${newsSlideIndex+1} / ${list.length}</span></div>`;

  const categoryOrder=['GT','GTP','LM_GYRO'];
  let actualidades=[];
  if(newsCategoryFilter==='ALL'){
    categoryOrder.forEach(catKey=>{
      let candidate=all.find(n=>normalizeCategory(n.cat)===catKey);
      if(candidate&&!actualidades.some(x=>x.id===candidate.id)){
        actualidades.push(candidate);
      }
    });
    actualidades.sort((a,b)=>String(b.date).localeCompare(String(a.date))||b.priority-a.priority);
  } else {
    actualidades=list.slice(0,3);
  }

  feed.innerHTML=actualidades.map((n,i)=>{
    let catMeta=NEWS_CATEGORIES[n.category||getNewsCategoryByType(n.type)]||{label:'Actualidad',icon:'📰'};
    let avatarEl=n.d?avatar(n.d,'avatar'):(n.team?.logo?`<img class="avatar" style="object-fit:contain;background:#fff;padding:2px" src="${esc(n.team.logo)}" alt="${esc(n.team.name)}">`:`<div class="avatar" style="font-size:20px">${catMeta.icon}</div>`);
    let mediaEl=n.image?`<img src="${esc(n.image)}" alt="${esc(n.title)}">`:'<div class="newsMediaFallback">MINIZRD</div>';
    return `<article class="newsArticleCard ${i===0?'lead':''}" onclick="openNewsStory('${n.id}')"><div class="newsArticleImage">${mediaEl}<div class="newsArticleAvatar">${avatarEl}</div></div><div class="newsArticleBody"><div class="newsArticleMeta">${getCategoryBadge(n.cat)}<span class="newsCategoryTag">${catMeta.icon} ${esc(catMeta.label)}</span><span>${esc(newsTypeLabel(n.type))}</span><time>${fmt(n.date)}</time></div><h3>${esc(n.title)}</h3><p>${esc(n.excerpt)}</p><span class="newsArticleLink">Leer noticia →</span></div></article>`;
  }).join('')||'<div class="empty">No hay actualidades en esta selección.</div>';
}
function openNewsStory(id){
  let item=automaticNews().find(n=>n.id===id);if(!item)return;
  let result=item.race?normalizeRaceResults(item.race):[],row=item.d?result.find(x=>x.driverId===item.d?.id):null,track=item.track,catMeta=NEWS_CATEGORIES[item.category||getNewsCategoryByType(item.type)]||{label:'Actualidad',icon:'📰'};
  openModal(`<button class="close" onclick="closeModal()">×</button><article class="newsStory"><div class="newsStoryHero">${item.image?`<img src="${esc(item.image)}" alt="${esc(item.title)}">`:'<div class="newsMediaFallback">MINIZRD NEWSROOM</div>'}<div class="newsStoryShade"></div><div class="newsStoryHeadline"><div>${getCategoryBadge(item.cat)} <span class="newsCategoryTag">${catMeta.icon} ${esc(catMeta.label)}</span> <span>${esc(newsTypeLabel(item.type))}</span></div><h1>${esc(item.title)}</h1><p>${esc(item.excerpt)}</p></div></div><div class="newsStoryByline">${item.d?avatar(item.d,'avatar'):(item.team?.logo?`<img class="avatar" style="object-fit:contain;background:#fff;padding:2px" src="${esc(item.team.logo)}" alt="${esc(item.team.name)}">`:`<div class="avatar" style="font-size:24px">${catMeta.icon}</div>`)}<div><b>${esc(item.d?.name||item.team?.name||'MiniZRD')}</b><span>${fmt(item.date)}${item.race?.name?` · Datos oficiales de ${esc(item.race.name)}`:''}</span></div></div><div class="newsStoryCopy"><p>${esc(item.body||'MiniZRD detectó este acontecimiento al procesar los registros oficiales de la competición. La información se actualiza automáticamente desde la base de datos de la liga.')}</p><div class="newsFacts">${(item.facts||[]).filter(Boolean).map(f=>`<div><span>Dato verificado</span><b>${esc(f)}</b></div>`).join('')}${row?`<div><span>Posición final</span><b>${row.position}.º · ${row.points} puntos</b></div>`:''}${track?`<div><span>Pista</span><b>${esc(track.name)}</b></div>`:''}</div></div><div class="toolbar">${item.race?.id&&!String(item.race.id).startsWith('sch_')&&!['stat','stat_duo','rec_hall'].includes(item.race.id)?`<button class="btn secondary" onclick="showRaceResult('${item.race.id}')">Ver resultado oficial</button>`:''}${item.d?`<button class="btn" onclick="profile('${item.d.id}')">Ver perfil del piloto</button>`:''}${item.team?`<button class="btn secondary" onclick="showTeamProfile('${item.team.id}')">Ver perfil de la escudería</button>`:''}</div></article>`,'newsStoryModal');
}

function setResultsView(view){currentResultsView=view==='forecast'?'forecast':'official';document.getElementById('resultsOfficialView')?.classList.toggle('hidden',currentResultsView!=='official');document.getElementById('resultsForecastView')?.classList.toggle('hidden',currentResultsView!=='forecast');document.getElementById('btnResultsOfficial')?.classList.toggle('active',currentResultsView==='official');document.getElementById('btnResultsForecast')?.classList.toggle('active',currentResultsView==='forecast');if(currentResultsView==='forecast')renderResultsForecast()}
function projectionLevel(index,total){if(index===0)return'Muy alta';if(index<Math.max(2,Math.ceil(total*.3)))return'Alta';if(index<Math.max(4,Math.ceil(total*.6)))return'Media-alta';return'Media'}
function renderResultsForecast(){
  let target=document.getElementById('resultsForecast');if(!target)return;let season=active(),next=getNextScheduledRace(season?.id);
  if(!season){target.innerHTML='<div class="forecastEmpty"><span>PRONÓSTICO NO DISPONIBLE</span><h2>No hay un campeonato seleccionado</h2></div>';return}
  if(!next){target.innerHTML=`<div class="forecastEmpty"><div class="forecastEmptyIcon">📅</div>${getCategoryBadge(season.category)}<h2>Próxima ronda pendiente de programación</h2><p>Para generar un pronóstico verificable, la siguiente ronda debe tener número, fecha y pista configurados. No se mostrarán pilotos ni proyecciones inventadas.</p>${isAdmin?'<button class="btn" onclick="show(\'admin\')">Programar próxima ronda</button>':''}</div>`;return}
  let p=projectionForSchedule(season,next.event),track=db.tracks.find(t=>t.id===next.event.trackId),top=p.ranked.slice(0,10);if(!top.length){target.innerHTML=`<div class="forecastEmpty">${getCategoryBadge(p.cat)}<h2>Datos insuficientes para una proyección fiable</h2><p>La ronda está programada, pero los pilotos elegibles todavía no tienen resultados oficiales en ${categoryLabel(p.cat)}.</p></div>`;return}
  target.innerHTML=`<div class="forecastHero">${track?.image?`<img src="${esc(track.image)}" alt="${esc(track.name)}">`:'<div class="forecastTrackFallback">🏁</div>'}<div class="forecastHeroShade"></div><div class="forecastHeroContent"><span>PRONÓSTICOS DE LA SIGUIENTE RONDA</span><h2>${esc(next.event.name||`Ronda ${next.event.round}`)}</h2><div>${getCategoryBadge(p.cat)}<b>🏁 ${esc(track?.name||'Pista')}</b><b>📅 ${fmt(next.event.date)}</b></div><p>Proyección estadística · Confianza ${p.confidence.toLowerCase()}</p></div></div><div class="forecastLayout"><section class="forecastRanking"><div class="forecastTitleRow"><div><span>PROYECCIÓN ESTADÍSTICA</span><h3>TOP ${top.length} — ${categoryLabel(p.cat)}</h3></div><small>Sin porcentajes artificiales</small></div>${top.map((x,i)=>`<div class="forecastDriverRow"><div class="forecastPosition">${i+1}</div>${avatar(x.d,'avatar')}<div class="forecastDriverInfo"><b>${esc(x.d.name)}</b><span>Rating ${ratingFor(x.d,p.cat)} · ${x.form.length} carreras recientes${x.trackStarts?` · ${x.trackStarts} en esta pista`:''}</span></div><div class="forecastLevel level${Math.min(i,3)}"><span>Proyección</span><b>${projectionLevel(i,top.length)}</b></div></div>`).join('')}</section><aside class="forecastPoleCard"><span>PRONÓSTICO DE POLE</span>${avatar(p.pole?.d,'profileHeroPhoto')}<h3>${esc(p.pole?.d.name||'Datos insuficientes')}</h3><p>${p.pole?.st.poles||0} poles oficiales en ${categoryLabel(p.cat)}.</p><div><b>Confianza ${p.confidence}</b><small>Prioriza frecuencia de poles, rating, forma reciente y rendimiento en la pista.</small></div></aside></div><div class="forecastMethod"><b>Cómo se calcula</b><span>Rating de categoría 42%</span><span>Forma reciente 22%</span><span>Historial en pista 18%</span><span>Poles 10%</span><span>Podios 8%</span></div>`;
}
function deleteScheduledRound(seasonId,round){let season=db.seasons.find(s=>s.id===seasonId);if(!season)return;season.schedule=(season.schedule||[]).filter(e=>Number(e.round)!==Number(round));save()}
function renderScheduleAdmin(){let el=document.getElementById('scheduleListV04'),season=db.seasons.find(s=>s.id===(document.getElementById('scheduleSeasonV04')?.value||db.activeSeason));if(!el||!season)return;let list=(season.schedule||[]).slice().sort((a,b)=>Number(a.round)-Number(b.round));el.innerHTML=list.length?list.map(e=>{let track=db.tracks.find(t=>t.id===e.trackId),done=db.races.some(r=>r.seasonId===season.id&&Number(r.round)===Number(e.round));return `<div class="scheduleAdminRow"><div><b>Ronda ${e.round} · ${esc(track?.name||'Pista')}</b><span>${fmt(e.date)} · ${done?'Resultado registrado':'Pendiente'}</span></div>${done?'':`<button class="btnActionMini" onclick="deleteScheduledRound('${season.id}',${e.round})">Eliminar</button>`}</div>`}).join(''):'<div class="muted small">No hay rondas futuras programadas para este campeonato.</div>'}

function showSeasonRules(id){let s=db.seasons.find(x=>x.id===id);if(s)openModal(`<button class="close" onclick="closeModal()">×</button><div class="eyebrow">${esc(s.name)}</div><h2>Reglamento</h2><div class="rulesText">${esc(s.rules||s.desc||'No hay reglamento registrado.')}</div>`)}
async function saveSeasonV04Meta(){let s=active();if(!s)return;let rules=document.getElementById('cfgRulesV04')?.value.trim(),file=document.getElementById('cfgSeasonImageV04')?.files?.[0];if(rules!==undefined)s.rules=rules;if(file)s.image=await fileToDataURL(file);save()}
function saveScheduledRound(){let sid=document.getElementById('scheduleSeasonV04')?.value,season=db.seasons.find(s=>s.id===sid);if(!season)return;let round=Number(document.getElementById('scheduleRoundV04')?.value),date=document.getElementById('scheduleDateV04')?.value,trackId=document.getElementById('scheduleTrackV04')?.value;if(!round||!date||!trackId)return alert('Completa ronda, fecha y pista.');season.schedule=season.schedule||[];let old=season.schedule.find(x=>Number(x.round)===round);let data={round,date,trackId,name:`Ronda ${round}`};if(old)Object.assign(old,data);else season.schedule.push(data);save()}

function renderV04(a){
  let tracksIntro=document.querySelector('#pistas .pageTitle p');if(tracksIntro)tracksIntro.textContent='Perfiles, historial de ganadores y récords de pista GT, GTP y LM GYRO.';
  let catGroup=document.querySelector('.catRadioGroup');if(catGroup&&!document.getElementById('lblCatLMGYRO'))catGroup.insertAdjacentHTML('beforeend','<label class="catRadioLabel" id="lblCatLMGYRO"><input type="radio" name="seasonCategoryRadio" value="LM_GYRO" onchange="updateCatRadioStyle()"> 🟢 LM GYRO</label>');
  let cfg=document.getElementById('cfgCategory');if(cfg&&!cfg.querySelector('[value="LM_GYRO"]'))cfg.insertAdjacentHTML('beforeend','<option value="LM_GYRO">Categoría LM GYRO</option>');
  let createDriver=document.getElementById('newName')?.closest('.admin');if(createDriver&&!createDriver.querySelector('[name="newDriverCategoryV04"]'))createDriver.querySelector('h2')?.insertAdjacentHTML('afterend',`<div class="categoryChecks"><b>Categorías oficiales:</b>${CATEGORY_KEYS.map((c,i)=>`<label><input type="checkbox" name="newDriverCategoryV04" value="${c}" ${i===0?'checked':''}> ${categoryLabel(c)}</label>`).join('')}</div>`);
  let seasonAdmin=document.getElementById('seasonName')?.closest('.admin');if(seasonAdmin&&!document.getElementById('seasonRulesV04'))seasonAdmin.querySelector('.formrow')?.insertAdjacentHTML('beforeend','<input id="seasonRulesV04" placeholder="Reglamento"><label class="filePicker">📷 Foto oficial<input id="seasonImageV04" type="file" accept="image/*"></label>');
  let cfgAdmin=document.getElementById('cfgName')?.closest('.admin');if(cfgAdmin&&!document.getElementById('cfgRulesV04'))cfgAdmin.insertAdjacentHTML('beforeend',`<div class="formrow v04AdminRow"><textarea id="cfgRulesV04" placeholder="Reglamento">${esc(a?.rules||a?.desc||'')}</textarea><label class="filePicker">📷 Foto oficial<input id="cfgSeasonImageV04" type="file" accept="image/*"></label><button class="btn" onclick="saveSeasonV04Meta()">Guardar reglamento/foto</button></div><div class="v04Schedule"><h3>Programar próxima ronda</h3><div class="formrow"><select id="scheduleSeasonV04" onchange="renderScheduleAdmin()">${db.seasons.map(s=>`<option value="${s.id}" ${s.id===a?.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select><input id="scheduleRoundV04" type="number" min="1" placeholder="Ronda"><input id="scheduleDateV04" type="date"><select id="scheduleTrackV04"><option value="">Pista</option>${db.tracks.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select><button class="btn" onclick="saveScheduledRound()">Programar</button></div><div id="scheduleListV04" class="scheduleAdminList"></div></div>`);
  document.querySelectorAll('#seasonsPublic>.card').forEach((card,i)=>{let s=db.seasons[i];if(!s||card.querySelector('.seasonV04Meta'))return;card.insertAdjacentHTML('afterbegin',`<div class="seasonV04Meta">${s.image?`<img src="${esc(s.image)}" alt="${esc(s.name)}" loading="lazy" onerror="this.parentElement.style.display=\'none\'">`:''}</div>`);card.insertAdjacentHTML('beforeend',`<button class="btn secondary rulesBtn" onclick="event.stopPropagation();showSeasonRules('${s.id}')">VER REGLAMENTO</button>`)});
  document.querySelectorAll('#tracksPublic>.card').forEach((card,i)=>{let t=db.tracks[i];if(t?.recordLMGYRO?.time&&!card.querySelector('.lmgyro'))card.querySelector('.raceMeta')?.insertAdjacentHTML('beforeend',`<span class="catBadge lmgyro">LM GYRO: ${esc(t.recordLMGYRO.time)}</span>`)});
  let champ=document.getElementById('champName')?.parentElement;if(champ&&a){let old=document.getElementById('champLeaderV04');if(old)old.remove();let lead=standings(a.id)[0],finished=isSeasonComplete(a.id);if(lead)champ.insertAdjacentHTML('beforeend',`<div id="champLeaderV04" class="champLeaderCard" onclick="profile('${lead.id}')">${avatar(lead,'avatar')}<div><span>${finished?'CAMPEÓN':'LÍDER DEL CAMPEONATO'}</span><b>${esc(lead.name)}</b></div></div>`)}
  renderNewsPortal();
  renderResultsForecast();
  setResultsView(currentResultsView);
  renderScheduleAdmin();
  let duo=document.getElementById('bestDuo');if(duo){let b=calculateBestDuo(currentRankTab);duo.innerHTML=b?`<div class="bestDuoCard">${avatar(b.a,'avatar')}<b>${esc(b.a.name)} + ${esc(b.b.name)}</b>${avatar(b.b,'avatar')}<span>Mayor valoración estadística combinada según el rendimiento registrado${b.category==='general'?'.':` en ${categoryLabel(b.category)}.`}</span></div>`:'<div class="empty">Datos insuficientes para calcular una dupla.</div>'}
  let records=document.getElementById('hallRecords');if(records)records.innerHTML=calculateHallRecords().map(r=>{let valid=Number(r[2]||0)>0;return `<div class="recordCard"><span>${r[0]}</span><b>${esc(valid?r[1]?.name||'Sin marca':'Sin marca')}</b><strong>${valid?Number(r[2]):'—'}</strong>${valid&&r[3]?getCategoryBadge(r[3]):''}${valid&&r[4]?`<small>${esc(r[4])}</small>`:''}</div>`}).join('');
}

const editTrackRecordsModalV03=editTrackRecordsModal;editTrackRecordsModal=function(id){editTrackRecordsModalV03(id);let t=db.tracks.find(x=>x.id===id),box=document.querySelector('#modal .modalbox'),toolbar=box?.querySelector('.toolbar:last-child');if(!t||!toolbar)return;let opts='<option value="">(Sin récord)</option>'+db.drivers.filter(d=>isDriverParticipatingInCategory(d.id,'LM_GYRO')).map(d=>`<option value="${d.id}" ${t.recordLMGYRO?.driverId===d.id?'selected':''}>${esc(d.name)}</option>`).join('');toolbar.insertAdjacentHTML('beforebegin',`<div class="editSectionBox" style="border-left:4px solid #22c55e;margin-top:14px"><div>${getCategoryBadge('LM_GYRO')} <b>Récord oficial LM GYRO</b></div><div class="formrow"><select id="mRecDriverLMGYRO">${opts}</select><input id="mRecTimeLMGYRO" value="${esc(t.recordLMGYRO?.time||'')}" placeholder="Tiempo"><input id="mRecChampLMGYRO" value="${esc(t.recordLMGYRO?.championship||'')}" placeholder="Campeonato"><input id="mRecRoundLMGYRO" value="${esc(t.recordLMGYRO?.round||'')}" placeholder="Ronda"></div></div>`)};
const showTrackProfileV03=showTrackProfile;showTrackProfile=function(id){showTrackProfileV03(id);let t=db.tracks.find(x=>x.id===id),grid=document.querySelector('#modal .trackRecordGrid');if(!t||!grid||grid.querySelector('.lmgyro'))return;let r=t.recordLMGYRO;grid.insertAdjacentHTML('beforeend',`<div class="recordBox lmgyro"><div class="recordHeader">${getCategoryBadge('LM_GYRO')}<span class="recordTimeBadge">${esc(r?.time||'—')}</span></div>${r?.driverId&&r?.time?`<div class="recordDriverRow" onclick="profile('${r.driverId}')">${avatar(driver(r.driverId),'avatar')}<b>${esc(driver(r.driverId)?.name||'Piloto')}</b></div><div class="recordMetaInfo">${r.championship?`<div>🏆 ${esc(r.championship)}</div>`:''}${r.round?`<div>🏁 ${esc(r.round)}</div>`:''}</div>`:'<div class="subtle" style="padding:14px 0;text-align:center">Sin récord registrado en LM GYRO</div>'}</div>`)};
const profileV03=profile;profile=function(id){profileV03(id);enhanceDriverProfileV04(id)};
const showTeamProfileV03=showTeamProfile;showTeamProfile=function(id){showTeamProfileV03(id);let box=document.querySelector('#modal .modalbox');let title=[...box.querySelectorAll('h3')].find(x=>x.textContent.toLowerCase().includes('rivalidad'));if(title&&!box.querySelector('.rivalryExplanation'))title.insertAdjacentHTML('afterend',`<p class="rivalryExplanation">${esc(getTeamPerformanceExplanation(id))}</p>`)};
renderChampRounds=function(seasonId){
  let season=db.seasons.find(s=>s.id===seasonId),chronological=db.races.filter(r=>r.seasonId===seasonId).slice().sort((x,y)=>String(x.date).localeCompare(String(y.date))),el=document.getElementById('champRounds');if(!el)return;
  let completed=chronological.slice().reverse().map((r,index)=>{let res=normalizeRaceResults(r),winner=res.find(x=>x.position===1),track=db.tracks.find(t=>t.id===r.trackId),round=r.round||chronological.length-index;return `<div class="card roundCard"><div class="roundTrack">${track?.image?`<img src="${esc(track.image)}" alt="${esc(track.name)}">`:'<div class="trackFallback">🏁</div>'}<div><span class="eyebrow">RONDA ${round} · OFICIAL</span><h3>${esc(track?.name||r.name)}</h3>${getCategoryBadge(r.category||getSeasonCategory(r.seasonId))}<div class="muted small">${fmt(r.date)} · Ganador: ${esc(driver(winner?.driverId)?.name||'—')}</div></div></div><button class="btn secondary" onclick="showRaceResult('${r.id}')">Ver resultado</button></div>`}).join('');
  let future=(season?.schedule||[]).filter(e=>!db.races.some(r=>r.seasonId===seasonId&&(Number(r.round)===Number(e.round)||r.name===e.name))).sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(e=>{let track=db.tracks.find(t=>t.id===e.trackId);return `<div class="card roundCard upcoming"><div class="roundTrack">${track?.image?`<img src="${esc(track.image)}" alt="${esc(track.name)}">`:'<div class="trackFallback">🏁</div>'}<div><span class="eyebrow">RONDA ${e.round} · PROGRAMADA</span><h3>${esc(track?.name||'Pista pendiente')}</h3>${getCategoryBadge(season.category)}<div class="muted small">${fmt(e.date)} · Próxima carrera</div></div></div></div>`}).join('');
  el.innerHTML=future+completed||'<div class="empty">Todavía no hay rondas registradas.</div>';
};

function applyTheme(){
  if(typeof document!=='undefined'&&document.body){
    document.body.classList.remove('light','light-theme');
  }
  if(typeof localStorage!=='undefined'){
    localStorage.setItem('minizrd_theme','dark');
  }
}
function toggleTheme(){}
applyTheme();
db.races=db.races.map((r,i)=>{let seasonId=r.seasonId||db.seasons[0]?.id;let results=(r.results||r.grid||[]).map((x,j)=>{let obj=typeof x==='string'?{driverId:x,position:j+1,pole:false,fast:false}:x;let position=Number(obj.position)||j+1;return {driverId:obj.driverId,position,pole:!!obj.pole,fast:!!obj.fast,points:pointsForPosition(position,!!obj.pole,!!obj.fast)}});return {...r,id:r.id||('r'+Date.now()+i),seasonId,trackId:r.trackId||'',results};});localStorage.setItem('minizrd_data',JSON.stringify(db));render();addGridRow();show('inicio');
