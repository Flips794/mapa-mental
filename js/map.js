/* =========================================================
   Editor de mapa mental
   ========================================================= */
"use strict";

const COLORS = {
  blue:'#3b82f6', red:'#ef4444', green:'#22c55e', purple:'#a855f7', orange:'#f97316',
  teal:'#14b8a6', pink:'#ec4899', amber:'#eab308', indigo:'#6366f1', sky:'#0ea5e9', slate:'#64748b'
};
const BRANCH_ORDER = ['blue','red','green','purple','orange','teal','pink','amber','indigo','sky'];
const ROOT_INK = 'var(--ink)';

const KEYS = [
  ['Tab','Novo sub-tópico'], ['Enter','Novo tópico irmão'], ['Digitar','Edita o texto no painel'],
  ['F2 / duplo clique','Editar direto no mapa'], ['Setas','Navegar entre tópicos'], ['Espaço','Recolher / expandir'],
  ['Delete','Excluir tópico'], ['Ctrl+Z / Ctrl+Shift+Z','Desfazer / refazer'], ['Ctrl+B / I / U','Negrito / itálico / sublinhado'],
  ['Arrastar tópico','Mover para outro lugar'], ['Arrastar fundo / roda','Mover o mapa'], ['Ctrl + roda','Zoom'], ['Ctrl+0','Ajustar à tela'],
];
function keysHtml(){ return KEYS.map(k=>'<span>'+k[0].split(' / ').map(x=>'<kbd>'+x+'</kbd>').join(' ')+'</span><span>'+k[1]+'</span>').join(''); }
['#keysEmpty','#keysPanel','#keysPop'].forEach(s=>{ $(s).innerHTML=keysHtml(); });

/* ================= Estado ================= */
let M=null, curMapId=null;            // mapa aberto: {version, root, files}
let selectedId=null, editingId=null, editSession=null;
const els=new Map();
let pos=new Map();
const view={x:0,y:0,z:1};
let matchSet=new Set();
let mapNeedsFit=false;

const canvas=$('#canvas'), world=$('#world'), svg=$('#links');

function mk(html,color){ return {id:genId(),html:html||'',note:'',color:color||'slate',collapsed:false,attachments:[],links:[],children:[]}; }
function mapTitle(m){ return plainText((m||M).root.html).trim() || 'Sem título'; }

function defaultMap(){
  const root=mk('Meu Mapa Mental');
  root.note='<p><b>Bem-vindo!</b> Este texto é o próprio mapa: edite aqui e o desenho se atualiza.</p><ul><li>Cada linha com - é um tópico; 2 espaços de recuo = um nível abaixo</li><li>Linhas com &gt; são anotações</li><li>Use o botão IA para criar mapas com Claude ou ChatGPT</li></ul>';
  const a=mk('Projeto Ômega','purple'); a.side='R';
  const t=mk('Tarefas','purple'); t.children=[mk('Definir escopo','purple'), mk('Montar cronograma','purple')];
  a.children=[mk('Objetivos','purple'), t];
  const b=mk('Ideias','green'); b.side='L';
  b.children=[mk('Texto em <b>negrito</b> e <i>itálico</i>','green'), mk('Arraste-me para outro ramo','green')];
  const c=mk('Referências','orange'); c.side='R';
  const d=mk('Pessoas','blue'); d.side='L';
  root.children=[a,b,c,d];
  return {version:2, root, files:{}};
}
function blankMap(title){ const r=mk(esc(title||'Novo mapa')); return {version:2, root:r, files:{}}; }

/* Converte qualquer versão (inclusive a antiga, só texto) para o formato atual */
function normalizeMap(d){
  const v1 = !(d.version>=2);
  const files={};
  if(d.files && typeof d.files==='object'){
    Object.keys(d.files).forEach(k=>{ const f=d.files[k]; if(f && typeof f.dataUrl==='string' && /^data:/i.test(f.dataUrl)) files[k]={kind:f.kind==='image'?'image':'file',name:String(f.name||'arquivo'),size:+f.size||0,mime:String(f.mime||''),dataUrl:f.dataUrl}; });
  }
  const ids=new Set();
  function fix(n){
    if(typeof n.id!=='string' || !n.id || ids.has(n.id)) n.id=genId();
    ids.add(n.id);
    if(v1){ n.html=textToHtml(n.text||''); n.note=textToHtml(n.note||''); }
    delete n.text;
    n.html=sanitize(typeof n.html==='string'?n.html:'');
    n.note=sanitize(typeof n.note==='string'?n.note:'');
    n.color=COLORS[n.color]?n.color:'slate';
    n.collapsed=!!n.collapsed;
    n.attachments=(Array.isArray(n.attachments)?n.attachments:[]).map(a=>{
      if(typeof a==='string') return files[a]?a:null;
      if(a && typeof a==='object' && typeof a.dataUrl==='string' && /^data:/i.test(a.dataUrl)){
        const id=genId(); files[id]={kind:a.kind==='image'?'image':'file',name:String(a.name||'arquivo'),size:+a.size||0,mime:String(a.mime||''),dataUrl:a.dataUrl}; return id;
      }
      return null;
    }).filter(Boolean);
    n.links=(Array.isArray(n.links)?n.links:[]).filter(l=>l && typeof l.doc==='string' && typeof l.page==='string').map(l=>({doc:l.doc,page:l.page}));
    n.children=(Array.isArray(n.children)?n.children:[]).filter(c=>c && typeof c==='object');
    n.children.forEach(fix);
  }
  fix(d.root);
  d.root.collapsed=false;
  d.root.children.forEach((c,i)=>{ if(c.side!=='L' && c.side!=='R') c.side = i%2 ? 'L' : 'R'; });
  return {version:2, root:d.root, files};
}

/* ================= Abrir / trocar de mapa ================= */
async function mapOpen(id){
  await mapFlush();
  let data=await Store.get('map:'+id);
  data = data && data.root ? normalizeMap(data) : defaultMap();
  M=data; curMapId=id; ws.current.map=id;
  past.length=0; future.length=0; editingId=null; editSession=null;
  matches=[]; matchSet=new Set(); $('#search').value=''; $('#searchCnt').textContent='';
  for(const e of els.values()) e.remove(); els.clear(); fastIndex=null;
  selectedId=M.root.id;
  if(appMode==='map'){ render(); fit(false); outlineRefresh(true); } else mapNeedsFit=true;
}
async function mapFlush(){ if(M && saveTimer){ clearTimeout(saveTimer); saveTimer=null; await saveNow(); } }
function mapShown(){ render(); if(mapNeedsFit){ fit(false); mapNeedsFit=false; } outlineRefresh(true); }

