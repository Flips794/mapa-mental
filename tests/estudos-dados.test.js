'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/estudos-core.js');
const { EstDadosCriar } = require('../js/estudos-dados.js');

const clone = (v) => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
/* armazenamento falso: se comporta como o Store (pode falhar como sem internet) */
function storeFalso(){
  const map = new Map();
  return {
    map, falhar: false, falharLeitura: false,
    async get(k){ if (this.falharLeitura) throw new Error('sem rede'); return clone(map.get(k)); },
    async setMesclando(k, v, mesclar){ if (this.falhar) return null; const m = mesclar(clone(v), clone(map.get(k))); map.set(k, clone(m)); return clone(m); },
  };
}
function localFalso(){ const map = new Map(); return { map, async get(k){ return clone(map.get(k)); }, async set(k, v){ map.set(k, clone(v)); return true; } }; }
let relogio = Date.parse('2026-11-27T10:00:00Z');
const agora = () => new Date(relogio += 1000).toISOString();
let seq = 0;
const novoId = () => 'id' + (++seq);
const criar = (store, local) => EstDadosCriar({ store, local, core: C, agora, id: novoId });

const sessao = (o) => Object.assign({ id: novoId(), itemId: 'i1', data: '2026-11-27', tipo: 'estudo', metodos: [], questoes: { feitas: 10, acertos: 8 } }, o);

test('salvar e recarregar em outra instância traz os mesmos dados', async () => {
  const store = storeFalso();
  const a = criar(store, localFalso()); await a.carregar();
  await a.salvarItem({ id: 'i1', tipo: 'topico', caminho: 'Mat › 01', materia: 'Matemática' });
  const s = sessao(); await a.salvarSessao(s);
  const b = criar(store, localFalso()); await b.carregar();
  assert.equal(b.todas('itens').length, 1);
  assert.deepEqual(b.sessoesDoItem('i1').map(x => x.id), [s.id]);
  assert.ok(store.map.has('est:sessoes-2026-11'));
  assert.ok(store.map.has('est:indice'));
});

test('salvar a mesma sessão duas vezes não duplica', async () => {
  const store = storeFalso(); const a = criar(store, localFalso()); await a.carregar();
  const s = sessao(); await a.salvarSessao(s); await a.salvarSessao(clone(s));
  assert.equal(a.todas('sessoes').length, 1);
});

test('dois aparelhos salvando no mesmo mês: as duas sessões ficam', async () => {
  const store = storeFalso();
  const a = criar(store, localFalso()), b = criar(store, localFalso());
  await a.carregar(); await b.carregar();
  const sa = sessao(), sb = sessao({ itemId: 'i2' });
  await a.salvarSessao(sa); await b.salvarSessao(sb);
  const c = criar(store, localFalso()); await c.carregar();
  assert.deepEqual(c.todas('sessoes').map(x => x.id).sort(), [sa.id, sb.id].sort());
  assert.equal(b.todas('sessoes').length, 2);     // b adotou a versão mesclada
});

test('aparelho desatualizado não desfaz uma exclusão', async () => {
  const store = storeFalso();
  const a = criar(store, localFalso()); await a.carregar();
  const s = sessao(); await a.salvarSessao(s);
  const b = criar(store, localFalso()); await b.carregar();
  await a.excluirSessao(s.id);
  await b.salvarSessao(sessao({ itemId: 'outro' }));   // b ainda tem a sessão como ativa
  const c = criar(store, localFalso()); await c.carregar();
  assert.equal(c.todas('sessoes').some(x => x.id === s.id), false);
  assert.equal(c.todas('sessoes').length, 1);
});

test('sem internet: o registro fica na cópia local e sobe depois', async () => {
  const store = storeFalso(), local = localFalso();
  const a = criar(store, local); await a.carregar();
  store.falhar = true;
  const s = sessao(); await a.salvarSessao(s);
  assert.ok(a.pendentes().includes('est:sessoes-2026-11'));
  assert.equal(store.map.has('est:sessoes-2026-11'), false);
  // aba fechada; reabre com internet de volta
  store.falhar = false;
  const b = criar(store, local); await b.carregar();
  assert.deepEqual(b.todas('sessoes').map(x => x.id), [s.id]);
  await b.sincronizar();
  assert.equal(b.pendentes().length, 0);
  assert.equal(Object.keys(store.map.get('est:sessoes-2026-11').registros).length, 1);
});

