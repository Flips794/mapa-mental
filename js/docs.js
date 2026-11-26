/* =========================================================
   Editor de documentos: páginas de texto (estilo Word) e
   páginas de PDF com caixas de texto por cima
   ========================================================= */
"use strict";

const PAGE_W = 794;               // A4 a 96 dpi (210 mm)
const PAGE_H = 1122;              // 297 mm
let D=null, curDocId=null;        // documento aberto: {id, title}
let docZoom=1, docSaveTimer=null, docSavedRange=null;
const docPagesEl=$('#docPages'), docScroll=$('#docScroll'), docTitleEl=$('#docTitle');

/* ---------- PDF.js (carregado só quando necessário) ---------- */
let pdfjsP=null;
function loadScript(src){ return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=()=>rej(new Error('Falha ao carregar '+src)); document.head.appendChild(s); }); }
function loadPdfJs(){
  if(pdfjsP) return pdfjsP;
  pdfjsP=(async ()=>{
    await loadScript('vendor/pdfjs/pdf.min.js');
    const lib=window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc='vendor/pdfjs/pdf.worker.min.js';
    // Aberto direto do disco (file://) o navegador bloqueia workers: roda no próprio processo
    if(location.protocol==='file:') await loadScript('vendor/pdfjs/pdf.worker.min.js');
    return lib;
  })();
  pdfjsP.catch(()=>{ pdfjsP=null; });
  return pdfjsP;
}
const pdfCache=new Map();         // pdfId -> Promise<PDFDocumentProxy>
function openPdfData(lib,buf){ return lib.getDocument({data:new Uint8Array(buf.slice(0)), standardFontDataUrl:'vendor/pdfjs/standard_fonts/'}).promise; }
function getPdf(pdfId){
  if(!pdfCache.has(pdfId)){
    const p=(async ()=>{
      const [lib,buf]=await Promise.all([loadPdfJs(), Store.get('pdf:'+pdfId)]);
      if(!buf) throw new Error('PDF não encontrado');
      return openPdfData(lib,buf);
    })();
    p.catch(()=>pdfCache.delete(pdfId));
    pdfCache.set(pdfId,p);
  }
  return pdfCache.get(pdfId);
}

/* ---------- Modelo ---------- */
function newTextPage(html){ return {id:genId(),kind:'text',html:html||''}; }
function pageLabel(p){
  if(p.kind==='pdf'){
    const t=(p.overlays||[]).map(o=>plainText(o.html)).join(' ').trim();
    return 'PDF pág. '+p.num+(t?' · '+t.slice(0,30):'');
  }
  const spaced=(p.html||'').replace(/<\/(p|div|h[1-6]|li|blockquote)>|<br\s*\/?>/gi,'$& ');
  return plainText(spaced).replace(/\s+/g,' ').trim().slice(0,40) || 'Página em branco';
}
function docMeta(data){ return { pages:data.pages.map(p=>({id:p.id,label:pageLabel(p)})), pdfs:[...new Set(data.pages.filter(p=>p.kind==='pdf').map(p=>p.pdf))] }; }

async function docCreate(title,pages){
  const id=genId();
  const data={title:title||'Documento sem título', pages:pages&&pages.length?pages:[newTextPage('')]};
  await Store.set('doc:'+id,data);
  ws.items.push(Object.assign({id,type:'doc',title:data.title,updated:Date.now()},docMeta(data)));
  await wsSave();
  return id;
}

async function docOpen(id){
  if(curDocId===id && D) return;
  await docFlush();
  const data=await Store.get('doc:'+id);
  if(!data){ toast('Documento não encontrado.'); return; }
  D={id}; curDocId=id; ws.current.doc=id; wsSave();
  docTitleEl.value=data.title||'';
  docPagesEl.innerHTML='';
  (data.pages||[]).forEach(p=>docPagesEl.appendChild(buildPage(p)));
  if(!docPagesEl.children.length) docPagesEl.appendChild(buildPage(newTextPage('')));
  renumber(); updateDocEmpty(); docScroll.scrollTop=0;
  renderSidebar();
}
function docClose(){ D=null; curDocId=null; docPagesEl.innerHTML=''; updateDocEmpty(); }
function updateDocEmpty(){
  $('#docEmpty').classList.toggle('hidden',!!D);
  docScroll.classList.toggle('hidden',!D);
  $('#docBar').classList.toggle('disabled',!D);
}