/* ================= Árvore ================= */
function findNode(id, node, parent, level){
  node=node||M.root; parent=parent||null; level=level||0;
  if(node.id===id) return {node,parent,level};
  for(const c of node.children){ const r=findNode(id,c,node,level+1); if(r) return r; }
  return null;
}
function countAll(n){ let k=1; n.children.forEach(c=>k+=countAll(c)); return k; }
function subtreeIds(n,set){ set=set||new Set(); set.add(n.id); n.children.forEach(c=>subtreeIds(c,set)); return set; }
function colorize(n,color){ n.color=color; n.children.forEach(c=>colorize(c,color)); }
let fastIndex=null;
function findNodeFast(id){
  if(!fastIndex || !fastIndex.has(id)){ fastIndex=new Map(); (function w(n){ fastIndex.set(n.id,n); n.children.forEach(w); })(M.root); }
  return fastIndex.get(id);
}

/* ================= Links para documentos ================= */
function resolveLink(l){
  const it=ws.items.find(i=>i.id===l.doc && i.type==='doc');
  if(!it) return {ok:false, docTitle:'Documento excluído', pageNo:null};
  const idx=(it.pages||[]).findIndex(p=>p.id===l.page);
  return {ok:idx>=0, docTitle:it.title, pageNo:idx>=0?idx+1:null, label: idx>=0 ? it.pages[idx].label : ''};
}
function linkChipHtml(l){
  const r=resolveLink(l);
  const title = r.ok ? (r.docTitle+' — página '+r.pageNo) : (r.docTitle+' — página não encontrada');
  return '<span class="bd link'+(r.ok?'':' broken')+'" data-doc="'+esc(l.doc)+'" data-page="'+esc(l.page)+'" title="'+esc(title)+'">📄'+(r.ok?' p.'+r.pageNo:' ?')+'</span>';
}

/* ================= Renderização ================= */
function render(){
  if(appMode!=='map' || !M) return;
  const seen=new Set();
  (function walk(n,level,dir){
    seen.add(n.id);
    let e=els.get(n.id);
    if(!e){
      e=document.createElement('div'); e.dataset.id=n.id;
      const c=document.createElement('div'); c.className='content'; e.appendChild(c);
      const b=document.createElement('span'); b.className='badges'; e.appendChild(b);
      world.appendChild(e); els.set(n.id,e);
      e._fresh=true;
    }
    updateEl(e,n,level,dir);
    if(!n.collapsed) n.children.forEach(c=>walk(c,level+1, level===0 ? (c.side==='L'?-1:1) : dir));
  })(M.root,0,1);
  for(const [id,e] of els){ if(!seen.has(id)){ e.remove(); els.delete(id); } }
  layout();
  updatePanel();
  updateHistoryBtns();
}

function updateEl(e,n,level,dir){
  const cls=['node', level===0?'lv0':level===1?'lv1':'lvn', dir<0?'dirL':'dirR'];
  if(n.id===selectedId) cls.push('sel');
  if(n.id===editingId) cls.push('editing');
  if(matchSet.has(n.id)) cls.push('match');
  if(isEmptyHtml(n.html)) cls.push('empty');
  if(e._fresh){ cls.push('fresh'); e._fresh=false; setTimeout(()=>e.classList.remove('fresh'),220); }
  e.className=cls.join(' ');
  e._level=level; e._dir=dir;
  e.style.setProperty('--c', level===0 ? ROOT_INK : COLORS[n.color]);

  const content=e.firstChild;
  if(n.id!==editingId && content._h!==n.html){
    content.innerHTML=n.html; content._h=n.html;
    content.querySelectorAll('a[href]').forEach(a=>{ a.target='_blank'; a.rel='noopener noreferrer'; });
  }

  const imgs=n.attachments.filter(a=>M.files[a] && M.files[a].kind==='image').length;
  const fls=n.attachments.filter(a=>M.files[a] && M.files[a].kind!=='image').length;
  let bh='';
  n.links.forEach(l=>{ bh+=linkChipHtml(l); });
  if(!isEmptyHtml(n.note)) bh+='<span class="bd" title="Tem anotação">📝</span>';
  if(imgs) bh+='<span class="bd" title="Imagens">🖼'+(imgs>1?imgs:'')+'</span>';
  if(fls) bh+='<span class="bd" title="Arquivos">📎'+(fls>1?fls:'')+'</span>';
  const badges=e.children[1];
  if(badges._h!==bh){ badges.innerHTML=bh; badges._h=bh; badges.style.display=bh?'':'none'; }

  e.querySelectorAll('.h').forEach(h=>h.remove());
  const side=(btn,d,offset)=>{ if(d>0) btn.style.left='calc(100% + '+offset+'px)'; else btn.style.right='calc(100% + '+offset+'px)'; e.appendChild(btn); };
  if(level===0){
    const r=hBtn('add','+','Novo tópico à direita'); r.dataset.side='R'; side(r,1,7);
    const l=hBtn('add','+','Novo tópico à esquerda'); l.dataset.side='L'; side(l,-1,7);
  } else {
    let off=6;
    if(n.children.length){
      const hidden=String(countAll(n)-1);
      const f = n.collapsed ? hBtn('fold count', hidden, 'Expandir') : hBtn('fold','−','Recolher');
      side(f,dir,off); off += n.collapsed ? 12+hidden.length*6+6 : 24;
    }
    if(!n.children.length) side(hBtn('add','+','Novo sub-tópico (Tab)'),dir,off);
  }
}
function hBtn(cls,txt,title){ const b=document.createElement('button'); b.className='h '+cls; b.textContent=txt; b.title=title; b.tabIndex=-1; return b; }

/* ================= Layout automático ================= */
const VGAP1=14, VGAPN=6;
function hgap(level){ return level===0?56:level===1?36:28; }
let layoutRAF=null;
function scheduleLayout(){ if(layoutRAF) return; layoutRAF=requestAnimationFrame(()=>{ layoutRAF=null; if(appMode==='map') layout(); }); }

