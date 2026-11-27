'use strict';
/* Segurança: a chave do GitHub só pode ir para api.github.com (ou para localhost, em teste local) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'util.js'), 'utf8');
const corpo = /function ghApiBase\(\)\{[\s\S]*?\n\}/.exec(src);
function base(hostname, override){
  const ctx = { location: { hostname }, localStorage: { getItem: (k) => k === 'mm-github-api' ? override : null } };
  vm.createContext(ctx); vm.runInContext(corpo[0] + '; resultado = ghApiBase();', ctx);
  return ctx.resultado;
}
test('ghApiBase: desvio da API só vale em localhost e para localhost', () => {
  assert.ok(corpo, 'ghApiBase existe em util.js');
  assert.equal(base('flips794.github.io', null), 'https://api.github.com');
  assert.equal(base('flips794.github.io', 'https://evil.example'), 'https://api.github.com');
  assert.equal(base('flips794.github.io', 'http://localhost:4590'), 'https://api.github.com');
  assert.equal(base('localhost', 'https://evil.example'), 'https://api.github.com');
  assert.equal(base('localhost', 'http://localhost.evil.example:80'), 'https://api.github.com');
  assert.equal(base('localhost', 'http://localhost:4590/'), 'http://localhost:4590');
});