/* ---------- Construção das páginas ---------- */
function pageTools(){
  const t=document.createElement('div'); t.className='page-tools';
  t.innerHTML=
    '<button data-act="up" title="Mover para cima">↑</button>'+
    '<button data-act="down" title="Mover para baixo">↓</button>'+
    '<button data-act="add" title="Inserir página em branco depois desta">＋</button>'+
    '<button data-act="del" class="danger" title="Excluir página">🗑</button>';
  return t;
}
function buildPage(p){
  const el=document.createElement('div');
  el.dataset.pid=p.id; el.dataset.kind=p.kind;
  if(p.kind==='pdf'){
    el.className='page pdf';
    el.dataset.pdf=p.pdf; el.dataset.num=p.num; el.dataset.ratio=p.ratio;
    el.style.height=Math.round(PAGE_W*p.ratio)+'px';
    el.innerHTML='<canvas></canvas><div class="loading">Carregando página…</div><div class="overlays"></div>';
    const ov=el.querySelector('.overlays');
    (p.overlays||[]).forEach(o=>ov.appendChild(buildOverlay(o)));
    pdfObserver.observe(el);
  } else {
    el.className='page text';
    const body=document.createElement('div'); body.className='page-body'; body.contentEditable='true'; body.spellcheck=true;
    body.innerHTML=sanitizeDoc(p.html)||'<p><br></p>';
    el.appendChild(body);
  }
  el.appendChild(pageTools());
  const num=document.createElement('div'); num.className='page-num'; el.appendChild(num);
  return el;
}
function buildOverlay(o){
  const ov=document.createElement('div'); ov.className='ov'; ov.dataset.oid=o.id||genId();
  ov.style.left=o.x+'%'; ov.style.top=o.y+'%'; ov.style.width=(o.w||30)+'%';
  ov.innerHTML='<div class="ov-grip" title="Arraste para mover">⠿ mover<button class="ov-del" title="Excluir caixa">✕</button></div><div class="ov-body" contenteditable="true"></div><div class="ov-rs" title="Arraste para mudar a largura"></div>';
  ov.querySelector('.ov-body').innerHTML=sanitizeDoc(o.html);
  return ov;
}
function renumber(){
  const pages=[...docPagesEl.children];
  pages.forEach((el,i)=>{ el.querySelector('.page-num').textContent='Página '+(i+1)+' de '+pages.length; });
}

/* ---------- Renderização preguiçosa do PDF ---------- */
const pdfObserver=new IntersectionObserver(entries=>{
  entries.forEach(en=>{ if(en.isIntersecting) renderPdfPage(en.target); });
},{root:docScroll, rootMargin:'800px 0px'});

async function renderPdfPage(el){
  const scale=Math.max(1,docZoom)*(window.devicePixelRatio||1)*1.25;
  if(el._rendering) return el._rendering;
  if(el._scale && el._scale>=scale) return;
  el._rendering=(async ()=>{
    try{
      const pdf=await getPdf(el.dataset.pdf);
      const page=await pdf.getPage(+el.dataset.num);
      const vp1=page.getViewport({scale:1});
      const vp=page.getViewport({scale:PAGE_W*scale/vp1.width});
      const c=el.querySelector('canvas');
      const tmp=document.createElement('canvas'); tmp.width=Math.ceil(vp.width); tmp.height=Math.ceil(vp.height);
      await page.render({canvasContext:tmp.getContext('2d'), viewport:vp}).promise;
      c.width=tmp.width; c.height=tmp.height; c.getContext('2d').drawImage(tmp,0,0);
      el._scale=scale;
      const l=el.querySelector('.loading'); if(l) l.remove();
    }catch(err){
      const l=el.querySelector('.loading'); if(l) l.textContent='Não foi possível carregar esta página do PDF.';
    }finally{ el._rendering=null; }
  })();
  return el._rendering;
}

