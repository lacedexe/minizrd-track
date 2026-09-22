const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const engine=require('../team-head-to-head.js');

test('agrega una carrera una sola vez por equipo aunque participen varios pilotos',()=>{
  const rows=[
    {driverId:'a1',teamId:'a',position:1,points:25,pole:true},
    {driverId:'a2',teamId:'a',position:4,points:12},
    {driverId:'b1',teamId:'b',position:2,points:18},
    {driverId:'b2',teamId:'b',position:3,points:15}
  ];
  assert.deepEqual(engine.aggregateTeamRace(rows,'a'),{points:37,wins:1,podiums:1,poles:1,fast:0,bestPosition:1,drivers:2});
  assert.deepEqual(engine.aggregateTeamRace(rows,'b'),{points:33,wins:0,podiums:2,poles:0,fast:0,bestPosition:2,drivers:2});
});

test('el duelo de equipos se decide primero por puntos oficiales',()=>{
  assert.equal(engine.compareTeamRace({points:37,bestPosition:1},{points:33,bestPosition:2},'a','b'),'a');
});

test('un empate de puntos usa la mejor posición y permite un empate real',()=>{
  assert.equal(engine.compareTeamRace({points:25,bestPosition:1},{points:25,bestPosition:2},'a','b'),'a');
  assert.equal(engine.compareTeamRace({points:25,bestPosition:1},{points:25,bestPosition:1},'a','b'),null);
});

test('la interfaz activa el modo equipos y ofrece acceso desde la página de escuderías',()=>{
  const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),analysis=fs.readFileSync(path.join(root,'analysis.js'),'utf8');
  assert.match(html,/CARA A CARA DE EQUIPOS/);
  assert.match(html,/setHeadToHeadMode\('teams'\)/);
  assert.match(html,/team-head-to-head\.js/);
  assert.match(analysis,/renderTeamHeadToHead/);
  assert.match(analysis,/teamHistoricalTotals/);
  assert.match(analysis,/teamStatsFor/);
  assert.match(analysis,/VERSUS DE EQUIPOS/);
  assert.match(analysis,/Puntos directos/);
});