function layout(){
  const size=new Map();
  for(const [id,e] of els) size.set(id,{w:e.offsetWidth,h:e.offsetHeight});
  const subH=new Map();
  const blockH=(kids,level)=>{ if(!kids.length) return 0; let t=0; kids.forEach(c=>t+=sh(c,level)); return t+(level===1?VGAP1:VGAPN)*(kids.length-1); };
  function sh(n,level){
    if(subH.has(n.id)) return subH.get(n.id);
    let v=size.get(n.id).h;
    if(!n.collapsed && n.children.length) v=Math.max(v, blockH(n.children,level+1));
    subH.set(n.id,v); return v;
  }
  function place(n,level,x,cy,dir,parentId){
    const s=size.get(n.id);
    pos.set(n.id,{x:dir>0?x:x-s.w, y:cy-s.h/2, w:s.w, h:s.h, level, dir, parent:parentId});
    if(!n.collapsed && n.children.length) placeKids(n,n.children,level,dir);
  }
  function placeKids(n,kids,level,dir){
    if(!kids.length) return;
    const p=pos.get(n.id), gap=level+1===1?VGAP1:VGAPN;
    let y=p.y+p.h/2-blockH(kids,level+1)/2;
    const x=dir>0 ? p.x+p.w+hgap(level) : p.x-hgap(level);
    kids.forEach(c=>{ const hh=sh(c,level+1); place(c,level+1,x,y+hh/2,dir,n.id); y+=hh+gap; });
  }
  pos=new Map();
  const r=M.root, rs=size.get(r.id);
  pos.set(r.id,{x:-rs.w/2,y:-rs.h/2,w:rs.w,h:rs.h,level:0,dir:1,parent:null});
  placeKids(r, r.children.filter(c=>c.side!=='L'), 0, 1);
  placeKids(r, r.children.filter(c=>c.side==='L'), 0, -1);

  for(const [id,p] of pos){ const e=els.get(id); if(e){ e.style.left=p.x+'px'; e.style.top=p.y+'px'; } }
  drawLinks();
}

function drawLinks(){
  let out='';
  for(const [id,p] of pos){
    if(!p.parent) continue;
    const pp=pos.get(p.parent); if(!pp) continue;
    const f=findNodeFast(id), d=p.dir;
    const ax = d>0 ? pp.x+pp.w : pp.x;
    const ay = pp.level>=2 ? pp.y+pp.h-1 : pp.y+pp.h/2;
    const bx = d>0 ? p.x : p.x+p.w;
    const by = p.level>=2 ? p.y+p.h-1 : p.y+p.h/2;
    const mx=(ax+bx)/2;
    out+='<path d="M'+ax+','+ay+' C'+mx+','+ay+' '+mx+','+by+' '+bx+','+by+'" stroke="'+(f?COLORS[f.color]:'#94a3b8')+'" stroke-width="'+(p.level===1?2.5:2)+'" fill="none" stroke-linecap="round"/>';
  }
  svg.innerHTML=out;
}

/* ================= Câmera ================= */
function applyView(){
  world.style.transform='translate('+view.x+'px,'+view.y+'px) scale('+view.z+')';
  canvas.style.backgroundPosition=view.x+'px '+view.y+'px';
  canvas.style.backgroundSize=(20*view.z)+'px '+(20*view.z)+'px';
  $('#zoomPct').textContent=Math.round(view.z*100)+'%';
}
function toWorld(cx,cy){ const r=canvas.getBoundingClientRect(); return {x:(cx-r.left-view.x)/view.z, y:(cy-r.top-view.y)/view.z}; }
function zoomAt(factor,cx,cy){
  const r=canvas.getBoundingClientRect();
  const px=(cx==null?r.width/2:cx-r.left), py=(cy==null?r.height/2:cy-r.top);
  const nz=clamp(view.z*factor,0.2,3);
  const wx=(px-view.x)/view.z, wy=(py-view.y)/view.z;
  view.z=nz; view.x=px-wx*nz; view.y=py-wy*nz; applyView();
}
let anim=null;
function animateView(tx,ty,tz){
  cancelAnimationFrame(anim);
  const sx=view.x, sy=view.y, sz=view.z, t0=performance.now(), dur=260;
  tz=tz==null?sz:tz;
  (function step(t){
    const k=Math.min(1,(t-t0)/dur), e=1-Math.pow(1-k,3);
    view.x=sx+(tx-sx)*e; view.y=sy+(ty-sy)*e; view.z=sz+(tz-sz)*e; applyView();
    if(k<1) anim=requestAnimationFrame(step);
  })(t0);
}
function bbox(){
  let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;
  for(const p of pos.values()){ x1=Math.min(x1,p.x); y1=Math.min(y1,p.y); x2=Math.max(x2,p.x+p.w); y2=Math.max(y2,p.y+p.h); }
  return {x1,y1,x2,y2};
}
function fit(animated){
  const b=bbox(), r=canvas.getBoundingClientRect();
  if(!isFinite(b.x1) || !r.width) return;
  const z=clamp(Math.min((r.width-120)/(b.x2-b.x1),(r.height-120)/(b.y2-b.y1)),0.25,1);
  const tx=r.width/2-(b.x1+b.x2)/2*z, ty=r.height/2-(b.y1+b.y2)/2*z;
  if(animated) animateView(tx,ty,z); else { view.x=tx; view.y=ty; view.z=z; applyView(); }
}
function centerOn(id){
  const p=pos.get(id); if(!p) return; const r=canvas.getBoundingClientRect();
  animateView(r.width/2-(p.x+p.w/2)*view.z, r.height/2-(p.y+p.h/2)*view.z);
}
function ensureVisible(id){
  const p=pos.get(id); if(!p) return; const r=canvas.getBoundingClientRect(), m=50;
  const sx1=p.x*view.z+view.x, sy1=p.y*view.z+view.y, sx2=sx1+p.w*view.z, sy2=sy1+p.h*view.z;
  let dx=0, dy=0;
  if(sx1<m) dx=m-sx1; else if(sx2>r.width-m) dx=(r.width-m)-sx2;
  if(sy1<m) dy=m-sy1; else if(sy2>r.height-m) dy=(r.height-m)-sy2;
  if(dx||dy) animateView(view.x+dx, view.y+dy);
}

