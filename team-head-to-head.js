(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.MiniZRDTeamHeadToHead=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function aggregateTeamRace(results,teamId){
    const rows=(Array.isArray(results)?results:[]).filter(row=>row&&row.teamId===teamId);
    if(!rows.length)return null;
    return {
      points:rows.reduce((sum,row)=>sum+Number(row.points||0),0),
      wins:rows.filter(row=>Number(row.position)===1).length,
      podiums:rows.filter(row=>Number(row.position)<=3).length,
      poles:rows.filter(row=>!!row.pole).length,
      fast:rows.filter(row=>!!row.fast).length,
      bestPosition:Math.min(...rows.map(row=>Number(row.position)).filter(Number.isFinite)),
      drivers:rows.length
    };
  }

  function compareTeamRace(a,b,idA,idB){
    if(!a||!b)return null;
    if(a.points!==b.points)return a.points>b.points?idA:idB;
    if(a.bestPosition!==b.bestPosition)return a.bestPosition<b.bestPosition?idA:idB;
    return null;
  }

  return {aggregateTeamRace,compareTeamRace};
});
