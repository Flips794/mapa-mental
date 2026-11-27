/* =========================================================
   Área de trabalho: lista de arquivos, modos e inicialização
   ========================================================= */
"use strict";

// ws e appMode são declarados em util.js (precisam existir antes dos outros scripts)

async function wsSave(){ if(ws) await Store.set('ws',ws); }
function wsItem(id){ return ws.items.find(i=>i.id===id); }

/* ---------- Modos (Mapas / Documentos) ---------- */
async function switchMode(m,opts){
  opts=opts||{};
  if(m===appMode) return;
  if(appMode==='map'){ if(editingId) endInlineEdit(); await mapFlush(); }
  else await docFlush();
  appMode=m; ws.mode=m; wsSave();
  document.body.classList.toggle('mode-map',m==='map');
  document.body.classList.toggle('mode-doc',m==='doc');
  document.querySelectorAll('.seg button').forEach(b=>b.classList.toggle('on',b.dataset.mode===m));
  if(m==='map'){ mapShown(); }
  else if(!opts.noAutoOpen && !D){
    const docs=ws.items.filter(i=>i.type==='doc');
    const target = docs.find(d=>d.id===ws.current.doc) || docs[0];
    if(target) await docOpen(target.id); else updateDocEmpty();
  }
  renderSidebar();
}
document.querySelectorAll('.seg button').forEach(b=>b.addEventListener('click',()=>switchMode(b.dataset.mode)));

/* ---------- Barra lateral ---------- */
const sbList=$('#sbList');
function renderSidebar(){
  if(!ws) return;
  const type=appMode;
  $('#sbTitle').textContent = type==='map' ? 'Mapas mentais' : 'Documentos';
  $('#sbNew').title = type==='map' ? 'Novo mapa mental' : 'Novo documento';
  const items=ws.items.filter(i=>i.type===type);
  const active = type==='map' ? curMapId : curDocId;
  sbList.innerHTML='';
  if(!items.length){
    sbList.innerHTML='<div class="sb-empty">'+(type==='map' ? 'Nenhum mapa ainda.' : 'Nenhum documento ainda.<br>Crie um novo ou abra um PDF.')+'</div>';
    return;
  }
  items.forEach(it=>{
    const row=document.createElement('div'); row.className='sb-item'+(it.id===active?' on':''); row.dataset.id=it.id;
    const isPdf = it.type==='doc' && it.pdfs && it.pdfs.length;
    row.innerHTML='<span class="ico '+it.type+'">'+(it.type==='map'?'◉':(isPdf?'PDF':'¶'))+'</span><span class="nm"></span><button class="more" title="Opções">⋯</button>';
    row.querySelector('.nm').textContent=it.title||'Sem título';
    row.title=it.title||'';
    sbList.appendChild(row);
  });
}
sbList.addEventListener('click',async e=>{
  const row=e.target.closest('.sb-item'); if(!row) return;
  const id=row.dataset.id, it=wsItem(id); if(!it) return;
  if(e.target.closest('.more')){
    const r=e.target.getBoundingClientRect();
    showMenu(r.right-4, r.bottom+4, [
      {label:'✏️  Renomear', fn:()=>renameItem(it)},
      {label:'⧉  Duplicar', fn:()=>duplicateItem(it)},
      {label:'🗑  Excluir', danger:true, fn:()=>deleteItem(it)},
    ]);
    return;
  }
  if(it.type==='map'){ if(id!==curMapId){ await mapOpen(id); renderSidebar(); } }
  else await docOpen(id);
});
sbList.addEventListener('dblclick',e=>{ const row=e.target.closest('.sb-item'); if(row && !e.target.closest('.more')) renameItem(wsItem(row.dataset.id)); });

$('#sbNew').addEventListener('click',()=>{ if(appMode==='map') newMap(); else newDocument(); });
$('#sbPdf').addEventListener('click',()=>pickPdf('new'));
$('#sbBtn').addEventListener('click',()=>{ $('#sidebar').classList.toggle('collapsed'); $('#sbBtn').classList.toggle('on',!$('#sidebar').classList.contains('collapsed')); if(appMode==='map') scheduleLayout(); });

async function newMap(){
  const name=prompt('Nome do novo mapa:','Novo mapa'); if(name===null) return;
  const title=name.trim()||'Novo mapa';
  await mapFlush();
  const id=genId(), data=blankMap(title);
  await Store.set('map:'+id,data);
  ws.items.push({id,type:'map',title,updated:Date.now()});
  await wsSave();
  await mapOpen(id); renderSidebar();
  showPanel(true);
  if(panelTab==='text') selectNodeTitleInText(M.root.id); else { rteText.focus(); selectAllIn(rteText); }
  toast('Mapa criado · o tópico central pode ter outro nome, é só editar');
}

