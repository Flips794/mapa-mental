# Mapa Mental

Mapas mentais e documentos **100% no navegador**. Sem login, sem servidor, sem mensalidade: tudo fica salvo no seu computador.

🌐 **Acesse:** https://flips794.github.io/mapa-mental/

## ✨ Funcionalidades

### 🧠 Mapas mentais
- Vários mapas, listados na barra lateral esquerda (criar, renomear, duplicar, excluir)
- Tópico central com ramos dos dois lados, cada ramo com sua cor
- Canvas livre: arraste o fundo (ou use a roda do mouse) para mover; `Ctrl + roda` para zoom
- Arraste e solte tópicos para reorganizar; desfazer / refazer
- Painel de edição à direita com **negrito**, *itálico*, sublinhado, tachado, listas e links
- **Link para página de documento**: no painel, use *📄 Vincular*, escolha o documento e a página. No mapa aparece um selo curto (`📄 p.3`); um clique abre o documento direto nessa página
- Anotações, imagens e arquivos anexos; busca; exportar / importar `.json`

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
js/app.js           barra lateral, modos e inicialização
vendor/pdfjs/       PDF.js 3.11.174 (Mozilla, Apache 2.0) para ler PDFs
```

Funciona também abrindo o `index.html` direto do disco (duplo clique).

## 🛠️ Tecnologia

HTML, CSS e JavaScript puro. A única biblioteca é o [PDF.js](https://mozilla.github.io/pdf.js/), incluída no projeto. Nada é enviado para a internet: mapas, documentos e PDFs ficam no IndexedDB do navegador.

## 📄 Licença

Projeto pessoal. Use e modifique à vontade. O PDF.js segue a licença Apache 2.0 (`vendor/pdfjs/LICENSE`).
