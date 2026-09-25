const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');

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

test('Firebase remote data persists to local cache on sync to prevent state loss', () => {
  assert.match(script, /localStorage\.setItem\('minizrd_data',\s*JSON\.stringify\(db\)\)/);
  assert.match(script, /hasPendingLocalSync/);
  assert.match(script, /db\.updatedAt\s*=\s*Date\.now\(\)/);
});
