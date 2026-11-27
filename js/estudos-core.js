/* =========================================================
   Estudos — regras puras (sem DOM). Funciona no navegador
   (global EstCore) e no Node (require) para os testes.
   Spec: docs/superpowers/specs/2026-11-27-calendario-estudos-design.md
   ========================================================= */
(function(root){
"use strict";

/* ---------- Parâmetros iniciais (todos editáveis em Ajustes) ---------- */
const AJUSTES_PADRAO = Object.freeze({
  escada: [1, 7, 15, 30, 60],
  degrauExtra: 120,            // só para domínio consolidado
  fatorDificil: 0.7,
  limiarBom: 0.85,
  limiarBaixo: 0.60,
  dominioConsolidado: 85,
  dominioEsquecimento: 75,
  recorrenteN: 3,
  minQuestoes: 20,
  minAvaliadas: 2,
  minRevisoesRetencao: 2,
  meiaVidaDias: 60,
  categorias: { excelente: 90, bom: 75, regular: 60 },
  pesoQuestoes: 2, refQuestoes: 10, pesoExplicacao: 2, pesoPercebida: 1,
  percebidaValor: { facil: 0.9, ok: 0.7, dificil: 0.4 },
  notaExplicacao: { completo: 1, pouco: 0.7, muito: 0.4 },
  pesoDominioQuestoes: 0.6, pesoDominioExplicacao: 0.4,
  ajustePercebida: { dificil: -5, facil: 2 },
  alertaCronometroHoras: 6,
});

/* ---------- Datas (sempre no fuso local, formato AAAA-MM-DD) ---------- */
const pad = (n) => String(n).padStart(2, '0');
function fmt(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function parseData(s){ const [a, m, d] = String(s).split('-').map(Number); return new Date(a, m - 1, d); }
function hoje(date){
  if (!date && api._hoje) return api._hoje;          // permite simular o dia em testes de navegador
  return fmt(date || new Date());
}
function addDias(data, n){ const d = parseData(data); d.setDate(d.getDate() + n); return fmt(d); }
function diffDias(a, b){ return Math.round((parseData(b) - parseData(a)) / 86400000); }
function mesDe(data){ return String(data).slice(0, 7); }
function inicioSemana(data){ const d = parseData(data); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return fmt(d); }

/* ---------- Duração digitada → minutos ---------- */
function parseDuracao(texto){
  if (texto == null) return null;
  const t = String(texto).trim().toLowerCase().replace(/\s+/g, '');
  if (!t) return null;
  let m;
  if ((m = /^(\d+):(\d{1,2})$/.exec(t))) return Number(m[1]) * 60 + Number(m[2]);
  if ((m = /^(?:(\d+)h)?(?:(\d+)(?:min|m)?)?$/.exec(t)) && (m[1] || m[2])) return Number(m[1] || 0) * 60 + Number(m[2] || 0);
  return null;
}

/* ---------- Cronômetro: lista de eventos com hora ---------- */
const iso = (ms) => new Date(ms).toISOString();
function cronoIniciar(agoraMs){ return { eventos: [{ t: 'inicio', em: iso(agoraMs) }] }; }
function cronoEstado(c){
  if (!c || !c.eventos || !c.eventos.length) return 'parado';
  const ult = c.eventos[c.eventos.length - 1].t;
  return ult === 'fim' ? 'finalizado' : ult === 'pausa' ? 'pausado' : 'rodando';
}
function cronoAplicar(c, tipo, agoraMs){
  const est = cronoEstado(c);
  const ok = (tipo === 'pausa' && est === 'rodando') || (tipo === 'retomada' && est === 'pausado') || (tipo === 'fim' && (est === 'rodando' || est === 'pausado'));
  if (!ok) throw new Error('Cronômetro: não dá para "' + tipo + '" quando está ' + est);
  return { eventos: c.eventos.concat([{ t: tipo, em: iso(agoraMs) }]) };
}
function cronoDuracaoMs(c, agoraMs){
  if (!c || !c.eventos) return 0;
  let total = 0, desde = null;
  for (const e of c.eventos){
    const t = Date.parse(e.em);
    if (e.t === 'inicio' || e.t === 'retomada'){ desde = t; }
    else if ((e.t === 'pausa' || e.t === 'fim') && desde != null){ total += t - desde; desde = null; }
  }
  if (desde != null) total += Math.max(0, agoraMs - desde);
  return total;
}
function cronoDataInicio(c){ return c && c.eventos && c.eventos.length ? fmt(new Date(c.eventos[0].em)) : null; }

/* ---------- Coleções {versao, registros:{id: registro}} — nada é apagado de verdade ---------- */
const META = new Set(['criadoEm', 'atualizadoEm', 'versoes', 'excluida', 'excluidaEm']);
function estavel(v){
  if (Array.isArray(v)) return '[' + v.map(estavel).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + estavel(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
function conteudo(r){ const o = {}; for (const k of Object.keys(r || {})) if (!META.has(k)) o[k] = r[k]; return o; }
function colecao(){ return { versao: 1, registros: {} }; }
function salvarRegistro(col, reg, agoraISO){
  col = col || colecao();
  const atual = col.registros[reg.id];
  const novoConteudo = conteudo(reg);
  if (atual && estavel(conteudo(atual)) === estavel(novoConteudo)) return col;   // idêntico: nada muda
  const r = Object.assign({}, novoConteudo, {
    criadoEm: atual ? atual.criadoEm : (reg.criadoEm || agoraISO),
    atualizadoEm: agoraISO,
    versoes: atual ? (atual.versoes || []).concat([Object.assign(conteudo(atual), { criadoEm: atual.criadoEm, atualizadoEm: atual.atualizadoEm, em: agoraISO })]) : [],
  });
  if (atual && atual.excluida){ r.excluida = true; r.excluidaEm = atual.excluidaEm; }
  return { versao: col.versao || 1, registros: Object.assign({}, col.registros, { [reg.id]: r }) };
}
function excluirRegistro(col, id, agoraISO){
  const atual = col && col.registros[id];
  if (!atual || atual.excluida) return col;
  return { versao: col.versao || 1, registros: Object.assign({}, col.registros, { [id]: Object.assign({}, atual, { excluida: true, excluidaEm: agoraISO, atualizadoEm: agoraISO }) }) };
}
function registrosAtivos(col){ return col ? Object.values(col.registros).filter(r => !r.excluida) : []; }
function mesclarRegistro(a, b){
  const ta = a.atualizadoEm || '', tb = b.atualizadoEm || '';
  const vence = ta > tb ? a : tb > ta ? b : (estavel(a) >= estavel(b) ? a : b);
  const r = Object.assign({}, vence);
  const vistos = new Map();
  for (const v of (a.versoes || []).concat(b.versoes || [])) vistos.set((v.em || '') + estavel(conteudo(v)), v);
  r.versoes = [...vistos.entries()].sort((x, y) => x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0).map(e => e[1]);
  if (a.excluida || b.excluida){
    r.excluida = true;
    r.excluidaEm = [a.excluidaEm, b.excluidaEm].filter(Boolean).sort().pop() || r.atualizadoEm;
  }
  return r;
}
function mesclarColecoes(a, b){
  if (!a) return b ? JSON.parse(JSON.stringify(b)) : colecao();
  if (!b) return JSON.parse(JSON.stringify(a));
  const ids = [...new Set(Object.keys(a.registros || {}).concat(Object.keys(b.registros || {})))].sort();
  const registros = {};
  for (const id of ids){
    const ra = a.registros[id], rb = b.registros[id];
    registros[id] = ra && rb ? mesclarRegistro(ra, rb) : JSON.parse(JSON.stringify(ra || rb));
  }
  return { versao: Math.max(a.versao || 1, b.versao || 1), registros };
}

/* ---------- Evidências, domínio e retenção ---------- */
function ordenarSessoes(sessoes){
  return (sessoes || []).filter(s => s && !s.excluida).slice().sort((a, b) =>
    a.data < b.data ? -1 : a.data > b.data ? 1 : (a.criadoEm || '') < (b.criadoEm || '') ? -1 : (a.criadoEm || '') > (b.criadoEm || '') ? 1 : (a.id < b.id ? -1 : 1));
}
function valorExplicacao(e, aj){
  if (!e) return null;
  if (Array.isArray(e.marcados) && e.total > 0) return Math.min(1, e.marcados.length / e.total);
  if (e.nota && aj.notaExplicacao[e.nota] != null) return aj.notaExplicacao[e.nota];
  return null;
}
/* Resultado de recuperação de uma sessão (0–1), ou null sem evidência (spec 7.1) */
function resultadoSessao(s, aj){
  aj = aj || AJUSTES_PADRAO;
  let soma = 0, pesos = 0;
  if (s.questoes && s.questoes.feitas > 0){
    const w = aj.pesoQuestoes * Math.min(1, s.questoes.feitas / aj.refQuestoes);
    soma += w * (Math.min(s.questoes.acertos, s.questoes.feitas) / s.questoes.feitas); pesos += w;
  }
  const r = valorExplicacao(s.explicacao, aj);
  if (r != null){ soma += aj.pesoExplicacao * r; pesos += aj.pesoExplicacao; }
  if (s.percebida && aj.percebidaValor[s.percebida] != null){ soma += aj.pesoPercebida * aj.percebidaValor[s.percebida]; pesos += aj.pesoPercebida; }
  return pesos > 0 ? soma / pesos : null;
}
function categoria(valor, aj){
  const c = (aj || AJUSTES_PADRAO).categorias;
  return valor >= c.excelente ? 'excelente' : valor >= c.bom ? 'bom' : valor >= c.regular ? 'regular' : 'critico';
}
const pesoRecencia = (data, ref, aj) => Math.pow(0.5, Math.max(0, diffDias(data, ref)) / aj.meiaVidaDias);
/* Domínio (compreensão), olhando todo o histórico até refData (spec 7.2) */
function dominio(sessoes, aj, refData){
  aj = aj || AJUSTES_PADRAO;
  const lista = ordenarSessoes(sessoes).filter(s => !refData || s.data <= refData);
  const ref = refData || (lista.length ? lista[lista.length - 1].data : hoje());
  let qa = 0, qn = 0, questoes = 0, er = 0, ew = 0, avaliadas = 0, ultimaPercebida = null;
  for (const s of lista){
    const w = pesoRecencia(s.data, ref, aj);
    if (s.questoes && s.questoes.feitas > 0){ qa += w * Math.min(s.questoes.acertos, s.questoes.feitas); qn += w * s.questoes.feitas; questoes += s.questoes.feitas; }
    const r = valorExplicacao(s.explicacao, aj);
    if (r != null){ er += w * r; ew += w; }
    if (s.percebida) ultimaPercebida = s.percebida;
    if (resultadoSessao(s, aj) != null) avaliadas++;
  }
  const Q = qn > 0 ? qa / qn : null, R = ew > 0 ? er / ew : null;
  let base = Q != null && R != null ? aj.pesoDominioQuestoes * Q + aj.pesoDominioExplicacao * R : Q != null ? Q : R;
  let valor = null;
  if (base != null){
    valor = Math.round(base * 100) + (ultimaPercebida && aj.ajustePercebida[ultimaPercebida] || 0);
    valor = Math.max(0, Math.min(100, valor));
  }
  const suficiente = valor != null && questoes >= aj.minQuestoes && avaliadas >= aj.minAvaliadas;
  return { valor, categoria: suficiente ? categoria(valor, aj) : null, suficiente, questoes, avaliadas };
}
/* Retenção (lembrar após um intervalo): só revisões com evidência (spec 7.3) */
function retencao(sessoes, aj, refData){
  aj = aj || AJUSTES_PADRAO;
  const lista = ordenarSessoes(sessoes).filter(s => !refData || s.data <= refData);
  const ref = refData || (lista.length ? lista[lista.length - 1].data : hoje());
  const revs = [];
  let anterior = null, maiorIntervaloBom = null;
  for (const s of lista){
    const r = resultadoSessao(s, aj);
    if (s.tipo === 'revisao' && r != null){
      const intervalo = anterior ? diffDias(anterior, s.data) : null;
      revs.push({ data: s.data, r });
      if (r >= aj.limiarBom && intervalo != null && (maiorIntervaloBom == null || intervalo > maiorIntervaloBom)) maiorIntervaloBom = intervalo;
    }
    anterior = s.data;
  }
  const ult = revs.slice(-5);
  let soma = 0, pesos = 0;
  for (const x of ult){ const w = pesoRecencia(x.data, ref, aj); soma += w * x.r; pesos += w; }
  const valor = pesos > 0 ? Math.round(100 * soma / pesos) : null;
  const suficiente = valor != null && revs.length >= aj.minRevisoesRetencao;
  return { valor, categoria: suficiente ? categoria(valor, aj) : null, suficiente, revisoes: revs.length, maiorIntervaloBom };
}

/* ---------- Escada de revisões e diagnóstico (spec 7.4) ---------- */
function escadaDo(item, aj){
  aj = aj || AJUSTES_PADRAO;
  const base = aj.escada.concat([aj.degrauExtra]);
  if (!item || !item.dificil) return base.slice();
  // arredonda .5 para baixo: 15×0,7 = 10,5 → 10 (spec: 1 → 5 → 10 → 21 → 42)
  return base.map((d, i) => i === 0 ? d : Math.max(1, Math.round(d * aj.fatorDificil - 1e-9)));
}
/* Estado de um assunto, sempre recalculado repassando o histórico (spec 7.5) */
function calcularEstado(item, sessoes, aj, hojeStr){
  aj = aj || AJUSTES_PADRAO;
  hojeStr = hojeStr || hoje();
  const lista = ordenarSessoes(sessoes);
  const escada = escadaDo(item, aj), maxNormal = escada.length - 2, extra = escada.length - 1;
  const fim = (extraCampos) => Object.assign({
    dominio: dominio(lista, aj, hojeStr), retencao: retencao(lista, aj, hojeStr),
  }, extraCampos);
  if (!lista.length) return fim({ status: item && item.semRevisao ? 'sem-revisao' : 'novo', degrau: null, intervalo: null, ultima: null, proxima: null, atrasoDias: 0, diagnostico: null, baixasSeguidas: 0, revisoes: 0 });
  let degrau = null, baixas = 0, status = 'ativo', diagnostico = null, revisoes = 0, ultimoR = null;
  lista.forEach((s, i) => {
    if (s.tipo === 'revisao') revisoes++;
    const r = resultadoSessao(s, aj);
    if (degrau === null || s.tipo === 'retomada'){             // primeiro estudo ou retomada: recomeça
      degrau = 0; baixas = 0; status = 'ativo'; diagnostico = null;
      if (r != null) ultimoR = r;
      return;
    }
    if (r == null) return;                                      // sem evidência: mantém o degrau
    const antes = dominio(lista.slice(0, i), aj, s.data);       // domínio de ANTES desta revisão
    if (r >= aj.limiarBom){
      baixas = 0; status = 'ativo';
      const consolidado = antes.suficiente && antes.valor >= aj.dominioConsolidado && ultimoR != null && ultimoR >= aj.limiarBom;
      if (consolidado){ degrau = Math.min(degrau + 2, extra); diagnostico = 'consolidado'; }
      else { diagnostico = 'progresso'; if (s.percebida !== 'dificil' && degrau < maxNormal) degrau++; }
    } else if (r >= aj.limiarBaixo){
      baixas = 0; status = 'ativo'; diagnostico = 'estavel';
    } else {
      baixas++;
      if (baixas >= aj.recorrenteN){ status = 'retomada'; diagnostico = 'recorrente'; }
      else if ((antes.suficiente && antes.valor >= aj.dominioEsquecimento) || (ultimoR != null && ultimoR >= aj.limiarBom)){
        degrau = Math.max(0, Math.min(degrau, maxNormal) - 1); diagnostico = 'esquecimento';
      } else { degrau = 0; diagnostico = 'compreensao'; }
    }
    ultimoR = r;
  });
  const ultima = lista[lista.length - 1].data;
  if (item && item.semRevisao) status = 'sem-revisao';
  const intervalo = escada[degrau];
  const proxima = status === 'ativo' ? addDias(ultima, intervalo) : null;
  const atrasoDias = proxima && proxima < hojeStr ? diffDias(proxima, hojeStr) : 0;
  return fim({ status, degrau, intervalo, ultima, proxima, atrasoDias, diagnostico, baixasSeguidas: baixas, revisoes });
}
/* O que fazer hoje: atrasadas, do dia, retomadas recomendadas, próximos 7 dias */
function agenda(itens, sessoesPorItem, aj, hojeStr){
  hojeStr = hojeStr || hoje();
  const out = { atrasadas: [], hoje: [], retomar: [], proximos7: 0, estados: new Map() };
  for (const it of itens || []){
    if (!it || it.excluida) continue;
    const estado = calcularEstado(it, sessoesPorItem.get(it.id) || [], aj, hojeStr);
    out.estados.set(it.id, estado);
    if (estado.status === 'retomada') out.retomar.push({ item: it, estado });
    else if (estado.status === 'ativo' && estado.proxima){
      if (estado.proxima < hojeStr) out.atrasadas.push({ item: it, estado });
      else if (estado.proxima === hojeStr) out.hoje.push({ item: it, estado });
      else if (diffDias(hojeStr, estado.proxima) <= 7) out.proximos7++;
    }
  }
  out.atrasadas.sort((a, b) => b.estado.atrasoDias - a.estado.atrasoDias);
  return out;
}

const api = {
  AJUSTES_PADRAO,
  escadaDo, calcularEstado, agenda,
  ordenarSessoes, resultadoSessao, categoria, dominio, retencao,
  colecao, salvarRegistro, excluirRegistro, registrosAtivos, mesclarColecoes, estavel,
  hoje, addDias, diffDias, mesDe, inicioSemana, parseDuracao,
  cronoIniciar, cronoAplicar, cronoEstado, cronoDuracaoMs, cronoDataInicio,
  _hoje: null,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.EstCore = api;
})(typeof self !== 'undefined' ? self : this);
