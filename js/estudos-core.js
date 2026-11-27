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

/* ---------- Estatísticas (nunca contam excluídos nem duplicados) ---------- */
function unicos(lista){
  const vistos = new Map();
  for (const r of lista || []) if (r && !r.excluida) vistos.set(r.id, r);
  return [...vistos.values()];
}
const qf = (s) => (s.questoes && s.questoes.feitas) || 0;
const qa = (s) => (s.questoes && Math.min(s.questoes.acertos || 0, s.questoes.feitas || 0)) || 0;
function somar(sessoes, sims){
  const t = { questoes: 0, acertos: 0, minutos: 0 };
  for (const s of sessoes){ t.questoes += qf(s); t.acertos += qa(s); t.minutos += s.minutos || 0; }
  for (const m of sims || []){ t.questoes += m.questoes || 0; t.acertos += m.acertos || 0; t.minutos += m.minutos || 0; }
  return t;
}
function resumoDia(sessoes, simulados, data){
  const ss = unicos(sessoes).filter(s => s.data === data);
  const ms = unicos(simulados).filter(m => m.data === data);
  const t = somar(ss, ms);
  return { assuntos: new Set(ss.map(s => s.itemId)).size, sessoes: ss.length, questoes: t.questoes, acertos: t.acertos, minutos: t.minutos };
}
function serieDiaria(sessoes, simulados, de, ate){
  const ss = unicos(sessoes), ms = unicos(simulados), out = [];
  for (let d = de; d <= ate; d = addDias(d, 1)){
    const t = somar(ss.filter(s => s.data === d), ms.filter(m => m.data === d));
    out.push(Object.assign({ data: d }, t));
  }
  return out;
}
function porAssunto(itens, sessoes, aj, hojeStr){
  const ss = unicos(sessoes), out = [];
  for (const it of unicos(itens)){
    const minhas = ss.filter(s => s.itemId === it.id);
    if (!minhas.length) continue;
    const t = somar(minhas, []);
    out.push(Object.assign({ item: it, estado: calcularEstado(it, minhas, aj, hojeStr) }, t));
  }
  return out;
}
function porMateria(itens, sessoes, aj, hojeStr){
  const grupos = new Map();
  for (const a of porAssunto(itens, sessoes, aj, hojeStr)){
    const nome = a.item.materia || 'Outros';
    const g = grupos.get(nome) || { materia: nome, minutos: 0, questoes: 0, acertos: 0, assuntos: 0, criticos: 0 };
    g.minutos += a.minutos; g.questoes += a.questoes; g.acertos += a.acertos; g.assuntos++;
    if (a.estado.status === 'retomada' || a.estado.dominio.categoria === 'critico') g.criticos++;
    grupos.set(nome, g);
  }
  return [...grupos.values()].sort((x, y) => y.minutos - x.minutos || y.questoes - x.questoes);
}
function evolucaoMensal(sessoes, simulados){
  const meses = new Map();
  const add = (mes, q, a, m) => { const g = meses.get(mes) || { mes, minutos: 0, questoes: 0, acertos: 0 }; g.questoes += q; g.acertos += a; g.minutos += m; meses.set(mes, g); };
  for (const s of unicos(sessoes)) add(mesDe(s.data), qf(s), qa(s), s.minutos || 0);
  for (const m of unicos(simulados)) add(mesDe(m.data), m.questoes || 0, m.acertos || 0, m.minutos || 0);
  return [...meses.values()].sort((x, y) => x.mes < y.mes ? -1 : 1);
}
function tempoMedioPorQuestao(sessoes, simulados){
  let min = 0, q = 0;
  for (const s of unicos(sessoes)) if (s.minutos > 0 && qf(s) > 0){ min += s.minutos; q += qf(s); }
  for (const m of unicos(simulados)) if (m.minutos > 0 && m.questoes > 0){ min += m.minutos; q += m.questoes; }
  return q > 0 ? Math.round(min * 60 / q) : null;
}
function produtividade(sessoes, de, ate){
  const ss = unicos(sessoes).filter(s => s.data >= de && s.data <= ate);
  const dias = new Set(ss.map(s => s.data));
  const totalDias = diffDias(de, ate) + 1;
  let seq = 0, d = dias.has(ate) ? ate : addDias(ate, -1);
  const todosDias = new Set(unicos(sessoes).map(s => s.data));
  while (todosDias.has(d)){ seq++; d = addDias(d, -1); }
  return { diasEstudados: dias.size, mediaMinutosDia: Math.round(ss.reduce((t, s) => t + (s.minutos || 0), 0) / totalDias), sequenciaAtual: seq };
}