test('leitura remota falhando ao abrir usa a cópia local sem perder nada', async () => {
  const store = storeFalso(), local = localFalso();
  const a = criar(store, local); await a.carregar();
  const s = sessao(); await a.salvarSessao(s);
  store.falharLeitura = true;
  const b = criar(store, local); const r = await b.carregar();
  assert.equal(r.offline, true);
  assert.deepEqual(b.todas('sessoes').map(x => x.id), [s.id]);
});

test('mudar a data de uma sessão para outro mês não duplica', async () => {
  const store = storeFalso(); const a = criar(store, localFalso()); await a.carregar();
  const s = sessao({ data: '2026-11-30' }); await a.salvarSessao(s);
  await a.salvarSessao(Object.assign(clone(s), { data: '2026-12-01' }));
  const b = criar(store, localFalso()); await b.carregar();
  const todas = b.todas('sessoes');
  assert.equal(todas.length, 1);
  assert.equal(todas[0].data, '2026-12-01');
});

test('excluir a sessão exclui os erros classificados nela', async () => {
  const store = storeFalso(); const a = criar(store, localFalso()); await a.carregar();
  const s = sessao(); await a.salvarSessao(s);
  await a.salvarErro({ id: 'e1', itemId: 'i1', sessaoId: s.id, data: s.data, motivo: 'calculo', quantidade: 2 });
  await a.salvarErro({ id: 'e2', itemId: 'i1', data: s.data, motivo: 'desatencao' });
  await a.excluirSessao(s.id);
  assert.deepEqual(a.todas('erros').map(e => e.id), ['e2']);
});

test('reagendar atividade para outro mês cria a nova e marca a antiga', async () => {
  const store = storeFalso(); const a = criar(store, localFalso()); await a.carregar();
  await a.salvarPlano({ id: 'p1', data: '2026-11-30', itemId: 'i1', metaMinutos: 60, metaQuestoes: 10, status: 'planejada' });
  const novo = await a.reagendarPlano('p1', '2026-12-02');
  const b = criar(store, localFalso()); await b.carregar();
  const ps = b.todas('planos');
  assert.equal(ps.find(p => p.id === 'p1').status, 'reagendada');
  assert.equal(ps.find(p => p.id === novo).data, '2026-12-02');
  assert.equal(ps.find(p => p.id === novo).origemId, 'p1');
});

test('ajustes salvos se juntam aos padrões; cronômetro ativo persiste', async () => {
  const store = storeFalso(); const a = criar(store, localFalso()); await a.carregar();
  assert.deepEqual(a.ajustes().escada, [1, 7, 15, 30, 60]);
  await a.salvarAjustes({ limiarBaixo: 0.5, categorias: { excelente: 92, bom: 75, regular: 60 } });
  const c = Object.assign(C.cronoIniciar(Date.parse('2026-11-27T10:00:00Z')), { id: 'cr1' });
  await a.salvarCronometro(c);
  const b = criar(store, localFalso()); await b.carregar();
  assert.equal(b.ajustes().limiarBaixo, 0.5);
  assert.equal(b.ajustes().categorias.excelente, 92);
  assert.equal(b.ajustes().limiarBom, 0.85);
  assert.equal(b.cronometroAtivo().id, 'cr1');
  await b.descartarCronometro('cr1');
  assert.equal(b.cronometroAtivo(), null);
});