/* ---------- Importar PDF ---------- */
const pdfInput=$('#pdfFile'); let pdfInputMode='new';
function pickPdf(mode){ pdfInputMode=mode; pdfInput.click(); }
pdfInput.addEventListener('change',async e=>{
  const file=e.target.files[0]; e.target.value='';
  if(!file) return;
  try{ await importPdf(file, pdfInputMode); }
  catch(err){ console.error(err); toast('Não foi possível abrir este PDF.'); }
});
async function importPdf(file, mode){
  setStatus('Abrindo PDF…');
  const lib=await loadPdfJs();
  const buf=await file.arrayBuffer();
  const pdf=await openPdfData(lib,buf);
  const pdfId='p'+genId();
  if(!await Store.set('pdf:'+pdfId, buf)){ toast('Sem espaço para salvar este PDF no navegador.'); setStatus('—'); return; }
  pdfCache.set(pdfId, Promise.resolve(pdf));
  const pages=[];
  for(let i=1;i<=pdf.numPages;i++){
    const pg=await pdf.getPage(i); const vp=pg.getViewport({scale:1});
    pages.push({id:genId(),kind:'pdf',pdf:pdfId,num:i,ratio:+(vp.height/vp.width).toFixed(5),overlays:[]});
  }
  if(mode==='append' && D){
    pages.forEach(p=>docPagesEl.appendChild(buildPage(p)));
    renumber(); docSaveSoon();
    docPagesEl.lastChild && pages.length && docPagesEl.querySelector('[data-pid="'+pages[0].id+'"]').scrollIntoView({behavior:'smooth',block:'start'});
    toast(pdf.numPages+' página(s) adicionada(s).');
  } else {
    const id=await docCreate(file.name.replace(/\.pdf$/i,''), pages);
    if(appMode!=='doc') await switchMode('doc');
    await docOpen(id);
    toast('PDF aberto: '+pdf.numPages+' página(s).');
  }
  setStatus('Pronto ✓');
}

/* ---------- Salvamento ---------- */
function docSerialize(){
  const pages=[...docPagesEl.children].map(el=>{
    if(el.dataset.kind==='pdf'){
      const overlays=[...el.querySelectorAll('.ov')].map(ov=>({
        id:ov.dataset.oid, x:+parseFloat(ov.style.left).toFixed(3), y:+parseFloat(ov.style.top).toFixed(3),
        w:+parseFloat(ov.style.width).toFixed(3), html:sanitizeDoc(ov.querySelector('.ov-body').innerHTML)
      })).filter(o=>!isEmptyHtml(o.html));
      return {id:el.dataset.pid,kind:'pdf',pdf:el.dataset.pdf,num:+el.dataset.num,ratio:+el.dataset.ratio,overlays};
    }
    return {id:el.dataset.pid,kind:'text',html:sanitizeDoc(el.querySelector('.page-body').innerHTML)};
  });
  return {title:docTitleEl.value.trim()||'Documento sem título', pages};
}
function docSaveSoon(){ if(!D) return; setStatus('Salvando…'); clearTimeout(docSaveTimer); docSaveTimer=setTimeout(docSaveNow,600); }
async function docSaveNow(){
  docSaveTimer=null;
  if(!D) return;
  const data=docSerialize();
  const ok=await Store.set('doc:'+D.id,data);
  const it=ws.items.find(i=>i.id===D.id);
  if(it){ const changed=it.title!==data.title; Object.assign(it,{title:data.title,updated:Date.now()},docMeta(data)); await wsSave(); if(changed) renderSidebar(); }
  savedStatus(ok);
}
async function docFlush(){ if(D && docSaveTimer){ clearTimeout(docSaveTimer); await docSaveNow(); } }
window.addEventListener('pagehide',()=>{ if(D) Store.set('doc:'+D.id, docSerialize()); });
docTitleEl.addEventListener('input',docSaveSoon);
docTitleEl.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); const b=docPagesEl.querySelector('.page-body,.ov-body'); if(b){ b.focus(); } } });

