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

/* ---------- Task 4: escada, diagnóstico, estado e agenda ---------- */
const item = (o) => Object.assign({ id: 'i1', tipo: 'topico', caminho: 'Mat › 01' }, o);
const q = (data, a, n, extra) => ses(Object.assign({ data, questoes: { feitas: n || 10, acertos: a } }, extra || {}));

test('escada normal e encurtada para assunto difícil', () => {
  assert.deepEqual(C.escadaDo(item(), AJ), [1, 7, 15, 30, 60, 120]);
  assert.deepEqual(C.escadaDo(item({ dificil: true }), AJ), [1, 5, 10, 21, 42, 84]);
});

test('primeiro estudo agenda revisão em 1 dia', () => {
  const e = C.calcularEstado(item(), [q('2026-11-20', 7, 10, { tipo: 'estudo' })], AJ, '2026-11-20');
  assert.equal(e.status, 'ativo');
  assert.equal(e.degrau, 0);
  assert.equal(e.proxima, '2026-11-21');
  assert.equal(C.calcularEstado(item(), [], AJ, '2026-11-20').status, 'novo');
});

test('progresso sobe um degrau; percebida difícil mantém', () => {
  const base = [q('2026-11-01', 7, 10, { tipo: 'estudo' })];
  let e = C.calcularEstado(item(), base.concat([q('2026-11-02', 9)]), AJ, '2026-11-02');
  assert.equal(e.diagnostico, 'progresso'); assert.equal(e.degrau, 1); assert.equal(e.proxima, '2026-11-09');
  // 10/10 + explicação completa + 'difícil' → s = (2+2+0,4)/5 = 0,88: progresso, mas mantém o degrau
  e = C.calcularEstado(item(), base.concat([q('2026-11-02', 10, 10, { percebida: 'dificil', explicacao: { nota: 'completo' } })]), AJ, '2026-11-02');
  assert.equal(e.diagnostico, 'progresso'); assert.equal(e.degrau, 0);
});

test('estável repete o intervalo', () => {
  const s = [q('2026-11-01', 7, 10, { tipo: 'estudo' }), q('2026-11-02', 9), q('2026-11-09', 7)];
  const e = C.calcularEstado(item(), s, AJ, '2026-11-09');
  assert.equal(e.diagnostico, 'estavel'); assert.equal(e.degrau, 1); assert.equal(e.proxima, '2026-11-16');
});

test('domínio consolidado sobe dois degraus e chega a 120 dias', () => {
  const s = [q('2026-11-01', 10, 10, { tipo: 'estudo' }), q('2026-11-02', 10), q('2026-11-09', 10)];
  let e = C.calcularEstado(item(), s, AJ, '2026-11-09');
  assert.equal(e.diagnostico, 'consolidado'); assert.equal(e.degrau, 3); assert.equal(e.intervalo, 30);
  s.push(q('2026-12-09', 10));
  e = C.calcularEstado(item(), s, AJ, '2026-12-09');
  assert.equal(e.degrau, 5); assert.equal(e.intervalo, 120);
  s.push(q('2027-04-08', 10));
  assert.equal(C.calcularEstado(item(), s, AJ, '2027-04-08').intervalo, 120);
});

test('esquecimento desce um degrau quando já tinha ido bem', () => {
  const s = [q('2026-11-01', 7, 10, { tipo: 'estudo' }), q('2026-11-02', 9), q('2026-11-09', 9), q('2026-11-24', 4)];
  const e = C.calcularEstado(item(), s, AJ, '2026-11-24');
  assert.equal(e.diagnostico, 'esquecimento'); assert.equal(e.degrau, 1); assert.equal(e.proxima, '2026-12-01');
});

test('dificuldade de compreensão volta para 1 dia', () => {
  const s = [q('2026-11-01', 4, 10, { tipo: 'estudo' }), q('2026-11-02', 4)];
  const e = C.calcularEstado(item(), s, AJ, '2026-11-02');
  assert.equal(e.diagnostico, 'compreensao'); assert.equal(e.degrau, 0); assert.equal(e.proxima, '2026-11-03');
});

