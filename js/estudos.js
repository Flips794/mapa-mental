/* =========================================================
   Área Estudos — telas. As regras ficam em estudos-core.js e
   a gravação em estudos-dados.js; aqui só desenho e eventos.
   ========================================================= */
"use strict";

const EC = EstCore;
let ED = null;                       // dados de estudos (criado ao entrar na área)
let estAba = 'hoje';
let estMateria = null;               // matéria aberta pela barra lateral
let estCarregando = null;
let estTick = null, estSyncTimer = null;
const estUi = { mes: null, semana: null, periodo: 30, filtroErros: {} };

const DIAG_TXT = { consolidado: 'Domínio consolidado', progresso: 'Progresso', estavel: 'Estável', esquecimento: 'Esquecimento', compreensao: 'Dificuldade de compreensão', recorrente: 'Dificuldade recorrente', retomada: 'Retomada' };
const CAT_TXT = { excelente: 'Excelente', bom: 'Bom', regular: 'Regular', critico: 'Crítico' };
const METODOS = [['explicacao', 'Explicação sem consulta'], ['questoes', 'Questões'], ['flashcards', 'Flashcards'], ['releitura', 'Releitura'], ['outro', 'Outro']];
const TIPO_TXT = { estudo: 'Estudo', revisao: 'Revisão', retomada: 'Retomada' };