/* ---------- Texto que transborda vai para a próxima página ---------- */
function nextTextPage(el){
  let n=el.nextElementSibling;
  if(!n || n.dataset.kind!=='text'){ n=buildPage(newTextPage('')); n.querySelector('.page-body').innerHTML=''; el.after(n); renumber(); }
  return n;
}
function reflow(el,depth){
  depth=depth||0; if(depth>20) return;
  const body=el.querySelector('.page-body'); if(!body) return;
  let moved=false, guard=0;
  while(body.scrollHeight>body.clientHeight+2 && body.childNodes.length>1 && guard++<200){
    const next=nextTextPage(el), nb=next.querySelector('.page-body');
    const last=body.lastChild;
    const sel=getSelection();
    const caretInside = sel.rangeCount && last.contains(sel.anchorNode);
    const an=sel.anchorNode, ao=sel.anchorOffset;
    nb.insertBefore(last, nb.firstChild);
    if(caretInside){ nb.focus({preventScroll:true}); const r=document.createRange(); r.setStart(an,ao); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); next.scrollIntoView({block:'nearest'}); }
    moved=true;
  }
  if(moved) reflow(el.nextElementSibling,depth+1);
}

/* ---------- Eventos das páginas ---------- */
docPagesEl.addEventListener('input',e=>{
  const page=e.target.closest('.page');
  if(e.target.classList.contains('page-body')) reflow(page);
  docSaveSoon();
});
docPagesEl.addEventListener('keydown',e=>{
  const body=e.target.closest('.page-body');
  if(body && e.key==='Backspace'){
    const page=body.closest('.page'), prev=page.previousElementSibling;
    const sel=getSelection();
    const atStart = sel.isCollapsed && (()=>{ const r=document.createRange(); r.selectNodeContents(body); r.setEnd(sel.anchorNode,sel.anchorOffset); return !r.toString().length; })();
    if(atStart && isEmptyHtml(body.innerHTML) && prev && docPagesEl.children.length>1){
      e.preventDefault(); page.remove(); renumber(); docSaveSoon();
      const pb=prev.querySelector('.page-body'); if(pb){ pb.focus(); placeCaretEnd(pb); }
    }
  }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='k' && e.target.isContentEditable){ e.preventDefault(); insertLinkPrompt(); }
});
docPagesEl.addEventListener('click',async e=>{
  const btn=e.target.closest('.page-tools button');
  if(btn){
    const page=btn.closest('.page'), act=btn.dataset.act;
    if(act==='up' && page.previousElementSibling){ page.previousElementSibling.before(page); }
    else if(act==='down' && page.nextElementSibling){ page.nextElementSibling.after(page); }
    else if(act==='add'){ const n=buildPage(newTextPage('')); page.after(n); renumber(); const b=n.querySelector('.page-body'); b.focus(); placeCaretEnd(b); n.scrollIntoView({behavior:'smooth',block:'nearest'}); }
    else if(act==='del'){
      const hasContent = page.dataset.kind==='pdf' || !isEmptyHtml(page.querySelector('.page-body').innerHTML);
      if(docPagesEl.children.length===1){ toast('O documento precisa ter pelo menos uma página.'); return; }
      if(hasContent && !confirm('Excluir esta página? Links do mapa que apontam para ela deixarão de funcionar.')) return;
      page.remove();
    }
    renumber(); docSaveSoon(); return;
  }
  const del=e.target.closest('.ov-del');
  if(del){ del.closest('.ov').remove(); docSaveSoon(); return; }
  // ferramenta "caixa de texto" ativa: um clique cria a caixa
  if($('#docView').classList.contains('tool-text')){
    const page=e.target.closest('.page.pdf');
    if(page && !e.target.closest('.ov,.page-tools')) addOverlayAt(page,e.clientX,e.clientY);
  }
});
docPagesEl.addEventListener('dblclick',e=>{
  const page=e.target.closest('.page.pdf');
  if(page && !e.target.closest('.ov,.page-tools')) addOverlayAt(page,e.clientX,e.clientY);
});
function addOverlayAt(page,cx,cy){
  const r=page.getBoundingClientRect();
  const x=clamp((cx-r.left)/r.width*100,0,95), y=clamp((cy-r.top)/r.height*100,0,98);
  const ov=buildOverlay({id:genId(),x:+x.toFixed(2),y:+(y-1).toFixed(2),w:Math.min(35,100-x),html:''});
  page.querySelector('.overlays').appendChild(ov);
  const b=ov.querySelector('.ov-body'); b.focus();
  setTool(false);
}
docPagesEl.addEventListener('focusout',e=>{
  const b=e.target.closest && e.target.closest('.ov-body');
  if(b && isEmptyHtml(b.innerHTML)){ setTimeout(()=>{ if(document.activeElement!==b && b.isConnected && isEmptyHtml(b.innerHTML)){ b.closest('.ov').remove(); docSaveSoon(); } },150); }
});

