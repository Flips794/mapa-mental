# Mapa Mental

Mapas mentais e documentos **100% no navegador**. Sem login, sem servidor, sem mensalidade: tudo fica salvo no seu computador.

🏠 **Seu endereço:** http://localhost:4580 — servidor neste computador; os dados ficam na pasta `dados/` e são os mesmos em qualquer navegador.
🌐 **Demonstração online:** https://flips794.github.io/mapa-mental/ (lá os dados ficam só no navegador).

## 🖥️ Servidor local (armazenamento único)

```bash
bash server/instalar-servico.sh     # instala e liga (inicia sozinho ao entrar no computador)
systemctl --user status mapa-mental # ver se está rodando
journalctl --user -u mapa-mental    # ver o registro
systemctl --user disable --now mapa-mental   # desligar
```

Sem instalar: `node server/server.js` e abra http://localhost:4580.

| Pasta | Conteúdo |
|---|---|
| `dados/ws.json` | lista de mapas e documentos |
| `dados/mapas/` | cada mapa (com anexos) |
| `dados/documentos/`, `dados/pdfs/` | documentos e PDFs originais |
| `dados/lixeira/` | o que foi excluído pelo app (nada é apagado de verdade; para recuperar, mova o arquivo de volta) |
| `dados/texto/` | cópia legível `.md` de cada mapa (atualizada a cada salvamento; editar ali não altera o mapa) |

Faça backup copiando a pasta `dados/`, ou pelo app: **Exportar → Tudo**. Para trazer dados de outro navegador: abra o app nele, **Exportar → Tudo**, e depois **Importar** esse arquivo em http://localhost:4580.

O servidor só aceita conexões deste computador.

## ✨ Funcionalidades

### 📝 O mapa é um texto simples
O conteúdo de cada mapa é um texto leve (estilo Markdown), visível na aba **📝 Texto** do painel direito. O desenho do mapa é só a apresentação desse texto: edite o texto e o mapa se atualiza; mexa no mapa e o texto acompanha. Clicar em um tópico destaca a linha dele no texto, e colocar o cursor numa linha seleciona o tópico.

```markdown
# Tópico central
> anotação do tópico central
- Tópico principal {verde, direita}
  - Sub-tópico
    > anotação do sub-tópico
  - Sub-tópico com link para documento [[Contrato#3]]
- Outro tópico principal {azul, esquerda}
  - Ramo fechado {recolhido}
```

| Escrita | Significado |
|---|---|
| `# texto` | tópico central de uma árvore (cada `#` começa uma árvore nova no mesmo mapa) |
| `- texto` | tópico; **2 espaços** de recuo = um nível abaixo (`Tab` / `Shift+Tab`) |
| `> texto` | anotação do tópico logo acima |
| `{cor, lado, recolhido}` | opcional: azul, vermelho, verde, roxo, laranja, turquesa, rosa, amarelo, anil, celeste, cinza · esquerda/direita · recolhido |
| `[[Documento#N]]` | link para a página N de um documento |
| `**negrito**` `*itálico*` `~~tachado~~` `[texto](https://…)` | formatação |

Também são aceitos títulos `##`, listas numeradas e recuo com tab — o que facilita colar textos vindos de outras ferramentas.

### 🤖 Com Claude ou ChatGPT
Botão **🤖 IA** (aba Texto): escreva o que quer ("crie um mapa sobre…", "expanda o ramo X"), clique em **Copiar prompt** e cole no Claude ou no ChatGPT. Depois cole a resposta na mesma janela e escolha **Aplicar neste mapa** ou **Criar como novo mapa**. Sem chave de API e sem custo; o bloco do mapa é encontrado automaticamente na resposta. `Ctrl+Z` desfaz.

Exportar → **Texto (.md)** gera um arquivo que qualquer IA ou editor lê; Importar aceita `.md`, `.txt` e `.json`.

### 🌙 Tema claro e escuro
Botão de lua/sol no topo. Na primeira visita segue o tema do sistema.

### 🧠 Mapas mentais
- Vários mapas, listados na barra lateral esquerda (criar, renomear, duplicar, excluir). O **nome do mapa** é independente do texto dos tópicos centrais das árvores
- **Várias árvores no mesmo mapa** (como no Whimsical): botão **＋ Árvore** na barra de zoom; arraste o tópico central para mover a árvore inteira; arraste um tópico para outra árvore, ou solte-o no vazio para virar uma árvore nova
- Tópico central com ramos dos dois lados, cada ramo com sua cor
- Canvas livre: arraste o fundo (ou use a roda do mouse) para mover; `Ctrl + roda` para zoom
- Arraste e solte tópicos para reorganizar; desfazer / refazer
- **Recolher tudo / Expandir tudo** (barra de zoom, canto inferior): recolher deixa só o tópico central e os ramos principais, cada um mostrando quantos tópicos esconde
- Painel de edição à direita com **negrito**, *itálico*, sublinhado, tachado, listas e links
- **Link para página de documento**: no painel, use *📄 Vincular*, escolha o documento e a página. No mapa aparece um selo curto (`📄 p.3`); um clique abre o documento direto nessa página
- Anotações, imagens e arquivos anexos; busca; backup completo em `.json` (inclui anexos)

### 📄 Documentos
- Documentos em páginas A4, com escrita como no Word: títulos, tamanho e cor da fonte, marca-texto, alinhamento, listas e links
- Quando o texto enche a página, ele continua automaticamente na próxima
- **Abrir PDF**: as páginas aparecem como no original; dê **duplo clique** (ou use *Caixa de texto*) para escrever por cima
- Inserir páginas em branco entre as páginas do PDF, mover e excluir páginas
- **Exportar PDF**: gera o documento final (páginas do PDF + o que você escreveu + páginas novas)

## ⌨️ Atalhos do mapa

| Tecla | Ação |
|---|---|
| `Tab` | Novo sub-tópico |
| `Enter` | Novo tópico irmão |
| Digitar | Edita o texto no painel |
| `F2` / duplo clique | Editar direto no mapa |
| Setas | Navegar entre tópicos |
| `Espaço` | Recolher / expandir |
| `Delete` | Excluir tópico |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+U` | Negrito / itálico / sublinhado |
| `Ctrl+K` | Inserir link |
| `Ctrl+0` | Ajustar à tela |

## 🗂️ Estrutura

```
index.html          página principal
css/app.css         estilos
js/util.js          armazenamento, HTML seguro, utilidades
js/map.js           editor de mapa mental
js/docs.js          editor de documentos / PDF
js/outline.js       formato de texto do mapa, painel Texto e IA
js/app.js           barra lateral, modos e inicialização
server/server.js    servidor local (Node, sem dependências) + instalar-servico.sh
vendor/pdfjs/       PDF.js 3.11.174 (Mozilla, Apache 2.0) para ler PDFs
```

Funciona também abrindo o `index.html` direto do disco (duplo clique).

## 🛠️ Tecnologia

HTML, CSS e JavaScript puro. A única biblioteca é o [PDF.js](https://mozilla.github.io/pdf.js/), incluída no projeto. Nada é enviado para a internet: mapas, documentos e PDFs ficam no IndexedDB do navegador.

## 📄 Licença

Projeto pessoal. Use e modifique à vontade. O PDF.js segue a licença Apache 2.0 (`vendor/pdfjs/LICENSE`).
