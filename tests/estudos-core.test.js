'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/estudos-core.js');

/* ---------- Task 1: datas, durações e cronômetro ---------- */
const ms = (s) => new Date(s).getTime();   // horário local

test('parseDuracao entende os formatos combinados', () => {
  assert.equal(C.parseDuracao('1h30'), 90);
  assert.equal(C.parseDuracao('1:30'), 90);
  assert.equal(C.parseDuracao('45min'), 45);
  assert.equal(C.parseDuracao('45'), 45);
  assert.equal(C.parseDuracao('2h'), 120);
  assert.equal(C.parseDuracao(' 1h 05min '), 65);
  assert.equal(C.parseDuracao(''), null);
  assert.equal(C.parseDuracao('abc'), null);
  assert.equal(C.parseDuracao(null), null);
});

test('datas locais: somar, diferença, mês e início da semana', () => {
  assert.equal(C.addDias('2026-11-27', 5), '2026-12-02');
  assert.equal(C.addDias('2026-03-01', -1), '2026-02-28');
  assert.equal(C.diffDias('2026-11-27', '2026-12-02'), 5);
  assert.equal(C.diffDias('2026-12-02', '2026-11-27'), -5);
  assert.equal(C.mesDe('2026-11-27'), '2026-11');
  assert.equal(C.inicioSemana('2026-11-27'), '2026-11-23');   // sexta -> segunda
  assert.equal(C.inicioSemana('2026-11-29'), '2026-11-23');   // domingo -> segunda da mesma semana
  assert.equal(C.hoje(new Date(2026, 10, 27, 23, 59)), '2026-11-27');
});

test('cronômetro soma só os trechos em andamento', () => {
  let c = C.cronoIniciar(ms('2026-11-27T10:00:00'));
  c = C.cronoAplicar(c, 'pausa', ms('2026-11-27T10:20:00'));
  assert.equal(C.cronoEstado(c), 'pausado');
  c = C.cronoAplicar(c, 'retomada', ms('2026-11-27T10:30:00'));
  assert.equal(C.cronoEstado(c), 'rodando');
  c = C.cronoAplicar(c, 'fim', ms('2026-11-27T11:00:00'));
  assert.equal(C.cronoEstado(c), 'finalizado');
  assert.equal(C.cronoDuracaoMs(c, ms('2026-11-27T15:00:00')), 50 * 60000);
});

test('cronômetro rodando conta até agora e sobrevive a JSON (recarregar a página)', () => {
  let c = C.cronoIniciar(ms('2026-11-27T10:00:00'));
  c = JSON.parse(JSON.stringify(c));
  assert.equal(C.cronoDuracaoMs(c, ms('2026-11-27T10:25:00')), 25 * 60000);
  c = C.cronoAplicar(c, 'fim', ms('2026-11-27T10:40:00'));
  assert.equal(C.cronoDuracaoMs(c, ms('2026-11-27T12:00:00')), 40 * 60000);
});

test('cronômetro que passa da meia-noite fica com a data do início', () => {
  let c = C.cronoIniciar(ms('2026-11-27T23:50:00'));
  c = C.cronoAplicar(c, 'fim', ms('2026-11-28T00:20:00'));
  assert.equal(C.cronoDuracaoMs(c, ms('2026-11-28T01:00:00')), 30 * 60000);
  assert.equal(C.cronoDataInicio(c), '2026-11-27');
});

test('cronômetro recusa transições inválidas', () => {
  let c = C.cronoIniciar(ms('2026-11-27T10:00:00'));
  c = C.cronoAplicar(c, 'pausa', ms('2026-11-27T10:05:00'));
  assert.throws(() => C.cronoAplicar(c, 'pausa', ms('2026-11-27T10:06:00')));
  const fim = C.cronoAplicar(c, 'fim', ms('2026-11-27T10:07:00'));
  assert.throws(() => C.cronoAplicar(fim, 'retomada', ms('2026-11-27T10:08:00')));
  assert.equal(C.cronoDuracaoMs(fim, ms('2026-11-27T11:00:00')), 5 * 60000);   // pausado até o fim não conta
  assert.equal(C.cronoEstado(null), 'parado');
});