test('dificuldade recorrente pausa revisões e recomenda retomar; retomada recomeça mantendo histórico', () => {
  const s = [q('2026-11-01', 4, 10, { tipo: 'estudo' }), q('2026-11-02', 4), q('2026-11-03', 5), q('2026-11-04', 3)];
  let e = C.calcularEstado(item(), s, AJ, '2026-11-05');
  assert.equal(e.status, 'retomada'); assert.equal(e.diagnostico, 'recorrente'); assert.equal(e.proxima, null);
  const ag = C.agenda([item()], new Map([['i1', s]]), AJ, '2026-11-05');
  assert.equal(ag.retomar.length, 1); assert.equal(ag.atrasadas.length + ag.hoje.length, 0);
  s.push(ses({ data: '2026-11-06', tipo: 'retomada', questoes: { feitas: 10, acertos: 6 } }));
  e = C.calcularEstado(item(), s, AJ, '2026-11-06');
  assert.equal(e.status, 'ativo'); assert.equal(e.degrau, 0); assert.equal(e.baixasSeguidas, 0); assert.equal(e.proxima, '2026-11-07');
  assert.equal(e.dominio.questoes, 50);   // histórico anterior continua contando
});

test('revisão adiantada conta da data da sessão; atrasada aparece com atraso', () => {
  const s = [q('2026-11-01', 7, 10, { tipo: 'estudo' }), q('2026-11-05', 9)];   // previsto 08/11, feito 05/11
  let e = C.calcularEstado(item(), s, AJ, '2026-11-05');
  assert.equal(e.proxima, '2026-11-12');
  e = C.calcularEstado(item(), s, AJ, '2026-11-15');
  assert.equal(e.atrasoDias, 3);
  const ag = C.agenda([item()], new Map([['i1', s]]), AJ, '2026-11-15');
  assert.equal(ag.atrasadas.length, 1); assert.equal(ag.atrasadas[0].estado.atrasoDias, 3);
});

test('excluir uma sessão dá o mesmo estado de quem nunca a teve; mudar a data reordena', () => {
  const ruim = q('2026-11-09', 2);
  const comExcluida = [q('2026-11-01', 7, 10, { tipo: 'estudo' }), q('2026-11-02', 9), Object.assign({}, ruim, { excluida: true })];
  const semNada = [q('2026-11-01', 7, 10, { tipo: 'estudo' }), q('2026-11-02', 9)];
  const a = C.calcularEstado(item(), comExcluida, AJ, '2026-11-10'), b = C.calcularEstado(item(), semNada, AJ, '2026-11-10');
  assert.deepEqual([a.degrau, a.proxima, a.dominio.valor, a.retencao.valor], [b.degrau, b.proxima, b.dominio.valor, b.retencao.valor]);
  const movida = [q('2026-11-01', 7, 10, { tipo: 'estudo' }), Object.assign(q('2026-11-02', 9), { data: '2026-11-20' })];
  assert.equal(C.calcularEstado(item(), movida, AJ, '2026-11-20').proxima, '2026-11-27');
});

test('assunto sem revisão não entra na agenda; agenda conta os próximos 7 dias', () => {
  const itens = [item({ id: 'a' }), item({ id: 'b', tipo: 'livre', semRevisao: true }), item({ id: 'c' })];
  const m = new Map([['a', [q('2026-11-20', 7, 10, { tipo: 'estudo' })]], ['b', [q('2026-11-20', 7, 10, { tipo: 'estudo' })]], ['c', [q('2026-11-19', 7, 10, { tipo: 'estudo' }), q('2026-11-20', 9)]]]);
  const ag = C.agenda(itens, m, AJ, '2026-11-21');
  assert.deepEqual(ag.hoje.map(x => x.item.id), ['a']);
  assert.equal(ag.proximos7, 1);   // c em 27/11
  assert.equal(C.calcularEstado(itens[1], m.get('b'), AJ, '2026-11-21').status, 'sem-revisao');
});

