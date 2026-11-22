(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.MiniZRDNewsEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const OFFICIAL_CATEGORIES=['GT','GTP','LM_GYRO','PRO_AM'];

  function normalizeCategory(value){
    const raw=String(value??'').trim();
    if(!raw)return'GT';
    const v=raw.toUpperCase().replace(/[\s\/-]+/g,'_');
    if(v==='GT'||v==='GTS')return'GT';
    if(v==='GTP')return'GTP';
    if(v==='LMGYRO'||v==='LM_GYRO')return'LM_GYRO';
    if(v==='PROAM'||v==='PRO_AM')return'PRO_AM';
    return raw;
  }

  function storyCategories(story){
    if(Array.isArray(story?.categoryIds)&&story.categoryIds.length){
      const out=[];
      story.categoryIds.forEach(c=>{
        const id=normalizeCategory(c);
        if(id&&!out.includes(id))out.push(id);
      });
      if(out.length)return out;
    }
    return[normalizeCategory(story?.cat)];
  }

  function editorialDate(date=new Date()){
    try{
      return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santo_Domingo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
    }catch(_){return date.toISOString().slice(0,10)}
  }

  function token(value){
    return String(value??'').trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'')||'general';
  }

  function storyKey(story){
    if(story.storyKey)return String(story.storyKey);
    const driverIds=(story.driverIds||[story.d?.id,story.d2?.id]).filter(Boolean).sort().join(',');
    const teamIds=(story.teamIds||[story.team?.id]).filter(Boolean).sort().join(',');
    const source=story.eventId||story.raceId||story.race?.id||story.seasonId||story.season?.id||story.trackId||story.track?.id||'global';
    const version=story.eventVersion||story.metricVersion||story.mark||'';
    return [token(story.type),token(source),token(driverIds),token(teamIds),token(version)].join('|');
  }

  function daysSince(date,today){
    if(!date)return 3650;
    const a=Date.parse(`${date}T12:00:00Z`),b=Date.parse(`${today}T12:00:00Z`);
    return Number.isFinite(a)&&Number.isFinite(b)?Math.max(0,Math.floor((b-a)/86400000)):3650;
  }

  function selectDailyStories({candidates=[],history=[],date=editorialDate(),limit=3,categories=OFFICIAL_CATEGORIES}={}){
    const existingToday=history.filter(x=>x.publicationDate===date);
    const remaining=Math.max(0,limit-existingToday.length);
    if(!remaining)return[];
    const usedKeys=new Set(history.filter(item=>daysSince(item.publicationDate,date)<60).map(storyKey));
    const unique=new Map();
    candidates.forEach((candidate,index)=>{
      const categoryIds=storyCategories(candidate);
      const item={...candidate,cat:categoryIds[0],categoryIds,_index:index};
      item.storyKey=storyKey(item);
      if(!usedKeys.has(item.storyKey)&&!unique.has(item.storyKey))unique.set(item.storyKey,item);
    });
    const pool=[...unique.values()];
    const lastCategoryDate={};
    categories.map(normalizeCategory).forEach(cat=>lastCategoryDate[cat]='');
    history.forEach(x=>{
      storyCategories(x).forEach(cat=>{
        if(!lastCategoryDate[cat]||String(x.publicationDate)>lastCategoryDate[cat])lastCategoryDate[cat]=x.publicationDate||'';
      });
    });
    const selected=[];
    while(selected.length<remaining&&pool.length){
      let bestIndex=0,bestScore=-Infinity;
      pool.forEach((item,index)=>{
        const drivers=item.driverIds||[item.d?.id,item.d2?.id].filter(Boolean);
        const teams=item.teamIds||[item.team?.id].filter(Boolean);
        const selectedDrivers=new Set(selected.flatMap(x=>x.driverIds||[x.d?.id,x.d2?.id].filter(Boolean)));
        const selectedTeams=new Set(selected.flatMap(x=>x.teamIds||[x.team?.id].filter(Boolean)));
        let score=Number(item.priorityLevel||Math.ceil(Number(item.priority||0)/22)||1)*100;
        score+=Math.min(60,daysSince(lastCategoryDate[item.cat],date)*3);
        if(selected.some(x=>x.type===item.type))score-=85;
        if(selected.some(x=>x.category===item.category))score-=38;
        if(selected.some(x=>(x.raceId||x.race?.id)&&(x.raceId||x.race?.id)===(item.raceId||item.race?.id)))score-=50;
        if(drivers.some(id=>selectedDrivers.has(id)))score-=70;
        if(teams.some(id=>selectedTeams.has(id)))score-=45;
        score+=Number(item.priority||0)/10-index/10000;
        if(score>bestScore){bestScore=score;bestIndex=index}
      });
      selected.push(pool.splice(bestIndex,1)[0]);
    }
    const best=selected.slice().sort((a,b)=>Number(b.priorityLevel||1)-Number(a.priorityLevel||1)||Number(b.priority||0)-Number(a.priority||0))[0];
    const alreadyHasStoryOfDay=existingToday.some(x=>x.storyOfDay);
    return selected.map(x=>({...x,publicationDate:date,storyOfDay:!alreadyHasStoryOfDay&&x===best}));
  }

  function selectTrackUpdates({stories=[],category='ALL',categories=OFFICIAL_CATEGORIES,limit=3}={}){
    const rawCategory=String(category??'ALL').trim();
    if(rawCategory.toUpperCase()!=='ALL'){
      const selectedCategory=normalizeCategory(rawCategory);
      return stories.filter(story=>storyCategories(story).includes(selectedCategory)).slice(0,limit);
    }
    const official=new Set(categories.map(normalizeCategory)),seen=new Set();
    return stories.filter(story=>{
      const match=storyCategories(story).find(cat=>official.has(cat)&&!seen.has(cat));
      if(!match)return false;
      seen.add(match);
      return true;
    });
  }

  return {OFFICIAL_CATEGORIES,editorialDate,normalizeCategory,storyCategories,storyKey,selectDailyStories,selectTrackUpdates};
});
