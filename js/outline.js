/* =========================================================
   Formato de texto do mapa (a "forma verdadeira" da escrita)

   # Tópico central
   > anotação do tópico central
   - Tópico principal {verde, direita}
     - Sub-tópico [[Contrato#3]]
       > anotação do sub-tópico
     - Outro sub-tópico {recolhido}

   O mapa visual é só a apresentação deste texto.
   ========================================================= */
"use strict";

const COLOR_PT = {blue:'azul', red:'vermelho', green:'verde', purple:'roxo', orange:'laranja', teal:'turquesa', pink:'rosa', amber:'amarelo', indigo:'anil', sky:'celeste', slate:'cinza'};
const COLOR_FROM = {};
Object.keys(COLOR_PT).forEach(k=>{ COLOR_FROM[k]=k; COLOR_FROM[COLOR_PT[k]]=k; });
Object.assign(COLOR_FROM,{cyan:'teal',yellow:'amber',gray:'slate',grey:'slate',violeta:'purple',lilas:'purple','lilás':'purple',marrom:'orange',preto:'slate',branco:'slate'});
const SIDE_FROM = {esquerda:'L', left:'L', direita:'R', right:'R'};
const COLLAPSE_WORDS = new Set(['recolhido','recolhida','collapsed','fechado']);