/* ---------- Task 5: estatísticas, planejamento, erros, simulados ---------- */
test('Cebraspe: cada erro anula um acerto; nota negativa é permitida', () => {
  const ceb = C.CRITERIOS_PADRAO.find(c => c.id === 'cebraspe');
  assert.deepEqual(C.notaSimulado({ questoes: 100, acertos: 70, erros: 20, brancos: 10 }, ceb), { nota: 50, maxima: 100, percentual: 50 });
  assert.equal(C.notaSimulado({ questoes: 100, acertos: 40, erros: 50, brancos: 10 }, ceb).nota, -10);
  const simples = C.CRITERIOS_PADRAO.find(c => c.id === 'simples');
  assert.equal(C.notaSimulado({ questoes: 100, acertos: 70, erros: 20, brancos: 10 }, simples).nota, 70);
  const proprio = { id: 'x', pontosAcerto: 2, penalidadeErro: 0.5, pontosBranco: 0 };
  assert.deepEqual(C.notaSimulado({ questoes: 10, acertos: 6, erros: 4, brancos: 0 }, proprio), { nota: 10, maxima: 20, percentual: 50 });
});

test('validação do simulado acusa soma que não fecha', () => {
  assert.deepEqual(C.validarSimulado({ questoes: 100, acertos: 70, erros: 20, brancos: 10 }), []);
  assert.ok(C.validarSimulado({ questoes: 100, acertos: 70, erros: 20, brancos: 5 }).length > 0);
  assert.ok(C.validarSimulado({ questoes: 0, acertos: 0, erros: 0, brancos: 0 }).length > 0);
  assert.ok(C.validarSimulado({ questoes: 10, acertos: -1, erros: 11, brancos: 0 }).length > 0);
});

test('evolução dos simulados em ordem de data com nota pelo critério de cada um', () => {
  const sims = [{ id: 'b', data: '2026-11-20', criterioId: 'cebraspe', questoes: 10, acertos: 8, erros: 2, brancos: 0 }, { id: 'a', data: '2026-11-10', criterioId: 'simples', questoes: 10, acertos: 5, erros: 5, brancos: 0 }, { id: 'c', data: '2026-11-25', excluida: true, questoes: 10, acertos: 10, erros: 0, brancos: 0 }];
  const ev = C.evolucaoSimulados(sims, C.CRITERIOS_PADRAO);
  assert.deepEqual(ev.map(x => [x.simulado.id, x.nota]), [['a', 5], ['b', 6]]);
});

test('planejado só vira concluído com sessão ligada; excluir a sessão desfaz', () => {
  const plano = { id: 'p1', data: '2026-11-20', metaMinutos: 60, metaQuestoes: 20, status: 'planejada' };
  assert.equal(C.planoStatus(plano, [], '2026-11-20'), 'pendente');
  assert.equal(C.planoStatus(plano, [], '2026-11-21'), 'atrasada');
  const s = ses({ data: '2026-11-20', planoId: 'p1', minutos: 50, questoes: { feitas: 15, acertos: 12 } });
  assert.equal(C.planoStatus(plano, [s], '2026-11-21'), 'concluida');
  assert.equal(C.planoStatus(plano, [Object.assign({}, s, { excluida: true })], '2026-11-21'), 'atrasada');
  assert.deepEqual(C.realizadoDoPlano([s, ses({ planoId: 'p1', minutos: 10 })]), { minutos: 60, questoes: 15 });
  assert.equal(C.planoStatus(Object.assign({}, plano, { status: 'cancelada' }), [], '2026-11-25'), 'cancelada');
});

test('reagendar marca o original e cria um novo ligado a ele', () => {
  let col = C.salvarRegistro(C.colecao(), { id: 'p1', data: '2026-11-20', itemId: 'i1', metaMinutos: 60, metaQuestoes: 0, status: 'planejada' }, T1);
  col = C.reagendarPlano(col, 'p1', '2026-11-24', T2, 'p2');
  assert.equal(col.registros.p1.status, 'reagendada');
  assert.equal(col.registros.p1.reagendadaPara, '2026-11-24');
  assert.equal(col.registros.p2.data, '2026-11-24');
  assert.equal(col.registros.p2.origemId, 'p1');
  assert.equal(col.registros.p2.status, 'planejada');
  assert.equal(col.registros.p2.itemId, 'i1');
  assert.equal(C.planoStatus(col.registros.p1, [], '2026-11-30'), 'reagendada');
});