/* ---------- Planejamento (Etapa 2): planejado só conta com sessão registrada ---------- */
function planoStatus(plano, sessoesLigadas, hojeStr){
  if (plano.status === 'cancelada') return 'cancelada';
  if (plano.status === 'reagendada') return 'reagendada';
  if (unicos(sessoesLigadas).some(s => s.planoId === plano.id)) return 'concluida';
  return plano.data < (hojeStr || hoje()) ? 'atrasada' : 'pendente';
}
function realizadoDoPlano(sessoesLigadas){
  const t = somar(unicos(sessoesLigadas), []);
  return { minutos: t.minutos, questoes: t.questoes };
}
function resumoSemana(planos, sessoes, inicio, hojeStr){
  const ps = unicos(planos), ss = unicos(sessoes), fimSemana = addDias(inicio, 6);
  const dias = [];
  const planejado = { minutos: 0, questoes: 0 };
  for (let i = 0; i < 7; i++){
    const data = addDias(inicio, i);
    const itens = ps.filter(p => p.data === data).map(plano => {
      const ligadas = ss.filter(s => s.planoId === plano.id);
      return { plano, status: planoStatus(plano, ligadas, hojeStr), realizado: realizadoDoPlano(ligadas) };
    });
    for (const x of itens) if (x.status !== 'reagendada' && x.status !== 'cancelada'){ planejado.minutos += x.plano.metaMinutos || 0; planejado.questoes += x.plano.metaQuestoes || 0; }
    dias.push({ data, itens });
  }
  const t = somar(ss.filter(s => s.data >= inicio && s.data <= fimSemana), []);
  return { dias, planejado, realizado: { minutos: t.minutos, questoes: t.questoes } };
}
function reagendarPlano(col, id, novaData, agoraISO, novoId){
  const orig = col.registros[id];
  if (!orig || orig.excluida) return col;
  col = salvarRegistro(col, Object.assign(conteudo(orig), { status: 'reagendada', reagendadaPara: novaData }), agoraISO);
  const novo = Object.assign(conteudo(orig), { id: novoId, data: novaData, status: 'planejada', origemId: id });
  delete novo.reagendadaPara;
  return salvarRegistro(col, novo, agoraISO);
}

/* ---------- Banco de erros (Etapa 3) ---------- */
const MOTIVOS_ERRO = [['desconhecimento', 'Desconhecimento'], ['esquecimento', 'Esquecimento'], ['interpretacao', 'Interpretação'], ['calculo', 'Cálculo'], ['confusao', 'Confusão conceitual'], ['desatencao', 'Desatenção']];
function estatisticasErros(erros, itens){
  const porId = new Map(unicos(itens).map(i => [i.id, i]));
  const porMotivo = {}, mats = new Map(), asss = new Map();
  let total = 0;
  for (const e of unicos(erros)){
    const n = e.quantidade > 0 ? e.quantidade : 1;
    total += n;
    porMotivo[e.motivo] = (porMotivo[e.motivo] || 0) + n;
    const it = porId.get(e.itemId);
    const mat = (it && it.materia) || e.materia || 'Outros';
    const gm = mats.get(mat) || { materia: mat, total: 0, porMotivo: {} };
    gm.total += n; gm.porMotivo[e.motivo] = (gm.porMotivo[e.motivo] || 0) + n; mats.set(mat, gm);
    if (it){ const ga = asss.get(it.id) || { item: it, total: 0, porMotivo: {} }; ga.total += n; ga.porMotivo[e.motivo] = (ga.porMotivo[e.motivo] || 0) + n; asss.set(it.id, ga); }
  }
  const ord = (a, b) => b.total - a.total;
  return { total, porMotivo, porMateria: [...mats.values()].sort(ord), porAssunto: [...asss.values()].sort(ord) };
}

