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

/* ---------- Task 2: coleções com histórico e mescla ---------- */
const T1 = '2026-11-27T10:00:00.000Z', T2 = '2026-11-27T11:00:00.000Z', T3 = '2026-11-27T12:00:00.000Z';

test('salvar o mesmo registro duas vezes não duplica nem cria versão', () => {
  let col = C.colecao();
  col = C.salvarRegistro(col, { id: 's1', questoes: { feitas: 10, acertos: 8 } }, T1);
  col = C.salvarRegistro(col, { id: 's1', questoes: { feitas: 10, acertos: 8 } }, T2);
  assert.equal(Object.keys(col.registros).length, 1);
  assert.deepEqual(col.registros.s1.versoes || [], []);
  assert.equal(col.registros.s1.criadoEm, T1);
  assert.equal(col.registros.s1.atualizadoEm, T1);
});

test('editar guarda a versão anterior e mantém criadoEm', () => {
  let col = C.salvarRegistro(C.colecao(), { id: 's1', questoes: { feitas: 10, acertos: 8 } }, T1);
  col = C.salvarRegistro(col, { id: 's1', questoes: { feitas: 10, acertos: 9 } }, T2);
  const r = col.registros.s1;
  assert.equal(r.questoes.acertos, 9);
  assert.equal(r.criadoEm, T1);
  assert.equal(r.atualizadoEm, T2);
  assert.equal(r.versoes.length, 1);
  assert.equal(r.versoes[0].questoes.acertos, 8);
  assert.equal(r.versoes[0].em, T2);
  assert.equal(r.versoes[0].versoes, undefined);
});

test('excluir marca como excluída e some dos registros ativos', () => {
  let col = C.salvarRegistro(C.colecao(), { id: 'a' }, T1);
  col = C.salvarRegistro(col, { id: 'b' }, T1);
  col = C.excluirRegistro(col, 'a', T2);
  assert.equal(col.registros.a.excluida, true);
  assert.equal(col.registros.a.excluidaEm, T2);
  assert.deepEqual(C.registrosAtivos(col).map(r => r.id), ['b']);
});

test('mescla junta aparelhos: mais recente vence e exclusão não é desfeita', () => {
  let a = C.salvarRegistro(C.colecao(), { id: 'x', v: 1 }, T1);
  a = C.salvarRegistro(a, { id: 'soA' }, T1);
  let b = C.salvarRegistro(C.colecao(), { id: 'x', v: 1 }, T1);
  b = C.salvarRegistro(b, { id: 'x', v: 2 }, T2);           // B editou depois
  b = C.salvarRegistro(b, { id: 'soB' }, T1);
  let a2 = C.excluirRegistro(a, 'soA', T1);
  let b2 = C.salvarRegistro(b, { id: 'soA', velho: true }, T1); // B tem uma cópia antiga de soA
  b2 = C.salvarRegistro(b2, { id: 'soA', velho: true, mexido: 1 }, T3); // mais nova, mas A excluiu
  const m = C.mesclarColecoes(a2, b2);
  assert.equal(m.registros.x.v, 2);
  assert.ok(m.registros.soB);
  assert.equal(m.registros.soA.excluida, true);
  assert.deepEqual(C.registrosAtivos(m).map(r => r.id).sort(), ['soB', 'x']);
  const m2 = C.mesclarColecoes(b2, a2);
  assert.deepEqual(JSON.parse(JSON.stringify(m2)), JSON.parse(JSON.stringify(m)));
});

test('mescla une o histórico de versões sem repetir', () => {
  let a = C.salvarRegistro(C.colecao(), { id: 'x', v: 1 }, T1);
  a = C.salvarRegistro(a, { id: 'x', v: 2 }, T2);
  let b = JSON.parse(JSON.stringify(a));
  b = C.salvarRegistro(b, { id: 'x', v: 3 }, T3);
  const m = C.mesclarColecoes(a, b);
  assert.equal(m.registros.x.v, 3);
  assert.deepEqual(m.registros.x.versoes.map(v => v.v), [1, 2]);
  assert.equal(C.mesclarColecoes(null, a).registros.x.v, 2);
});