/* ---------- utilidades de tela ---------- */
const estHoje = () => EC.hoje();
function fmtData(d, comAno){ if (!d) return '—'; const [a, m, dd] = d.split('-'); const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']; return Number(dd) + ' ' + meses[Number(m) - 1] + (comAno ? ' ' + a : ''); }
function fmtMin(min){ if (!min) return '0min'; const h = Math.floor(min / 60), m = Math.round(min % 60); return (h ? h + 'h' : '') + (m || !h ? (h ? String(m).padStart(2, '0') : m) + (h ? '' : 'min') : ''); }
function fmtRel(d){ const n = EC.diffDias(estHoje(), d); return n === 0 ? 'hoje' : n === 1 ? 'amanhã' : n === -1 ? 'ontem' : n > 0 ? 'em ' + n + ' dias' : 'há ' + (-n) + ' dias'; }
function pct(a, b){ return b > 0 ? Math.round(a / b * 100) : null; }
function badgeMetrica(m, rotulo){
  if (!m || m.valor == null) return '<span class="est-badge vazio" title="' + rotulo + ': sem dados ainda">' + rotulo + ' —</span>';
  if (!m.suficiente) return '<span class="est-badge vazio" title="' + rotulo + ' em avaliação: ainda há pouca evidência">' + rotulo + ' em avaliação</span>';
  return '<span class="est-badge cat-' + m.categoria + '" title="' + rotulo + ' ' + m.valor + '%">' + rotulo + ' ' + CAT_TXT[m.categoria] + ' · ' + m.valor + '%</span>';
}
function estModal(html, cls){
  const d = document.createElement('div'); d.className = 'modal est-modal';
  d.innerHTML = '<div class="modal-box ' + (cls || '') + '">' + html + '</div>';
  document.body.appendChild(d);
  const fechar = () => d.remove();
  d.addEventListener('pointerdown', e => { if (e.target === d) fechar(); });
  d.addEventListener('keydown', e => { if (e.key === 'Escape'){ e.stopPropagation(); fechar(); } });
  d.querySelectorAll('[data-fechar]').forEach(b => b.onclick = fechar);
  return { el: d, fechar };
}
const ajustes = () => ED ? ED.ajustes() : EC.AJUSTES_PADRAO;

/* ---------- tópicos dos mapas (para escolher o que estudou) ---------- */
let topicosCache = null;
async function estTopicos(){
  if (topicosCache) return topicosCache;
  const lista = [];
  for (const it of ws.items.filter(i => i.type === 'map')){
    let m = null;
    try { m = (it.id === curMapId && M) ? M : normalizeMap(await Store.get('map:' + it.id) || {}); } catch (e) { continue; }
    if (!m || !m.trees) continue;
    const materia = mapTitle(m);
    const walk = (n, caminho, depth) => {
      const texto = plainText(n.html).trim() || 'Sem título';
      const c = caminho.concat(texto);
      lista.push({ mapId: it.id, nodeId: n.id, materia, texto, caminho: materia + ' › ' + c.join(' › '), filhos: n.children.length, depth });
      n.children.forEach(k => walk(k, c, depth + 1));
    };
    m.trees.forEach(t => { const r = t.root; lista.push({ mapId: it.id, nodeId: r.id, materia, texto: plainText(r.html).trim() || 'Sem título', caminho: materia + ' › ' + (plainText(r.html).trim() || 'Sem título'), filhos: r.children.length, depth: 0 }); r.children.forEach(k => walk(k, [], 1)); });
  }
  topicosCache = lista;
  return lista;
}
function invalidarTopicos(){ topicosCache = null; }
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
async function subtopicos(mapId, nodeId){
  let m = null;
  try { m = (mapId === curMapId && M) ? M : normalizeMap(await Store.get('map:' + mapId) || {}); } catch (e) { return []; }
  if (!m || !m.trees) return [];
  let alvo = null;
  const achar = (n) => { if (n.id === nodeId){ alvo = n; return true; } return n.children.some(achar); };
  m.trees.some(t => achar(t.root));
  if (!alvo) return [];
  const out = [];
  const walk = (n, d) => n.children.forEach(k => { out.push({ id: k.id, texto: plainText(k.html).trim() || 'Sem título', depth: d }); walk(k, d + 1); });
  walk(alvo, 0);
  return out;
}

/* ---------- entrada na área ---------- */
async function estGarantirDados(){
  if (ED) return ED;
  if (!estCarregando){
    estCarregando = (async () => {
      const d = EstDadosCriar({ store: Store, local: Store.mode === 'local' ? null : Store.local, core: EC });
      const r = await d.carregar();
      ED = d;
      if (r.pendentes.length) d.sincronizar().then(() => estAtualizarBarra());
      if (!estSyncTimer){
        estSyncTimer = setInterval(() => { if (ED && ED.pendentes().length) ED.sincronizar().then(estAtualizarBarra); }, 60000);
        window.addEventListener('focus', () => { if (ED && ED.pendentes().length) ED.sincronizar().then(estAtualizarBarra); });
      }
      return d;
    })();
  }
  return estCarregando;
}
async function estShown(){
  const v = $('#estView');
  if (!ED){ v.innerHTML = '<div class="est-carregando">Carregando seus estudos…</div>'; }
  try { await estGarantirDados(); }
  catch (e){ v.innerHTML = '<div class="est-carregando">Não foi possível carregar os estudos. Verifique a conexão e recarregue a página.</div>'; return; }
  invalidarTopicos();
  estRender();
  estRenderSidebar();
  if (!estTick) estTick = setInterval(estAtualizarCrono, 1000);
}

/* ---------- moldura: abas, cronômetro, registrar ---------- */
const ABAS = [['hoje', 'Hoje'], ['calendario', 'Calendário'], ['planejamento', 'Planejamento'], ['erros', 'Erros'], ['simulados', 'Simulados'], ['desempenho', 'Desempenho'], ['ajustes', 'Ajustes']];
function estRender(){
  const v = $('#estView');
  v.innerHTML = '<div class="est-bar">'
    + '<div class="est-abas">' + ABAS.map(([k, t]) => '<button data-aba="' + k + '" class="' + (k === estAba && !estMateria ? 'on' : '') + '">' + t + '</button>').join('') + '</div>'
    + '<div class="spacer"></div><span class="est-sync" id="estSync"></span>'
    + '<div class="est-crono" id="estCrono"></div>'
    + '<button class="btn-s primary" id="estNovo">＋ Registrar estudo</button></div>'
    + '<div class="est-body" id="estBody"></div>';
  v.querySelectorAll('.est-abas button').forEach(b => b.onclick = () => { estAba = b.dataset.aba; estMateria = null; estRender(); estRenderSidebar(); });
  $('#estNovo').onclick = () => estAbrirRegistro({});
  estAtualizarCrono(); estAtualizarBarra();
  const body = $('#estBody');
  if (estMateria) return estViewMateria(body, estMateria);
  (EST_VIEWS[estAba] || EST_VIEWS.hoje)(body);
}
function estAtualizarBarra(){
  const el = $('#estSync'); if (!el || !ED) return;
  const n = ED.pendentes().length;
  el.textContent = n ? '⚠ ' + n + ' alteração(ões) aguardando envio' : (ED.estaOffline() ? '⚠ sem conexão — usando cópia local' : '');
  el.title = n ? 'Ficam guardadas neste aparelho e são enviadas assim que a conexão voltar.' : '';
}
function estRenderSidebar(){
  if (appMode !== 'est' || !ED) return;
  $('#sbTitle').textContent = 'Matérias';
  $('#sbNew').title = 'Registrar estudo';
  const ag = estAgenda();
  const pend = new Map();
  for (const x of ag.atrasadas.concat(ag.hoje, ag.retomar)){ const k = x.item.materia || 'Outros'; pend.set(k, (pend.get(k) || 0) + 1); }
  const materias = [...new Set(ws.items.filter(i => i.type === 'map').map(i => i.title).concat(ED.todas('itens').map(i => i.materia || 'Outros')))];
  const list = $('#sbList');
  list.innerHTML = materias.length ? '' : '<div class="sb-empty">Registre um estudo para começar.</div>';
  for (const m of materias){
    const row = document.createElement('div'); row.className = 'sb-item' + (estMateria === m ? ' on' : '');
    const n = pend.get(m) || 0;
    row.innerHTML = '<span class="ico map">◉</span><span class="nm"></span>' + (n ? '<span class="est-pend" title="Revisões para hoje ou atrasadas">' + n + '</span>' : '');
    row.querySelector('.nm').textContent = m; row.title = m;
    row.onclick = () => { estMateria = m; estRender(); estRenderSidebar(); };
    list.appendChild(row);
  }
}

/* ---------- agenda e estados ---------- */
function estSessoesPorItem(){
  const map = new Map();
  for (const s of ED.todas('sessoes')){ if (!map.has(s.itemId)) map.set(s.itemId, []); map.get(s.itemId).push(s); }
  return map;
}
function estAgenda(){ return EC.agenda(ED.todas('itens'), estSessoesPorItem(), ajustes(), estHoje()); }
function estEstado(itemId){ const it = ED.item(itemId); return it ? EC.calcularEstado(it, ED.sessoesDoItem(itemId), ajustes(), estHoje()) : null; }

/* ---------- Hoje ---------- */
function linhaAssunto(x, acao){
  const e = x.estado, it = x.item;
  const info = e.status === 'retomada' ? e.baixasSeguidas + ' revisões abaixo de ' + Math.round(ajustes().limiarBaixo * 100) + '% — recomendado estudar de novo'
    : e.atrasoDias ? 'venceu ' + fmtRel(e.proxima) : e.intervalo ? 'degrau de ' + e.intervalo + (e.intervalo === 1 ? ' dia' : ' dias') : '';
  return '<div class="est-linha" data-item="' + esc(it.id) + '">'
    + '<div class="est-l-txt"><b></b><span>' + esc(info) + (e.diagnostico ? ' · ' + esc(DIAG_TXT[e.diagnostico] || '') : '') + '</span></div>'
    + '<div class="est-l-bd">' + badgeMetrica(e.dominio, 'Domínio') + badgeMetrica(e.retencao, 'Retenção') + '</div>'
    + '<button class="btn-s" data-acao="' + acao + '">' + (acao === 'retomar' ? 'Retomar' : 'Revisar') + '</button></div>';
}
function ligarLinhas(box){
  box.querySelectorAll('.est-linha').forEach(row => {
    const it = ED.item(row.dataset.item);
    row.querySelector('b').textContent = it ? it.caminho : '(assunto removido)';
    row.addEventListener('click', e => {
      const b = e.target.closest('[data-acao]');
      if (b) estAbrirRegistro({ itemId: row.dataset.item, tipo: b.dataset.acao === 'retomar' ? 'retomada' : 'revisao' });
      else estAbrirAssunto(row.dataset.item);
    });
  });
}
const EST_VIEWS = {};
EST_VIEWS.hoje = function(body){
  const ag = estAgenda(), d = estHoje();
  const r = EC.resumoDia(ED.todas('sessoes'), ED.simulados(), d);
  const sec = (titulo, cls, lista, acao) => lista.length ? '<section class="est-sec ' + cls + '"><h3>' + titulo + ' (' + lista.length + ')</h3>' + lista.map(x => linhaAssunto(x, acao)).join('') + '</section>' : '';
  const plan = EST_VIEWS._planejadoHoje ? EST_VIEWS._planejadoHoje(d) : '';
  const vazio = !ag.atrasadas.length && !ag.hoje.length && !ag.retomar.length;
  body.innerHTML = '<div class="est-hoje">'
    + sec('⚠ Atrasadas', 'atrasadas', ag.atrasadas, 'revisar')
    + sec('Revisar hoje', 'hoje', ag.hoje, 'revisar')
    + sec('↻ Retomar conteúdo', 'retomar', ag.retomar, 'retomar')
    + plan
    + (vazio ? '<div class="est-vazio">Nada para revisar hoje. ' + (ED.todas('itens').length ? 'Bom trabalho!' : 'Registre o que você estudou e as revisões aparecem aqui sozinhas.') + '</div>' : '')
    + '<div class="est-resumo"><b>Hoje você:</b> ' + r.assuntos + ' assunto(s) · ' + r.questoes + ' questões' + (r.questoes ? ' · ' + pct(r.acertos, r.questoes) + '% de acertos' : '') + (r.minutos ? ' · ' + fmtMin(r.minutos) : '') + ' &nbsp;·&nbsp; Próximos 7 dias: ' + ag.proximos7 + ' revisão(ões)</div>'
    + '</div>';
  ligarLinhas(body);
  if (EST_VIEWS._ligarPlanejadoHoje) EST_VIEWS._ligarPlanejadoHoje(body);
};

/* ---------- Matéria (pela barra lateral) ---------- */
async function estViewMateria(body, materia){
  const itens = ED.todas('itens').filter(i => (i.materia || 'Outros') === materia);
  const spi = estSessoesPorItem();
  const linhas = itens.map(it => ({ item: it, estado: EC.calcularEstado(it, spi.get(it.id) || [], ajustes(), estHoje()) }))
    .sort((a, b) => (a.estado.proxima || '9') < (b.estado.proxima || '9') ? -1 : 1);
  const topicos = (await estTopicos()).filter(t => t.materia === materia && t.depth > 0);
  const acompanhados = new Set(itens.map(i => i.nodeId).filter(Boolean));
  const naoVistos = topicos.filter(t => !acompanhados.has(t.nodeId) && t.depth === 1);
  body.innerHTML = '<div class="est-hoje"><h2 class="est-h2"></h2>'
    + (linhas.length ? '<section class="est-sec"><h3>Assuntos acompanhados (' + linhas.length + ')</h3>' + linhas.map(x => linhaAssunto(x, x.estado.status === 'retomada' ? 'retomar' : 'revisar')).join('') + '</section>' : '<div class="est-vazio">Nenhum assunto desta matéria registrado ainda.</div>')
    + (naoVistos.length ? '<section class="est-sec"><h3>Tópicos do mapa ainda não estudados (' + naoVistos.length + ')</h3><div class="est-chips">' + naoVistos.map(t => '<button class="est-chip" data-map="' + esc(t.mapId) + '" data-node="' + esc(t.nodeId) + '"></button>').join('') + '</div></section>' : '')
    + '</div>';
  body.querySelector('.est-h2').textContent = materia;
  ligarLinhas(body);
  body.querySelectorAll('.est-chip').forEach(b => {
    const t = naoVistos.find(x => x.nodeId === b.dataset.node);
    b.textContent = t.texto; b.title = 'Registrar estudo de: ' + t.caminho;
    b.onclick = () => estAbrirRegistro({ topico: t });
  });
}

/* ---------- Registro (estudo, revisão ou retomada) ---------- */
async function estAbrirRegistro(o){
  await estGarantirDados();
  o = o || {};
  const editando = o.sessaoId ? ED.todas('sessoes').find(s => s.id === o.sessaoId) : null;
  const st = {
    id: editando ? editando.id : ED.novoId(),
    itemId: editando ? editando.itemId : o.itemId || null,
    topico: o.topico || null,
    data: editando ? editando.data : (o.data || estHoje()),
    planoId: editando ? editando.planoId || null : o.planoId || null,
    cronometro: editando ? editando.cronometro || null : o.cronometro || null,
    salvando: false,
  };
  let item = st.itemId ? ED.item(st.itemId) : null;
  if (!item && st.topico){ item = ED.todas('itens').find(i => i.mapId === st.topico.mapId && i.nodeId === st.topico.nodeId) || null; if (item) st.itemId = item.id; }
  const estado = item ? estEstado(item.id) : null;
  const tipo = editando ? editando.tipo : o.tipo || (estado && estado.status === 'retomada' ? 'retomada' : item ? 'revisao' : 'estudo');
  const errosAntes = editando ? ED.todas('erros').filter(e => e.sessaoId === editando.id) : [];
  const ex = editando && editando.explicacao || {};
  const metodos = new Set(editando ? editando.metodos || [] : []);
  if (editando && editando.questoes) metodos.add('questoes');
  if (editando && editando.explicacao) metodos.add('explicacao');

  const { el, fechar } = estModal(
    '<div class="modal-head"><b>' + (editando ? 'Editar registro' : 'Registrar estudo') + '</b><button class="ib" data-fechar>✕</button></div>'
    + '<div class="est-form">'
    + '<div class="est-campo"><label>O que você estudou</label><div id="erQue"></div></div>'
    + '<div class="est-linha2"><div class="est-campo"><label>Data</label><input type="date" id="erData"></div>'
    + '<div class="est-campo"><label>Tipo</label><div class="est-radios" id="erTipo">' + Object.keys(TIPO_TXT).map(k => '<label><input type="radio" name="erTipo" value="' + k + '"> ' + TIPO_TXT[k] + '</label>').join('') + '</div></div></div>'
    + '<div class="est-campo"><label>Como você estudou / revisou</label><div class="est-checks" id="erMetodos">' + METODOS.map(([k, t]) => '<label><input type="checkbox" value="' + k + '"> ' + t + '</label>').join('') + '</div></div>'
    + '<div class="est-bloco hidden" id="erExpl"><label>Explicação sem consulta <span class="sub">escreva de memória, sem olhar nada</span></label><textarea id="erTexto" rows="5" placeholder="O que você lembra sobre o assunto…"></textarea>'
    + '<div class="est-row"><button class="btn-s" id="erConferir">Conferir com o mapa</button><span class="est-compl" id="erCompl"></span></div><div id="erCheck"></div></div>'
    + '<div class="est-bloco hidden" id="erQuest"><div class="est-linha2"><div class="est-campo"><label>Questões feitas</label><input type="number" min="0" id="erFeitas"></div><div class="est-campo"><label>Acertos</label><input type="number" min="0" id="erAcertos"></div></div>'
    + '<details class="est-erros-cl"' + (errosAntes.length ? ' open' : '') + '><summary>Classificar os erros (opcional)</summary><div class="est-motivos">' + EC.MOTIVOS_ERRO.map(([k, t]) => '<label>' + t + ' <input type="number" min="0" data-motivo="' + k + '"></label>').join('') + '</div></details></div>'
    + '<div class="est-campo"><label>Como você sentiu o assunto</label><div class="est-radios" id="erPerc"><label><input type="radio" name="erPerc" value=""> não informar</label><label><input type="radio" name="erPerc" value="facil"> Fácil</label><label><input type="radio" name="erPerc" value="ok"> Ok</label><label><input type="radio" name="erPerc" value="dificil"> Difícil</label></div></div>'
    + '<div class="est-campo"><label>Tempo (opcional)</label><input id="erTempo" placeholder="ex.: 1h30, 45min — ou use o cronômetro"></div>'
    + '<div class="est-msg" id="erMsg"></div>'
    + '<div class="est-row fim"><button class="btn-s" data-fechar>Cancelar</button><button class="btn-s primary" id="erSalvar">Salvar</button></div>'
    + '</div>', 'est-box');

  // o que estudou
  const que = el.querySelector('#erQue');
  const desenharQue = () => {
    if (item){
      que.innerHTML = '<div class="est-esc"><b></b><button class="btn-s" id="erTrocar">trocar</button></div>'
        + '<label class="chk"><input type="checkbox" id="erDificil"> assunto difícil (revisões mais próximas)</label>'
        + (item.tipo === 'livre' ? '<label class="chk"><input type="checkbox" id="erSemRev"> sem revisão (ex.: simulado misto)</label>' : '');
      que.querySelector('b').textContent = item.caminho;
      que.querySelector('#erDificil').checked = !!item.dificil;
      if (que.querySelector('#erSemRev')) que.querySelector('#erSemRev').checked = !!item.semRevisao;
      que.querySelector('#erTrocar').onclick = () => { item = null; st.itemId = null; st.topico = null; desenharQue(); };
    } else if (st.topico){
      que.innerHTML = '<div class="est-esc"><b></b><button class="btn-s" id="erTrocar">trocar</button></div><label class="chk"><input type="checkbox" id="erDificil"> assunto difícil (revisões mais próximas)</label>';
      que.querySelector('b').textContent = st.topico.caminho;
      que.querySelector('#erTrocar').onclick = () => { st.topico = null; desenharQue(); };
    } else {
      que.innerHTML = '<div class="est-seg"><button class="on" data-modo="topico">Tópico dos mapas</button><button data-modo="livre">Item livre</button></div>'
        + '<div id="erBusca"><input id="erQ" placeholder="Buscar tópico nos seus mapas…" autocomplete="off"><div class="est-res" id="erRes"></div></div>'
        + '<div id="erLivre" class="hidden"><input id="erLivreTxt" placeholder="Ex.: Lei seca — CPP arts. 158-A a 158-F"><input id="erLivreMat" list="erMatList" placeholder="Matéria (opcional)"><datalist id="erMatList">' + ws.items.filter(i => i.type === 'map').map(i => '<option value="' + esc(i.title) + '">').join('') + '</datalist>'
        + '<label class="chk"><input type="checkbox" id="erSemRev"> sem revisão (ex.: simulado misto)</label><label class="chk"><input type="checkbox" id="erDificil"> assunto difícil</label></div>';
      que.querySelectorAll('.est-seg button').forEach(b => b.onclick = () => {
        que.querySelectorAll('.est-seg button').forEach(x => x.classList.toggle('on', x === b));
        que.querySelector('#erBusca').classList.toggle('hidden', b.dataset.modo !== 'topico');
        que.querySelector('#erLivre').classList.toggle('hidden', b.dataset.modo !== 'livre');
      });
      const q = que.querySelector('#erQ'), res = que.querySelector('#erRes');
      const buscar = async () => {
        const termo = semAcento(q.value.trim()); const tops = await estTopicos();
        const achados = termo ? tops.filter(t => semAcento(t.caminho).includes(termo)).slice(0, 40) : [];
        res.innerHTML = achados.map((t, i) => '<button data-i="' + i + '"></button>').join('') || (termo ? '<div class="est-vazio pequeno">Nada encontrado — use "Item livre".</div>' : '');
        res.querySelectorAll('button').forEach(b => { const t = achados[Number(b.dataset.i)]; b.textContent = t.caminho; b.onclick = () => {
          const ja = ED.todas('itens').find(i => i.mapId === t.mapId && i.nodeId === t.nodeId);
          if (ja){ item = ja; st.itemId = ja.id; const e = estEstado(ja.id); marcarTipo(e && e.status === 'retomada' ? 'retomada' : 'revisao'); }
          else { st.topico = t; marcarTipo('estudo'); }
          desenharQue();
        }; });
      };
      q.addEventListener('input', buscar);
      setTimeout(() => q.focus(), 30);
    }
  };
  const marcarTipo = (t) => { const r = el.querySelector('#erTipo input[value="' + t + '"]'); if (r) r.checked = true; };
  desenharQue();
  if (o.livre && !item && !st.topico){
    const bLivre = que.querySelector('.est-seg button[data-modo=livre]'); if (bLivre) bLivre.click();
    if (que.querySelector('#erLivreTxt')) que.querySelector('#erLivreTxt').value = o.livre.titulo || '';
    if (que.querySelector('#erLivreMat')) que.querySelector('#erLivreMat').value = o.livre.materia || '';
  }

  // valores iniciais
  el.querySelector('#erData').value = st.data;
  marcarTipo(tipo);
  el.querySelectorAll('#erMetodos input').forEach(c => { c.checked = metodos.has(c.value); });
  el.querySelector('#erTexto').value = ex.texto || '';
  if (editando && editando.questoes){ el.querySelector('#erFeitas').value = editando.questoes.feitas; el.querySelector('#erAcertos').value = editando.questoes.acertos; }
  errosAntes.forEach(e => { const i = el.querySelector('[data-motivo="' + e.motivo + '"]'); if (i) i.value = e.quantidade || 1; });
  const perc = el.querySelector('#erPerc input[value="' + ((editando && editando.percebida) || '') + '"]'); if (perc) perc.checked = true;
  const minutos = editando ? editando.minutos : o.minutos;
  if (minutos) el.querySelector('#erTempo').value = fmtMin(minutos);
  const mostrarBlocos = () => {
    const sel = new Set([...el.querySelectorAll('#erMetodos input:checked')].map(c => c.value));
    el.querySelector('#erExpl').classList.toggle('hidden', !sel.has('explicacao'));
    el.querySelector('#erQuest').classList.toggle('hidden', !sel.has('questoes'));
  };
  el.querySelectorAll('#erMetodos input').forEach(c => c.onchange = mostrarBlocos);
  mostrarBlocos();

  // conferir a explicação com os sub-tópicos do mapa
  const exState = { marcados: new Set(ex.marcados || []), total: ex.total || 0, nota: ex.nota || null, lista: null };
  const desenharChecklist = async () => {
    const box = el.querySelector('#erCheck'), compl = el.querySelector('#erCompl');
    const ref = item && item.tipo === 'topico' ? item : st.topico;
    const lista = ref ? await subtopicos(ref.mapId, ref.nodeId) : [];
    exState.lista = lista;
    if (lista.length){
      exState.total = lista.length; exState.nota = null;
      box.innerHTML = '<div class="est-check-top"><span>Marque o que o seu resumo cobriu:</span><button class="btn-s" id="erTodos">marcar todos</button></div>'
        + lista.map(t => '<label class="est-ck" style="padding-left:' + (t.depth * 16) + 'px"><input type="checkbox" value="' + esc(t.id) + '"> <span></span></label>').join('');
      box.querySelectorAll('.est-ck').forEach((l, i) => { l.querySelector('span').textContent = lista[i].texto; const c = l.querySelector('input'); c.checked = exState.marcados.has(c.value); c.onchange = () => { c.checked ? exState.marcados.add(c.value) : exState.marcados.delete(c.value); atualizarCompl(); }; });
      box.querySelector('#erTodos').onclick = () => { box.querySelectorAll('.est-ck input').forEach(c => { c.checked = true; exState.marcados.add(c.value); }); atualizarCompl(); };
    } else {
      exState.total = 0;
      box.innerHTML = '<div class="est-check-top"><span>' + (ref ? 'Esse tópico não tem sub-tópicos no mapa.' : 'Item livre: avalie você mesmo.') + ' Seu resumo ficou:</span></div><div class="est-radios"><label><input type="radio" name="erNota" value="completo"> Completo</label><label><input type="radio" name="erNota" value="pouco"> Faltou pouco</label><label><input type="radio" name="erNota" value="muito"> Faltou muito</label></div>';
      box.querySelectorAll('input[name=erNota]').forEach(r => { r.checked = r.value === exState.nota; r.onchange = () => { exState.nota = r.value; atualizarCompl(); }; });
    }
    atualizarCompl();
    function atualizarCompl(){ compl.textContent = exState.total ? 'Completude: ' + exState.marcados.size + '/' + exState.total + ' (' + pct(exState.marcados.size, exState.total) + '%)' : exState.nota ? 'Completude: ' + Math.round(ajustes().notaExplicacao[exState.nota] * 100) + '%' : ''; }
  };
  el.querySelector('#erConferir').onclick = desenharChecklist;
  if (editando && editando.explicacao) desenharChecklist();

  // salvar
  el.querySelector('#erSalvar').onclick = async () => {
    if (st.salvando) return;
    const msg = el.querySelector('#erMsg'); msg.textContent = '';
    const erro = (t) => { msg.textContent = t; msg.className = 'est-msg err'; };
    const sel = new Set([...el.querySelectorAll('#erMetodos input:checked')].map(c => c.value));
    // assunto
    let it = item;
    const dificil = !!(el.querySelector('#erDificil') && el.querySelector('#erDificil').checked);
    const semRev = !!(el.querySelector('#erSemRev') && el.querySelector('#erSemRev').checked);
    if (!it && st.topico) it = { id: ED.novoId(), tipo: 'topico', mapId: st.topico.mapId, nodeId: st.topico.nodeId, caminho: st.topico.caminho, materia: st.topico.materia };
    if (!it){
      const livre = el.querySelector('#erLivreTxt'), mat = el.querySelector('#erLivreMat');
      const txt = livre ? livre.value.trim() : '';
      if (!txt) return erro('Escolha um tópico dos mapas ou escreva o item livre.');
      const ja = ED.todas('itens').find(i => i.tipo === 'livre' && semAcento(i.caminho) === semAcento(txt));
      it = ja || { id: ED.novoId(), tipo: 'livre', caminho: txt, materia: (mat && mat.value.trim()) || 'Outros' };
    }
    const data = el.querySelector('#erData').value || estHoje();
    const s = { id: st.id, itemId: it.id, data, tipo: (el.querySelector('#erTipo input:checked') || {}).value || 'estudo', metodos: [...sel].filter(m => m !== 'questoes' && m !== 'explicacao') };
    if (sel.has('questoes')){
      const f = parseInt(el.querySelector('#erFeitas').value, 10), a = parseInt(el.querySelector('#erAcertos').value, 10);
      if (!(f > 0)) return erro('Informe quantas questões você fez.');
      if (!(a >= 0) || a > f) return erro('Acertos precisam estar entre 0 e o total de questões.');
      s.questoes = { feitas: f, acertos: a };
    }
    if (sel.has('explicacao')){
      s.explicacao = { texto: el.querySelector('#erTexto').value, marcados: exState.total ? [...exState.marcados] : [], total: exState.total, nota: exState.total ? null : exState.nota };
    }
    const percebida = (el.querySelector('#erPerc input:checked') || {}).value; if (percebida) s.percebida = percebida;
    const tempoTxt = el.querySelector('#erTempo').value.trim();
    if (tempoTxt){ const m = EC.parseDuracao(tempoTxt); if (m == null) return erro('Não entendi o tempo. Use, por exemplo, 1h30 ou 45min.'); s.minutos = m; }
    if (st.planoId) s.planoId = st.planoId;
    if (st.cronometro) s.cronometro = st.cronometro;
    const motivos = [...el.querySelectorAll('[data-motivo]')].map(i => [i.dataset.motivo, parseInt(i.value, 10) || 0]);
    const totalClass = motivos.reduce((t, [, n]) => t + n, 0);
    if (totalClass && !s.questoes) return erro('Para classificar erros, informe as questões feitas.');
    if (s.questoes && totalClass > s.questoes.feitas - s.questoes.acertos) return erro('Você classificou mais erros (' + totalClass + ') do que errou (' + (s.questoes.feitas - s.questoes.acertos) + ').');
    st.salvando = true; el.querySelector('#erSalvar').disabled = true; el.querySelector('#erSalvar').textContent = 'Salvando…';
    try {
      const itemNovo = Object.assign({}, it, { dificil, semRevisao: it.tipo === 'livre' ? semRev : false });
      await ED.salvarItem(itemNovo);
      await ED.salvarSessao(s);
      for (const [motivo, n] of motivos){
        const eid = s.id + '-' + motivo, existe = ED.todas('erros').find(e => e.id === eid);
        if (n > 0) await ED.salvarErro({ id: eid, itemId: it.id, sessaoId: s.id, data, motivo, quantidade: n });
        else if (existe) await ED.excluirErro(eid);
      }
      const ativo = ED.cronometroAtivo();
      if (st.cronometro && ativo && ativo.id === st.cronometro.id) await ED.descartarCronometro(ativo.id);
      fechar();
      const e = estEstado(it.id);
      toast(e && e.status === 'ativo' ? 'Salvo · próxima revisão: ' + fmtData(e.proxima) + ' (' + fmtRel(e.proxima) + ')' : e && e.status === 'retomada' ? 'Salvo · recomendado retomar o conteúdo' : 'Salvo');
      estRender(); estRenderSidebar();
    } catch (err){
      console.error(err); st.salvando = false; el.querySelector('#erSalvar').disabled = false; el.querySelector('#erSalvar').textContent = 'Salvar';
      erro('Não foi possível salvar agora. Tente de novo.');
    }
  };
}

/* ---------- Detalhe de um assunto ---------- */
function estAbrirAssunto(itemId){
  const it = ED.item(itemId); if (!it) return;
  const e = estEstado(itemId), aj = ajustes();
  const escada = EC.escadaDo(it, aj);
  const sessoes = EC.ordenarSessoes(ED.sessoesDoItem(itemId)).reverse();
  const card = (m, rotulo, extra) => '<div class="est-card"><span>' + rotulo + '</span><b>' + (m.valor == null ? '—' : m.valor + '%') + '</b><i>' + (m.valor == null ? 'sem dados' : m.suficiente ? CAT_TXT[m.categoria] : 'em avaliação') + '</i><small>' + extra + '</small></div>';
  const { el, fechar } = estModal(
    '<div class="modal-head"><b class="est-titulo"></b><button class="ib" data-fechar>✕</button></div><div class="est-form">'
    + '<div class="est-cards">'
    + card(e.dominio, 'Domínio (compreensão)', e.dominio.questoes + ' questões · ' + e.dominio.avaliadas + ' sessões avaliadas')
    + card(e.retencao, 'Retenção (lembrar depois)', e.retencao.revisoes + ' revisões' + (e.retencao.maiorIntervaloBom ? ' · lembra bem após ' + e.retencao.maiorIntervaloBom + ' dias' : ''))
    + '</div>'
    + (e.status === 'retomada' ? '<div class="est-aviso">↻ ' + e.baixasSeguidas + ' revisões seguidas abaixo de ' + Math.round(aj.limiarBaixo * 100) + '%. Em vez de revisões cada vez mais próximas, o recomendado é <b>estudar o conteúdo de novo</b> (registre como "Retomada").</div>' : '')
    + '<div class="est-escada">' + escada.map((d, i) => '<span class="' + (i === e.degrau ? 'on' : '') + (i === escada.length - 1 ? ' extra' : '') + '">' + d + 'd</span>').join('') + '</div>'
    + '<div class="est-info">' + (e.status === 'sem-revisao' ? 'Sem revisões agendadas (item marcado como "sem revisão").' : e.proxima ? 'Próxima revisão: <b>' + fmtData(e.proxima, true) + '</b> (' + fmtRel(e.proxima) + ')' : e.status === 'retomada' ? 'Revisões pausadas até a retomada.' : '') + (e.diagnostico ? ' · Última avaliação: <b>' + DIAG_TXT[e.diagnostico] + '</b>' : '') + '</div>'
    + '<label class="chk"><input type="checkbox" id="adDificil"' + (it.dificil ? ' checked' : '') + '> assunto difícil (escada mais curta)</label>'
    + '<h4 class="est-h4">Histórico</h4><div class="est-hist">' + (sessoes.length ? sessoes.map(s => {
        const r = EC.resultadoSessao(s, aj);
        const exv = s.explicacao ? (s.explicacao.total ? pct(s.explicacao.marcados.length, s.explicacao.total) + '%' : s.explicacao.nota ? Math.round(aj.notaExplicacao[s.explicacao.nota] * 100) + '%' : '—') : null;
        return '<div class="est-h-row" data-id="' + esc(s.id) + '"><span class="d">' + fmtData(s.data, true) + '</span><span class="t">' + TIPO_TXT[s.tipo] + '</span><span class="m">'
          + [s.questoes ? s.questoes.acertos + '/' + s.questoes.feitas + ' questões' : '', exv ? 'explicação ' + exv : '', s.percebida ? { facil: 'fácil', ok: 'ok', dificil: 'difícil' }[s.percebida] : '', s.minutos ? fmtMin(s.minutos) : ''].concat((s.metodos || []).map(m => (METODOS.find(x => x[0] === m) || [m, m])[1].toLowerCase())).filter(Boolean).join(' · ')
          + '</span><span class="r">' + (r == null ? '' : Math.round(r * 100) + '%') + '</span>'
          + (s.explicacao && s.explicacao.texto ? '<button class="ib" data-ver title="Ver o resumo escrito">📝</button>' : '') + '<button class="ib" data-editar title="Editar">✎</button><button class="ib danger" data-excluir title="Excluir">🗑</button></div>';
      }).join('') : '<div class="est-vazio pequeno">Sem registros.</div>') + '</div>'
    + '<div class="est-row fim"><button class="btn-s" id="adExcluirItem">Parar de acompanhar</button><button class="btn-s primary" id="adRegistrar">' + (e.status === 'retomada' ? 'Registrar retomada' : 'Registrar revisão') + '</button></div>'
    + '</div>', 'est-box');
  el.querySelector('.est-titulo').textContent = it.caminho;
  el.querySelector('#adDificil').onchange = async (ev) => { await ED.salvarItem(Object.assign({}, it, { dificil: ev.target.checked })); fechar(); estAbrirAssunto(itemId); estRender(); };
  el.querySelector('#adRegistrar').onclick = () => { fechar(); estAbrirRegistro({ itemId, tipo: e.status === 'retomada' ? 'retomada' : 'revisao' }); };
  el.querySelector('#adExcluirItem').onclick = async () => {
    if (!confirm('Parar de acompanhar "' + it.caminho + '"? As revisões deixam de aparecer. O histórico fica guardado.')) return;
    await ED.excluirItem(itemId); fechar(); estRender(); estRenderSidebar(); toast('Assunto removido do acompanhamento');
  };
  el.querySelectorAll('.est-h-row').forEach(row => {
    const s = sessoes.find(x => x.id === row.dataset.id);
    const ver = row.querySelector('[data-ver]');
    if (ver) ver.onclick = () => { const m = estModal('<div class="modal-head"><b>Resumo de ' + fmtData(s.data, true) + '</b><button class="ib" data-fechar>✕</button></div><div class="est-form"><pre class="est-pre"></pre></div>', 'est-box'); m.el.querySelector('pre').textContent = s.explicacao.texto; };
    row.querySelector('[data-editar]').onclick = () => { fechar(); estAbrirRegistro({ sessaoId: s.id }); };
    row.querySelector('[data-excluir]').onclick = async () => {
      if (!confirm('Excluir o registro de ' + fmtData(s.data, true) + '? As revisões serão recalculadas. O registro fica guardado no histórico de alterações.')) return;
      await ED.excluirSessao(s.id); fechar(); estAbrirAssunto(itemId); estRender(); estRenderSidebar(); toast('Registro excluído · revisões recalculadas');
    };
  });
}

/* ---------- Cronômetro ---------- */
function estAtualizarCrono(){
  const box = $('#estCrono'); if (!box || !ED) return;
  const c = ED.cronometroAtivo(), estado = EC.cronoEstado(c);
  const ms = EC.cronoDuracaoMs(c, Date.now());
  const s = Math.floor(ms / 1000), hh = Math.floor(s / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60;
  const txt = (hh ? hh + ':' : '') + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
  const chave = estado + (c ? c.id : '');
  if (box.dataset.chave !== chave){
    box.dataset.chave = chave;
    box.innerHTML = '<span class="est-crono-t" id="estCronoT" title="Cronômetro de estudo (opcional)">⏱ ' + txt + '</span>'
      + (estado === 'finalizado' ? '<button class="ib" data-c="registrar" title="Registrar este tempo">📝</button><button class="ib" data-c="descartar" title="Descartar">✕</button>'
        : estado === 'parado' ? '<button class="ib" data-c="iniciar" title="Iniciar">▶</button>'
        : (estado === 'rodando' ? '<button class="ib" data-c="pausa" title="Pausar">⏸</button>' : '<button class="ib" data-c="retomada" title="Retomar">▶</button>')
          + '<button class="ib" data-c="fim" title="Finalizar e registrar">⏹</button><button class="ib" data-c="descartar" title="Descartar">✕</button>');
    box.querySelectorAll('[data-c]').forEach(b => b.onclick = () => estCronoAcao(b.dataset.c));
  } else { const t = $('#estCronoT'); if (t) t.textContent = '⏱ ' + txt; }
  box.classList.toggle('rodando', estado === 'rodando');
  box.classList.toggle('alerta', estado === 'rodando' && ms > ajustes().alertaCronometroHoras * 3600000);
  if (box.classList.contains('alerta')) box.title = 'Cronômetro rodando há mais de ' + ajustes().alertaCronometroHoras + ' horas sem pausa. Esqueceu ligado?';
}
async function estCronoAcao(acao){
  const c = ED.cronometroAtivo();
  try {
    if (acao === 'iniciar') await ED.salvarCronometro(Object.assign(EC.cronoIniciar(Date.now()), { id: ED.novoId() }));
    else if (acao === 'registrar') estAbrirRegistro({ minutos: Math.max(1, Math.round(EC.cronoDuracaoMs(c, Date.now()) / 60000)), data: EC.cronoDataInicio(c), cronometro: { id: c.id, eventos: c.eventos } });
    else if (acao === 'descartar'){ if (confirm('Descartar o tempo do cronômetro?')) await ED.descartarCronometro(c.id); }
    else if (acao === 'fim'){
      const fim = Object.assign(EC.cronoAplicar(c, 'fim', Date.now()), { id: c.id });
      await ED.salvarCronometro(fim);
      estAbrirRegistro({ minutos: Math.max(1, Math.round(EC.cronoDuracaoMs(fim, Date.now()) / 60000)), data: EC.cronoDataInicio(fim), cronometro: { id: fim.id, eventos: fim.eventos } });
    } else await ED.salvarCronometro(Object.assign(EC.cronoAplicar(c, acao, Date.now()), { id: c.id }));
  } catch (e){ toast(e.message); }
  estAtualizarCrono(); estAtualizarBarra();
}

/* =========================================================
   Calendário do mês
   ========================================================= */
const STATUS_PLANO = { pendente: 'Pendente', atrasada: 'Não feita', concluida: 'Concluída', reagendada: 'Reagendada', cancelada: 'Cancelada' };
function nomeAtividade(p){
  if (p.itemId){ const it = ED.item(p.itemId); if (it) return it.caminho; }
  if (p.topico) return p.topico.caminho;
  return (p.titulo || 'Atividade') + (p.materia ? ' — ' + p.materia : '');
}
EST_VIEWS.calendario = function(body){
  const h = estHoje();
  const mes = estUi.mes || EC.mesDe(h);
  const primeiro = mes + '-01';
  const inicio = EC.inicioSemana(primeiro);
  const ultimoDia = EC.addDias(EC.mesDe(EC.addDias(primeiro, 32)) + '-01', -1);
  const fimGrade = EC.addDias(EC.inicioSemana(ultimoDia), 6);
  const sessoes = ED.todas('sessoes'), sims = ED.simulados(), planos = ED.todas('planos');
  const serie = new Map(EC.serieDiaria(sessoes, sims, inicio, fimGrade).map(d => [d.data, d]));
  const ag = estAgenda();
  const previstas = new Map();
  for (const [id, e] of ag.estados) if (e.status === 'ativo' && e.proxima && e.proxima >= h){ previstas.set(e.proxima, (previstas.get(e.proxima) || 0) + 1); }
  const [a, m] = mes.split('-').map(Number);
  const nomeMes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][m - 1] + ' ' + a;
  let cels = '';
  for (let d = inicio; d <= fimGrade; d = EC.addDias(d, 1)){
    const doDia = sessoes.filter(s => s.data === d);
    const tipos = { estudo: 0, revisao: 0, retomada: 0 };
    doDia.forEach(s => tipos[s.tipo] = (tipos[s.tipo] || 0) + 1);
    const pl = planos.filter(p => p.data === d && p.status !== 'reagendada' && p.status !== 'cancelada');
    const plFeitos = pl.filter(p => EC.planoStatus(p, sessoes.filter(s => s.planoId === p.id), h) === 'concluida').length;
    const sd = serie.get(d) || { questoes: 0, minutos: 0 };
    const atr = d === h ? ag.atrasadas.length : 0;
    cels += '<div class="est-cal-dia' + (EC.mesDe(d) !== mes ? ' fora' : '') + (d === h ? ' hoje' : '') + (atr ? ' com-atraso' : '') + '" data-dia="' + d + '">'
      + '<span class="n">' + Number(d.slice(8)) + '</span>'
      + (tipos.estudo ? '<i class="mk estudo" title="Estudos">' + tipos.estudo + ' estudo' + (tipos.estudo > 1 ? 's' : '') + '</i>' : '')
      + (tipos.revisao ? '<i class="mk revisao" title="Revisões feitas">' + tipos.revisao + ' revis' + (tipos.revisao > 1 ? 'ões' : 'ão') + '</i>' : '')
      + (tipos.retomada ? '<i class="mk retomada">' + tipos.retomada + ' retomada' + (tipos.retomada > 1 ? 's' : '') + '</i>' : '')
      + (previstas.get(d) ? '<i class="mk prevista" title="Revisões previstas">' + previstas.get(d) + ' prevista' + (previstas.get(d) > 1 ? 's' : '') + '</i>' : '')
      + (atr ? '<i class="mk atraso">' + atr + ' atrasada' + (atr > 1 ? 's' : '') + '</i>' : '')
      + (pl.length ? '<i class="mk plano" title="Planejado">' + plFeitos + '/' + pl.length + ' planejado</i>' : '')
      + (sd.questoes || sd.minutos ? '<small>' + (sd.questoes ? sd.questoes + 'q' : '') + (sd.questoes && sd.minutos ? ' · ' : '') + (sd.minutos ? fmtMin(sd.minutos) : '') + '</small>' : '')
      + '</div>';
  }
  body.innerHTML = '<div class="est-hoje"><div class="est-nav"><button class="ib" id="calAnt" title="Mês anterior">‹</button><h2 class="est-h2">' + nomeMes + '</h2><button class="ib" id="calProx" title="Próximo mês">›</button><button class="btn-s" id="calHoje">Hoje</button></div>'
    + '<div class="est-cal"><div class="est-cal-sem">' + ['seg','ter','qua','qui','sex','sáb','dom'].map(x => '<span>' + x + '</span>').join('') + '</div><div class="est-cal-grade">' + cels + '</div></div></div>';
  const mudar = (n) => { const d = EC.addDias(primeiro, n > 0 ? 32 : -1); estUi.mes = EC.mesDe(d); estRender(); };
  body.querySelector('#calAnt').onclick = () => mudar(-1);
  body.querySelector('#calProx').onclick = () => mudar(1);
  body.querySelector('#calHoje').onclick = () => { estUi.mes = null; estRender(); };
  body.querySelectorAll('.est-cal-dia').forEach(c => c.onclick = () => estAbrirDia(c.dataset.dia));
};
function estAbrirDia(d){
  const h = estHoje(), sessoes = ED.todas('sessoes'), ag = estAgenda();
  const doDia = EC.ordenarSessoes(sessoes.filter(s => s.data === d));
  const prev = [...ag.estados.entries()].filter(([, e]) => e.status === 'ativo' && e.proxima === d).map(([id]) => ED.item(id)).filter(Boolean);
  const pl = ED.todas('planos').filter(p => p.data === d);
  const sims = ED.simulados().filter(s => s.data === d);
  const r = EC.resumoDia(sessoes, ED.simulados(), d);
  const { el, fechar } = estModal('<div class="modal-head"><b>' + fmtData(d, true) + '</b><button class="ib" data-fechar>✕</button></div><div class="est-form">'
    + '<div class="est-resumo">' + r.sessoes + ' registro(s) · ' + r.questoes + ' questões' + (r.questoes ? ' (' + pct(r.acertos, r.questoes) + '%)' : '') + (r.minutos ? ' · ' + fmtMin(r.minutos) : '') + '</div>'
    + '<h4 class="est-h4">Feito</h4>' + (doDia.length ? doDia.map(s => { const it = ED.item(s.itemId); return '<div class="est-h-row"><span class="t">' + TIPO_TXT[s.tipo] + '</span><span class="m">' + esc(it ? it.caminho : '(assunto removido)') + '</span><span class="r">' + (s.questoes ? s.questoes.acertos + '/' + s.questoes.feitas : '') + '</span><span class="d">' + (s.minutos ? fmtMin(s.minutos) : '') + '</span></div>'; }).join('') : '<div class="est-vazio pequeno">Nada registrado.</div>')
    + (sims.length ? '<h4 class="est-h4">Simulados</h4>' + sims.map(s => '<div class="est-h-row"><span class="m">' + esc((s.concurso || 'Simulado') + (s.banca ? ' · ' + s.banca : '')) + '</span><span class="r">' + s.acertos + '/' + s.questoes + '</span></div>').join('') : '')
    + (prev.length ? '<h4 class="est-h4">Revisões previstas</h4>' + prev.map(it => '<div class="est-h-row"><span class="m">' + esc(it.caminho) + '</span></div>').join('') : '')
    + (pl.length ? '<h4 class="est-h4">Planejado</h4>' + pl.map(p => '<div class="est-h-row"><span class="m">' + esc(nomeAtividade(p)) + '</span><span class="t">' + STATUS_PLANO[EC.planoStatus(p, sessoes.filter(s => s.planoId === p.id), h)] + '</span></div>').join('') : '')
    + '<div class="est-row fim"><button class="btn-s primary" id="diaReg">Registrar neste dia</button></div></div>', 'est-box');
  el.querySelector('#diaReg').onclick = () => { fechar(); estAbrirRegistro({ data: d <= h ? d : h }); };
}

/* =========================================================
   Planejamento semanal (planejado ≠ realizado até haver registro)
   ========================================================= */
EST_VIEWS.planejamento = function(body){
  const h = estHoje(), inicio = estUi.semana || EC.inicioSemana(h);
  const sessoes = ED.todas('sessoes'), planos = ED.todas('planos');
  const r = EC.resumoSemana(planos, sessoes, inicio, h);
  const barra = (feito, meta, txt) => '<div class="est-meta"><div class="est-meta-txt">' + txt + '</div><div class="est-meta-bar"><i style="width:' + Math.min(100, meta > 0 ? Math.round(feito / meta * 100) : 0) + '%"></i></div></div>';
  const diasNome = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  body.innerHTML = '<div class="est-hoje est-largo"><div class="est-nav"><button class="ib" id="plAnt" title="Semana anterior">‹</button><h2 class="est-h2">Semana de ' + fmtData(inicio) + ' a ' + fmtData(EC.addDias(inicio, 6), true) + '</h2><button class="ib" id="plProx" title="Próxima semana">›</button><button class="btn-s" id="plHoje">Esta semana</button></div>'
    + '<div class="est-cards">'
    + '<div class="est-card"><span>Tempo: realizado / planejado</span><b>' + fmtMin(r.realizado.minutos) + ' / ' + fmtMin(r.planejado.minutos) + '</b>' + barra(r.realizado.minutos, r.planejado.minutos, '') + '</div>'
    + '<div class="est-card"><span>Questões: realizado / planejado</span><b>' + r.realizado.questoes + ' / ' + r.planejado.questoes + '</b>' + barra(r.realizado.questoes, r.planejado.questoes, '') + '</div>'
    + '</div>'
    + '<div class="est-semana">' + r.dias.map((dia, i) => '<div class="est-dia-col' + (dia.data === h ? ' hoje' : '') + '"><div class="est-dia-cab"><b>' + diasNome[i] + '</b> ' + fmtData(dia.data) + '<button class="ib" data-novo="' + dia.data + '" title="Planejar neste dia">＋</button></div>'
      + dia.itens.map(x => '<div class="est-plano st-' + x.status + '" data-id="' + esc(x.plano.id) + '"><b></b><span>' + [x.plano.metaMinutos ? 'meta ' + fmtMin(x.plano.metaMinutos) : '', x.plano.metaQuestoes ? x.plano.metaQuestoes + ' questões' : ''].filter(Boolean).join(' · ') + '</span>'
        + '<span class="est-plano-st">' + STATUS_PLANO[x.status] + (x.status === 'concluida' ? ' · feito ' + [x.realizado.minutos ? fmtMin(x.realizado.minutos) : '', x.realizado.questoes ? x.realizado.questoes + 'q' : ''].filter(Boolean).join(' · ') : '') + (x.plano.reagendadaPara ? ' → ' + fmtData(x.plano.reagendadaPara) : '') + '</span>'
        + '<div class="est-plano-ac">' + (x.status === 'pendente' || x.status === 'atrasada' ? '<button class="btn-s" data-a="registrar">Registrar</button><button class="ib" data-a="reagendar" title="Reagendar">📅</button><button class="ib" data-a="cancelar" title="Cancelar">⊘</button>' : '') + '<button class="ib" data-a="excluir" title="Excluir">🗑</button></div></div>').join('')
      + '</div>').join('') + '</div></div>';
  const mover = (n) => { estUi.semana = EC.addDias(inicio, n * 7); estRender(); };
  body.querySelector('#plAnt').onclick = () => mover(-1);
  body.querySelector('#plProx').onclick = () => mover(1);
  body.querySelector('#plHoje').onclick = () => { estUi.semana = null; estRender(); };
  body.querySelectorAll('[data-novo]').forEach(b => b.onclick = () => estAbrirPlano({ data: b.dataset.novo }));
  body.querySelectorAll('.est-plano').forEach(card => {
    const p = planos.find(x => x.id === card.dataset.id);
    card.querySelector('b').textContent = nomeAtividade(p);
    card.querySelectorAll('[data-a]').forEach(b => b.onclick = () => estAcaoPlano(p, b.dataset.a));
  });
};
function estRegistrarDoPlano(p){
  const base = { planoId: p.id, data: p.data <= estHoje() ? (p.data < estHoje() ? estHoje() : p.data) : estHoje() };
  if (p.itemId && ED.item(p.itemId)) return estAbrirRegistro(Object.assign(base, { itemId: p.itemId }));
  if (p.topico) return estAbrirRegistro(Object.assign(base, { topico: p.topico }));
  return estAbrirRegistro(Object.assign(base, { livre: { titulo: p.titulo || '', materia: p.materia || '' } }));
}
async function estAcaoPlano(p, acao){
  if (acao === 'registrar') return estRegistrarDoPlano(p);
  if (acao === 'excluir'){ if (!confirm('Excluir esta atividade planejada?')) return; await ED.excluirPlano(p.id); }
  if (acao === 'cancelar') await ED.salvarPlano(Object.assign({}, p, { status: 'cancelada' }));
  if (acao === 'reagendar'){
    const { el, fechar } = estModal('<div class="modal-head"><b>Reagendar</b><button class="ib" data-fechar>✕</button></div><div class="est-form"><div class="est-campo"><label>Nova data</label><input type="date" id="rgData"></div><div class="est-row fim"><button class="btn-s" data-fechar>Cancelar</button><button class="btn-s primary" id="rgOk">Reagendar</button></div></div>', 'est-box est-pequeno');
    el.querySelector('#rgData').value = EC.addDias(estHoje(), 1);
    el.querySelector('#rgOk').onclick = async () => { const d = el.querySelector('#rgData').value; if (!d) return; await ED.reagendarPlano(p.id, d); fechar(); toast('Reagendado para ' + fmtData(d)); estRender(); };
    return;
  }
  estRender();
}
async function estAbrirPlano(o){
  const tops = await estTopicos();
  let escolha = null;
  const { el, fechar } = estModal('<div class="modal-head"><b>Planejar atividade</b><button class="ib" data-fechar>✕</button></div><div class="est-form">'
    + '<div class="est-campo"><label>O que estudar</label><div class="est-seg"><button class="on" data-modo="topico">Tópico dos mapas</button><button data-modo="livre">Livre</button></div>'
    + '<div id="plBusca"><input id="plQ" placeholder="Buscar tópico ou assunto já acompanhado…" autocomplete="off"><div class="est-res" id="plRes"></div><div class="est-esc hidden" id="plEsc"><b></b></div></div>'
    + '<div id="plLivre" class="hidden est-linha2"><input id="plTitulo" placeholder="Ex.: Simulado de Português"><input id="plMat" list="plMatList" placeholder="Matéria (opcional)"><datalist id="plMatList">' + ws.items.filter(i => i.type === 'map').map(i => '<option value="' + esc(i.title) + '">').join('') + '</datalist></div></div>'
    + '<div class="est-linha2"><div class="est-campo"><label>Dia</label><input type="date" id="plData"></div><div class="est-campo"><label>Meta de tempo</label><input id="plMin" placeholder="ex.: 1h30 (opcional)"></div><div class="est-campo"><label>Meta de questões</label><input type="number" min="0" id="plQ2" placeholder="opcional"></div></div>'
    + '<div class="est-msg" id="plMsg"></div><div class="est-row fim"><button class="btn-s" data-fechar>Cancelar</button><button class="btn-s primary" id="plOk">Planejar</button></div></div>', 'est-box');
  el.querySelector('#plData').value = o.data || estHoje();
  let modo = 'topico';
  el.querySelectorAll('.est-seg button').forEach(b => b.onclick = () => { modo = b.dataset.modo; el.querySelectorAll('.est-seg button').forEach(x => x.classList.toggle('on', x === b)); el.querySelector('#plBusca').classList.toggle('hidden', modo !== 'topico'); el.querySelector('#plLivre').classList.toggle('hidden', modo !== 'livre'); });
  const q = el.querySelector('#plQ'), res = el.querySelector('#plRes');
  q.addEventListener('input', () => {
    const t = semAcento(q.value.trim());
    const livres = ED.todas('itens').filter(i => i.tipo === 'livre').map(i => ({ livreItem: i, caminho: i.caminho }));
    const achados = t ? tops.concat(livres).filter(x => semAcento(x.caminho).includes(t)).slice(0, 30) : [];
    res.innerHTML = achados.map((x, i) => '<button data-i="' + i + '"></button>').join('');
    res.querySelectorAll('button').forEach(b => { const x = achados[Number(b.dataset.i)]; b.textContent = x.caminho; b.onclick = () => { escolha = x; res.innerHTML = ''; const esc_ = el.querySelector('#plEsc'); esc_.classList.remove('hidden'); esc_.querySelector('b').textContent = x.caminho; }; });
  });
  setTimeout(() => q.focus(), 30);
  el.querySelector('#plOk').onclick = async () => {
    const msg = el.querySelector('#plMsg');
    const p = { id: ED.novoId(), data: el.querySelector('#plData').value, status: 'planejada', metaMinutos: 0, metaQuestoes: parseInt(el.querySelector('#plQ2').value, 10) || 0 };
    const mt = el.querySelector('#plMin').value.trim();
    if (mt){ const m = EC.parseDuracao(mt); if (m == null){ msg.textContent = 'Não entendi a meta de tempo (ex.: 1h30).'; msg.className = 'est-msg err'; return; } p.metaMinutos = m; }
    if (!p.data){ msg.textContent = 'Escolha o dia.'; msg.className = 'est-msg err'; return; }
    if (modo === 'topico'){
      if (!escolha){ msg.textContent = 'Escolha um tópico ou use "Livre".'; msg.className = 'est-msg err'; return; }
      if (escolha.livreItem) p.itemId = escolha.livreItem.id;
      else { const ja = ED.todas('itens').find(i => i.mapId === escolha.mapId && i.nodeId === escolha.nodeId); if (ja) p.itemId = ja.id; else p.topico = { mapId: escolha.mapId, nodeId: escolha.nodeId, caminho: escolha.caminho, materia: escolha.materia }; }
    } else {
      p.titulo = el.querySelector('#plTitulo').value.trim(); p.materia = el.querySelector('#plMat').value.trim();
      if (!p.titulo){ msg.textContent = 'Escreva o que você vai estudar.'; msg.className = 'est-msg err'; return; }
    }
    await ED.salvarPlano(p); fechar(); toast('Planejado para ' + fmtData(p.data)); estRender();
  };
}
/* "Planejado para hoje" dentro da tela Hoje */
EST_VIEWS._planejadoHoje = function(d){
  const sessoes = ED.todas('sessoes');
  const lista = ED.todas('planos').filter(p => p.data <= d && p.status === 'planejada').map(p => ({ p, st: EC.planoStatus(p, sessoes.filter(s => s.planoId === p.id), d) })).filter(x => x.st === 'pendente' || x.st === 'atrasada');
  if (!lista.length) return '';
  return '<section class="est-sec planejado"><h3>📅 Planejado (' + lista.length + ')</h3>' + lista.map(x => '<div class="est-linha" data-plano="' + esc(x.p.id) + '"><div class="est-l-txt"><b></b><span>' + (x.st === 'atrasada' ? 'era para ' + fmtData(x.p.data) + ' · ' : '') + [x.p.metaMinutos ? 'meta ' + fmtMin(x.p.metaMinutos) : '', x.p.metaQuestoes ? x.p.metaQuestoes + ' questões' : ''].filter(Boolean).join(' · ') + '</span></div><button class="btn-s" data-plano-reg>Registrar</button></div>').join('') + '</section>';
};
EST_VIEWS._ligarPlanejadoHoje = function(body){
  body.querySelectorAll('[data-plano]').forEach(row => {
    const p = ED.todas('planos').find(x => x.id === row.dataset.plano);
    row.querySelector('b').textContent = nomeAtividade(p);
    row.onclick = () => estRegistrarDoPlano(p);
  });
};
