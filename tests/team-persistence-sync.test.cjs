const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('syncDriverTeam updates driver, team driverIds, and season driverTeams consistently', () => {
  assert.match(script, /function syncDriverTeam\(/);
  assert.match(script, /syncDriverTeam\(d\.id,\s*tid\)/);
  assert.match(script, /t\.driverIds\.includes\(d\.id\)/);
  assert.match(script, /t\.driverIds\.filter\(id => id !== d\.id\)/);
});

test('team lookup resolves by id or by name', () => {
  assert.match(script, /function team\(id\)\{/);
  assert.match(script, /t\.id===id\s*\|\|\s*t\.name\.trim\(\)\.toLowerCase\(\)===str/);
});

test('teams historical totals accumulate across all seasons without being wiped by individual champType', () => {
  assert.doesNotMatch(script, /if\(s\.champType==='individual'\)return;\s*let st=teamStatsFor\(teamId,s\.id\);/);
});

test('standings team toggle remains accessible regardless of championship type', () => {
  assert.match(script, /let cType = a\.champType \|\| 'both';\s*if\(toggleEl\) toggleEl\.style\.display = 'flex';/);
});

test('Firebase uses authenticated incremental REST writes without stale-cache overwrite', () => {
  assert.match(script, /localStorage\.setItem\('minizrd_data',\s*JSON\.stringify\(db\)\)/);
  assert.match(script, /let remoteReady=false/);
  assert.match(script, /remoteReady=true/);
  assert.match(script, /if\(!remoteReady\)/);
  assert.match(script, /MiniZRDFirebaseSync\.conditionalPatch\(/);
  assert.match(script, /expectedUpdatedAt:lastRemoteUpdatedAt/);
  assert.match(script, /getIdToken:\(\)=>user\.getIdToken\(\)/);
  assert.match(script, /let firebaseSaveQueue=Promise\.resolve\(\)/);
  assert.match(script, /pendingFirebaseWrites>0/);
  assert.match(script, /if\(!remoteReady\)return 0/);
  assert.doesNotMatch(script, /dbRef\.set\(db\)/);
  assert.doesNotMatch(script, /dbRef\.transaction\(/);
  assert.match(script, /firebase\.auth\(\)\.onAuthStateChanged\(user => \{\s*isAdmin = !!user;/);
  assert.match(script, /db\.updatedAt=nextDatabaseRevision\(\)/);
});

test('Firebase sync module and confirmation status load before application writes',()=>{
  assert.ok(html.indexOf('firebase-sync.js')>0);
  assert.ok(html.indexOf('firebase-sync.js')<html.indexOf('script.js'));
  assert.match(html,/id="firebaseSyncStatus"/);
  assert.match(script,/Guardado en Firebase/);
});

test('team creation waits for Firebase confirmation before reporting success',()=>{
  assert.match(script,/async function addTeam\(\)[\s\S]*?const saved=await save\(\)/);
  assert.match(script,/if\(!saved\)\{[\s\S]*?db\.teams=db\.teams\.filter\(t=>t\.id!==newT\.id\)/);
  assert.match(script,/Equipo "\$\{name\}" creado y confirmado en Firebase/);
});

test('ordinary saves cannot authorize entity deletion',()=>{
  assert.match(script,/function save\(options=\{\}\)/);
  assert.match(script,/syncCurrentDbToFirebase\(false,options\)/);
  assert.match(script,/async function deleteTeam[\s\S]*?save\(\{allowedDeletions:\[`teams\/\$\{id\}`\]\}\)/);
  assert.match(script,/async function deleteRace[\s\S]*?save\(\{allowedDeletions:\[`races\/\$\{id\}`\]\}\)/);
  assert.doesNotMatch(script,/allowDeletions:true/);
});

test('all primary create flows wait for Firebase before clearing their forms',()=>{
  for(const name of ['addSeason','addTeam','addDriver','addTrack','addRace']){
    assert.match(script,new RegExp(`async function ${name}\\(\\)[\\s\\S]*?(?:const )?saved=await save\\(\\)`));
  }
  assert.equal((script.match(/cacheCurrentDb\('rollback'\)/g)||[]).length,5);
  assert.match(script,/Campeonato "\$\{n\}" \(\$\{cat\}\) creado y confirmado en Firebase/);
  assert.match(script,/Piloto "\$\{n\}" creado y confirmado en Firebase/);
  assert.match(script,/Pista creada y confirmada en Firebase/);
  assert.match(script,/Resultado confirmado en Firebase/);
});