/* ---------- Simulados (Etapa 3) ---------- */
const CRITERIOS_PADRAO = [
  { id: 'cebraspe', nome: 'Cebraspe (cada erro anula um acerto)', pontosAcerto: 1, penalidadeErro: 1, pontosBranco: 0, fixo: true },
  { id: 'simples', nome: 'Sem penalidade', pontosAcerto: 1, penalidadeErro: 0, pontosBranco: 0, fixo: true },
];
function validarSimulado(s){
  const erros = [];
  const n = (v) => Number.isInteger(v) && v >= 0;
  if (!(s.questoes > 0) || !Number.isInteger(s.questoes)) erros.push('Informe a quantidade de questões.');
  if (!n(s.acertos) || !n(s.erros) || !n(s.brancos)) erros.push('Acertos, erros e em branco precisam ser números inteiros (zero ou mais).');
  else if (s.acertos + s.erros + s.brancos !== s.questoes) erros.push('Acertos + erros + em branco (' + (s.acertos + s.erros + s.brancos) + ') precisa ser igual ao total de questões (' + s.questoes + ').');
  return erros;
}
function notaSimulado(s, criterio){
  const c = criterio || CRITERIOS_PADRAO[1];
  const nota = Math.round(((s.acertos || 0) * c.pontosAcerto - (s.erros || 0) * c.penalidadeErro + (s.brancos || 0) * c.pontosBranco) * 100) / 100;
  const maxima = (s.questoes || 0) * c.pontosAcerto;
  return { nota, maxima, percentual: maxima > 0 ? Math.round(nota / maxima * 1000) / 10 : 0 };
}
function evolucaoSimulados(sims, criterios){
  const cs = criterios || CRITERIOS_PADRAO;
  return unicos(sims).sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : 0).map(s => {
    const c = cs.find(x => x.id === s.criterioId) || CRITERIOS_PADRAO[1];
    return Object.assign({ simulado: s }, notaSimulado(s, c));
  });
}

/* ---------- Pontos fracos (Etapa 4) ---------- */
function pontosFracos(itens, estados, estatErros){
  const errosPorItem = new Map(((estatErros && estatErros.porAssunto) || []).map(a => [a.item.id, a.total]));
  const out = [];
  for (const it of unicos(itens)){
    const e = estados.get(it.id); if (!e) continue;
    const motivos = []; let peso = 0;
    if (e.status === 'retomada'){ motivos.push('Retomada recomendada'); peso += 3; }
    if (e.dominio && e.dominio.categoria === 'critico'){ motivos.push('Domínio crítico'); peso += 3; }
    if (e.retencao && e.retencao.categoria === 'critico'){ motivos.push('Retenção crítica'); peso += 2; }
    const ne = errosPorItem.get(it.id) || 0;
    if (ne >= 5){ motivos.push('Muitos erros (' + ne + ')'); peso += 1 + Math.floor(ne / 10); }
    if (motivos.length) out.push({ item: it, motivos, peso });
  }
  return out.sort((a, b) => b.peso - a.peso);
}

