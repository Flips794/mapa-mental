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
  await mapFlush();
  const id=genId(), data=blankMap('Novo mapa');
  await Store.set('map:'+id,data);
  ws.items.push({id,type:'map',title:'Novo mapa',updated:Date.now()});
  await wsSave();
  await mapOpen(id); renderSidebar();
  showPanel(true);
  if(panelTab==='text') selectNodeTitleInText(M.root.id); else { rteText.focus(); selectAllIn(rteText); }
  toast('Digite o nome do novo mapa');
}

async function renameItem(it){
  if(!it) return;
  const name=prompt('Novo nome:', it.title||''); if(name==null) return;
  const t=name.trim(); if(!t) return;
  if(it.type==='map'){
    if(it.id===curMapId){ pushHistory(); M.root.html=esc(t); fastIndex=null; render(); await saveNow(); }
    else { const d=await Store.get('map:'+it.id); if(d&&d.root){ const n=normalizeMap(d); n.root.html=esc(t); await Store.set('map:'+it.id,n); } it.title=t; await wsSave(); }
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
  if(it.type==='map'){ copy.root.html=esc(title); }
  else copy.title=title;
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
  ws=await Store.get('ws');
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
  setStatus('Pronto ✓');
})();