canvas.addEventListener('wheel',e=>{
  e.preventDefault();
  const k=e.deltaMode===1?16:1;
  if(e.ctrlKey||e.metaKey){ zoomAt(Math.exp(-e.deltaY*k*0.0022), e.clientX, e.clientY); }
  else {
    let dx=e.deltaX*k, dy=e.deltaY*k;
    if(e.shiftKey && !dx){ dx=dy; dy=0; }
    view.x-=dx; view.y-=dy; applyView();
  }
},{passive:false});
$('#zoomIn').addEventListener('click',()=>zoomAt(1.2));
$('#zoomOut').addEventListener('click',()=>zoomAt(1/1.2));
$('#zoomPct').addEventListener('click',()=>zoomAt(1/view.z));
$('#fitBtn').addEventListener('click',()=>fit(true));
$('#keysBtn').addEventListener('click',()=>$('#keysPop').classList.toggle('hidden'));

/* ================= Ponteiro ================= */
let ptr=null, drag=null, lastClick={id:null,t:0};

canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0 && e.button!==1) return;
  if(e.target.closest('.h,.zoombar,.keys-pop')) return;
  const nEl=e.target.closest('.node');
  if(nEl && nEl.classList.contains('editing')) return;
  $('#keysPop').classList.add('hidden');
  cancelAnimationFrame(anim);
  ptr={mode:'pending', id:nEl?nEl.dataset.id:null, target:e.target, sx:e.clientX, sy:e.clientY, vx:view.x, vy:view.y, middle:e.button===1};
  if(document.activeElement && document.activeElement!==document.body) document.activeElement.blur();
  canvas.setPointerCapture(e.pointerId);
  e.preventDefault();
});
canvas.addEventListener('pointermove',e=>{
  if(!ptr) return;
  const dx=e.clientX-ptr.sx, dy=e.clientY-ptr.sy;
  if(ptr.mode==='pending'){
    if(Math.hypot(dx,dy)<4) return;
    if(ptr.id && ptr.id!==M.root.id && !ptr.middle) startDrag(e); else { ptr.mode='pan'; canvas.classList.add('panning'); }
  }
  if(ptr.mode==='pan'){ view.x=ptr.vx+dx; view.y=ptr.vy+dy; applyView(); }
  else if(ptr.mode==='drag') moveDrag(e);
});
canvas.addEventListener('pointerup',e=>{
  if(!ptr) return;
  const p=ptr; ptr=null; canvas.classList.remove('panning');
  if(p.mode==='drag'){ endDrag(true); return; }
  if(p.mode!=='pending') return;
  if(!p.id){ selectNode(null); return; }
  const chip=p.target.closest && p.target.closest('.bd.link');
  if(chip){ openDocLink(chip.dataset.doc, chip.dataset.page); return; }
  const a=p.target.closest && p.target.closest('a[href]');
  if(a){ window.open(a.href,'_blank','noopener'); }
  const now=Date.now();
  if(lastClick.id===p.id && now-lastClick.t<400){ lastClick={id:null,t:0}; selectNode(p.id); startInlineEdit(p.id); }
  else { lastClick={id:p.id,t:now}; selectNode(p.id); }
});
canvas.addEventListener('pointercancel',()=>{ if(ptr && ptr.mode==='drag') endDrag(false); ptr=null; canvas.classList.remove('panning'); });

world.addEventListener('click',e=>{
  const h=e.target.closest('.h'); if(!h) return;
  const id=h.closest('.node').dataset.id;
  if(h.classList.contains('add')) addChild(id, h.dataset.side);
  else if(h.classList.contains('fold')) toggleCollapse(id);
});

function startDrag(e){
  ptr.mode='drag';
  const id=ptr.id, f=findNode(id);
  selectNode(id);
  const sub=subtreeIds(f.node);
  sub.forEach(i=>{ const el=els.get(i); if(el) el.classList.add('drag-src'); });
  const ghost=els.get(id).cloneNode(true);
  ghost.classList.remove('drag-src','sel','match','fresh'); ghost.classList.add('ghost');
  ghost.querySelectorAll('.h').forEach(h=>h.remove());
  world.appendChild(ghost);
  const line=document.createElement('div'); line.className='drop-line hidden'; world.appendChild(line);
  const wp=toWorld(e.clientX,e.clientY), pp=pos.get(id);
  drag={id, sub, ghost, line, offX:wp.x-pp.x, offY:wp.y-pp.y, target:null};
}
function moveDrag(e){
  const wp=toWorld(e.clientX,e.clientY);
  drag.ghost.style.left=(wp.x-drag.offX)+'px'; drag.ghost.style.top=(wp.y-drag.offY)+'px';
  let best=null, bd=70;
  for(const [id,p] of pos){
    if(drag.sub.has(id)) continue;
    const ddx=Math.max(p.x-wp.x,0,wp.x-(p.x+p.w)), ddy=Math.max(p.y-wp.y,0,wp.y-(p.y+p.h));
    const d=Math.hypot(ddx,ddy);
    if(d<bd){ bd=d; best={id,p,inside:d===0}; }
  }
  let t=null;
  if(best){
    const {id,p}=best;
    if(id===M.root.id) t={mode:'child', id, side: wp.x<p.x+p.w/2 ? 'L' : 'R'};
    else {
      const outer = p.dir>0 ? wp.x>p.x+p.w*0.6 : wp.x<p.x+p.w*0.4;
      const ry=(wp.y-p.y)/p.h;
      if(best.inside){ t = ry<0.3 ? {mode:'before',id} : ry>0.7 ? {mode:'after',id} : {mode:'child',id}; }
      else if(outer && ry>=-0.2 && ry<=1.2) t={mode:'child',id};
      else t={mode: wp.y<p.y+p.h/2 ? 'before':'after', id};
    }
  }
  setDropIndicator(t);
}
function setDropIndicator(t){
  if(drag.target && drag.target.mode==='child'){ const el=els.get(drag.target.id); if(el) el.classList.remove('drop-child'); }
  drag.target=t;
  drag.line.classList.add('hidden');
  if(!t) return;
  if(t.mode==='child'){ const el=els.get(t.id); if(el) el.classList.add('drop-child'); }
  else {
    const p=pos.get(t.id), g=(p.level===1?VGAP1:VGAPN)/2+1;
    drag.line.style.left=p.x+'px'; drag.line.style.width=p.w+'px';
    drag.line.style.top=(t.mode==='before' ? p.y-g : p.y+p.h+g)+'px';
    drag.line.classList.remove('hidden');
  }
}
function endDrag(commit){
  const d=drag; drag=null;
  d.ghost.remove(); d.line.remove();
  for(const el of els.values()) el.classList.remove('drag-src','drop-child');
  if(commit && d.target) moveNode(d.id, d.target, d.sub);
}
function moveNode(id,t,sub){
  const src=findNode(id); if(!src || !src.parent) return;
  if(sub.has(t.id)) return;
  pushHistory();
  const oldParent=src.parent;
  oldParent.children.splice(oldParent.children.indexOf(src.node),1);
  let newParent;
  if(t.mode==='child'){
    newParent=findNode(t.id).node;
    newParent.children.push(src.node); newParent.collapsed=false;
    if(newParent===M.root) src.node.side=t.side;
  } else {
    const tf=findNode(t.id); newParent=tf.parent;
    const i=newParent.children.indexOf(tf.node);
    newParent.children.splice(t.mode==='before'?i:i+1, 0, src.node);
    if(newParent===M.root) src.node.side=tf.node.side;
  }
  if(newParent!==M.root){ delete src.node.side; if(newParent!==oldParent) colorize(src.node,newParent.color); }
  else if(oldParent!==M.root && src.node.color==='slate') colorize(src.node,nextBranchColor());
  fastIndex=null;
  render(); saveSoon();
}