async function renameItem(it){
  if(!it) return;
  const name=prompt('Novo nome:', it.title||''); if(name==null) return;
  const t=name.trim(); if(!t) return;
  if(it.type==='map'){
    // só o nome do mapa muda; o texto das árvores fica como está
    if(it.id===curMapId){ M.title=t; await saveNow(); }
    else { const d=await Store.get('map:'+it.id); if(d&&(d.root||d.trees)){ const n=normalizeMap(d); await Store.set('map:'+it.id,{version:3,title:t,trees:n.trees,files:n.files}); } it.title=t; await wsSave(); }
    if(Store.mode==='server'){ const d=it.id===curMapId?M:normalizeMap(await Store.get('map:'+it.id)); Store.setText(it.id,t,mapToText(d).text); }
  } else {
    if(it.id===curDocId){ docTitleEl.value=t; await docSaveNow(); }
    else { const d=await Store.get('doc:'+it.id); if(d){ d.title=t; await Store.set('doc:'+it.id,d); } it.title=t; await wsSave(); }
  }
  renderSidebar();
}

async function duplicateItem(it){
  if(it.type==='map'){ await mapFlush(); } else await docFlush();
  const key=it.type+':'+it.id, data=await Store.get(key); if(!data) return;
  const copy=JSON.parse(JSON.stringify(data)), id=genId();
  const title=(it.title||'Sem título')+' (cópia)';
  copy.title=title;
  await Store.set(it.type+':'+id, copy);
  const meta=Object.assign({},it,{id,title,updated:Date.now()});
  ws.items.splice(ws.items.indexOf(it)+1,0,meta);
  await wsSave(); renderSidebar();
  toast('Cópia criada.');
}

async function deleteItem(it){
  if(!confirm('Excluir "'+(it.title||'Sem título')+'"? Isso não pode ser desfeito.')) return;
  ws.items.splice(ws.items.indexOf(it),1);
  if(it.type==='map'){
    if(it.id===curMapId){ clearTimeout(saveTimer); saveTimer=null; M=null; curMapId=null; }
    await Store.del('map:'+it.id);
    let next=ws.items.find(i=>i.type==='map');
    if(!next){ const id=genId(); await Store.set('map:'+id, defaultMap()); next={id,type:'map',title:'Meu Mapa Mental',updated:Date.now()}; ws.items.unshift(next); }
    await wsSave();
    if(!M) await mapOpen(next.id);
  } else {
    if(it.id===curDocId){ clearTimeout(docSaveTimer); docSaveTimer=null; docClose(); }
    await Store.del('doc:'+it.id);
    // apaga os PDFs que nenhum outro documento usa
    const still=new Set(); ws.items.filter(i=>i.type==='doc').forEach(i=>(i.pdfs||[]).forEach(p=>still.add(p)));
    for(const p of (it.pdfs||[])){ if(!still.has(p)){ await Store.del('pdf:'+p); pdfCache.delete(p); } }
    await wsSave();
    if(!D && appMode==='doc'){ const d=ws.items.find(i=>i.type==='doc'); if(d) await docOpen(d.id); }
  }
  renderSidebar(); if(appMode==='map') render();
  toast('Excluído.');
}

