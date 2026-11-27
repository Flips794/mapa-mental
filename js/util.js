/* =========================================================
   Utilitários compartilhados: armazenamento, HTML seguro, UI
   ========================================================= */
"use strict";

const $ = s => document.querySelector(s);
let ws=null;        // área de trabalho: {version, mode, items:[{id,type,title,...}], current:{map,doc}}
let appMode='map';  // 'map' | 'doc'
function genId(){ return 'n'+Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-4); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function esc(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function textToHtml(s){ return esc(s||'').replace(/\n/g,'<br>'); }
function fmtSize(b){ if(!b) return ''; if(b<1024) return b+' B'; if(b<1048576) return (b/1024).toFixed(0)+' KB'; return (b/1048576).toFixed(1)+' MB'; }

/* ---------- Armazenamento chave/valor ----------
   1) Aberto pelo servidor local (http://localhost:4580): arquivos do servidor.
   2) Conectado a um repositório do GitHub: tudo fica no repositório privado (online, igual em qualquer aparelho).
   3) Sem nenhum dos dois: IndexedDB deste navegador. */
const GH_CFG_KEY='mm-github';
const GH_DEFAULT_REPO='Flips794/mapa-mental-dados';
/* endereço da API: o desvio (mm-github-api) só vale com o app aberto em localhost e apontando para localhost —
   impede que a chave seja enviada a outro servidor */
function ghApiBase(){
  let o=null; try{ o=localStorage.getItem('mm-github-api'); }catch(e){}
  const pagLocal=/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  return (o && pagLocal && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(o) ? o : 'https://api.github.com').replace(/\/$/,'');
}
function ghConfig(){ try{ const c=JSON.parse(localStorage.getItem(GH_CFG_KEY)||'null'); return c && c.owner && c.repo && c.token ? c : null; }catch(e){ return null; } }

const Store = (()=>{
  const local = LocalStore();
  let mode=null, gh=null;   // mode: 'server' | 'github' | 'local'
  const ready=(async()=>{
    if(/^https?:$/.test(location.protocol) && !/github\.io$/i.test(location.hostname)){
      try{
        const r=await fetch('api/health',{cache:'no-store'});
        if(r.ok){ const j=await r.json(); if(j && j.app==='mapa-mental'){ mode='server'; return; } }
      }catch(e){}
    }
    let cfg=ghConfig();
    if(!cfg && /github\.io$/i.test(location.hostname) && sessionStorage.getItem('mm-local-only')!=='1') cfg=await githubSetupDialog();
    if(cfg){ gh=GitHubStore(cfg); mode='github'; return; }
    mode='local';
  })();
  const H={'X-Mapa-Mental':'1'};
  const url=k=>'api/kv/'+encodeURIComponent(k);
  return {
    ready,
    get mode(){ return mode; },
    get remote(){ return mode==='server' || mode==='github'; },
    get github(){ return gh; },
    /* modo servidor/GitHub: erro de rede LANÇA exceção (nunca finge que está vazio) */
    async get(k){
      await ready;
      if(mode==='github') return gh.get(k);
      if(mode!=='server') return local.get(k);
      const r=await fetch(url(k),{cache:'no-store'});
      if(r.status===404) return undefined;
      if(!r.ok) throw new Error('Servidor respondeu '+r.status);
      return /^pdf:/.test(k) ? r.arrayBuffer() : r.json();
    },
    async set(k,v){
      await ready;
      if(mode==='github') return gh.set(k,v);
      if(mode!=='server') return local.set(k,v);
      const bin=v instanceof ArrayBuffer;
      const body=bin?v:JSON.stringify(v);
      try{
        const r=await fetch(url(k),{method:'PUT',headers:Object.assign({'Content-Type':bin?'application/octet-stream':'application/json'},H),body,keepalive:!bin && body.length<60000});
        return r.ok;
      }catch(e){ return false; }
    },
    /* grava mesclando com a versão já salva (coleções de estudos); devolve o resultado ou null */
    async setMesclando(k,v,mesclar){
      await ready;
      if(mode==='github') return gh.setMesclando(k,v,mesclar);
      let cur;
      try{ cur = await this.get(k); }catch(e){ return null; }
      const final=mesclar(v, cur||null);
      return (await this.set(k,final)) ? final : null;
    },
    async del(k){
      await ready;
      if(mode==='github') return gh.del(k);
      if(mode!=='server') return local.del(k);
      try{ await fetch(url(k),{method:'DELETE',headers:H}); }catch(e){}
    },
    /* cópia legível do mapa (texto/) */
    async setText(id,title,text){
      await ready;
      if(mode==='github') return gh.setText(id,title,text);
      if(mode!=='server') return;
      try{ await fetch('api/md/'+encodeURIComponent(id),{method:'PUT',headers:Object.assign({'Content-Type':'application/json'},H),body:JSON.stringify({title,text})}); }catch(e){}
    },
    async textIds(){
      await ready;
      if(mode==='github') return gh.textIds();
      if(mode!=='server') return [];
      try{ const r=await fetch('api/md',{cache:'no-store'}); return r.ok ? (await r.json()).ids||[] : []; }catch(e){ return []; }
    },
    /* espera os envios pendentes (GitHub) */
    busy(){ return mode==='github' && gh.busy(); },
    /* intervalo mínimo entre salvamentos: no GitHub cada salvamento vira um registro no histórico */
    delay(ms){ return mode==='github' ? Math.max(ms,2500) : ms; },
    local
  };
})();

/* ---------- Repositório do GitHub como armazenamento ---------- */
function bytesToB64(u8){ let s=''; for(let i=0;i<u8.length;i+=0x8000) s+=String.fromCharCode.apply(null,u8.subarray(i,i+0x8000)); return btoa(s); }
function b64ToBytes(b){ const s=atob(b); const u=new Uint8Array(s.length); for(let i=0;i<s.length;i++) u[i]=s.charCodeAt(i); return u; }
function GitHubStore(cfg){
  const api=ghApiBase();
  const branch=localStorage.getItem('mm-github-branch')||'';
  const base=api+'/repos/'+encodeURIComponent(cfg.owner)+'/'+encodeURIComponent(cfg.repo)+'/contents/';
  const shas=new Map();
  const ID=/^[A-Za-z0-9_-]{1,80}$/;
  const encPath=p=>p.split('/').map(encodeURIComponent).join('/');
  function pathOf(k){
    if(k==='ws') return 'ws.json';
    const e=/^est:([a-z]+)(?:-(\d{4}-\d{2}))?$/.exec(k);
    if(e) return e[2] ? 'estudos/'+e[1]+'/'+e[2]+'.json' : 'estudos/'+e[1]+'.json';
    const m=/^(map|doc|pdf):(.+)$/.exec(k);
    if(m && ID.test(m[2])) return ({map:'mapas',doc:'documentos',pdf:'pdfs'})[m[1]]+'/'+m[2]+(m[1]==='pdf'?'.pdf':'.json');
    if(ID.test(k)) return 'outros/'+k+'.json';
    throw new Error('chave inválida: '+k);
  }
  async function req(method,path,body,accept){
    const h={'Authorization':'Bearer '+cfg.token,'Accept':accept||'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
    if(body) h['Content-Type']='application/json';
    const q = (method==='GET' && branch) ? '?ref='+encodeURIComponent(branch) : '';
    const r=await fetch(base+encPath(path)+q,{method,headers:h,body:body?JSON.stringify(body):undefined,cache:'no-store'});
    if(r.status===401) throw Object.assign(new Error('Chave do GitHub inválida ou vencida'),{auth:true});
    return r;
  }
  async function readBytes(path){
    const r=await req('GET',path);
    if(r.status===404){ shas.set(path,null); return undefined; }
    if(!r.ok) throw new Error('GitHub respondeu '+r.status);
    const j=await r.json();
    if(Array.isArray(j)) throw new Error(path+' é uma pasta');
    shas.set(path,j.sha);
    if(j.encoding==='base64' && j.content) return b64ToBytes(j.content.replace(/\s/g,''));
    // arquivos acima de 1 MB vêm separados
    const r2=await req('GET',path,null,'application/vnd.github.raw+json');
    if(!r2.ok) throw new Error('GitHub respondeu '+r2.status);
    return new Uint8Array(await r2.arrayBuffer());
  }
  async function listDir(dir){
    const r=await req('GET',dir);
    if(r.status===404) return [];
    if(!r.ok) throw new Error('GitHub respondeu '+r.status);
    const j=await r.json(); return Array.isArray(j) ? j : [];
  }
  async function putBytes(path,bytes,msg,retry){
    if(!shas.has(path)){
      const r=await req('GET',path);
      if(r.ok){ const j=await r.json(); shas.set(path, Array.isArray(j)?null:j.sha); }
      else if(r.status===404) shas.set(path,null);
      else return false;
    }
    const body={message:msg, content:bytesToB64(bytes)};
    const sha=shas.get(path); if(sha) body.sha=sha;
    if(branch) body.branch=branch;
    const r=await req('PUT',path,body);
    if(r.ok){ const j=await r.json(); shas.set(path,j.content.sha); return true; }
    if((r.status===409 || r.status===422) && retry!==false){ shas.delete(path); return putBytes(path,bytes,msg,false); }
    return false;
  }
  async function deletePath(path,msg){
    if(!shas.get(path)){ const r=await req('GET',path); if(!r.ok) return r.status===404; const j=await r.json(); shas.set(path,j.sha); }
    const body={message:msg, sha:shas.get(path)}; if(branch) body.branch=branch;
    const r=await req('DELETE',path,body);
    if(r.ok || r.status===404){ shas.set(path,null); return true; }
    return false;
  }
  /* fila única: um envio por vez (evita conflito no histórico); vários salvamentos do mesmo arquivo viram um só */
  let chain=Promise.resolve(), inflight=0;
  const pending=new Map();
  function enqueue(key,fn){
    if(key && pending.has(key)){ const p=pending.get(key); p.fn=fn; return p.promise; }
    let resolve; const promise=new Promise(r=>resolve=r);
    const job={fn,promise}; if(key) pending.set(key,job);
    inflight++;
    chain=chain.then(async()=>{
      if(key) pending.delete(key);
      try{ resolve(await job.fn()); }catch(e){ console.error(e); resolve(false); }
      finally{ inflight--; }
    });
    return promise;
  }
  const enc=new TextEncoder(), dec=new TextDecoder();
  const label=k=> k==='ws' ? 'lista de arquivos' : k.replace(':',' ');
  return {
    async get(k){
      const bytes=await readBytes(pathOf(k));
      if(bytes===undefined) return undefined;
      if(/^pdf:/.test(k)) return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength);
      return JSON.parse(dec.decode(bytes));
    },
    set(k,v){
      const path=pathOf(k);
      return enqueue(path, async()=>{
        if(k==='ws' && v && Array.isArray(v.items)){
          // outro aparelho pode ter criado itens: junta as listas (respeitando o que foi excluído)
          try{
            const cur=await readBytes(path);
            if(cur){
              const remote=JSON.parse(dec.decode(cur));
              if(remote && Array.isArray(remote.items)){
                const dead=new Set([...(remote.deletedIds||[]),...(v.deletedIds||[])]);
                const ids=new Set(v.items.map(i=>i.id));
                remote.items.forEach(it=>{ if(it && !ids.has(it.id) && !dead.has(it.id)) v.items.push(it); });
                v.items=v.items.filter(i=>!dead.has(i.id));
                v.deletedIds=[...dead].slice(-500);
              }
            }
          }catch(e){ if(e.auth) throw e; }
        }
        const bytes = v instanceof ArrayBuffer ? new Uint8Array(v) : enc.encode(JSON.stringify(v));
        return putBytes(path,bytes,'Salva '+label(k));
      });
    },
    /* lê a versão do repositório, grava a mescla e devolve o resultado (null se não conseguiu) */
    setMesclando(k,v,mesclar){
      const path=pathOf(k);
      return enqueue(path, async()=>{
        for(let tentativa=0; tentativa<3; tentativa++){
          const cur=await readBytes(path);
          const curTxt=cur ? dec.decode(cur) : null;
          const final=mesclar(v, curTxt ? JSON.parse(curTxt) : null);
          if(curTxt!==null && JSON.stringify(final)===curTxt) return final;   // nada novo: não cria commit à toa
          if(await putBytes(path, enc.encode(JSON.stringify(final)), 'Salva '+label(k), false)) return final;
          shas.delete(path);   // alguém gravou antes: relê e mescla de novo
        }
        return null;
      });
    },
    del(k){
      const path=pathOf(k);
      return enqueue(null, async()=>{
        // vai para a lixeira/ e só então sai do lugar original
        const bytes=await readBytes(path).catch(()=>undefined);
        if(bytes!==undefined){
          const stamp=new Date().toISOString().replace(/[:.]/g,'-');
          await putBytes('lixeira/'+stamp+'__'+path.replace('/','_'),bytes,'Lixeira: '+label(k));
          await deletePath(path,'Exclui '+label(k));
        }
        return true;
      });
    },
    setText(id,title,text){
      if(!ID.test(id)) return Promise.resolve(false);
      return enqueue('texto:'+id, async()=>{
        const safe=String(title||'').replace(/[\\/:*?"<>|\u0000-\u001f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,90)||'Sem título';
        const name='texto/'+safe+' ('+id+').md';
        const files=await listDir('texto');
        for(const f of files){ if(f.name.endsWith(' ('+id+').md') && f.path!==name){ shas.set(f.path,f.sha); await deletePath(f.path,'Renomeia texto de '+id); } }
        const f=files.find(x=>x.path===name); if(f) shas.set(name,f.sha);
        return putBytes(name,enc.encode(String(text)),'Texto de '+safe);
      });
    },
    async textIds(){
      const files=await listDir('texto').catch(()=>[]);
      return files.map(f=>(/ \(([A-Za-z0-9_-]+)\)\.md$/.exec(f.name)||[])[1]).filter(Boolean);
    },
    busy(){ return inflight>0; },
    cfg
  };
}

/* ---------- Janela "Conectar ao GitHub" ---------- */
function githubSetupDialog(){
  return new Promise(resolve=>{
    const d=document.createElement('div'); d.className='modal'; d.id='ghSetup';
    d.innerHTML=`<div class="modal-box gh-box">
      <div class="modal-head"><b>☁️ Guardar seus mapas no GitHub</b></div>
      <div class="modal-sub">Os mapas ficam no seu repositório <b>privado</b> e aparecem iguais em qualquer aparelho. Em cada aparelho novo, cole a chave uma única vez.</div>
      <div class="gh-form">
        <label>Repositório <input id="ghRepo" autocomplete="off" spellcheck="false"></label>
        <label>Chave de acesso (token) <input id="ghToken" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_…"></label>
        <details class="gh-help"><summary>Como criar a chave (2 minutos)</summary>
          <ol>
            <li>Abra <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">github.com/settings/personal-access-tokens/new</a></li>
            <li><b>Token name</b>: Mapa Mental · <b>Expiration</b>: a validade que preferir</li>
            <li><b>Repository access</b>: <i>Only select repositories</i> → escolha <b>mapa-mental-dados</b></li>
            <li><b>Permissions</b> → <b>Repository permissions</b> → <b>Contents</b>: <i>Read and write</i></li>
            <li>Clique em <b>Generate token</b>, copie e cole aqui.</li>
          </ol>
          A chave fica guardada só neste navegador e dá acesso apenas a esse repositório.
        </details>
        <div class="gh-msg" id="ghMsg"></div>
        <div class="row"><button class="btn-s" id="ghLocal">Usar só neste navegador</button><button class="btn-s primary" id="ghOk">Conectar</button></div>
      </div></div>`;
    document.body.appendChild(d);
    const repo=d.querySelector('#ghRepo'), tok=d.querySelector('#ghToken'), msg=d.querySelector('#ghMsg');
    repo.value=GH_DEFAULT_REPO; setTimeout(()=>tok.focus(),50);
    d.querySelector('#ghLocal').onclick=()=>{ sessionStorage.setItem('mm-local-only','1'); d.remove(); resolve(null); };
    const go=async()=>{
      const [owner,name]=repo.value.trim().replace(/^https?:\/\/github\.com\//i,'').replace(/\.git$/,'').split('/');
      const token=tok.value.trim();
      if(!owner || !name || !token){ msg.textContent='Preencha o repositório (dono/nome) e a chave.'; return; }
      msg.textContent='Verificando…'; msg.className='gh-msg';
      try{
        const api=ghApiBase();
        const r=await fetch(api+'/repos/'+encodeURIComponent(owner)+'/'+encodeURIComponent(name),{headers:{'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json'},cache:'no-store'});
        if(r.status===401){ msg.textContent='Chave inválida ou vencida.'; msg.className='gh-msg err'; return; }
        if(r.status===404){ msg.textContent='Repositório não encontrado (ou a chave não tem acesso a ele).'; msg.className='gh-msg err'; return; }
        if(!r.ok){ msg.textContent='O GitHub respondeu '+r.status+'. Tente de novo.'; msg.className='gh-msg err'; return; }
        const j=await r.json();
        if(j.permissions && j.permissions.push===false){ msg.textContent='A chave só permite leitura. Marque Contents: Read and write.'; msg.className='gh-msg err'; return; }
        const cfg={owner,repo:name,token};
        localStorage.setItem(GH_CFG_KEY,JSON.stringify(cfg));
        d.remove(); resolve(cfg);
      }catch(e){ msg.textContent='Sem conexão com o GitHub. Verifique a internet.'; msg.className='gh-msg err'; }
    };
    d.querySelector('#ghOk').onclick=go;
    tok.addEventListener('keydown',e=>{ if(e.key==='Enter') go(); });
  });
}
function githubDisconnect(){ localStorage.removeItem(GH_CFG_KEY); sessionStorage.removeItem('mm-local-only'); location.reload(); }

function LocalStore(){
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
    },
    async keys(){ try{ return await req('readonly',st=>st.getAllKeys()); }catch(e){ return []; } }
  };
}

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
function savedStatus(ok){ const t=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); const where={github:' no GitHub',server:'',local:' (só neste navegador)'}[Store.mode]||''; setStatus(ok?('Salvo'+where+' ✓ '+t):({github:'⚠ Não salvou no GitHub — verifique a internet',server:'⚠ Servidor fora do ar — não salvou'}[Store.mode]||'⚠ Falha ao salvar')); }

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

/* ---------- Tema claro / escuro ---------- */
function currentTheme(){ return document.documentElement.dataset.theme==='dark'?'dark':'light'; }
function applyTheme(t){
  document.documentElement.dataset.theme=t;
  const b=document.getElementById('themeBtn');
  if(b){ b.title = t==='dark' ? 'Usar tema claro' : 'Usar tema escuro'; b.innerHTML = t==='dark'
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/></svg>'; }
}
document.getElementById('themeBtn').addEventListener('click',()=>{
  const t=currentTheme()==='dark'?'light':'dark';
  try{ localStorage.setItem('mm-theme',t); }catch(e){}
  applyTheme(t);
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',e=>{ let s=null; try{ s=localStorage.getItem('mm-theme'); }catch(err){} if(!s) applyTheme(e.matches?'dark':'light'); });
applyTheme(currentTheme());