/* ================= Seleção ================= */
function selectNode(id){
  if(editingId && editingId!==id) endInlineEdit();
  selectedId=id;
  for(const [k,e] of els) e.classList.toggle('sel',k===id);
  updatePanel();
  outlineOnSelect(id);
}

/* ================= Edição direto no mapa ================= */
function startInlineEdit(id){
  const e=els.get(id); if(!e) return;
  if(editingId && editingId!==id) endInlineEdit();
  editingId=id; editSession=null;
  e.classList.add('editing');
  const c=e.firstChild; c.contentEditable='true'; c.spellcheck=true;
  c.focus({preventScroll:true}); placeCaretEnd(c);
  scheduleLayout();
}
function endInlineEdit(){
  const id=editingId; if(!id) return;
  editingId=null; editSession=null;
  const e=els.get(id);
  if(e){ e.classList.remove('editing'); const c=e.firstChild; c.contentEditable='false'; c._h=null; if(document.activeElement===c) c.blur(); }
  render(); saveSoon();
}
world.addEventListener('input',e=>{
  if(!e.target.classList || !e.target.classList.contains('content')) return;
  const id=e.target.parentNode.dataset.id, n=findNodeFast(id); if(!n) return;
  beginEditSession(id);
  n.html=sanitize(e.target.innerHTML);
  e.target.parentNode.classList.toggle('empty',isEmptyHtml(n.html));
  if(id===selectedId) syncRte(rteText,n.html);
  scheduleLayout(); saveSoon();
});
world.addEventListener('keydown',e=>{
  if(!e.target.classList || !e.target.classList.contains('content')) return;
  e.stopPropagation();
  const id=e.target.parentNode.dataset.id;
  if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); endInlineEdit(); addSibling(id); }
  else if(e.key==='Tab'){ e.preventDefault(); endInlineEdit(); addChild(id); }
  else if(e.key==='Escape'){ e.preventDefault(); endInlineEdit(); }
  else if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); insertLinkPrompt(); }
});
world.addEventListener('focusout',e=>{
  if(e.target.classList && e.target.classList.contains('content') && editingId) endInlineEdit();
});

/* ================= Operações ================= */
function nextBranchColor(){
  const used={}; M.root.children.forEach(c=>used[c.color]=(used[c.color]||0)+1);
  let best=BRANCH_ORDER[0], bc=Infinity;
  BRANCH_ORDER.forEach(k=>{ const u=used[k]||0; if(u<bc){ bc=u; best=k; } });
  return best;
}
function balancedSide(){ let l=0,r=0; M.root.children.forEach(c=>c.side==='L'?l++:r++); return l<r?'L':'R'; }

function addChild(id, side){
  const f=findNode(id); if(!f) return;
  pushHistory();
  const isRoot=f.node===M.root;
  const c=mk('', isRoot ? nextBranchColor() : f.node.color);
  if(isRoot) c.side = side || balancedSide();
  f.node.collapsed=false;
  f.node.children.push(c);
  selectedId=c.id; fastIndex=null;
  render(); ensureVisible(c.id); startInlineEdit(c.id); saveSoon();
}
function addSibling(id){
  const f=findNode(id); if(!f) return;
  if(!f.parent){ addChild(id); return; }
  pushHistory();
  const c=mk('', f.node.color);
  if(f.parent===M.root){ c.side=f.node.side; c.color=nextBranchColor(); }
  f.parent.children.splice(f.parent.children.indexOf(f.node)+1,0,c);
  selectedId=c.id; fastIndex=null;
  render(); ensureVisible(c.id); startInlineEdit(c.id); saveSoon();
}
function deleteNode(id){
  const f=findNode(id); if(!f) return;
  if(!f.parent){ toast('O tópico central não pode ser excluído.'); return; }
  pushHistory();
  const sibs=f.parent.children, i=sibs.indexOf(f.node);
  sibs.splice(i,1);
  const next = sibs[i] || sibs[i-1] || f.parent;
  selectedId=next.id; fastIndex=null;
  render(); saveSoon();
  toast('Tópico excluído · Ctrl+Z desfaz');
}
function toggleCollapse(id){
  const f=findNode(id); if(!f || !f.node.children.length || !f.parent) return;
  pushHistory();
  f.node.collapsed=!f.node.collapsed;
  render(); saveSoon();
}