test('resumo da semana compara planejado com tudo o que foi realizado', () => {
  const planos = [{ id: 'p1', data: '2026-11-23', metaMinutos: 60, metaQuestoes: 20, status: 'planejada' }, { id: 'p2', data: '2026-11-25', metaMinutos: 30, metaQuestoes: 10, status: 'reagendada' }, { id: 'p3', data: '2026-11-26', metaMinutos: 30, metaQuestoes: 10, status: 'planejada', origemId: 'p2' }];
  const sessoes = [ses({ data: '2026-11-23', planoId: 'p1', minutos: 45, questoes: { feitas: 20, acertos: 15 } }), ses({ data: '2026-11-24', minutos: 30, questoes: { feitas: 5, acertos: 5 } }), ses({ data: '2026-11-30', minutos: 99 })];
  const r = C.resumoSemana(planos, sessoes, '2026-11-23', '2026-11-27');
  assert.equal(r.dias.length, 7);
  assert.deepEqual(r.planejado, { minutos: 90, questoes: 30 });
  assert.deepEqual(r.realizado, { minutos: 75, questoes: 25 });
  assert.equal(r.dias[0].itens[0].status, 'concluida');
  assert.equal(r.dias[3].itens[0].status, 'atrasada');   // dia 26 visto no dia 27 sem registro
});

test('estatísticas do dia não contam excluídas nem duplicadas e incluem simulados', () => {
  const s1 = ses({ id: 'x1', itemId: 'a', data: '2026-11-27', minutos: 30, questoes: { feitas: 10, acertos: 8 } });
  const sessoes = [s1, Object.assign({}, s1), ses({ itemId: 'b', data: '2026-11-27', minutos: 20 }), ses({ itemId: 'c', data: '2026-11-27', excluida: true, questoes: { feitas: 50, acertos: 50 } }), ses({ itemId: 'a', data: '2026-11-26', questoes: { feitas: 5, acertos: 5 } })];
  const sims = [{ id: 'sm', data: '2026-11-27', questoes: 20, acertos: 15, erros: 5, brancos: 0, minutos: 40 }];
  assert.deepEqual(C.resumoDia(sessoes, sims, '2026-11-27'), { assuntos: 2, sessoes: 2, questoes: 30, acertos: 23, minutos: 90 });
  const serie = C.serieDiaria(sessoes, sims, '2026-11-26', '2026-11-27');
  assert.deepEqual(serie.map(d => d.questoes), [5, 30]);
});

test('tempo médio por questão, evolução mensal e produtividade', () => {
  const sessoes = [ses({ data: '2026-11-25', minutos: 60, questoes: { feitas: 40, acertos: 30 } }), ses({ data: '2026-11-26', minutos: 30 }), ses({ data: '2026-11-27', questoes: { feitas: 10, acertos: 5 } }), ses({ data: '2026-10-10', minutos: 10, questoes: { feitas: 5, acertos: 5 } })];
  assert.equal(C.tempoMedioPorQuestao(sessoes.slice(0, 3), []), 90);
  assert.deepEqual(C.evolucaoMensal(sessoes, []).map(m => [m.mes, m.questoes]), [['2026-10', 5], ['2026-11', 50]]);
  const p = C.produtividade(sessoes, '2026-11-21', '2026-11-27');
  assert.equal(p.diasEstudados, 3);
  assert.equal(p.sequenciaAtual, 3);
  assert.equal(p.mediaMinutosDia, Math.round(90 / 7));
});

test('estatísticas por matéria e por assunto', () => {
  const itens = [item({ id: 'a', materia: 'Matemática' }), item({ id: 'b', materia: 'Matemática' }), item({ id: 'c', materia: 'Penal' })];
  const sessoes = [ses({ itemId: 'a', data: '2026-11-20', minutos: 30, questoes: { feitas: 10, acertos: 9 } }), ses({ itemId: 'c', data: '2026-11-20', minutos: 90, questoes: { feitas: 10, acertos: 3 } })];
  const pm = C.porMateria(itens, sessoes, AJ, '2026-11-27');
  assert.deepEqual(pm.map(m => [m.materia, m.minutos, m.questoes, m.acertos, m.assuntos]), [['Penal', 90, 10, 3, 1], ['Matemática', 30, 10, 9, 1]]);
  const pa = C.porAssunto(itens, sessoes, AJ, '2026-11-27');
  assert.equal(pa.length, 2);
  assert.equal(pa.find(x => x.item.id === 'c').acertos, 3);
});

