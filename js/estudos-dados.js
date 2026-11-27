/* =========================================================
   Estudos — persistência. Coleções no Store (GitHub / servidor /
   navegador), mescladas entre aparelhos, com cópia local de
   segurança: se a gravação falhar, nada se perde e sobe depois.
   ========================================================= */
(function(root){
"use strict";

const MENSAIS = ['sessoes', 'planos', 'erros'];
const UNICOS = ['itens', 'simulados', 'ajustes', 'cronometro', 'indice'];
const chave = (tipo, mes) => 'est:' + tipo + (mes ? '-' + mes : '');

function EstDadosCriar(opts){
  const { store, local, core: C } = opts;
  const agora = opts.agora || (() => new Date().toISOString());
  const novoId = opts.id || (() => 'e' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4));
  const cols = new Map();          // chave -> coleção atual
  const pend = new Set();          // chaves com alterações ainda não confirmadas no armazenamento principal
  const filas = new Map();         // uma gravação por chave por vez
  let offline = false;

  const col = (k) => cols.get(k) || C.colecao();
  const jornal = (k) => 'estlocal:' + k;

  async function lerUma(k){
    let remoto = null, falhou = false;
    try { remoto = await store.get(k) || null; } catch (e) { falhou = true; offline = true; }
    const copia = local ? (await local.get(jornal(k)) || null) : null;
    const m = C.mesclarColecoes(remoto, copia);
    cols.set(k, m);
    if (falhou || (copia && C.estavel(m) !== C.estavel(remoto || C.colecao()))) pend.add(k);
  }

  async function carregar(){
    offline = false;
    await Promise.all(UNICOS.map(t => lerUma(chave(t))));
    const meses = C.registrosAtivos(col('est:indice')).map(r => r.id);
    await Promise.all(meses.map(id => lerUma('est:' + id)));
    return { offline, pendentes: [...pend] };
  }

  /* grava: primeiro a cópia local, depois o armazenamento principal (mesclando com o que já está lá) */
  function gravar(k){
    const anterior = filas.get(k) || Promise.resolve();
    const p = anterior.then(async () => {
      if (local) await local.set(jornal(k), col(k));
      pend.add(k);
      return enviar(k);
    });
    filas.set(k, p.catch(() => {}));
    return p;
  }
  async function enviar(k){
    let res = null;
    try { res = await store.setMesclando(k, col(k), C.mesclarColecoes); } catch (e) { res = null; }
    if (!res) return false;
    cols.set(k, res);
    if (local) await local.set(jornal(k), res);
    pend.delete(k);
    return true;
  }
  async function sincronizar(){
    const lista = [...pend];
    const r = await Promise.all(lista.map(k => (filas.get(k) || Promise.resolve()).then(() => pend.has(k) ? enviar(k) : true)));
    return r.every(Boolean);
  }

  function registrarMes(tipo, mes){
    const id = tipo + '-' + mes, ind = col('est:indice');
    if (ind.registros[id] && !ind.registros[id].excluida) return null;
    cols.set('est:indice', C.salvarRegistro(ind, { id, tipo, mes }, agora()));
    return gravar('est:indice');
  }
  function mesesDe(tipo){ return C.registrosAtivos(col('est:indice')).filter(r => r.tipo === tipo).map(r => r.mes).sort(); }

  /* todas as versões de um tipo mensal juntas: a cópia ativa vence a excluída (sessão movida de mês) */
  function todasMensal(tipo){
    const porId = new Map();
    for (const mes of mesesDe(tipo)) for (const r of Object.values(col(chave(tipo, mes)).registros)){
      const atual = porId.get(r.id);
      if (!atual || (atual.excluida && !r.excluida) || (!!atual.excluida === !!r.excluida && (r.atualizadoEm || '') > (atual.atualizadoEm || ''))) porId.set(r.id, r);
    }
    return [...porId.values()].filter(r => !r.excluida);
  }
  function todas(tipo){ return MENSAIS.includes(tipo) ? todasMensal(tipo) : C.registrosAtivos(col(chave(tipo))); }
  function mesDoRegistro(tipo, id){
    for (const mes of mesesDe(tipo)){ const r = col(chave(tipo, mes)).registros[id]; if (r && !r.excluida) return mes; }
    return null;
  }

  async function salvarMensal(tipo, reg){
    const mes = C.mesDe(reg.data), antigo = mesDoRegistro(tipo, reg.id), trabalhos = [];
    if (antigo && antigo !== mes){
      const k = chave(tipo, antigo), velho = col(k).registros[reg.id];
      let c = C.salvarRegistro(col(k), Object.assign({}, velho, { movidaPara: mes }), agora());
      cols.set(k, C.excluirRegistro(c, reg.id, agora()));
      trabalhos.push(gravar(k));
    }
    const k = chave(tipo, mes);
    const antes = col(k);
    const depois = C.salvarRegistro(antes, reg, agora());
    if (depois !== antes){ cols.set(k, depois); trabalhos.push(gravar(k)); }
    const r = registrarMes(tipo, mes); if (r) trabalhos.push(r);
    await Promise.all(trabalhos);
    return reg.id;
  }
  async function excluirMensal(tipo, id){
    const mes = mesDoRegistro(tipo, id); if (!mes) return false;
    const k = chave(tipo, mes);
    cols.set(k, C.excluirRegistro(col(k), id, agora()));
    await gravar(k);
    return true;
  }
  async function salvarUnico(tipo, reg){
    const k = chave(tipo), antes = col(k), depois = C.salvarRegistro(antes, reg, agora());
    if (depois !== antes){ cols.set(k, depois); await gravar(k); }
    return reg.id;
  }
  async function excluirUnico(tipo, id){
    const k = chave(tipo);
    cols.set(k, C.excluirRegistro(col(k), id, agora()));
    await gravar(k);
  }

  return {
    carregar, sincronizar, novoId,
    pendentes: () => [...pend],
    estaOffline: () => offline,
    todas,
    sessoesDoItem: (id) => todasMensal('sessoes').filter(s => s.itemId === id),
    item: (id) => { const r = col('est:itens').registros[id]; return r && !r.excluida ? r : null; },

    salvarItem: (i) => salvarUnico('itens', i),
    excluirItem: (id) => excluirUnico('itens', id),
    salvarSessao: (s) => salvarMensal('sessoes', s),
    async excluirSessao(id){
      const ok = await excluirMensal('sessoes', id);
      // erros classificados naquela sessão deixam de contar junto com ela
      for (const e of todasMensal('erros').filter(e => e.sessaoId === id)) await excluirMensal('erros', e.id);
      return ok;
    },
    salvarPlano: (p) => salvarMensal('planos', p),
    excluirPlano: (id) => excluirMensal('planos', id),
    async reagendarPlano(id, novaData){
      const orig = todasMensal('planos').find(p => p.id === id); if (!orig) return null;
      const novo = novoId();
      const base = Object.assign({}, orig); delete base.criadoEm; delete base.atualizadoEm; delete base.versoes;
      await salvarMensal('planos', Object.assign({}, base, { status: 'reagendada', reagendadaPara: novaData }));
      const n = Object.assign({}, base, { id: novo, data: novaData, status: 'planejada', origemId: id }); delete n.reagendadaPara;
      await salvarMensal('planos', n);
      return novo;
    },
    salvarErro: (e) => salvarMensal('erros', e),
    excluirErro: (id) => excluirMensal('erros', id),
    simulados: () => todas('simulados').filter(r => r.tipoRegistro !== 'criterio'),
    salvarSimulado: (s) => salvarUnico('simulados', s),
    excluirSimulado: (id) => excluirUnico('simulados', id),

    ajustes(){
      const salvo = col('est:ajustes').registros.padrao || {};
      const out = JSON.parse(JSON.stringify(C.AJUSTES_PADRAO));
      for (const k of Object.keys(out)) if (salvo[k] !== undefined){
        out[k] = out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]) ? Object.assign(out[k], salvo[k]) : salvo[k];
      }
      return out;
    },
    salvarAjustes: (a) => salvarUnico('ajustes', Object.assign({}, a, { id: 'padrao' })),
    criterios(){
      const proprios = todas('simulados').filter(r => r.tipoRegistro === 'criterio');
      return C.CRITERIOS_PADRAO.concat(proprios);
    },

    cronometroAtivo(){
      const ativos = C.registrosAtivos(col('est:cronometro')).sort((a, b) => (a.atualizadoEm || '') < (b.atualizadoEm || '') ? 1 : -1);
      return ativos[0] || null;
    },
    salvarCronometro: (c) => salvarUnico('cronometro', c),
    descartarCronometro: (id) => excluirUnico('cronometro', id),

    exportar(){
      const arquivos = {};
      for (const [k, v] of cols) arquivos[k] = v;
      return { versao: 1, arquivos };
    },
    async importar(pacote){
      if (!pacote || !pacote.arquivos) return 0;
      let n = 0;
      const ks = Object.keys(pacote.arquivos).filter(k => /^est:[a-z]+(-\d{4}-\d{2})?$/.test(k));
      ks.sort((a, b) => (a === 'est:indice') - (b === 'est:indice'));   // índice por último
      for (const k of ks){
        cols.set(k, C.mesclarColecoes(col(k), pacote.arquivos[k]));
        const m = /^est:([a-z]+)-(\d{4}-\d{2})$/.exec(k);
        if (m) await registrarMes(m[1], m[2]);
        await gravar(k); n++;
      }
      return n;
    },
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { EstDadosCriar };
else root.EstDadosCriar = EstDadosCriar;
})(typeof self !== 'undefined' ? self : this);