/* ================= Navegação pelo teclado ================= */
function navigate(key){
  const f=findNode(selectedId); if(!f) return;
  const n=f.node, p=pos.get(n.id); if(!p) return;
  const cy=p.y+p.h/2;
  const go=id=>{ selectNode(id); ensureVisible(id); };
  const pickNearest=list=>{ let b=null,bd=Infinity; list.forEach(c=>{ const q=pos.get(c.id); if(!q) return; const d=Math.abs(q.y+q.h/2-cy); if(d<bd){bd=d;b=c;} }); return b; };
  const toChild=wantLeft=>{
    let kids=n.children;
    if(n===M.root) kids=kids.filter(c=>(c.side==='L')===wantLeft);
    if(!kids.length) return;
    if(n.collapsed){ n.collapsed=false; render(); saveSoon(); }
    const c=pickNearest(kids); if(c) go(c.id);
  };
  if(key==='ArrowLeft' || key==='ArrowRight'){
    const left=key==='ArrowLeft';
    if(n===M.root) toChild(left);
    else if((p.dir<0)===left) toChild(left);
    else go(f.parent.id);
    return;
  }
  const up=key==='ArrowUp';
  if(f.parent){
    const sibs = f.parent===M.root ? f.parent.children.filter(c=>c.side===n.side) : f.parent.children;
    const i=sibs.indexOf(n), j=up?i-1:i+1;
    if(sibs[j]){ go(sibs[j].id); return; }
  }
  let best=null, bd=Infinity;
  for(const [id,q] of pos){
    if(id===n.id) continue;
    const qy=q.y+q.h/2, dy=up?cy-qy:qy-cy;
    if(dy<=2) continue;
    const score=dy+Math.abs((q.x+q.w/2)-(p.x+p.w/2))*0.6;
    if(score<bd){ bd=score; best=id; }
  }
  if(best) go(best);
}

/* ================= Teclado (só no modo mapa) ================= */
document.addEventListener('keydown',e=>{
  if(appMode!=='map' || !M) return;
  const t=e.target;
  const inEditable = t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
  const mod=e.ctrlKey||e.metaKey, k=e.key.toLowerCase();
  if(mod && k==='f'){ e.preventDefault(); $('#search').focus(); $('#search').select(); return; }
  if(inEditable) return;
  if(mod){
    if(k==='z' && !e.shiftKey){ e.preventDefault(); undo(); }
    else if((k==='z' && e.shiftKey) || k==='y'){ e.preventDefault(); redo(); }
    else if(k==='=' || k==='+'){ e.preventDefault(); zoomAt(1.2); }
    else if(k==='-'){ e.preventDefault(); zoomAt(1/1.2); }
    else if(k==='0'){ e.preventDefault(); fit(true); }
    return;
  }
  if(e.altKey) return;
  if(!selectedId){
    if(['Enter','Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){ e.preventDefault(); selectNode(M.root.id); }
    return;
  }
  switch(e.key){
    case 'Tab': e.preventDefault(); addChild(selectedId); break;
    case 'Enter': e.preventDefault(); addSibling(selectedId); break;
    case 'Delete': case 'Backspace': e.preventDefault(); deleteNode(selectedId); break;
    case 'F2': e.preventDefault(); startInlineEdit(selectedId); break;
    case ' ': e.preventDefault(); toggleCollapse(selectedId); break;
    case 'Escape': selectNode(null); break;
    case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': e.preventDefault(); navigate(e.key); break;
    default:
      if(e.key.length===1){
        if(panelTab==='text') focusTextAtNode(selectedId);
        else { showPanel(true); rteText.focus({preventScroll:true}); placeCaretEnd(rteText); }
      }
  }
});

/* ================= Painel de edição ================= */
const pEmpty=$('#pEmpty'), pBody=$('#pBody'), rteText=$('#rteText'), rteNote=$('#rteNote');
const swatchesBox=$('#swatches'), attList=$('#attList');
let activeRte=rteText;

Object.keys(COLORS).forEach(k=>{
  const s=document.createElement('button'); s.className='swatch'; s.style.background=COLORS[k]; s.dataset.color=k; s.title=k;
  s.addEventListener('click',()=>{
    const f=findNode(selectedId); if(!f || !f.parent) return;
    pushHistory();
    const old=f.node.color;
    (function w(n){ if(n.color===old) n.color=k; n.children.forEach(w); })(f.node);
    f.node.color=k;
    render(); saveSoon();
  });
  swatchesBox.appendChild(s);
});

function syncRte(r,html){
  if(document.activeElement===r) return;
  if(r._h!==html){ r.innerHTML=html; r._h=html; }
  r.classList.toggle('is-empty',isEmptyHtml(html));
}
function updatePanel(){
  const f=selectedId?findNode(selectedId):null;
  if(!f){ pEmpty.classList.remove('hidden'); pBody.classList.add('hidden'); return; }
  pEmpty.classList.add('hidden'); pBody.classList.remove('hidden');
  const n=f.node;
  $('#pKind').textContent = !f.parent ? 'Tópico central' : f.level===1 ? 'Tópico' : 'Sub-tópico · nível '+f.level;
  $('#pChip').style.setProperty('--c', f.parent ? COLORS[n.color] : ROOT_INK);
  syncRte(rteText,n.html); syncRte(rteNote,n.note);
  $('#colorSec').classList.toggle('hidden',!f.parent);
  swatchesBox.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('on',s.dataset.color===n.color));
  const tg=$('#aToggle');
  tg.classList.toggle('hidden',!f.parent || !n.children.length);
  tg.textContent = n.collapsed ? '⊕' : '⊖';
  tg.title = n.collapsed ? 'Expandir (Espaço)' : 'Recolher (Espaço)';
  $('#aDelete').classList.toggle('hidden',!f.parent);
  $('#aSibling').classList.toggle('hidden',!f.parent);
  renderAttList(n);
  renderLinkList(n);
}
[rteText,rteNote].forEach(r=>{
  r.addEventListener('focus',()=>{ activeRte=r; editSession=null; updateFmtState(); });
  r.addEventListener('blur',()=>{ editSession=null; r._h=null; });
  r.addEventListener('input',()=>{
    const n=selectedId && findNodeFast(selectedId); if(!n) return;
    beginEditSession(selectedId+(r===rteNote?':note':''));
    const h=sanitize(r.innerHTML);
    if(r===rteText) n.html=h; else n.note=h;
    r.classList.toggle('is-empty',isEmptyHtml(h));
    const e=els.get(n.id); if(e) updateEl(e,n,e._level,e._dir);
    scheduleLayout(); saveSoon(); updateFmtState();
  });
  r.addEventListener('keydown',e=>{
    if(e.key==='Escape'){ e.preventDefault(); r.blur(); }
    else if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); insertLinkPrompt(); }
  });
});