test('banco de erros por motivo, matéria e assunto', () => {
  const itens = [item({ id: 'a', materia: 'Matemática' }), item({ id: 'c', materia: 'Penal' })];
  const erros = [{ id: 'e1', itemId: 'a', motivo: 'calculo', quantidade: 3 }, { id: 'e2', itemId: 'a', motivo: 'desatencao' }, { id: 'e3', itemId: 'c', motivo: 'calculo', quantidade: 2 }, { id: 'e4', itemId: 'c', motivo: 'calculo', excluida: true, quantidade: 9 }];
  const st = C.estatisticasErros(erros, itens);
  assert.equal(st.total, 6);
  assert.deepEqual(st.porMotivo, { calculo: 5, desatencao: 1 });
  assert.deepEqual(st.porMateria.map(m => [m.materia, m.total]), [['Matemática', 4], ['Penal', 2]]);
  assert.equal(st.porAssunto[0].item.id, 'a');
  assert.equal(C.MOTIVOS_ERRO.length, 6);
});

test('pontos fracos juntam domínio crítico, retomada, retenção e erros', () => {
  const itens = [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })];
  const estados = new Map([
    ['a', { status: 'retomada', dominio: { categoria: 'critico' }, retencao: { categoria: null } }],
    ['b', { status: 'ativo', dominio: { categoria: 'bom' }, retencao: { categoria: 'critico' } }],
    ['c', { status: 'ativo', dominio: { categoria: 'excelente' }, retencao: { categoria: 'bom' } }],
  ]);
  const pf = C.pontosFracos(itens, estados, { porAssunto: [{ item: itens[1], total: 6 }] });
  assert.deepEqual(pf.map(p => p.item.id), ['a', 'b']);
  assert.ok(pf[1].motivos.some(m => /erros/i.test(m)));
});

test('validarAjustes: padrões são válidos; valores que quebram os cálculos são apontados', () => {
  const pad = JSON.parse(JSON.stringify(C.AJUSTES_PADRAO));
  assert.deepEqual(C.validarAjustes(pad), []);
  const ruim = (mud) => C.validarAjustes(Object.assign(JSON.parse(JSON.stringify(pad)), mud));
  assert.deepEqual(ruim({ meiaVidaDias: 0 }), ['meiaVidaDias']);
  assert.deepEqual(ruim({ fatorDificil: 0 }), ['fatorDificil']);
  assert.deepEqual(ruim({ fatorDificil: 1.5 }), ['fatorDificil']);
  assert.deepEqual(ruim({ escada: [1, 7, 7] }), ['escada']);
  assert.deepEqual(ruim({ limiarBom: 0.5, limiarBaixo: 0.6 }).sort(), ['limiarBaixo', 'limiarBom']);
  assert.deepEqual(ruim({ categorias: { excelente: 90, bom: 95, regular: 60 } }).sort(), ['categorias.bom', 'categorias.excelente', 'categorias.regular']);
  assert.deepEqual(ruim({ pesoDominioQuestoes: 0, pesoDominioExplicacao: 0 }).sort(), ['pesoDominioExplicacao', 'pesoDominioQuestoes']);
  assert.deepEqual(ruim({ refQuestoes: 0 }), ['refQuestoes']);
  assert.deepEqual(ruim({ recorrenteN: 0 }), ['recorrenteN']);
});

/* ---------- Auditoria ---------- */
test('auditoria: duas sessões no mesmo dia contam como um dia só (a revisão de 1 dia não é pulada)', () => {
  const s = [q('2026-11-01', 10, 10, { tipo: 'estudo' }), q('2026-11-01', 10, 10, { tipo: 'revisao', explicacao: { nota: 'completo' } })];
  const e = C.calcularEstado(item(), s, AJ, '2026-11-01');
  assert.equal(e.degrau, 0);
  assert.equal(e.proxima, '2026-11-02');
});

test('auditoria: revisões no mesmo dia contam como uma revisão na retenção', () => {
  const s = [q('2026-11-01', 8, 10, { tipo: 'estudo' }), q('2026-11-02', 9, 10, { tipo: 'revisao' }), q('2026-11-02', 10, 10, { tipo: 'revisao' })];
  assert.equal(C.retencao(s, AJ, '2026-11-02').revisoes, 1);
});

test('auditoria: sessão com data no futuro não mexe na escada de hoje', () => {
  const s = [q('2026-11-20', 7, 10, { tipo: 'estudo' }), q('2026-12-20', 10, 10)];
  const e = C.calcularEstado(item(), s, AJ, '2026-11-20');
  assert.equal(e.proxima, '2026-11-21');
  assert.equal(e.degrau, 0);
});

