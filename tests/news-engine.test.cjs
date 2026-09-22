const test=require('node:test');
const assert=require('node:assert/strict');
const engine=require('../news-engine.js');
const fs=require('node:fs');
const path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'..','script.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function candidate(id,type,cat,priorityLevel,driverId=`d-${id}`){
  return {id,type,cat,priorityLevel,priority:priorityLevel*20,category:type,driverIds:[driverId],raceId:`r-${id}`,eventVersion:'1',title:id};
}

test('selecciona exactamente tres historias cuando hay material verificable',()=>{
  const result=engine.selectDailyStories({date:'2026-09-22',candidates:[candidate('1','race','GT',5),candidate('2','rating','GTP',4),candidate('3','history','LM_GYRO',3),candidate('4','team','PRO_AM',2)],history:[]});
  assert.equal(result.length,3);
  assert.equal(result.filter(x=>x.storyOfDay).length,1);
  assert.ok(result.every(x=>x.publicationDate==='2026-09-22'));
});

test('no rellena con noticias inventadas si faltan candidatos',()=>{
  const result=engine.selectDailyStories({date:'2026-09-22',candidates:[candidate('1','race','GT',5)],history:[]});
  assert.equal(result.length,1);
});

test('anti-repetición bloquea la misma historia aunque cambie el texto',()=>{
  const old=candidate('1','first-win','GT',5,'driver-1');
  const key=engine.storyKey(old);
  const paraphrase={...old,title:'Un título diferente para el mismo evento'};
  const result=engine.selectDailyStories({date:'2026-09-23',candidates:[paraphrase],history:[{...old,storyKey:key,publicationDate:'2026-09-22'}]});
  assert.equal(result.length,0);
});

test('el archivo puede recuperar un ángulo después del período razonable de 60 días',()=>{
  const old=candidate('archive','history','GT',1,'driver-1');
  const result=engine.selectDailyStories({date:'2026-09-22',candidates:[old],history:[{...old,storyKey:engine.storyKey(old),publicationDate:'2026-06-01'}]});
  assert.equal(result.length,1);
});

test('una evolución real del evento crea una historia nueva',()=>{
  const old=candidate('1','streak','GT',4,'driver-1');old.eventVersion='2-wins';
  const evolved={...old,eventVersion:'3-wins'};
  const result=engine.selectDailyStories({date:'2026-09-23',candidates:[evolved],history:[{...old,storyKey:engine.storyKey(old),publicationDate:'2026-09-22'}]});
  assert.equal(result.length,1);
});

test('una edición completada más tarde conserva una sola Historia del Día',()=>{
  const history=[{...candidate('one','race','GT',5),storyKey:'already-published',publicationDate:'2026-09-22',storyOfDay:true}];
  const result=engine.selectDailyStories({date:'2026-09-22',candidates:[candidate('two','rating','GTP',4),candidate('three','history','PRO_AM',3)],history});
  assert.equal(result.length,2);
  assert.equal(result.some(x=>x.storyOfDay),false);
});

test('el selector puede reparar la ventana inicial hasta diez sin repetir historias',()=>{
  const history=[0,1,2].map(i=>({...candidate(`old-${i}`,'archive','GT',2),storyKey:`old-key-${i}`,publicationDate:'2026-09-22'}));
  const candidates=Array.from({length:9},(_,i)=>candidate(`new-${i}`,`type-${i}`,['GT','GTP','LM_GYRO','PRO_AM'][i%4],3));
  const selected=engine.selectDailyStories({date:'2026-09-22',candidates,history,limit:10});
  assert.equal(selected.length,7);
  assert.equal(new Set(selected.map(x=>x.storyKey)).size,7);
});

test('la rotación favorece categorías que llevan más tiempo sin cobertura',()=>{
  const history=[
    {...candidate('old-gt','archive','GT',2),storyKey:'old-gt',publicationDate:'2026-09-21'},
    {...candidate('old-gtp','archive','GTP',2),storyKey:'old-gtp',publicationDate:'2026-09-21'},
    {...candidate('old-lm','archive','LM_GYRO',2),storyKey:'old-lm',publicationDate:'2026-09-21'}
  ];
  const candidates=[candidate('gt','analysis','GT',3),candidate('pro','analysis','PRO_AM',3)];
  const [first]=engine.selectDailyStories({date:'2026-09-22',candidates,history,limit:1});
  assert.equal(first.cat,'PRO_AM');
});

test('normaliza etiquetas visibles a los códigos internos oficiales',()=>{
  assert.equal(engine.normalizeCategory('GTS'),'GT');
  assert.equal(engine.normalizeCategory('LM GYRO'),'LM_GYRO');
  assert.equal(engine.normalizeCategory('PRO/AM'),'PRO_AM');
});

test('el historial editorial guarda relaciones y datos verificables',()=>{
  for(const field of ['publicationDate','category','type','seasonId','raceId','driverIds','teamIds','trackId','statisticsUsed','recordUsed','eventUsed','title','content'])assert.match(script,new RegExp(field));
  assert.match(script,/storyKey/);
  assert.match(script,/newsHistory/);
  assert.match(html,/news-engine\.js/);
});

test('la portada conserva una ventana visible de diez noticias mientras publica tres diarias',()=>{
  assert.match(script,/limit:3,categories:CATEGORY_KEYS/);
  assert.match(script,/db\.newsHistory\.length<10/);
  assert.match(script,/slice\(0,10\)/);
  assert.match(html,/10 historias más recientes/);
  assert.match(html,/3 noticias nuevas cada día/);
});

test('Actualidad de la pista muestra solo las tres últimas de una categoría individual',()=>{
  const stories=[1,2,3,4].map(id=>({id:`gt-${id}`,cat:'GT'})).concat([{id:'gtp-1',cat:'GTP'}]);
  const selected=engine.selectTrackUpdates({stories,category:'GT'});
  assert.deepEqual(selected.map(x=>x.id),['gt-1','gt-2','gt-3']);
});

test('Actualidad de la pista en Todas muestra solamente la última de cada categoría',()=>{
  const stories=[
    {id:'gt-latest',cat:'GT'},{id:'gt-old',cat:'GT'},
    {id:'gtp-latest',cat:'GTP'},{id:'lm-latest',cat:'LM_GYRO'},
    {id:'pro-latest',cat:'PRO_AM'},{id:'pro-old',cat:'PRO_AM'}
  ];
  const selected=engine.selectTrackUpdates({stories,category:'ALL'});
  assert.deepEqual(selected.map(x=>x.id),['gt-latest','gtp-latest','lm-latest','pro-latest']);
});

test('perfil expone récords personales y ADN gráfico sin modificar el rating',()=>{
  assert.match(script,/openDriverPersonalRecords/);
  assert.match(script,/openDriverDNA/);
  assert.match(script,/type:'radar'/);
  assert.match(script,/No modifica el Rating oficial/);
  for(const metric of ['Mayor remontada','Mayor racha de victorias','Más puntos en una temporada','Mejor Consistencia','Mayor cantidad de carreras'])assert.match(script,new RegExp(metric));
  const dnaSource=script.slice(script.indexOf('function getDriverDNA'),script.indexOf('function openDriverDNA'));
  assert.doesNotMatch(dnaSource,/Remontada|comeback/);
});

test('los resultados normalizados no duplican un piloto y conservan metadatos oficiales',()=>{
  assert.match(script,/seenDrivers\.has\(obj\.driverId\)/);
  for(const field of ['category','seasonId','raceId','trackId'])assert.match(script,new RegExp(`${field}:`));
});