const fmtbar=$('#fmtbar');
fmtbar.addEventListener('mousedown',e=>{ if(e.target.closest('button')) e.preventDefault(); });
fmtbar.addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return;
  const a=document.activeElement;
  if(!(a && a.isContentEditable)){ activeRte.focus(); placeCaretEnd(activeRte); }
  const cmd=b.dataset.cmd;
  if(cmd==='link') insertLinkPrompt();
  else { document.execCommand(cmd,false,null); if(cmd==='removeFormat') document.execCommand('unlink',false,null); }
  updateFmtState();
});
function updateFmtState(){
  fmtbar.querySelectorAll('button[data-cmd]').forEach(b=>{
    const c=b.dataset.cmd; if(c==='link'||c==='removeFormat') return;
    let on=false; try{ on=document.queryCommandState(c); }catch(err){}
    b.classList.toggle('on', on && !!(document.activeElement && document.activeElement.isContentEditable));
  });
}
document.addEventListener('selectionchange',()=>{ if(appMode==='map' && document.activeElement && document.activeElement.isContentEditable) updateFmtState(); });

$('#aChild').addEventListener('click',()=>selectedId&&addChild(selectedId));
$('#aSibling').addEventListener('click',()=>selectedId&&addSibling(selectedId));
$('#aToggle').addEventListener('click',()=>selectedId&&toggleCollapse(selectedId));
$('#aDelete').addEventListener('click',()=>selectedId&&deleteNode(selectedId));

function showPanel(v){ $('#panel').classList.toggle('hidden',!v); $('#panelBtn').classList.toggle('on',v); }
$('#panelBtn').addEventListener('click',()=>showPanel($('#panel').classList.contains('hidden')));

/* ---------- Links para páginas de documentos (painel) ---------- */
const linkList=$('#linkList'), linkPicker=$('#linkPicker'), lpDoc=$('#lpDoc'), lpPage=$('#lpPage');
function renderLinkList(n){
  linkList.innerHTML='';
  if(!n.links.length){ linkList.innerHTML='<div class="hint">Nenhum link. Vincule uma página de um documento para abri-la com um clique.</div>'; return; }
  n.links.forEach((l,i)=>{
    const r=resolveLink(l);
    const row=document.createElement('div'); row.className='lnk'+(r.ok?'':' broken');
    row.innerHTML='<span class="lnk-ic">📄</span><span class="lnk-t"><b>'+esc(r.docTitle)+'</b><span>'+(r.ok?'Página '+r.pageNo+(r.label?' · '+esc(r.label):''):'página não encontrada')+'</span></span>';
    if(r.ok) row.addEventListener('click',ev=>{ if(!ev.target.closest('.x')) openDocLink(l.doc,l.page); });
    const x=document.createElement('button'); x.className='x del'; x.textContent='✕'; x.title='Remover link';
    x.addEventListener('click',()=>{ pushHistory(); n.links.splice(i,1); render(); saveSoon(); });
    row.appendChild(x);
    linkList.appendChild(row);
  });
}
function fillPagePicker(){
  const it=ws.items.find(i=>i.id===lpDoc.value);
  lpPage.innerHTML='';
  (it&&it.pages||[]).forEach((p,i)=>{ const o=document.createElement('option'); o.value=p.id; o.textContent='Página '+(i+1)+(p.label?' — '+p.label.slice(0,40):''); lpPage.appendChild(o); });
}
$('#addLinkBtn').addEventListener('click',async ()=>{
  await docFlush();
  const docs=ws.items.filter(i=>i.type==='doc');
  if(!docs.length){ toast('Crie ou abra um documento na aba Documentos primeiro.'); return; }
  lpDoc.innerHTML='';
  docs.forEach(d=>{ const o=document.createElement('option'); o.value=d.id; o.textContent=d.title; lpDoc.appendChild(o); });
  if(curDocId && docs.some(d=>d.id===curDocId)) lpDoc.value=curDocId;
  fillPagePicker();
  linkPicker.classList.remove('hidden');
});
lpDoc.addEventListener('change',fillPagePicker);
$('#lpCancel').addEventListener('click',()=>linkPicker.classList.add('hidden'));
$('#lpOk').addEventListener('click',()=>{
  const n=selectedId && findNodeFast(selectedId); if(!n || !lpDoc.value || !lpPage.value) return;
  if(n.links.some(l=>l.doc===lpDoc.value && l.page===lpPage.value)){ linkPicker.classList.add('hidden'); return; }
  pushHistory();
  n.links.push({doc:lpDoc.value, page:lpPage.value});
  linkPicker.classList.add('hidden');
  render(); saveSoon();
});

/* ================= Anexos ================= */
function renderAttList(n){
  const key=curMapId+'|'+n.id+'|'+n.attachments.join(',');
  if(attList._k===key) return; attList._k=key;
  attList.innerHTML='';
  if(!n.attachments.length){ attList.innerHTML='<div class="hint">Nenhum anexo.</div>'; return; }
  n.attachments.forEach(fid=>{
    const a=M.files[fid]; if(!a) return;
    const row=document.createElement('div'); row.className='att';
    if(a.kind==='image'){ const im=document.createElement('img'); im.src=a.dataUrl; im.alt=a.name; im.addEventListener('click',()=>showLightbox(a.dataUrl)); row.appendChild(im); }
    else { const ic=document.createElement('div'); ic.className='ic'; ic.textContent='📄'; row.appendChild(ic); }
    const meta=document.createElement('div'); meta.className='meta';
    const nm=document.createElement('div'); nm.className='nm'; nm.textContent=a.name; nm.title=a.name;
    const sz=document.createElement('div'); sz.className='sz'; sz.textContent=(a.kind==='image'?'Imagem · ':'Arquivo · ')+fmtSize(a.size);
    meta.appendChild(nm); meta.appendChild(sz); row.appendChild(meta);
    const dl=document.createElement('button'); dl.className='x'; dl.textContent='⬇'; dl.title='Baixar'; dl.addEventListener('click',()=>download(a)); row.appendChild(dl);
    const x=document.createElement('button'); x.className='x del'; x.textContent='✕'; x.title='Remover';
    x.addEventListener('click',()=>{ pushHistory(); n.attachments=n.attachments.filter(z=>z!==fid); render(); saveSoon(); });
    row.appendChild(x);
    attList.appendChild(row);
  });
}
const imgFile=$('#imgFile'), docFile=$('#docFile');
$('#addImg').addEventListener('click',()=>imgFile.click());
$('#addDoc').addEventListener('click',()=>docFile.click());
imgFile.addEventListener('change',e=>handleFiles(e.target.files,'image'));
docFile.addEventListener('change',e=>handleFiles(e.target.files,'file'));
function handleFiles(list,kind){
  const id=selectedId; if(!id) return;
  const files=[...list]; imgFile.value=''; docFile.value='';
  if(!files.length) return;
  pushHistory();
  files.forEach(file=>{
    const r=new FileReader();
    r.onload=()=>{
      const n=findNodeFast(id); if(!n) return;
      const fid=genId();
      M.files[fid]={kind,name:file.name,size:file.size,mime:file.type,dataUrl:r.result};
      n.attachments.push(fid); render(); saveSoon();
    };
    r.readAsDataURL(file);
  });
}

