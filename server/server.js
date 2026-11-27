#!/usr/bin/env node
/* =========================================================
   Mapa Mental — servidor local (armazenamento único)

   Serve o aplicativo e guarda tudo em arquivos na pasta dados/:
     dados/ws.json               lista de mapas e documentos
     dados/mapas/<id>.json       cada mapa (com anexos)
     dados/documentos/<id>.json  cada documento
     dados/pdfs/<id>.pdf         PDFs originais
     dados/texto/<título> (<id>).md   cópia legível de cada mapa

   Uso: node server/server.js      (porta 4580; PORT=... para mudar)
   Sem dependências externas.
   ========================================================= */
'use strict';
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.resolve(process.env.MAPA_DADOS || path.join(ROOT, 'dados'));
const PORT = Number(process.env.PORT) || 4580;
const HOST = process.env.HOST || '127.0.0.1';          // só este computador
const MAX_BODY = 300 * 1024 * 1024;                     // 300 MB (PDFs grandes)
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const STATIC_ROOTS = new Set(['index.html', 'css', 'js', 'vendor', 'README.md']);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.pfb': 'application/octet-stream',
};

/* nomes aceitos no cabeçalho Host (protege contra DNS rebinding) */
const okHosts = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`]);
if (process.env.EXTRA_HOSTS) process.env.EXTRA_HOSTS.split(',').forEach(h => okHosts.add(h.trim()));

function keyPath(key) {
  if (key === 'ws') return { file: path.join(DATA, 'ws.json'), bin: false };
  const e = /^est:([a-z]+)(?:-(\d{4}-\d{2}))?$/.exec(key);
  if (e) return { file: e[2] ? path.join(DATA, 'estudos', e[1], e[2] + '.json') : path.join(DATA, 'estudos', e[1] + '.json'), bin: false };
  const m = /^(map|doc|pdf):(.+)$/.exec(key);
  if (m && ID.test(m[2])) {
    const dir = { map: 'mapas', doc: 'documentos', pdf: 'pdfs' }[m[1]];
    return { file: path.join(DATA, dir, m[2] + (m[1] === 'pdf' ? '.pdf' : '.json')), bin: m[1] === 'pdf', kind: m[1], id: m[2] };
  }
  if (ID.test(key)) return { file: path.join(DATA, 'outros', key + '.json'), bin: false };
  return null;
}

async function writeAtomic(file, buf) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await fsp.writeFile(tmp, buf);
  await fsp.rename(tmp, file);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => {
      n += c.length;
      if (n > MAX_BODY) { reject(Object.assign(new Error('Arquivo grande demais'), { status: 413 })); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res, status, body, type) {
  res.writeHead(status, {
    'Content-Type': type || 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj));

/* ---------- cópia legível (.md) ---------- */
const TEXT_DIR = path.join(DATA, 'texto');
function safeTitle(t) {
  return String(t || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'Sem título';
}
async function removeMirrors(id) {
  let names = [];
  try { names = await fsp.readdir(TEXT_DIR); } catch (e) { return; }
  await Promise.all(names.filter(n => n.endsWith(` (${id}).md`)).map(n => fsp.unlink(path.join(TEXT_DIR, n)).catch(() => {})));
}
async function writeMirror(id, title, text) {
  const file = path.join(TEXT_DIR, `${safeTitle(title)} (${id}).md`);
  let names = [];
  try { names = await fsp.readdir(TEXT_DIR); } catch (e) {}
  await Promise.all(names.filter(n => n.endsWith(` (${id}).md`) && path.join(TEXT_DIR, n) !== file)
    .map(n => fsp.unlink(path.join(TEXT_DIR, n)).catch(() => {})));
  await writeAtomic(file, Buffer.from(String(text), 'utf8'));
}

/* ---------- API ---------- */
async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const method = req.method;
  const mutating = method === 'PUT' || method === 'DELETE' || method === 'POST';
  // pedidos que alteram dados exigem este cabeçalho (outros sites não conseguem enviá-lo)
  if (mutating && req.headers['x-mapa-mental'] !== '1') return json(res, 403, { erro: 'cabeçalho ausente' });

  if (parts[1] === 'health' && method === 'GET') return json(res, 200, { app: 'mapa-mental', ok: true, dados: DATA });

  if (parts[1] === 'kv' && parts[2]) {
    const key = decodeURIComponent(parts[2]);
    const kp = keyPath(key);
    if (!kp) return json(res, 400, { erro: 'chave inválida' });
    if (method === 'GET') {
      try {
        const buf = await fsp.readFile(kp.file);
        return send(res, 200, buf, kp.bin ? 'application/pdf' : 'application/json; charset=utf-8');
      } catch (e) {
        if (e.code === 'ENOENT') return json(res, 404, { erro: 'não encontrado' });
        throw e;
      }
    }
    if (method === 'PUT') {
      let body = await readBody(req);
      if (!kp.bin) {
        let obj;
        try { obj = JSON.parse(body.toString('utf8')); } catch (e) { return json(res, 400, { erro: 'JSON inválido' }); }
        // índice: nunca perde itens de outro navegador que ainda existem em disco
        if (key === 'ws' && obj && Array.isArray(obj.items)) {
          try {
            const cur = JSON.parse(await fsp.readFile(kp.file, 'utf8'));
            if (cur && Array.isArray(cur.items)) {
              const ids = new Set(obj.items.map(i => i && i.id));
              for (const it of cur.items) {
                if (!it || ids.has(it.id)) continue;
                const p = keyPath(`${it.type}:${it.id}`);
                if (p && fs.existsSync(p.file)) obj.items.push(it);
              }
            }
          } catch (e) { /* primeiro salvamento */ }
          body = Buffer.from(JSON.stringify(obj));
        }
      }
      await writeAtomic(kp.file, body);
      return json(res, 200, { ok: true });
    }
    if (method === 'DELETE') {
      // nada é apagado de verdade: vai para dados/lixeira/ (dá para recuperar)
      const trash = path.join(DATA, 'lixeira');
      await fsp.mkdir(trash, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await fsp.rename(kp.file, path.join(trash, `${stamp}__${key.replace(':', '_')}${path.extname(kp.file)}`))
        .catch(e => { if (e.code !== 'ENOENT') throw e; });
      if (kp.kind === 'map') await removeMirrors(kp.id);
      return json(res, 200, { ok: true });
    }
  }

  if (parts[1] === 'md') {
    if (method === 'GET' && !parts[2]) {
      let names = [];
      try { names = await fsp.readdir(TEXT_DIR); } catch (e) {}
      const ids = names.map(n => (/ \(([A-Za-z0-9_-]+)\)\.md$/.exec(n) || [])[1]).filter(Boolean);
      return json(res, 200, { ids });
    }
    if (method === 'PUT' && parts[2]) {
      const id = decodeURIComponent(parts[2]);
      if (!ID.test(id)) return json(res, 400, { erro: 'id inválido' });
      let obj;
      try { obj = JSON.parse((await readBody(req)).toString('utf8')); } catch (e) { return json(res, 400, { erro: 'JSON inválido' }); }
      await writeMirror(id, obj.title, obj.text || '');
      return json(res, 200, { ok: true });
    }
  }
  return json(res, 404, { erro: 'rota desconhecida' });
}

/* ---------- arquivos do aplicativo ---------- */
async function handleStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Método não permitido', 'text/plain; charset=utf-8');
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  const norm = path.posix.normalize(rel);
  const first = norm.split('/')[0];
  if (norm.startsWith('..') || norm.split('/').some(s => s.startsWith('.')) || !STATIC_ROOTS.has(first)) {
    return send(res, 404, 'Não encontrado', 'text/plain; charset=utf-8');
  }
  const file = path.join(ROOT, norm);
  if (!file.startsWith(ROOT + path.sep)) return send(res, 404, 'Não encontrado', 'text/plain; charset=utf-8');
  try {
    const st = await fsp.stat(file);
    if (!st.isFile()) return send(res, 404, 'Não encontrado', 'text/plain; charset=utf-8');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    send(res, 404, 'Não encontrado', 'text/plain; charset=utf-8');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (!okHosts.has(req.headers.host || '')) return send(res, 403, 'Host não permitido', 'text/plain; charset=utf-8');
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else await handleStatic(req, res, url);
  } catch (e) {
    console.error(new Date().toISOString(), req.method, req.url, e);
    if (!res.headersSent) json(res, e.status || 500, { erro: e.status ? e.message : 'erro interno' });
    else res.end();
  }
});

fs.mkdirSync(DATA, { recursive: true });
server.listen(PORT, HOST, () => {
  console.log(`Mapa Mental rodando em http://localhost:${PORT}  (dados em ${DATA})`);
});
