/* =========================================================
   Utilitários compartilhados: armazenamento, HTML seguro, UI
   ========================================================= */
"use strict";

const $ = s => document.querySelector(s);
function genId(){ return 'n'+Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-4); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function esc(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function textToHtml(s){ return esc(s||'').replace(/\n/g,'<br>'); }
function fmtSize(b){ if(!b) return ''; if(b<1024) return b+' B'; if(b<1048576) return (b/1024).toFixed(0)+' KB'; return (b/1048576).toFixed(1)+' MB'; }

/* ---------- Armazenamento chave/valor (IndexedDB, com fallback localStorage) ---------- */
const Store = (()=>{
  const DB='mapa_mental_db', ST='kv'; let dbP=null;
  function open(){
    if(dbP) return dbP;
    dbP=new Promise((res,rej)=>{
      let r; try{ r=indexedDB.open(DB,1); }catch(e){ return rej(e); }
      r.onupgradeneeded=()=>{ try{ r.result.createObjectStore(ST); }catch(e){} };
      r.onsuccess=()=>res(r.result);
      r.onerror=()=>rej(r.error);
    });
    return dbP;
  }
  function req(mode,fn){
    return open().then(db=>new Promise((res,rej)=>{
      const tx=db.transaction(ST,mode); const st=tx.objectStore(ST); let out;
      const q=fn(st); if(q) q.onsuccess=()=>{ out=q.result; };
      tx.oncomplete=()=>res(out); tx.onerror=()=>rej(tx.error); tx.onabort=()=>rej(tx.error);
    }));
  }
  const lsKey=k=> k==='doc' ? 'mapa_mental' : 'mm:'+k;
  return {
    async get(k){
      try{ const v=await req('readonly',st=>st.get(k)); if(v!==undefined) return v; }catch(e){}
      try{ const s=localStorage.getItem(lsKey(k)); if(s) return JSON.parse(s); }catch(e){}
      return undefined;
    },
    async set(k,v){
      try{ await req('readwrite',st=>st.put(v,k)); return true; }catch(e){}
      if(v instanceof ArrayBuffer) return false;
      try{ localStorage.setItem(lsKey(k), JSON.stringify(v)); return true; }catch(e){ return false; }
    },
    async del(k){
      try{ await req('readwrite',st=>st.delete(k)); }catch(e){}
      try{ localStorage.removeItem(lsKey(k)); }catch(e){}
    }
  };
})();

/* ---------- HTML seguro ---------- */
const DROP_TAGS = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','TEMPLATE','NOSCRIPT','SVG','MATH','HEAD','TITLE','META','LINK','IMG','VIDEO','AUDIO','CANVAS','INPUT','BUTTON','SELECT','TEXTAREA','FORM','FRAME','FRAMESET','BASE']);
const MAP_TAGS = new Set(['B','STRONG','I','EM','U','S','STRIKE','DEL','UL','OL','LI','BR','P','DIV','A','CODE']);
const DOC_TAGS = new Set([...MAP_TAGS,'H1','H2','H3','BLOCKQUOTE','FONT','SPAN','SUB','SUP']);
const SAFE_CSS_VAL = /^[#a-z0-9(),.\s%-]+$/i;

function cleanTree(parent,rich){
  [...parent.childNodes].forEach(n=>{
    if(n.nodeType===3) return;
    if(n.nodeType!==1){ n.remove(); return; }
    const tag=n.tagName.toUpperCase();
    if(DROP_TAGS.has(tag)){ n.remove(); return; }
    cleanTree(n,rich);
    if(!(rich?DOC_TAGS:MAP_TAGS).has(tag)){ n.replaceWith(...n.childNodes); return; }
    [...n.attributes].forEach(a=>{
      const name=a.name.toLowerCase(), val=a.value.trim();
      let keep=false;
      if(tag==='A' && name==='href') keep=/^(https?:|mailto:)/i.test(val);
      else if(rich && tag==='FONT' && name==='size') keep=/^[1-7]$/.test(val);
      else if(rich && tag==='FONT' && name==='color') keep=/^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(val);
      else if(rich && name==='align') keep=/^(left|right|center|justify)$/i.test(val);
      else if(rich && name==='style'){
        const kept=[];
        val.split(';').forEach(decl=>{
          const i=decl.indexOf(':'); if(i<0) return;
          const prop=decl.slice(0,i).trim().toLowerCase(), v=decl.slice(i+1).trim();
          if(!['text-align','color','background-color'].includes(prop)) return;
          if(!SAFE_CSS_VAL.test(v) || /url|expression|var\(/i.test(v)) return;
          kept.push(prop+':'+v);
        });
        if(kept.length){ n.setAttribute('style',kept.join(';')); }
        else n.removeAttribute('style');
        return;
      }
      if(!keep) n.removeAttribute(a.name);
    });
  });
}
function sanitizeWith(html,rich){
  if(!html) return '';
  const t=document.createElement('template'); t.innerHTML=html; cleanTree(t.content,rich);
  let out=t.innerHTML.trim();
  if(/^(<br\s*\/?>|\s|&nbsp;|<p>(<br\s*\/?>|\s)*<\/p>)*$/i.test(out)) out='';
  return out;
}
const sanitize = html => sanitizeWith(html,false);      // mapa
const sanitizeDoc = html => sanitizeWith(html,true);    // documentos
function plainText(html){ const t=document.createElement('template'); t.innerHTML=html||''; return t.content.textContent||''; }
function isEmptyHtml(html){ return !plainText(html).trim() && !/<li/i.test(html||''); }

/* ---------- Seleção / cursor ---------- */
function placeCaretEnd(elm){
  const r=document.createRange(); r.selectNodeContents(elm); r.collapse(false);
  const s=getSelection(); s.removeAllRanges(); s.addRange(r);
}
function selectAllIn(elm){
  const r=document.createRange(); r.selectNodeContents(elm);
  const s=getSelection(); s.removeAllRanges(); s.addRange(r);
}
try{ document.execCommand('styleWithCSS',false,false); }catch(e){}
try{ document.execCommand('defaultParagraphSeparator',false,'p'); }catch(e){}

/* Colar / soltar: só formatação permitida */
document.addEventListener('paste',e=>{
  const t=e.target.closest && e.target.closest('.rte,.node .content,.page-body,.ov-body');
  if(!t || !t.isContentEditable) return;
  e.preventDefault();
  const rich=t.matches('.page-body,.ov-body');
  const html=e.clipboardData.getData('text/html'), txt=e.clipboardData.getData('text/plain');
  if(html) document.execCommand('insertHTML',false,sanitizeWith(html,rich));
  else document.execCommand('insertText',false,txt);
});
document.addEventListener('drop',e=>{ if(e.target.closest && e.target.closest('.rte,.node .content,.page-body,.ov-body')) e.preventDefault(); });

/* Link: pede o endereço e insere no editor em foco */
function insertLinkPrompt(){
  const sel=getSelection(); const range=sel.rangeCount?sel.getRangeAt(0).cloneRange():null;
  let url=prompt('Endereço do link:','https://');
  if(!url) return;
  url=url.trim(); if(!/^[a-z]+:/i.test(url)) url=(url.includes('@')&&!url.includes('/')?'mailto:':'https://')+url;
  if(!/^(https?:|mailto:)/i.test(url)){ toast('Link inválido.'); return; }
  if(range){ sel.removeAllRanges(); sel.addRange(range); }
  if(!range || range.collapsed) document.execCommand('insertHTML',false,'<a href="'+esc(url)+'">'+esc(url.replace(/^mailto:/,''))+'</a>&nbsp;');
  else document.execCommand('createLink',false,url);
}

/* ---------- UI: toast, lightbox, download, menu ---------- */
let toastTimer=null;
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),2400); }
function showLightbox(src){ const lb=$('#lightbox'); lb.querySelector('img').src=src; lb.style.display='flex'; }
$('#lightbox').addEventListener('click',()=>{ $('#lightbox').style.display='none'; });
function download(a){ const l=document.createElement('a'); l.href=a.dataUrl; l.download=a.name; document.body.appendChild(l); l.click(); l.remove(); }
function setStatus(t){ $('#status').textContent=t; }
function savedStatus(ok){ const t=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); setStatus(ok?('Salvo ✓ '+t):'⚠ Falha ao salvar'); }

/* menu flutuante simples: items = [{label, danger, fn}] */
let openMenuEl=null;
function closeMenu(){ if(openMenuEl){ openMenuEl.remove(); openMenuEl=null; } }
function showMenu(x,y,items){
  closeMenu();
  const m=document.createElement('div'); m.className='menu';
  items.forEach(it=>{
    const b=document.createElement('button'); b.textContent=it.label; if(it.danger) b.className='danger';
    b.addEventListener('click',()=>{ closeMenu(); it.fn(); });
    m.appendChild(b);
  });
  document.body.appendChild(m);
  const r=m.getBoundingClientRect();
  m.style.left=Math.min(x, innerWidth-r.width-8)+'px';
  m.style.top=Math.min(y, innerHeight-r.height-8)+'px';
  openMenuEl=m;
}
document.addEventListener('pointerdown',e=>{ if(openMenuEl && !openMenuEl.contains(e.target) && !e.target.closest('.more')) closeMenu(); },true);
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeMenu(); });