/* mover / redimensionar caixas de texto */
docPagesEl.addEventListener('pointerdown',e=>{
  const grip=e.target.closest('.ov-grip'), rs=e.target.closest('.ov-rs');
  if((!grip && !rs) || e.target.closest('.ov-del')) return;
  e.preventDefault();
  const ov=e.target.closest('.ov'), page=ov.closest('.page'), r=page.getBoundingClientRect();
  const start={x:e.clientX,y:e.clientY,l:parseFloat(ov.style.left),t:parseFloat(ov.style.top),w:parseFloat(ov.style.width)};
  ov.classList.add('moving');
  const move=ev=>{
    const dx=(ev.clientX-start.x)/r.width*100, dy=(ev.clientY-start.y)/r.height*100;
    if(grip){ ov.style.left=clamp(start.l+dx,0,100-start.w)+'%'; ov.style.top=clamp(start.t+dy,0,98)+'%'; }
    else ov.style.width=clamp(start.w+dx,6,100-start.l)+'%';
  };
  const up=()=>{ removeEventListener('pointermove',move); removeEventListener('pointerup',up); ov.classList.remove('moving'); docSaveSoon(); };
  addEventListener('pointermove',move); addEventListener('pointerup',up);
});

/* ---------- Barra de formatação do documento ---------- */
const docBar=$('#docBar');
function docEditableActive(){ const a=document.activeElement; return a && a.isContentEditable && a.closest('#docPages') ? a : null; }
document.addEventListener('selectionchange',()=>{
  if(appMode!=='doc') return;
  const a=docEditableActive();
  if(a){ const s=getSelection(); if(s.rangeCount) docSavedRange={el:a, range:s.getRangeAt(0).cloneRange()}; updateDocFmt(); }
});
function restoreDocRange(){
  if(docEditableActive()) return true;
  if(docSavedRange && docSavedRange.el.isConnected){
    docSavedRange.el.focus({preventScroll:true});
    const s=getSelection(); s.removeAllRanges(); s.addRange(docSavedRange.range); return true;
  }
  const b=docPagesEl.querySelector('.page-body'); if(b){ b.focus(); placeCaretEnd(b); return true; }
  return false;
}
docBar.addEventListener('mousedown',e=>{ if(e.target.closest('button')) e.preventDefault(); });
docBar.addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b || !D) return;
  if(b.id==='docTool'){ setTool(!$('#docView').classList.contains('tool-text')); return; }
  if(b.id==='docAddPage'){ addBlankPageAfterCurrent(); return; }
  if(b.id==='docAddPdf'){ pickPdf('append'); return; }
  if(b.id==='docExport'){ exportPdf(); return; }
  if(b.id==='docZoomIn'){ setDocZoom(docZoom*1.15); return; }
  if(b.id==='docZoomOut'){ setDocZoom(docZoom/1.15); return; }
  if(b.id==='docZoomPct'){ setDocZoom(1); return; }
  const cmd=b.dataset.dcmd; if(!cmd) return;
  if(!restoreDocRange()) return;
  if(cmd==='link') insertLinkPrompt();
  else if(cmd==='hilite'){ const on=b.classList.contains('on'); document.execCommand('hiliteColor',false,on?'transparent':'#fde68a'); }
  else { document.execCommand(cmd,false,null); if(cmd==='removeFormat'){ document.execCommand('unlink',false,null); document.execCommand('formatBlock',false,'p'); } }
  updateDocFmt();
});
$('#docBlock').addEventListener('change',e=>{ if(restoreDocRange()) document.execCommand('formatBlock',false,e.target.value); docSaveSoon(); });
$('#docSize').addEventListener('change',e=>{ if(restoreDocRange()) document.execCommand('fontSize',false,e.target.value); docSaveSoon(); });
$('#docColor').addEventListener('input',e=>{ if(restoreDocRange()) document.execCommand('foreColor',false,e.target.value); docSaveSoon(); });
function updateDocFmt(){
  docBar.querySelectorAll('button[data-dcmd]').forEach(b=>{
    const c=b.dataset.dcmd; let on=false;
    try{
      if(c==='hilite') on=selectionHasHighlight();
      else if(!['link','removeFormat'].includes(c)) on=document.queryCommandState(c);
    }catch(err){}
    b.classList.toggle('on',on);
  });
  try{
    const blk=(document.queryCommandValue('formatBlock')||'p').toLowerCase().replace(/[<>]/g,'');
    $('#docBlock').value=['h1','h2','h3','blockquote'].includes(blk)?blk:'p';
    const sz=document.queryCommandValue('fontSize'); $('#docSize').value=['2','3','4','5','6'].includes(String(sz))?String(sz):'3';
  }catch(err){}
}
function selectionHasHighlight(){
  const s=getSelection(); if(!s.rangeCount) return false;
  let n=s.anchorNode; if(n && n.nodeType===3) n=n.parentNode;
  while(n && n.nodeType===1 && !n.matches('.page-body,.ov-body')){
    const bg=n.style && n.style.backgroundColor;
    if(bg && !/transparent|rgba\(0, 0, 0, 0\)/.test(bg)) return true;
    n=n.parentNode;
  }
  return false;
}
function setTool(on){ $('#docView').classList.toggle('tool-text',on); $('#docTool').classList.toggle('on',on); if(on) toast('Clique em uma página de PDF para escrever.'); }
function addBlankPageAfterCurrent(){
  const a=docEditableActive() || (docSavedRange && docSavedRange.el.isConnected ? docSavedRange.el : null);
  const cur=a ? a.closest('.page') : docPagesEl.lastElementChild;
  const n=buildPage(newTextPage(''));
  if(cur) cur.after(n); else docPagesEl.appendChild(n);
  renumber(); docSaveSoon();
  const b=n.querySelector('.page-body'); b.focus({preventScroll:true}); placeCaretEnd(b);
  n.scrollIntoView({behavior:'smooth',block:'start'});
}
function setDocZoom(z){
  docZoom=clamp(z,0.4,2.5);
  docPagesEl.style.setProperty('--dz',docZoom);
  $('#docZoomPct').textContent=Math.round(docZoom*100)+'%';
  docPagesEl.querySelectorAll('.page.pdf').forEach(el=>{ const r=el.getBoundingClientRect(), v=docScroll.getBoundingClientRect(); if(r.bottom>v.top-800 && r.top<v.bottom+800) renderPdfPage(el); });
}

