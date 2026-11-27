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

/* ---------- Task 3: evidências, domínio e retenção ---------- */
const AJ = C.AJUSTES_PADRAO;
const ses = (o) => Object.assign({ id: Math.random().toString(36).slice(2), itemId: 'i1', tipo: 'revisao', metodos: [] }, o);
const near = (a, b, eps = 0.005) => assert.ok(Math.abs(a - b) <= eps, a + ' ≈ ' + b);

test('resultado da sessão combina as evidências com seus pesos', () => {
  near(C.resultadoSessao(ses({ questoes: { feitas: 10, acertos: 8 } }), AJ), 0.8);
  near(C.resultadoSessao(ses({ questoes: { feitas: 2, acertos: 2 }, explicacao: { nota: null, marcados: ['a', 'b'], total: 4 } }), AJ), (0.4 * 1 + 2 * 0.5) / 2.4);
  near(C.resultadoSessao(ses({ percebida: 'dificil' }), AJ), 0.4);
  near(C.resultadoSessao(ses({ explicacao: { marcados: ['a', 'b', 'c'], total: 4 } }), AJ), 0.75);
  near(C.resultadoSessao(ses({ explicacao: { nota: 'pouco' } }), AJ), 0.7);
  assert.equal(C.resultadoSessao(ses({}), AJ), null);
  assert.equal(C.resultadoSessao(ses({ questoes: { feitas: 0, acertos: 0 } }), AJ), null);
});

test('categorias de domínio pelos limites', () => {
  assert.equal(C.categoria(95, AJ), 'excelente');
  assert.equal(C.categoria(90, AJ), 'excelente');
  assert.equal(C.categoria(89, AJ), 'bom');
  assert.equal(C.categoria(75, AJ), 'bom');
  assert.equal(C.categoria(60, AJ), 'regular');
  assert.equal(C.categoria(59, AJ), 'critico');
});

test('domínio não classifica com pouca evidência', () => {
  const d = C.dominio([ses({ data: '2026-11-01', questoes: { feitas: 5, acertos: 5 } }), ses({ data: '2026-11-02', questoes: { feitas: 5, acertos: 5 } })], AJ, '2026-11-27');
  assert.equal(d.suficiente, false);
  assert.equal(d.categoria, null);
  assert.equal(d.questoes, 10);
  assert.equal(d.valor, 100);
});

test('domínio com evidência suficiente é classificado', () => {
  const s = ['2026-11-20', '2026-11-22', '2026-11-25'].map(data => ses({ data, questoes: { feitas: 10, acertos: 9 } }));
  const d = C.dominio(s, AJ, '2026-11-27');
  assert.equal(d.suficiente, true);
  assert.equal(d.valor, 90);
  assert.equal(d.categoria, 'excelente');
  assert.equal(d.avaliadas, 3);
});

test('dificuldade percebida recente desconta 5 pontos do domínio', () => {
  const base = ['2026-11-20', '2026-11-22'].map(data => ses({ data, questoes: { feitas: 10, acertos: 8 } }));
  const sem = C.dominio(base, AJ, '2026-11-27').valor;
  const com = C.dominio(base.concat([ses({ data: '2026-11-25', percebida: 'dificil' })]), AJ, '2026-11-27').valor;
  assert.equal(com, sem - 5);
});

test('sessão antiga pesa menos no domínio (meia-vida de 60 dias)', () => {
  const s = [ses({ data: C.addDias('2026-11-27', -240), questoes: { feitas: 10, acertos: 0 } }), ses({ data: '2026-11-27', questoes: { feitas: 10, acertos: 10 } })];
  assert.equal(C.dominio(s, AJ, '2026-11-27').valor, Math.round(100 * 10 / (10 + 10 / 16)));
});

test('domínio ignora sessões excluídas e as posteriores à data de referência', () => {
  const s = [ses({ data: '2026-11-20', questoes: { feitas: 10, acertos: 10 } }), ses({ data: '2026-11-21', questoes: { feitas: 10, acertos: 0 }, excluida: true }), ses({ data: '2026-11-30', questoes: { feitas: 10, acertos: 0 } })];
  assert.equal(C.dominio(s, AJ, '2026-11-27').valor, 100);
});

test('retenção usa só revisões e mostra o maior intervalo lembrado', () => {
  const s = [
    ses({ data: '2026-10-01', tipo: 'estudo', questoes: { feitas: 10, acertos: 10 } }),
    ses({ data: '2026-10-16', questoes: { feitas: 10, acertos: 9 } }),
    ses({ data: '2026-11-15', questoes: { feitas: 10, acertos: 5 } }),
  ];
  const r = C.retencao(s, AJ, '2026-11-27');
  assert.equal(r.revisoes, 2);
  assert.equal(r.suficiente, true);
  assert.equal(r.maiorIntervaloBom, 15);
  assert.ok(r.valor > 50 && r.valor < 90);
  const so1 = C.retencao(s.slice(0, 2), AJ, '2026-11-27');
  assert.equal(so1.suficiente, false);
  assert.equal(so1.categoria, null);
});

test('domínio e retenção são métricas diferentes', () => {
  const s = [
    ses({ data: '2026-11-01', tipo: 'estudo', questoes: { feitas: 30, acertos: 30 } }),
    ses({ data: '2026-11-08', explicacao: { nota: 'muito' } }),
    ses({ data: '2026-11-22', explicacao: { nota: 'muito' } }),
  ];
  const d = C.dominio(s, AJ, '2026-11-27'), r = C.retencao(s, AJ, '2026-11-27');
  assert.equal(r.valor, 40);
  assert.ok(d.valor > 70, 'domínio ' + d.valor);
  assert.notEqual(d.valor, r.valor);
});