test('exportar e importar em armazenamento vazio reproduz tudo', async () => {
  const store = storeFalso(); const a = criar(store, localFalso()); await a.carregar();
  await a.salvarItem({ id: 'i1', tipo: 'livre', caminho: 'Lei seca' });
  await a.salvarSessao(sessao());
  await a.salvarSimulado({ id: 'sm1', data: '2026-11-27', criterioId: 'cebraspe', questoes: 10, acertos: 7, erros: 3, brancos: 0 });
  const pacote = a.exportar();
  const store2 = storeFalso(); const b = criar(store2, localFalso()); await b.carregar();
  await b.importar(clone(pacote));
  const c = criar(store2, localFalso()); await c.carregar();
  assert.equal(c.todas('itens').length, 1);
  assert.equal(c.todas('sessoes').length, 1);
  assert.equal(c.todas('simulados').length, 1);
});

test('critério próprio fica junto, mas fora da lista de simulados', async () => {
  const store = storeFalso(); const a = criar(store, localFalso()); await a.carregar();
  await a.salvarSimulado({ id: 'cr', tipoRegistro: 'criterio', nome: 'Banca X', pontosAcerto: 2, penalidadeErro: 0.5, pontosBranco: 0 });
  await a.salvarSimulado({ id: 'sm1', data: '2026-11-27', criterioId: 'cr', questoes: 10, acertos: 6, erros: 4, brancos: 0 });
  assert.deepEqual(a.simulados().map(s => s.id), ['sm1']);
  assert.deepEqual(a.criterios().map(c => c.id), ['cebraspe', 'simples', 'cr']);
});

test('depois de sincronizar com sucesso, deixa de indicar "sem conexão"', async () => {
  const store = storeFalso(), local = localFalso();
  const a = criar(store, local); await a.carregar();
  await a.salvarSessao(sessao());
  store.falharLeitura = true;
  const b = criar(store, local); await b.carregar();
  assert.equal(b.estaOffline(), true);
  store.falharLeitura = false;
  assert.equal(await b.sincronizar(), true);
  assert.equal(b.estaOffline(), false);
});

/* ---------- Auditoria ---------- */
test('auditoria: alteração feita durante um envio lento não se perde', async () => {
  const store = storeFalso(), local = localFalso();
  const orig = store.setMesclando.bind(store);
  let liberar, primeira = true; const portao = new Promise(r => { liberar = r; });
  store.setMesclando = async (k, v, m) => { if (primeira && k === 'est:sessoes-2026-11'){ primeira = false; await portao; } return orig(k, v, m); };
  const a = criar(store, local); await a.carregar();
  const s1 = sessao(), s2 = sessao();
  const p1 = a.salvarSessao(s1);
  await new Promise(r => setTimeout(r, 5));
  const p2 = a.salvarSessao(s2);
  liberar(); await p1; await p2;
  const ids = [s1.id, s2.id].sort();
  assert.deepEqual(a.todas('sessoes').map(s => s.id).sort(), ids);
  assert.deepEqual(Object.keys(store.map.get('est:sessoes-2026-11').registros).sort(), ids);
  assert.deepEqual(Object.keys(local.map.get('estlocal:est:sessoes-2026-11').registros).sort(), ids);
});

test('auditoria: duas abas sem internet no mesmo navegador não apagam o registro uma da outra', async () => {
  const store = storeFalso(), local = localFalso();
  const a = criar(store, local), b = criar(store, local); await a.carregar(); await b.carregar();
  store.falhar = true;
  const sa = sessao(), sb = sessao();
  await a.salvarSessao(sa); await b.salvarSessao(sb);
  store.falhar = false;
  const c = criar(store, local); await c.carregar(); await c.sincronizar();
  assert.deepEqual(Object.keys(store.map.get('est:sessoes-2026-11').registros).sort(), [sa.id, sb.id].sort());
});

test('auditoria: sessão movida para outro mês e depois de volta continua existindo', async () => {
  const store = storeFalso(); const a = criar(store, localFalso()); await a.carregar();
  const s = sessao({ data: '2026-11-30' }); await a.salvarSessao(s);
  await a.salvarSessao(Object.assign(clone(s), { data: '2026-12-01' }));
  await a.salvarSessao(Object.assign(clone(s), { data: '2026-11-29' }));
  const b = criar(store, localFalso()); await b.carregar();
  assert.deepEqual(b.todas('sessoes').map(x => x.data), ['2026-11-29']);
  assert.deepEqual(a.todas('sessoes').map(x => x.data), ['2026-11-29']);
});

