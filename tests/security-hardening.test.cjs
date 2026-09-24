const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const rules = JSON.parse(fs.readFileSync(path.join(root, 'database.rules.json'), 'utf8'));

test('external scripts are pinned and protected by SRI', () => {
  assert.match(html, /chart\.js@4\.5\.1\/dist\/chart\.umd\.min\.js/);
  assert.match(html, /firebasejs\/12\.19\.0\/firebase-app-compat\.js/);
  const externalScripts = [...html.matchAll(/<script\s+src="https:[^"]+"[^>]*>/g)].map(x => x[0]);
  assert.equal(externalScripts.length, 4);
  for (const tag of externalScripts) {
    assert.match(tag, /integrity="sha384-[A-Za-z0-9+/=]+"/);
    assert.match(tag, /crossorigin="anonymous"/);
  }
});

test('the document defines a restrictive resource policy', () => {
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /object-src 'none'/);
  assert.match(html, /base-uri 'self'/);
  assert.match(html, /form-action 'self'/);
  assert.match(html, /strict-origin-when-cross-origin/);
});

test('database and uploads are validated before use', () => {
  assert.match(script, /function validateDbPayload\(/);
  assert.match(script, /SAFE_ENTITY_ID/);
  assert.match(script, /SAFE_IMAGE_DATA_URL/);
  assert.match(script, /imageFileBytes:8_000_000/);
  assert.match(script, /if\(!validateDbPayload\(db\)\.ok\)/);
  assert.match(script, /Importación rechazada/);
});

test('admin sessions do not expose raw authentication errors', () => {
  assert.match(script, /Auth\.Persistence\.SESSION/);
  assert.match(script, /No se pudo iniciar sesión\. Verifica las credenciales/);
  assert.doesNotMatch(script, /loginError'\)\.textContent='Error: '\+err\.message/);
});

test('prepared Firebase rules require a dedicated admin claim', () => {
  assert.equal(rules.rules['.read'], false);
  assert.equal(rules.rules['.write'], false);
  assert.equal(rules.rules.minizrd_data['.read'], true);
  assert.match(rules.rules.minizrd_data['.write'], /auth\.token\.minizrdAdmin === true/);
});
