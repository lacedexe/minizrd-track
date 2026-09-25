const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const analysis = fs.readFileSync(path.join(root, 'analysis.js'), 'utf8');

function loadMediaHelpers() {
  const start = script.indexOf('const mediaObjectUrlCache=new Map();');
  const end = script.indexOf('function isSectionVisible', start);
  assert.ok(start >= 0 && end > start, 'media helper source should exist');

  let createCalls = 0;
  let capturedBlob;
  const context = {
    Blob,
    TextEncoder,
    atob,
    console,
    URL: {
      createObjectURL(blob) {
        createCalls += 1;
        capturedBlob = blob;
        return `blob:test-${createCalls}`;
      }
    }
  };
  const exported = vm.runInNewContext(
    `${script.slice(start, end)};({cachedMediaUrl,esc,mediaObjectUrlCache})`,
    context
  );
  return {...exported, getCreateCalls: () => createCalls, getBlob: () => capturedBlob};
}

test('reutiliza una sola URL interna por imagen Base64 sin recomprimirla', async () => {
  const helpers = loadMediaHelpers();
  const originalBytes = Buffer.from([0, 17, 34, 51, 68, 255]);
  const source = `data:image/png;base64,${originalBytes.toString('base64')}`;

  const first = helpers.esc(source);
  const second = helpers.esc(source);

  assert.equal(first, 'blob:test-1');
  assert.equal(second, first);
  assert.equal(helpers.getCreateCalls(), 1);
  assert.equal(helpers.mediaObjectUrlCache.size, 1);
  assert.equal(helpers.getBlob().type, 'image/png');
  assert.deepEqual(Buffer.from(await helpers.getBlob().arrayBuffer()), originalBytes);
});

test('mantiene el escape HTML normal para contenido que no es una imagen', () => {
  const helpers = loadMediaHelpers();
  assert.equal(helpers.esc('<b>MiniZRD & "Track"</b>'), '&lt;b&gt;MiniZRD &amp; &quot;Track&quot;&lt;/b&gt;');
  assert.equal(helpers.getCreateCalls(), 0);
});

test('las vistas pesadas se renderizan únicamente cuando están visibles', () => {
  for (const id of ['campeonato', 'inicio', 'pilotos', 'equipos', 'ranking', 'resultados', 'competitiveCategories']) {
    assert.match(script, new RegExp(`isSectionVisible\\('${id}'\\)`));
  }
  assert.match(script, /if\(!isSectionVisible\('admin'\)\)\{renderV04\(a\);return\}/);
  assert.doesNotMatch(analysis, /else updateH2HDropdowns\(\)/);
});

test('las fotos de pilotos conservan carga diferida y decodificación asíncrona', () => {
  assert.match(script, /function avatar[\s\S]*?decoding="async" loading="lazy"/);
});

test('omite el intento imposible de localStorage cuando las imágenes exceden el límite', () => {
  assert.match(script, /const LOCAL_CACHE_MEDIA_LIMIT=3500000/);
  assert.match(script, /embeddedMediaChars\(db\)>LOCAL_CACHE_MEDIA_LIMIT/);
  assert.match(script, /caché omitida por tamaño; Firebase conserva la fuente completa/);
});