test('auditoria: assunto arquivado sai da agenda, mas o estado continua calculável', () => {
  const it = item({ arquivado: true });
  const ag = C.agenda([it], new Map([['i1', [q('2026-11-01', 9, 10, { tipo: 'estudo' })]]]), AJ, '2026-11-20');
  assert.equal(ag.atrasadas.length + ag.hoje.length + ag.retomar.length, 0);
});

test('auditoria: sessão movida de mês (lápide) e trazida de volta revive; exclusão real continua definitiva', () => {
  let col = C.salvarRegistro(C.colecao(), { id: 's', data: '2026-11-30' }, '2026-11-27T10:00:00Z');
  col = C.moverRegistro(col, 's', '2026-12', '2026-11-27T10:01:00Z');
  assert.equal(C.registrosAtivos(col).length, 0);
  const voltou = C.salvarRegistro(col, { id: 's', data: '2026-11-29' }, '2026-11-27T10:02:00Z');
  assert.equal(C.registrosAtivos(voltou).length, 1);
  // outro aparelho ainda com a lápide: a versão revivida (mais nova) vence
  assert.equal(C.registrosAtivos(C.mesclarColecoes(col, voltou)).length, 1);
  assert.equal(C.registrosAtivos(C.mesclarColecoes(voltou, col)).length, 1);
  // exclusão real nunca é desfeita, nem por edição mais nova
  const excl = C.excluirRegistro(voltou, 's', '2026-11-27T10:03:00Z');
  const velhoEditado = C.salvarRegistro(voltou, { id: 's', data: '2026-11-28' }, '2026-11-27T10:04:00Z');
  assert.equal(C.registrosAtivos(C.mesclarColecoes(excl, velhoEditado)).length, 0);
  assert.equal(C.registrosAtivos(C.salvarRegistro(excl, { id: 's', data: '2026-11-28' }, '2026-11-27T10:05:00Z')).length, 0);
});

test('auditoria: cronômetro alterado em duas abas junta os eventos (pausa não se perde)', () => {
  const t0 = Date.parse('2026-11-27T10:00:00Z');
  const base = C.salvarRegistro(C.colecao(), Object.assign(C.cronoIniciar(t0), { id: 'cr' }), '2026-11-27T10:00:00Z');
  const comPausa = C.salvarRegistro(base, Object.assign(C.cronoAplicar(base.registros.cr, 'pausa', t0 + 10 * 60000), { id: 'cr' }), '2026-11-27T10:10:00Z');
  const comFim = C.salvarRegistro(base, Object.assign(C.cronoAplicar(base.registros.cr, 'fim', t0 + 30 * 60000), { id: 'cr' }), '2026-11-27T10:30:00Z');
  for (const m of [C.mesclarColecoes(comPausa, comFim), C.mesclarColecoes(comFim, comPausa)]){
    assert.deepEqual(m.registros.cr.eventos.map(e => e.t), ['inicio', 'pausa', 'fim']);
    assert.equal(C.cronoDuracaoMs(m.registros.cr, t0 + 60 * 60000), 10 * 60000);
  }
});

test('auditoria: critério de pontuação precisa de nome e ponto por acerto positivo', () => {
  assert.deepEqual(C.validarCriterio({ nome: 'X', pontosAcerto: 1, penalidadeErro: 0.25, pontosBranco: 0 }), []);
  assert.ok(C.validarCriterio({ nome: 'X', pontosAcerto: 0, penalidadeErro: 0, pontosBranco: 0 }).length);
  assert.ok(C.validarCriterio({ nome: 'X', pontosAcerto: 1, penalidadeErro: -1, pontosBranco: 0 }).length);
  assert.ok(C.validarCriterio({ nome: ' ', pontosAcerto: 1, penalidadeErro: 0, pontosBranco: 0 }).length);
});

test('auditoria: assunto arquivado não aparece em pontos fracos', () => {
  const it = item({ arquivado: true });
  const estados = new Map([['i1', { status: 'retomada', dominio: { categoria: 'critico' }, retencao: {} }]]);
  assert.deepEqual(C.pontosFracos([it], estados, null), []);
});