/* ---------- HTML ⇄ texto (formatação em linha) ---------- */
function inlineOf(el){
  let s='';
  el.childNodes.forEach(c=>{
    if(c.nodeType===3){ s+=c.textContent.replace(/\s*\n\s*/g,' '); return; }
    if(c.nodeType!==1) return;
    const t=c.tagName, inner=()=>inlineOf(c);
    const wrap=(a,b)=>{ const x=inner(); if(x.trim()) s+=a+x+(b||a); };
    switch(t){
      case 'B': case 'STRONG': wrap('**'); break;
      case 'I': case 'EM': wrap('*'); break;
      case 'S': case 'STRIKE': case 'DEL': wrap('~~'); break;
      case 'U': wrap('<u>','</u>'); break;
      case 'CODE': wrap('`'); break;
      case 'A': { const x=inner(); const h=c.getAttribute('href'); s+= h ? '['+(x||h)+']('+h+')' : x; break; }
      case 'BR': s+='<br>'; break;
      case 'P': case 'DIV': { const x=inner(); if(s && !/<br>$/.test(s)) s+='<br>'; s+=x; break; }
      case 'UL': case 'OL': {
        const items=[...c.children].filter(li=>li.tagName==='LI');
        items.forEach((li,i)=>{ if(s && !/<br>$/.test(s)) s+='<br>'; s+=(t==='OL'?(i+1)+'. ':'• ')+inlineOf(li); });
        break;
      }
      default: s+=inner();
    }
  });
  return s;
}
function htmlToInline(html){
  const t=document.createElement('template'); t.innerHTML=html||'';
  return inlineOf(t.content).replace(/(<br>\s*)+$/,'').replace(/^(\s*<br>)+/,'').replace(/[ \t]{2,}/g,' ').trim();
}
function mdInline(t){
  let h=esc(t||'');
  h=h.replace(/&lt;br\s*\/?&gt;/gi,'<br>').replace(/&lt;(\/?)u&gt;/gi,'<$1u>');
  h=h.replace(/`([^`]+)`/g,'<code>$1</code>');
  h=h.replace(/\[([^\]]+)\]\(((?:https?:|mailto:)[^)\s]+)\)/g,'<a href="$2">$1</a>');
  h=h.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/__(.+?)__/g,'<b>$1</b>');
  h=h.replace(/\*([^*\s][^*]*?)\*/g,'<i>$1</i>');
  h=h.replace(/~~(.+?)~~/g,'<s>$1</s>');
  return sanitize(h);
}
function noteToLines(html){
  if(isEmptyHtml(html)) return [];
  const t=document.createElement('template'); t.innerHTML=html;
  const lines=[]; let cur='';
  const flush=()=>{ cur.split('<br>').forEach(x=>{ if(x.trim()) lines.push(x.trim()); }); cur=''; };
  t.content.childNodes.forEach(c=>{
    if(c.nodeType===1 && /^(P|DIV|H[1-6]|BLOCKQUOTE)$/.test(c.tagName)){ flush(); cur=inlineOf(c); flush(); }
    else if(c.nodeType===1 && (c.tagName==='UL'||c.tagName==='OL')){
      flush(); [...c.children].forEach((li,i)=>{ lines.push((c.tagName==='OL'?(i+1)+'. ':'- ')+inlineOf(li).replace(/<br>/g,' ').trim()); });
    }
    else if(c.nodeType===1 && c.tagName==='BR'){ cur+='<br>'; }
    else { const tmp=document.createElement('div'); tmp.appendChild(c.cloneNode(true)); cur+=inlineOf(tmp); }
  });
  flush();
  return lines;
}
function linesToNote(lines){
  let out='', list=null;
  const close=()=>{ if(list){ out+='</'+list+'>'; list=null; } };
  lines.forEach(l=>{
    let m;
    if((m=l.match(/^\s*[-*•]\s+(.*)$/))){ if(list!=='ul'){ close(); out+='<ul>'; list='ul'; } out+='<li>'+mdInline(m[1])+'</li>'; }
    else if((m=l.match(/^\s*\d+[.)]\s+(.*)$/))){ if(list!=='ol'){ close(); out+='<ol>'; list='ol'; } out+='<li>'+mdInline(m[1])+'</li>'; }
    else { close(); if(l.trim()) out+='<p>'+mdInline(l.trim())+'</p>'; }
  });
  close();
  return sanitize(out);
}

/* ---------- Mapa → texto ---------- */
function linkToText(l){
  const it=ws.items.find(i=>i.id===l.doc && i.type==='doc'); if(!it) return '';
  const idx=(it.pages||[]).findIndex(p=>p.id===l.page); if(idx<0) return '';
  return '[['+it.title.replace(/[\[\]#]/g,'')+'#'+(idx+1)+']]';
}
function topicLine(n,level,parentColor){
  let s=htmlToInline(n.html);
  (n.links||[]).forEach(l=>{ const t=linkToText(l); if(t) s+=(s?' ':'')+t; });
  const attrs=[];
  if(level===1){ attrs.push(COLOR_PT[n.color]||'cinza'); attrs.push(n.side==='L'?'esquerda':'direita'); }
  else if(level>=2 && n.color!==parentColor) attrs.push(COLOR_PT[n.color]||'cinza');
  if(n.collapsed && level>0) attrs.push('recolhido');
  if(attrs.length) s+=(s?' ':'')+'{'+attrs.join(', ')+'}';
  return s;
}
function mapToText(m){
  m=m||M;
  const out=[], ids=[];
  const push=(s,id)=>{ out.push(s); ids.push(id); };
  push('# '+topicLine(m.root,0,null), m.root.id);
  noteToLines(m.root.note).forEach(l=>push('> '+l, m.root.id));
  if(m.root.children.length) push('', null);
  (function walk(n,depth){
    n.children.forEach(c=>{
      const ind='  '.repeat(depth);
      push(ind+'- '+topicLine(c,depth+1,depth===0?null:n.color), c.id);
      noteToLines(c.note).forEach(l=>push(ind+'  > '+l, c.id));
      walk(c,depth+1);
    });
  })(m.root,0);
  return {text:out.join('\n')+'\n', ids};
}

/* ---------- Texto → mapa (tolerante: aceita títulos ##, listas 1., recuo com tab) ---------- */
function extractOutline(text){
  const fence=/```[a-zA-Z]*[ \t]*\n([\s\S]*?)```/.exec(text||'');
  if(fence && /^\s*(#|[-*+]|\d+[.)])\s/m.test(fence[1])) return fence[1];
  return text||'';
}
function parseTopicText(raw){
  let t=(raw||'').trim(), color=null, side=null, collapsed=false;
  // {atributos} podem estar em qualquer ponto da linha (só palavras conhecidas)
  t=t.replace(/\s*\{([^{}]*)\}/g,(whole,inner)=>{
    const parts=inner.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
    if(!parts.length || !parts.every(p=>COLOR_FROM[p]||SIDE_FROM[p]||COLLAPSE_WORDS.has(p))) return whole;
    parts.forEach(p=>{ if(COLOR_FROM[p]) color=COLOR_FROM[p]; else if(SIDE_FROM[p]) side=SIDE_FROM[p]; else collapsed=true; });
    return '';
  }).trim();
  const links=[];
  t=t.replace(/\[\[([^\]#]+)#(\d+)\]\]/g,(s,d,p)=>{ links.push({title:d.trim(),page:+p}); return ''; }).replace(/\s{2,}/g,' ').trim();
  return {text:t, color, side, collapsed, links};
}
function parseOutline(text){
  const lines=(text||'').replace(/\r/g,'').split('\n');
  const P=(raw,line)=>Object.assign(parseTopicText(raw),{noteLines:[],children:[],line});
  let root=null, synthetic=false, base=null, last=null, inFence=false;
  const stack=[], headings=[];
  const lineNodes=new Array(lines.length).fill(null);
  const ensureRoot=()=>{ if(!root){ root=P('',-1); synthetic=true; base=root; headings[0]=root; } };
  lines.forEach((line,i)=>{
    if(/^\s*```/.test(line)){ inFence=!inFence; return; }
    if(!line.trim()) return;
    let m;
    if((m=line.match(/^\s*>\s?(.*)$/))){ ensureRoot(); (last||root).noteLines.push(m[1]); lineNodes[i]=last||root; return; }
    if((m=line.match(/^\s{0,3}(#{1,6})\s+(.*)$/))){
      const h=m[1].length, n=P(m[2],i);
      if(h===1 && (!root || (synthetic && !root.children.length && !root.noteLines.length))){ root=n; synthetic=false; base=root; headings.length=0; headings[0]=root; stack.length=0; }
      else {
        ensureRoot();
        const depth=Math.max(1,h-1);
        let parent=null; for(let d=depth-1; d>=0 && !parent; d--) parent=headings[d];
        (parent||root).children.push(n);
        headings[depth]=n; headings.length=depth+1; base=n; stack.length=0;
      }
      last=n; lineNodes[i]=n; return;
    }
    m=line.match(/^(\s*)(?:[-*+•]|\d+[.)])(?:\s+(.*))?$/) || line.match(/^(\s*)(.*)$/);
    ensureRoot();
    const indent=m[1].replace(/\t/g,'  ').length, n=P(m[2]||'',i);
    while(stack.length && stack[stack.length-1].indent>=indent) stack.pop();
    const parent=stack.length ? stack[stack.length-1].node : base;
    parent.children.push(n); stack.push({indent,node:n});
    last=n; lineNodes[i]=n;
  });
  if(!root) return {ok:false, error:'Nenhum tópico encontrado no texto.'};
  if(synthetic){
    if(root.children.length===1 && !root.noteLines.length){ root=root.children[0]; synthetic=false; }
  }
  return {ok:true, root, synthetic, lineNodes};
}
function countParsed(p){ let k=1; p.children.forEach(c=>k+=countParsed(c)); return k; }