/* ================= Desfazer / refazer ================= */
const past=[], future=[];
function snap(){ return {root:JSON.stringify(M.root), sel:selectedId}; }
function pushHistory(){ past.push(snap()); if(past.length>200) past.shift(); future.length=0; updateHistoryBtns(); }
function beginEditSession(key){ if(editSession!==key){ pushHistory(); editSession=key; } }
function restore(s){
  M.root=JSON.parse(s.root); fastIndex=null;
  selectedId = s.sel && findNode(s.sel) ? s.sel : (selectedId && findNode(selectedId) ? selectedId : null);
  render(); saveSoon();
}
function undo(){ if(editingId) endInlineEdit(); if(!past.length) return; future.push(snap()); restore(past.pop()); }
function redo(){ if(editingId) endInlineEdit(); if(!future.length) return; past.push(snap()); restore(future.pop()); }
function updateHistoryBtns(){ $('#undoBtn').disabled=!past.length; $('#redoBtn').disabled=!future.length; }
$('#undoBtn').addEventListener('click',undo);
$('#redoBtn').addEventListener('click',redo);

/* ================= Salvamento ================= */
let saveTimer=null;
function persistable(){
  const used=new Set(); (function w(n){ n.attachments.forEach(a=>used.add(a)); n.children.forEach(w); })(M.root);
  const files={}; used.forEach(k=>{ if(M.files[k]) files[k]=M.files[k]; });
  return {version:2, root:M.root, files};
}
function saveSoon(){ fastIndex=null; outlineRefreshSoon(); setStatus('Salvando…'); clearTimeout(saveTimer); saveTimer=setTimeout(saveNow,400); }
async function saveNow(){
  saveTimer=null;
  if(!M || !curMapId) return;
  const ok=await Store.set('map:'+curMapId, persistable());
  const it=ws.items.find(i=>i.id===curMapId);
  if(it){ const t=mapTitle(); const changed=it.title!==t; it.title=t; it.updated=Date.now(); await wsSave(); if(changed) renderSidebar(); }
  savedStatus(ok);
}
window.addEventListener('pagehide',()=>{ if(M && curMapId) Store.set('map:'+curMapId, persistable()); });

/* ================= Exportar / importar (mapa atual) ================= */
function exportJson(){
  const blob=new Blob([JSON.stringify(persistable(),null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download=(mapTitle().replace(/[\\/:*?"<>|]+/g,'').slice(0,60)||'mapa-mental')+'-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  toast('Backup completo exportado (.json).');
}
$('#exportBtn').addEventListener('click',e=>{
  const r=e.currentTarget.getBoundingClientRect();
  showMenu(r.left, r.bottom+4, [
    {label:'📝  Texto (.md) — para ler e usar com IA', fn:exportMd},
    {label:'🗄  Backup completo (.json) — inclui anexos', fn:exportJson},
  ]);
});
$('#importBtn').addEventListener('click',()=>$('#importFile').click());
/* aceita vários arquivos de uma vez: cada um vira um mapa novo */
$('#importFile').addEventListener('change',async e=>{
  const files=[...e.target.files]; e.target.value='';
  if(!files.length) return;
  let ok=0; const bad=[];
  for(const file of files){
    const raw=await file.text().catch(()=>'');
    try{
      if(!/\.json$/i.test(file.name) && !/^\s*\{/.test(raw)){
        const res=parseOutline(extractOutline(raw));
        if(!res.ok) throw new Error(res.error);
        await createMapFromRoot(buildFromParsed(res,null).root);
      } else {
        const parsed=JSON.parse(raw);
        if(!parsed || !parsed.root || typeof parsed.root!=='object') throw new Error('formato');
        const nd=normalizeMap(parsed);
        await mapFlush();
        const id=genId();
        await Store.set('map:'+id, nd);
        ws.items.push({id,type:'map',title:mapTitle(nd),updated:Date.now()});
        await wsSave();
        await mapOpen(id); renderSidebar();
      }
      ok++;
    }catch(err){ bad.push(file.name); }
  }
  toast(ok ? (ok===1 ? 'Mapa importado como um novo mapa!' : ok+' mapas importados!')+(bad.length?' · falharam: '+bad.join(', '):'') : 'Arquivo inválido.');
});

/* ================= Busca ================= */
let matches=[], mIdx=0;
const searchEl=$('#search'), cntEl=$('#searchCnt');
function runSearch(){
  const q=searchEl.value.trim().toLowerCase();
  matches=[]; matchSet=new Set(); mIdx=0;
  if(q){
    (function walk(n,anc){
      if((plainText(n.html)+' '+plainText(n.note)).toLowerCase().includes(q)){ matches.push(n.id); anc.forEach(a=>{ a.collapsed=false; }); }
      n.children.forEach(c=>walk(c,anc.concat(n)));
    })(M.root,[]);
    matchSet=new Set(matches);
  }
  cntEl.textContent = q ? (matches.length ? '1/'+matches.length : '0') : '';
  render();
  if(matches.length){ selectNode(matches[0]); centerOn(matches[0]); }
}
searchEl.addEventListener('input',runSearch);
searchEl.addEventListener('keydown',e=>{
  if(e.key==='Enter' && matches.length){
    e.preventDefault();
    mIdx=(mIdx+(e.shiftKey?-1:1)+matches.length)%matches.length;
    cntEl.textContent=(mIdx+1)+'/'+matches.length;
    selectNode(matches[mIdx]); centerOn(matches[mIdx]);
  } else if(e.key==='Escape'){ searchEl.value=''; runSearch(); searchEl.blur(); }
});
window.addEventListener('resize',()=>scheduleLayout());