test('auditoria: aparelho aberto há horas enxerga o que outro aparelho registrou, sem perder o que é seu', async () => {
  const store = storeFalso(), local = localFalso();
  const a = criar(store, local); await a.carregar();
  const b = criar(store, localFalso()); await b.carregar();
  store.falhar = true; const sa = sessao(); await a.salvarSessao(sa); store.falhar = false;   // a ainda não enviou
  const sb = sessao(); await b.salvarSessao(sb);
  await a.atualizar();
  assert.deepEqual(a.todas('sessoes').map(x => x.id).sort(), [sa.id, sb.id].sort());
  assert.ok(a.pendentes().includes('est:sessoes-2026-11'));
  await a.sincronizar();
  assert.deepEqual(Object.keys(store.map.get('est:sessoes-2026-11').registros).sort(), [sa.id, sb.id].sort());
});

test('auditoria: cronômetro pausado em outra aba aparece antes de finalizar aqui', async () => {
  const store = storeFalso();
  const a = criar(store, localFalso()), b = criar(store, localFalso()); await a.carregar();
  const t0 = Date.parse('2026-11-27T10:00:00Z');
  await a.salvarCronometro(Object.assign(C.cronoIniciar(t0), { id: 'cr' }));
  await b.carregar();
  await a.salvarCronometro(Object.assign(C.cronoAplicar(a.cronometroAtivo(), 'pausa', t0 + 10 * 60000), { id: 'cr' }));
  await b.atualizar(['cronometro']);
  assert.equal(C.cronoEstado(b.cronometroAtivo()), 'pausado');
});

test('auditoria: excluir um critério próprio não muda a nota dos simulados que o usaram', async () => {
  const store = storeFalso(); const a = criar(store, localFalso()); await a.carregar();
  await a.salvarSimulado({ id: 'cr', tipoRegistro: 'criterio', nome: 'Banca X', pontosAcerto: 2, penalidadeErro: 0.5, pontosBranco: 0 });
  await a.salvarSimulado({ id: 'sm1', data: '2026-11-27', criterioId: 'cr', questoes: 10, acertos: 6, erros: 4, brancos: 0 });
  await a.excluirSimulado('cr');
  assert.deepEqual(a.criterios().map(c => c.id), ['cebraspe', 'simples']);
  const ev = C.evolucaoSimulados(a.simulados(), a.criteriosParaCalculo());
  assert.equal(ev[0].nota, 10);   // 6×2 − 4×0,5
});

test('auditoria: cópia local de outro repositório não vaza para este', async () => {
  const local = localFalso(), storeX = storeFalso(), storeY = storeFalso();
  const a = EstDadosCriar({ store: storeX, local, core: C, agora, id: novoId, escopo: 'gh:dono/repoX' }); await a.carregar();
  storeX.falhar = true; await a.salvarSessao(sessao());          // ficou só na cópia local do repoX
  const b = EstDadosCriar({ store: storeY, local, core: C, agora, id: novoId, escopo: 'gh:dono/repoY' }); await b.carregar();
  assert.equal(b.todas('sessoes').length, 0);
  await b.sincronizar();
  assert.equal(storeY.map.has('est:sessoes-2026-11'), false);
});

test('auditoria: cópia local antiga (sem escopo) continua valendo para o armazenamento principal', async () => {
  const local = localFalso(), store = storeFalso();
  const s = sessao();
  local.map.set('estlocal:est:indice', { versao: 1, registros: { 'sessoes-2026-11': { id: 'sessoes-2026-11', tipo: 'sessoes', mes: '2026-11' } } });
  local.map.set('estlocal:est:sessoes-2026-11', { versao: 1, registros: { [s.id]: s } });
  const a = EstDadosCriar({ store, local, core: C, agora, id: novoId, escopo: 'gh:Flips794/mapa-mental-dados', jornalLegado: true }); await a.carregar();
  assert.deepEqual(a.todas('sessoes').map(x => x.id), [s.id]);
  await a.sincronizar();
  assert.ok(store.map.get('est:sessoes-2026-11').registros[s.id]);
});