/* ---------- Exportar como PDF (impressão do navegador) ---------- */
async function exportPdf(){
  await docFlush();
  setStatus('Preparando…');
  const pdfPages=[...docPagesEl.querySelectorAll('.page.pdf')];
  await Promise.all(pdfPages.map(el=>renderPdfPage(el)));
  setStatus('Pronto ✓');
  const old=document.title; document.title=docTitleEl.value.trim()||'Documento';
  window.print();
  document.title=old;
}

/* ---------- Abrir link de página vindo do mapa ---------- */
async function openDocLink(docId,pageId){
  const it=ws.items.find(i=>i.id===docId && i.type==='doc');
  if(!it){ toast('Esse documento foi excluído.'); return; }
  if(appMode!=='doc') await switchMode('doc',{noAutoOpen:true});
  await docOpen(docId);
  const el=docPagesEl.querySelector('[data-pid="'+CSS.escape(pageId)+'"]');
  if(!el){ toast('Essa página não existe mais no documento.'); return; }
  el.scrollIntoView({block:'start'});
  docScroll.scrollTop-=16;
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}
$('#docNewBtn').addEventListener('click',()=>newDocument());
$('#docOpenPdfBtn').addEventListener('click',()=>pickPdf('new'));
async function newDocument(){ const id=await docCreate('Documento sem título'); if(appMode!=='doc') await switchMode('doc',{noAutoOpen:true}); await docOpen(id); docTitleEl.focus(); docTitleEl.select(); }
