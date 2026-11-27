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

const api = {
  AJUSTES_PADRAO,
  hoje, addDias, diffDias, mesDe, inicioSemana, parseDuracao,
  cronoIniciar, cronoAplicar, cronoEstado, cronoDuracaoMs, cronoDataInicio,
  _hoje: null,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.EstCore = api;
})(typeof self !== 'undefined' ? self : this);
