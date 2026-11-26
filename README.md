# Mapa Mental

Aplicativo de mapa mental **100% offline**, em um único arquivo HTML. Sem login, sem servidor, sem mensalidade — abre direto no navegador e salva sozinho no seu computador.

🌐 **Acesse:** https://flips794.github.io/mapa-mental/

## ✨ Funcionalidades

- 🧠 Tópico central com ramos dos dois lados, cada ramo com sua cor e conectores curvos
- 🖱️ Canvas livre: arraste o fundo (ou use a roda do mouse) para mover o mapa; `Ctrl + roda` para zoom; botão de ajustar à tela
- ✋ Arraste e solte tópicos para reorganizar (soltar sobre um tópico vira filho; acima/abaixo vira irmão)
- ✍️ Painel de edição à direita com **negrito**, *itálico*, sublinhado, tachado, listas e links — selecione um tópico e comece a digitar
- 📝 Anotações longas (com formatação) em cada tópico
- 🔽 Recolher / expandir ramos (mostra quantos itens ficam escondidos)
- ↩️ Desfazer / refazer (`Ctrl+Z` / `Ctrl+Shift+Z`)
- 🖼️ Anexar imagens e 📎 documentos
- 🔍 Busca nos tópicos e anotações (`Enter` vai para o próximo resultado)
- 💾 Salvamento automático no navegador (IndexedDB, com fallback para localStorage)
- ⬇️ Exportar / ⬆️ Importar backup em `.json` (aceita também backups da versão antiga)

## ⌨️ Atalhos

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

## 🛠️ Tecnologia

HTML, CSS e JavaScript puro (vanilla), sem dependências externas. Tudo roda no navegador do usuário — nada é enviado para a internet.

## 📄 Licença

Projeto pessoal. Use e modifique à vontade.