/* ---------- Ajustes: valores que quebrariam os cálculos ---------- */
function validarAjustes(a){
  const ruins = new Set();
  const num = (v) => typeof v === 'number' && isFinite(v);
  const exigir = (cam, ok) => { if (!ok) ruins.add(cam); };
  const e = a.escada;
  exigir('escada', Array.isArray(e) && e.length > 0 && e.every((n, i) => Number.isInteger(n) && n > 0 && (!i || n > e[i - 1])));
  exigir('degrauExtra', Number.isInteger(a.degrauExtra) && a.degrauExtra >= 1);
  exigir('fatorDificil', num(a.fatorDificil) && a.fatorDificil > 0 && a.fatorDificil <= 1);
  const lim = (v) => num(v) && v > 0 && v <= 1;
  exigir('limiarBom', lim(a.limiarBom)); exigir('limiarBaixo', lim(a.limiarBaixo));
  if (lim(a.limiarBom) && lim(a.limiarBaixo) && !(a.limiarBom > a.limiarBaixo)){ ruins.add('limiarBom'); ruins.add('limiarBaixo'); }
  const p100 = (v) => num(v) && v >= 0 && v <= 100;
  exigir('dominioConsolidado', p100(a.dominioConsolidado)); exigir('dominioEsquecimento', p100(a.dominioEsquecimento));
  const c = a.categorias || {};
  if (!(p100(c.excelente) && p100(c.bom) && p100(c.regular) && c.excelente > c.bom && c.bom > c.regular)) ['excelente', 'bom', 'regular'].forEach(k => ruins.add('categorias.' + k));
  const inteiro = (cam, v, min) => exigir(cam, Number.isInteger(v) && v >= min);
  inteiro('recorrenteN', a.recorrenteN, 1); inteiro('minQuestoes', a.minQuestoes, 0); inteiro('minAvaliadas', a.minAvaliadas, 1);
  inteiro('minRevisoesRetencao', a.minRevisoesRetencao, 1); inteiro('refQuestoes', a.refQuestoes, 1);
  exigir('meiaVidaDias', num(a.meiaVidaDias) && a.meiaVidaDias >= 1);
  exigir('alertaCronometroHoras', num(a.alertaCronometroHoras) && a.alertaCronometroHoras > 0);
  const pesos = (cams) => { const vs = cams.map(k => a[k]); cams.forEach((k, i) => exigir(k, num(vs[i]) && vs[i] >= 0)); if (vs.every(num) && vs.every(v => v >= 0) && vs.reduce((t, v) => t + v, 0) <= 0) cams.forEach(k => ruins.add(k)); };
  pesos(['pesoDominioQuestoes', 'pesoDominioExplicacao']); pesos(['pesoQuestoes', 'pesoExplicacao', 'pesoPercebida']);
  for (const [grupo, ks] of [['notaExplicacao', ['completo', 'pouco', 'muito']], ['percebidaValor', ['facil', 'ok', 'dificil']]]) for (const k of ks) exigir(grupo + '.' + k, num((a[grupo] || {})[k]) && a[grupo][k] >= 0 && a[grupo][k] <= 1);
  for (const k of ['dificil', 'facil']) exigir('ajustePercebida.' + k, num((a.ajustePercebida || {})[k]));
  return [...ruins];
}

const api = {
  AJUSTES_PADRAO, validarAjustes,
  unicos, resumoDia, serieDiaria, porAssunto, porMateria, evolucaoMensal, tempoMedioPorQuestao, produtividade,
  planoStatus, realizadoDoPlano, resumoSemana, reagendarPlano,
  MOTIVOS_ERRO, estatisticasErros, CRITERIOS_PADRAO, validarSimulado, notaSimulado, evolucaoSimulados, pontosFracos,
  escadaDo, calcularEstado, agenda,
  ordenarSessoes, resultadoSessao, categoria, dominio, retencao,
  colecao, salvarRegistro, excluirRegistro, registrosAtivos, mesclarColecoes, estavel,
  hoje, addDias, diffDias, mesDe, inicioSemana, parseDuracao,
  cronoIniciar, cronoAplicar, cronoEstado, cronoDuracaoMs, cronoDataInicio,
  _hoje: null,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.EstCore = api;
})(typeof self !== 'undefined' ? self : this);