/* Monta a árvore final reaproveitando os tópicos existentes (mantém anexos, ids e links) */
function buildFromParsed(res, oldRoot){
  const used=new Set(), warnings=[];
  const oldAll=[]; if(oldRoot) (function w(n,parent){ oldAll.push({n,parent}); n.children.forEach(c=>w(c,n)); })(oldRoot,null);
  const key=s=>plainText(s).replace(/\s+/g,' ').trim().toLowerCase();
  const pkey=p=>key(mdInline(p.text));
  function matchKids(pk, ok){
    const res=new Array(pk.length).fill(null);
    pk.forEach((p,i)=>{ const k=pkey(p); const o=ok.find(o=>!used.has(o.id) && key(o.html)===k); if(o){ res[i]=o; used.add(o.id); } });
    pk.forEach((p,i)=>{ if(!res[i] && ok[i] && !used.has(ok[i].id)){ res[i]=ok[i]; used.add(ok[i].id); } });
    pk.forEach((p,i)=>{ if(!res[i]){ const k=pkey(p); if(!k) return; const f=oldAll.find(x=>!used.has(x.n.id) && key(x.n.html)===k); if(f){ res[i]=f.n; used.add(f.n.id); } } });
    return res;
  }
  function resolveLinks(p){
    const out=[];
    p.links.forEach(l=>{
      const it=ws.items.find(i=>i.type==='doc' && i.title.replace(/[\[\]#]/g,'').trim().toLowerCase()===l.title.toLowerCase());
      const pg=it && (it.pages||[])[l.page-1];
      if(pg) out.push({doc:it.id,page:pg.id}); else warnings.push('[['+l.title+'#'+l.page+']]');
    });
    return out;
  }
  const idOf=new Map();
  function build(p, old, level, parentColor){
    const n = old ? Object.assign(mk(''),{id:old.id, attachments:old.attachments||[]}) : mk('');
    idOf.set(p,n.id);
    n.html=mdInline(p.text);
    n.note=linesToNote(p.noteLines);
    n.links=resolveLinks(p);
    n.collapsed = level>0 && !!p.collapsed;
    if(level===0) n.color='slate';
    else if(level===1) n.color = p.color || (old && old.color) || null;
    else n.color = p.color || parentColor;
    if(level===1) n.side = p.side || (old && old.side) || null;
    const oks = old ? old.children : [];
    const matched = matchKids(p.children, oks);
    n.children = p.children.map((c,i)=>build(c, matched[i], level+1, n.color));
    return n;
  }
  if(oldRoot) used.add(oldRoot.id);
  const root=build(res.root, oldRoot, 0, null);
  // cores e lados padrão para tópicos principais novos
  const usedColors={}; root.children.forEach(c=>{ if(c.color) usedColors[c.color]=(usedColors[c.color]||0)+1; });
  let l=0,r=0; root.children.forEach(c=>{ if(c.side==='L') l++; else if(c.side==='R') r++; });
  root.children.forEach(c=>{
    if(!c.color){ let best=BRANCH_ORDER[0],bc=Infinity; BRANCH_ORDER.forEach(k=>{ const u=usedColors[k]||0; if(u<bc){bc=u;best=k;} }); c.color=best; usedColors[best]=(usedColors[best]||0)+1; (function w(n){ n.children.forEach(k=>{ if(!k.color||k.color==='slate') k.color=best; w(k); }); })(c); }
    if(!c.side){ c.side = l<r ? 'L' : 'R'; c.side==='L'?l++:r++; }
  });
  (function fix(n,pc){ n.children.forEach(c=>{ if(!c.color) c.color=pc; fix(c,c.color); }); })(root,'slate');
  const lineIds=res.lineNodes.map(p=>p?idOf.get(p)||null:null);
  return {root, lineIds, warnings};
}

/* ---------- Painel "Texto" ---------- */
const mapTextEl=$('#mapText'), ptMirror=$('#ptMirror'), ptHl=$('#ptHl'), ptStatus=$('#ptStatus');
let textLineIds=[], textTimer=null, textDirty=false, refreshTimer=null;
let panelTab=localStorage.getItem('mm-tab')||'text';

function setPanelTab(t){
  panelTab=t; localStorage.setItem('mm-tab',t);
  document.querySelectorAll('.p-tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===t));
  $('#pText').classList.toggle('hidden',t!=='text');
  $('#pTopic').classList.toggle('hidden',t!=='topic');
  if(t==='text') outlineRefresh(true);
}
document.querySelectorAll('.p-tabs button').forEach(b=>b.addEventListener('click',()=>setPanelTab(b.dataset.tab)));

function setPtStatus(msg,err){ ptStatus.textContent=msg; ptStatus.classList.toggle('err',!!err); }
function outlineRefresh(force){
  if(!M || appMode!=='map') return;
  if(document.activeElement===mapTextEl && !force) return;
  if(panelTab!=='text' && !force) { textDirty=true; return; }
  const r=mapToText();
  if(mapTextEl.value!==r.text) mapTextEl.value=r.text;
  textLineIds=r.ids; textDirty=false;
  rebuildMirror(); highlightNode(selectedId);
}
function outlineRefreshSoon(){ clearTimeout(refreshTimer); refreshTimer=setTimeout(()=>outlineRefresh(),250); }

function rebuildMirror(){
  ptMirror.style.width=mapTextEl.clientWidth+'px';
  const lines=mapTextEl.value.split('\n');
  ptMirror.innerHTML=lines.map(l=>'<div>'+(esc(l)||'&#8203;')+'</div>').join('');
}
function highlightNode(id){
  const i=textLineIds.indexOf(id);
  if(i<0 || !ptMirror.children[i]){ ptHl.style.display='none'; return; }
  let j=i; while(textLineIds[j+1]===id) j++;
  const a=ptMirror.children[i], b=ptMirror.children[j];
  const top=a.offsetTop, h=b.offsetTop+b.offsetHeight-top;
  ptHl.style.display='block'; ptHl.style.top=(top-mapTextEl.scrollTop)+'px'; ptHl.style.height=h+'px';
  ptHl._top=top; ptHl._h=h;
  if(document.activeElement!==mapTextEl){
    const st=mapTextEl.scrollTop, vh=mapTextEl.clientHeight;
    if(top<st+10 || top+h>st+vh-30){ mapTextEl.scrollTop=Math.max(0,top-vh/3); ptHl.style.top=(top-mapTextEl.scrollTop)+'px'; }
  }
}
mapTextEl.addEventListener('scroll',()=>{ if(ptHl._top!=null) ptHl.style.top=(ptHl._top-mapTextEl.scrollTop)+'px'; });
new ResizeObserver(()=>{ if(panelTab==='text' && appMode==='map'){ rebuildMirror(); highlightNode(selectedId); } }).observe(mapTextEl);

/* digitar no texto atualiza o mapa */
mapTextEl.addEventListener('input',()=>{
  rebuildMirror();
  setPtStatus('editando…');
  clearTimeout(textTimer); textTimer=setTimeout(()=>applyTextFromEditor(),350);
});
function applyTextFromEditor(){
  clearTimeout(textTimer); textTimer=null;
  const res=parseOutline(mapTextEl.value);
  if(!res.ok){ setPtStatus('⚠ '+res.error,true); return false; }
  beginEditSession('text');
  const b=buildFromParsed(res,M.root);
  M.root=b.root; fastIndex=null; textLineIds=b.lineIds;
  if(!selectedId || !findNode(selectedId)) selectedId=M.root.id;
  render(); saveSoon();
  setPtStatus(b.warnings.length ? '⚠ link não encontrado: '+b.warnings[0] : '✓ mapa atualizado', b.warnings.length>0);
  return true;
}
mapTextEl.addEventListener('focus',()=>{ editSession=null; });
mapTextEl.addEventListener('blur',()=>{
  if(textTimer) applyTextFromEditor();
  editSession=null;
  setTimeout(()=>{ if(document.activeElement!==mapTextEl){ outlineRefresh(true); setPtStatus('✓ sincronizado'); } },0);
});

/* cursor numa linha seleciona o tópico no mapa */
function caretLine(){ return mapTextEl.value.slice(0,mapTextEl.selectionStart).split('\n').length-1; }
function syncSelectionFromCaret(){
  const id=textLineIds[caretLine()];
  if(id && id!==selectedId && findNode(id)){ selectNode(id); ensureVisible(id); }
  else highlightNode(selectedId);
}
mapTextEl.addEventListener('click',syncSelectionFromCaret);
mapTextEl.addEventListener('keyup',e=>{ if(/^(Arrow|Page|Home|End)/.test(e.key)) syncSelectionFromCaret(); });

/* atalhos de edição de lista: Tab / Shift+Tab recuam, Enter continua a lista */
mapTextEl.addEventListener('keydown',e=>{
  const ta=mapTextEl, v=ta.value;
  if(e.key==='Escape'){ e.preventDefault(); ta.blur(); return; }
  if(e.key==='Tab'){
    e.preventDefault();
    const s=ta.selectionStart, en=ta.selectionEnd;
    const ls=v.lastIndexOf('\n',s-1)+1, le0=v.indexOf('\n',Math.max(en-1,s)); const le=le0<0?v.length:le0;
    const block=v.slice(ls,le);
    const out=block.split('\n').map(l=>e.shiftKey ? l.replace(/^ {1,2}/,'') : '  '+l).join('\n');
    ta.setSelectionRange(ls,le);
    document.execCommand('insertText',false,out);
    if(s===en){ const d=out.length-block.length; const p=Math.max(ls,s+(e.shiftKey?Math.max(d,-(s-ls)):2)); ta.setSelectionRange(p,p); }
    else ta.setSelectionRange(ls,ls+out.length);
    return;
  }
  if(e.key==='Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey){
    const s=ta.selectionStart; if(s!==ta.selectionEnd) return;
    const ls=v.lastIndexOf('\n',s-1)+1, line=v.slice(ls,s);
    const m=line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if(m){
      e.preventDefault();
      if(!m[3].trim()){ ta.setSelectionRange(ls,s); document.execCommand('insertText',false,''); return; }
      document.execCommand('insertText',false,'\n'+m[1]+(/\d/.test(m[2])?(parseInt(m[2])+1)+m[2].slice(-1):'-')+' ');
      return;
    }
    const q=line.match(/^(\s*)>\s?/);
    if(q && line.replace(/^\s*>\s?/,'').trim()){ e.preventDefault(); document.execCommand('insertText',false,'\n'+q[1]+'> '); }
  }
});

/* chamado pelo mapa quando um tópico é selecionado */
function outlineOnSelect(id){ if(panelTab==='text' && appMode==='map') highlightNode(id); }
/* começar a digitar com um tópico selecionado: vai para o fim da linha dele */
function focusTextAtNode(id){
  showPanel(true);
  if(textDirty) outlineRefresh(true);
  const i=textLineIds.indexOf(id);
  mapTextEl.focus({preventScroll:true});
  if(i>=0){
    const lines=mapTextEl.value.split('\n');
    let pos=0; for(let k=0;k<i;k++) pos+=lines[k].length+1;
    const line=lines[i]; const am=line.match(/\s*\{[^{}]*\}\s*$/);
    const end=pos+(am?am.index:line.length);
    mapTextEl.setSelectionRange(end,end);
    highlightNode(id);
  }
}
function selectNodeTitleInText(id){
  focusTextAtNode(id);
  const i=textLineIds.indexOf(id); if(i<0) return;
  const lines=mapTextEl.value.split('\n'); let pos=0; for(let k=0;k<i;k++) pos+=lines[k].length+1;
  const m=lines[i].match(/^(\s*(?:#|[-*+]|\d+[.)])\s+)(.*?)(\s*\{[^{}]*\}\s*)?$/);
  if(m) mapTextEl.setSelectionRange(pos+m[1].length, pos+m[1].length+m[2].length);
}

/* ---------- Copiar ---------- */
async function copyText(t){
  try{ await navigator.clipboard.writeText(t); return true; }
  catch(e){
    const ta=document.createElement('textarea'); ta.value=t; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select();
    let ok=false; try{ ok=document.execCommand('copy'); }catch(err){} ta.remove(); return ok;
  }
}
$('#copyTextBtn').addEventListener('click',async ()=>{ const ok=await copyText(mapToText().text); toast(ok?'Texto do mapa copiado.':'Não foi possível copiar.'); });
$('#fmtHelpBtn').addEventListener('click',()=>{ $('#ptHelp').classList.toggle('hidden'); rebuildMirror(); highlightNode(selectedId); });

/* ---------- IA (Claude / ChatGPT) por copiar e colar ---------- */
const FORMAT_RULES =
`Formato do mapa mental (texto simples, estilo Markdown):

# Tópico central
> anotação opcional (uma ou mais linhas começando com ">")
- Tópico principal {verde, direita}
  - Sub-tópico
    - Detalhe
    > anotação do detalhe
  - Outro sub-tópico
- Outro tópico principal {azul, esquerda}

Regras:
- Use "#" uma única vez, só no tópico central.
- Cada tópico ocupa UMA linha que começa com "- ". Recue 2 espaços para cada nível abaixo.
- Anotações (explicações longas) vão em linhas iniciadas com ">" logo abaixo do tópico.
- Opcional no fim da linha, entre chaves: cor (azul, vermelho, verde, roxo, laranja, turquesa, rosa, amarelo, anil, celeste, cinza), lado (esquerda ou direita, só nos tópicos principais) e "recolhido".
- Pode usar **negrito**, *itálico*, ~~tachado~~ e [texto](https://link).
- Mantenha intactos os marcadores [[Documento#N]] que já existirem (são links para páginas de documentos).
- Tópicos curtos (até ~8 palavras); detalhes vão nas anotações.`;

function buildPrompt(ask, includeMap){
  let p='Você vai criar ou editar um mapa mental para mim.\n\n'+FORMAT_RULES+'\n\n';
  p+='Pedido: '+(ask.trim() || (includeMap ? 'melhore e complete este mapa mental.' : 'crie um mapa mental sobre [TEMA].'))+'\n\n';
  if(includeMap) p+='Mapa atual:\n```markdown\n'+mapToText().text+'```\n\n';
  p+='Responda SOMENTE com o mapa completo dentro de um único bloco ```markdown, sem explicações antes ou depois.';
  return p;
}
const aiModal=$('#aiModal'), aiAsk=$('#aiAsk'), aiPaste=$('#aiPaste'), aiPreview=$('#aiPreview');
let aiParsed=null;
function openAi(){ aiModal.classList.remove('hidden'); aiPaste.value=''; aiParsed=null; updateAiPreview(); setTimeout(()=>aiAsk.focus(),30); }
function closeAi(){ aiModal.classList.add('hidden'); }
$('#aiBtn').addEventListener('click',openAi);
$('#aiClose').addEventListener('click',closeAi);
aiModal.addEventListener('pointerdown',e=>{ if(e.target===aiModal) closeAi(); });
aiModal.addEventListener('keydown',e=>{ if(e.key==='Escape'){ e.stopPropagation(); closeAi(); } });
$('#aiCopy').addEventListener('click',async ()=>{
  const ok=await copyText(buildPrompt(aiAsk.value,$('#aiInclude').checked));
  toast(ok?'Prompt copiado! Cole no Claude ou no ChatGPT.':'Não foi possível copiar.');
});
function updateAiPreview(){
  const txt=aiPaste.value.trim();
  aiParsed=null; aiPreview.className='ai-preview';
  if(!txt){ aiPreview.textContent='O bloco do mapa é encontrado automaticamente na resposta.'; }
  else {
    const res=parseOutline(extractOutline(txt));
    if(!res.ok){ aiPreview.textContent='⚠ '+res.error; aiPreview.classList.add('err'); }
    else { aiParsed=res; aiPreview.textContent='✓ '+countParsed(res.root)+' tópicos · central: “'+(plainText(mdInline(res.root.text))||'sem título')+'”'; aiPreview.classList.add('ok'); }
  }
  $('#aiApply').disabled=!aiParsed; $('#aiNew').disabled=!aiParsed;
}
aiPaste.addEventListener('input',updateAiPreview);
$('#aiApply').addEventListener('click',()=>{
  if(!aiParsed) return;
  if(editingId) endInlineEdit();
  pushHistory();
  const b=buildFromParsed(aiParsed,M.root);
  M.root=b.root; fastIndex=null; selectedId=M.root.id;
  render(); fit(true); saveSoon(); outlineRefresh(true);
  closeAi(); toast('Mapa atualizado pela IA · Ctrl+Z desfaz');
});
$('#aiNew').addEventListener('click',async ()=>{
  if(!aiParsed) return;
  const b=buildFromParsed(aiParsed,null);
  await createMapFromRoot(b.root);
  closeAi(); toast('Novo mapa criado.');
});
async function createMapFromRoot(root){
  await mapFlush();
  const id=genId(), data={version:2, root, files:{}};
  await Store.set('map:'+id,data);
  ws.items.push({id,type:'map',title:mapTitle(data),updated:Date.now()});
  await wsSave();
  await mapOpen(id); renderSidebar(); outlineRefresh(true);
}

/* ---------- Exportar / importar em texto ---------- */
function fileBase(){ return (mapTitle().replace(/[\\/:*?"<>|]+/g,'').slice(0,60)||'mapa-mental'); }
function exportMd(){
  const blob=new Blob([mapToText().text],{type:'text/markdown;charset=utf-8'});
  const url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download=fileBase()+'.md'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  toast('Mapa exportado em texto (.md).');
}
async function importTextMap(text){
  const res=parseOutline(extractOutline(text));
  if(!res.ok){ toast(res.error); return; }
  await createMapFromRoot(buildFromParsed(res,null).root);
  toast('Mapa importado do texto.');
}

/* ---------- Redimensionar o painel ---------- */
(function(){
  const panel=$('#panel'), h=$('#pResize');
  const saved=+localStorage.getItem('mm-panel-w'); if(saved) panel.style.flexBasis=saved+'px';
  h.addEventListener('pointerdown',e=>{
    e.preventDefault(); h.classList.add('on'); h.setPointerCapture(e.pointerId);
    const sx=e.clientX, sw=panel.getBoundingClientRect().width;
    const mv=ev=>{ const w=clamp(sw+(sx-ev.clientX),280,Math.min(900,innerWidth-360)); panel.style.flexBasis=w+'px'; };
    const up=()=>{ h.classList.remove('on'); h.removeEventListener('pointermove',mv); h.removeEventListener('pointerup',up); localStorage.setItem('mm-panel-w',Math.round(panel.getBoundingClientRect().width)); };
    h.addEventListener('pointermove',mv); h.addEventListener('pointerup',up);
  });
})();

setPanelTab(panelTab);
