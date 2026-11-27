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
  // a cópia local é separada por armazenamento (repositório/ramo/servidor): trocar de repositório não mistura estudos
  const jornal = (k) => 'estlocal:' + (opts.escopo ? opts.escopo + '|' : '') + k;
  const jornalAntigo = (k) => 'estlocal:' + k;     // cópias gravadas antes do escopo existir (só do armazenamento principal)

  /* lê do armazenamento principal e MESCLA com a cópia local e com o que já está na memória
     (nunca substitui: uma alteração feita enquanto a leitura acontecia continua valendo) */
  async function lerUma(k){
    let remoto = null, falhou = false;
    try { remoto = await store.get(k) || null; } catch (e) { falhou = true; offline = true; }
    let copia = local ? (await local.get(jornal(k)) || null) : null;
    if (local && opts.escopo && opts.jornalLegado) copia = C.mesclarColecoes(copia, await local.get(jornalAntigo(k)) || null);
    const antes = cols.get(k) || null;
    const m = C.mesclarColecoes(C.mesclarColecoes(remoto, copia), antes);
    cols.set(k, m);
    const temDados = Object.keys(m.registros).length > 0;
    if ((falhou && temDados) || (!falhou && C.estavel(m) !== C.estavel(remoto || C.colecao()))) pend.add(k);
    return !antes || C.estavel(antes) !== C.estavel(m);
  }

  /* relê tudo (ou só alguns tipos) — usado ao abrir, ao voltar para a aba e antes de mexer no cronômetro */
  async function atualizar(tipos){
    if (!tipos) offline = false;
    const unicos = tipos ? UNICOS.filter(t => tipos.includes(t) || (t === 'indice' && tipos.some(x => MENSAIS.includes(x)))) : UNICOS;
    const r1 = await Promise.all(unicos.map(t => lerUma(chave(t))));
    const mensais = tipos ? MENSAIS.filter(t => tipos.includes(t)) : MENSAIS;
    const meses = C.registrosAtivos(col('est:indice')).filter(r => mensais.includes(r.tipo)).map(r => r.id);
    const r2 = await Promise.all(meses.map(id => lerUma('est:' + id)));
    return { offline, pendentes: [...pend], mudou: r1.concat(r2).some(Boolean) };
  }
  const carregar = () => atualizar();

  /* cópia local: junta com a que já existe (outra aba do mesmo navegador pode ter gravado nela) */
  async function gravarJornal(k, v){
    const cur = await local.get(jornal(k)) || null;
    await local.set(jornal(k), C.mesclarColecoes(cur, v));
  }

  /* grava: primeiro a cópia local, depois o armazenamento principal (mesclando com o que já está lá) */
  function gravar(k){
    const anterior = filas.get(k) || Promise.resolve();
    const p = anterior.then(async () => {
      if (local) await gravarJornal(k, col(k));
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
    // junta com a memória: o que foi alterado durante o envio continua (e segue pendente até subir)
    const m = C.mesclarColecoes(res, cols.get(k) || null);
    cols.set(k, m);
    if (local) await gravarJornal(k, m);
    if (C.estavel(m) === C.estavel(res)) pend.delete(k);
    return true;
  }
  async function sincronizar(){
    const lista = [...pend];
    const r = await Promise.all(lista.map(k => (filas.get(k) || Promise.resolve()).then(() => pend.has(k) ? enviar(k) : true)));
    if (r.every(Boolean) && !pend.size) offline = false;   // tudo lido e confirmado de novo no armazenamento principal
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
    const porId = new Map(), excluidosDeVez = new Set();
    for (const mes of mesesDe(tipo)) for (const r of Object.values(col(chave(tipo, mes)).registros)){
      if (C.excluidaDeVez(r)) excluidosDeVez.add(r.id);
      const atual = porId.get(r.id);
      if (!atual || (atual.excluida && !r.excluida) || (!!atual.excluida === !!r.excluida && (r.atualizadoEm || '') > (atual.atualizadoEm || ''))) porId.set(r.id, r);
    }
    return [...porId.values()].filter(r => !r.excluida && !excluidosDeVez.has(r.id));   // exclusão em qualquer mês vale para todos
  }
  function todas(tipo){ return MENSAIS.includes(tipo) ? todasMensal(tipo) : C.registrosAtivos(col(chave(tipo))); }
  function mesDoRegistro(tipo, id){
    for (const mes of mesesDe(tipo)){ const r = col(chave(tipo, mes)).registros[id]; if (r && !r.excluida) return mes; }
    return null;
  }

  async function salvarMensal(tipo, reg){
    const mes = C.mesDe(reg.data), antigo = mesDoRegistro(tipo, reg.id), trabalhos = [];
    if (antigo && antigo !== mes){
      const k = chave(tipo, antigo);
      cols.set(k, C.moverRegistro(col(k), reg.id, mes, agora()));
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
    carregar, atualizar, sincronizar, novoId,
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
    /* para calcular notas: inclui critérios excluídos (o simulado antigo mantém a nota com que foi feito) */
    criteriosParaCalculo(){
      const todosProprios = Object.values(col('est:simulados').registros).filter(r => r.tipoRegistro === 'criterio');
      return C.CRITERIOS_PADRAO.concat(todosProprios);
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