/* ---------- Inicialização (com migração das versões anteriores) ---------- */
(async function init(){
  await Store.ready;
  if(/github\.io$/i.test(location.hostname)) showOnlineBanner();
  try{ ws=await Store.get('ws'); }
  catch(err){ fatal('Não foi possível ler os dados do servidor local. Verifique se ele está rodando e recarregue a página.'); return; }
  if(!ws || !Array.isArray(ws.items)){
    const legacy=await Store.get('doc');            // mapa único das versões anteriores
    const id=genId();
    const data = legacy && legacy.root ? normalizeMap(legacy) : defaultMap();
    await Store.set('map:'+id, data);
    ws={version:3, mode:'map', items:[{id,type:'map',title:mapTitle(data),updated:Date.now()}], current:{map:id,doc:null}};
    await wsSave();
  }
  ws.items=ws.items.filter(i=>i && typeof i.id==='string' && (i.type==='map'||i.type==='doc'));
  ws.current=ws.current||{};
  if(!ws.items.some(i=>i.type==='map')){
    const id=genId(); await Store.set('map:'+id, defaultMap());
    ws.items.unshift({id,type:'map',title:'Meu Mapa Mental',updated:Date.now()});
  }
  appMode = ws.mode==='doc' ? 'doc' : 'map';
  document.body.classList.add('mode-'+appMode);
  document.querySelectorAll('.seg button').forEach(b=>b.classList.toggle('on',b.dataset.mode===appMode));

  const cm=wsItem(ws.current.map);
  await mapOpen(cm && cm.type==='map' ? cm.id : ws.items.find(i=>i.type==='map').id);
  if(appMode==='doc'){
    const cd=wsItem(ws.current.doc), docs=ws.items.filter(i=>i.type==='doc');
    const t=(cd && cd.type==='doc') ? cd : docs[0];
    if(t) await docOpen(t.id); else updateDocEmpty();
  } else updateDocEmpty();
  renderSidebar();
  setStatus(Store.mode==='server' ? 'Pronto ✓' : 'Pronto (só neste navegador)');
  $('#status').title = Store.mode==='server'
    ? 'Tudo é salvo no servidor local (pasta dados/ do projeto) — igual em qualquer navegador deste computador'
    : 'Os dados ficam só neste navegador';
  if(Store.mode==='server'){
    buildMissingMirrors();
    window.addEventListener('focus',syncFromServer);
    document.addEventListener('visibilitychange',()=>{ if(!document.hidden) syncFromServer(); });
  }
})();

/* ---------- Erro grave: não escreve nada, só avisa ---------- */
function fatal(msg){
  setStatus('⚠ Sem servidor');
  const d=document.createElement('div'); d.className='modal';
  d.innerHTML='<div class="modal-box" style="padding:22px;max-width:460px"><b style="font-size:15px">⚠ Servidor indisponível</b><p style="color:var(--muted);line-height:1.55">'+esc(msg)+'</p><button class="btn-s primary" onclick="location.reload()">Tentar de novo</button></div>';
  document.body.appendChild(d);
}

/* ---------- Aviso na versão do GitHub ---------- */
function showOnlineBanner(){
  if(sessionStorage.getItem('mm-banner-off')) return;
  const b=document.createElement('div'); b.className='online-banner';
  b.innerHTML='Versão online de demonstração: aqui os dados ficam <b>só neste navegador</b>. Seus mapas ficam no endereço do seu computador: <a href="http://localhost:4580">http://localhost:4580</a> · para levar o que está aqui: Exportar → Tudo e depois Importar lá. <button title="Fechar">✕</button>';
  b.querySelector('button').onclick=()=>{ b.remove(); sessionStorage.setItem('mm-banner-off','1'); };
  document.body.insertBefore(b,document.body.firstChild);
}

/* ---------- Cópias .md que ainda não existem em dados/texto ---------- */
async function buildMissingMirrors(){
  const have=new Set(await Store.textIds());
  for(const it of ws.items.filter(i=>i.type==='map' && !have.has(i.id))){
    try{ const d=await Store.get('map:'+it.id); if(d && (d.root||d.trees)){ const m=normalizeMap(d); await Store.setText(it.id, mapTitle(m), mapToText(m).text); } }catch(e){}
  }
}

/* ---------- Voltar para a janela: pega o que outro navegador salvou ---------- */
let syncing=false;
async function syncFromServer(){
  if(syncing || Store.mode!=='server' || document.hidden || !ws) return;
  if(saveTimer || docSaveTimer || editingId || textTimer) return;
  const a=document.activeElement;
  if(a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
  syncing=true;
  try{
    const remote=await Store.get('ws');
    if(!remote || !Array.isArray(remote.items)) return;
    const newer=(id)=>{ const r=remote.items.find(i=>i.id===id), l=ws.items.find(i=>i.id===id); return r && l && (r.updated||0)>(l.updated||0); };
    const mapChanged=curMapId && newer(curMapId), docChanged=curDocId && newer(curDocId);
    const listChanged=JSON.stringify(remote.items)!==JSON.stringify(ws.items);
    remote.mode=ws.mode; remote.current=ws.current;
    ws=remote;
    if(curMapId && !ws.items.some(i=>i.id===curMapId)){ M=null; curMapId=null; const f=ws.items.find(i=>i.type==='map'); if(f) await mapOpen(f.id); }
    else if(mapChanged){ const id=curMapId; curMapId=null; await mapOpen(id); }
    if(curDocId && (!ws.items.some(i=>i.id===curDocId) || docChanged)){ const id=curDocId; docClose(); if(ws.items.some(i=>i.id===id)) await docOpen(id); }
    if(listChanged || mapChanged) renderSidebar();
  }catch(e){ /* servidor fora do ar: tenta na próxima vez */ }
  finally{ syncing=false; }
}
