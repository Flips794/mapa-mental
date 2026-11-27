# Calendário de Estudos (4 etapas) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Área "Estudos" no Mapa Mental com registro, cronômetro, revisões adaptativas (domínio × retenção), planejamento semanal, banco de erros, simulados (incl. Cebraspe) e painel de desempenho, persistida no repositório privado do GitHub.

**Architecture:** Toda regra fica em funções puras em `js/estudos-core.js` (sem DOM; carregável no navegador e no Node para testes). `js/estudos-dados.js` cuida de carregar/salvar coleções pela camada `Store` com mescla entre aparelhos e diário local para recuperação de falhas. `js/estudos.js` desenha as telas. O resto do app só ganha o modo `est` e o backup.

**Tech Stack:** HTML/CSS/JS puro, sem dependências; testes com `node --test` (Node 26).

**Spec:** `docs/superpowers/specs/2026-11-27-calendario-estudos-design.md`

## Global Constraints

- Sem novas dependências; sem mudanças visuais/arquiteturais nas áreas Mapas e Documentos além do necessário.
- Textos em português do Brasil; usar as variáveis de tema existentes (`--panel`, `--ink`, `--muted`, `--line`, `--surface`, `--ring`, `--accent-bg`, `--danger`…).
- Parâmetros iniciais (seção 7 do spec), todos editáveis em Ajustes: escada `[1,7,15,30,60]` + `120` para consolidado; fator difícil `0,7`; limiares `0,85` / `0,60`; domínio consolidado `85`; domínio para esquecimento `75`; dificuldade recorrente `3` revisões; evidência mínima `20` questões e `2` sessões avaliadas; retenção mínima `2` revisões; meia-vida `60` dias; categorias Excelente ≥90, Bom ≥75, Regular ≥60, Crítico <60; pesos questões `2×min(1,n/10)`, explicação `2`, percebida `1`; percebida fácil/ok/difícil = `0,9/0,7/0,4`; nota manual completo/faltou pouco/faltou muito = `1/0,7/0,4`; domínio = `0,6×questões + 0,4×explicação`, ajuste percebida difícil `−5`, fácil `+2`; alerta do cronômetro `6 h`.
- Datas de sessão em `AAAA-MM-DD` no fuso local; horários em ISO.
- Todo registro de coleção tem `id`, `criadoEm`, `atualizadoEm`, opcional `excluida`/`excluidaEm` e `versoes`; nada é apagado de verdade.
- Nenhum dado fictício nos registros reais; testes usam dados em memória; teste de navegador só no ramo `teste` do repositório de dados (apagado ao fim).

## Review Focus

- Mesma sessão salva duas vezes (duplo clique, recarregar, dois aparelhos) → contada uma vez. Teste em Task 2 (`salvarRegistro` idempotente) e Task 6 (salvar duas vezes / mescla).
- Gravação no GitHub falhando (sem internet) e aba fechada → registro não se perde e sobe na próxima abertura. Teste em Task 6 (store falhando + diário local).
- Sessão de mês anterior editada para outra data → sai do arquivo do mês antigo e entra no novo, sem duplicar. Teste em Task 6.
- Cronômetro aberto ao virar a meia-noite / recarregar no meio → duração correta e data = dia do início. Teste em Task 1.
- Simulado com acertos+erros+brancos ≠ questões, ou nota Cebraspe negativa → validação clara; nota negativa é permitida (como na banca). Teste em Task 5.

---

### Task 1: Núcleo — datas, durações e cronômetro

**Files:**
- Create: `js/estudos-core.js` (esqueleto UMD: `(function(root){ … const api={…}; if(typeof module!=='undefined'&&module.exports) module.exports=api; else root.EstCore=api; })(typeof self!=='undefined'?self:this);`)
- Test: `tests/estudos-core.test.js`

**Interfaces:**
- Produces: `AJUSTES_PADRAO` (objeto com todos os valores da seção Global Constraints), `hoje(date?)→'AAAA-MM-DD'`, `addDias(data,n)→data`, `diffDias(a,b)→int` (b−a), `mesDe(data)→'AAAA-MM'`, `inicioSemana(data)→data` (segunda-feira), `parseDuracao(texto)→minutos|null`, `cronoIniciar(agoraMs)→crono`, `cronoAplicar(crono,tipo,agoraMs)→crono` (tipos `pausa|retomada|fim`; transição inválida lança `Error`), `cronoEstado(crono)→'parado'|'rodando'|'pausado'|'finalizado'`, `cronoDuracaoMs(crono,agoraMs)→int`, `cronoDataInicio(crono)→data`. Crono = `{eventos:[{t:'inicio'|'pausa'|'retomada'|'fim', em:ISO}]}`.

- [ ] **Step 1: Testes** — `parseDuracao`: `"1h30"→90`, `"1:30"→90`, `"45min"→45`, `"45"→45`, `"2h"→120`, `""→null`, `"abc"→null`. Cronômetro: início 10:00, pausa 10:20, retomada 10:30, fim 11:00 → 50 min e `finalizado`; rodando sem fim conta até `agoraMs`; início 23:50 + fim 00:20 → 30 min e `cronoDataInicio` = dia do início; `cronoAplicar` de `pausa` em crono pausado lança erro; serializar/desserializar (JSON) no meio e continuar dá o mesmo total. Datas: `addDias('2026-11-27',5)='2026-12-02'`, `diffDias('2026-11-27','2026-12-02')=5`, `inicioSemana('2026-11-27')='2026-11-23'`.
- [ ] **Step 2:** `node --test tests/` → FAIL (módulo vazio).
- [ ] **Step 3:** Implementar as funções acima (datas pelo construtor local `new Date(a,m,d)`, nunca `toISOString` para data).
- [ ] **Step 4:** `node --test tests/` → PASS.
- [ ] **Step 5:** Commit `feat(estudos): núcleo de datas, durações e cronômetro`.

### Task 2: Núcleo — coleções com histórico e mescla

**Files:** Modify `js/estudos-core.js`; Test `tests/estudos-core.test.js`

**Interfaces:**
- Produces: `colecao()→{versao:1,registros:{}}`, `salvarRegistro(col,reg,agoraISO)→col` (novo objeto; mantém `criadoEm`; se já existia e mudou, guarda a versão anterior sem `versoes` em `versoes[]` com `em`; se idêntico, não muda nada), `excluirRegistro(col,id,agoraISO)→col` (marca `excluida:true`, `excluidaEm`), `registrosAtivos(col)→array`, `mesclarColecoes(a,b)→col`.

- [ ] **Step 1: Testes** — salvar o mesmo registro 2× → 1 registro, `versoes` vazio; editar → `versoes.length===1` com o valor antigo; excluir → não aparece em `registrosAtivos`, continua em `registros`; mescla: ids só em A ou só em B entram; mesmo id → vence `atualizadoEm` maior; se qualquer lado está excluído, resultado excluído (mesmo que o outro seja mais novo); `versoes` unidas sem repetir `em`; mescla é comutativa no resultado.
- [ ] **Step 2:** rodar → FAIL. **Step 3:** implementar. **Step 4:** rodar → PASS. **Step 5:** commit `feat(estudos): coleções com histórico e mescla`.

### Task 3: Núcleo — evidências, domínio e retenção

**Files:** Modify `js/estudos-core.js`; Test `tests/estudos-core.test.js`

**Interfaces:**
- Consumes: `AJUSTES_PADRAO`, `diffDias`.
- Produces: `resultadoSessao(sessao,aj)→number|null` (seção 7.1), `categoria(valor,aj)→'excelente'|'bom'|'regular'|'critico'`, `dominio(sessoes,aj,refData)→{valor:number|null,categoria:string|null,suficiente:boolean,questoes:int,avaliadas:int}`, `retencao(sessoes,aj,refData)→{valor,categoria,suficiente,revisoes:int,maiorIntervaloBom:int|null}`. Sessão = `{id,itemId,data,tipo:'estudo'|'revisao'|'retomada',questoes?:{feitas,acertos},explicacao?:{texto,marcados[],total,nota},percebida?,metodos[],minutos?,excluida?}`. Sessões excluídas são ignoradas.

- [ ] **Step 1: Testes** — `resultadoSessao`: só questões 8/10 → 0,8; questões 2/2 + explicação 0,5 → peso das questões 2×0,2=0,4 (resultado `(0,4·1+2·0,5)/2,4`); só percebida difícil → 0,4; nada → `null`; checklist 3/4 → 0,75; nota "pouco" → 0,7. `dominio`: 10 questões em 2 sessões → `suficiente:false`, categoria `null`; 30 questões 27 acertos em 3 sessões → Excelente; percebida difícil recente reduz 5 pontos; sessão antiga (240 dias) pesa ~1/16 de uma recente. `retencao`: só sessões `revisao` contam; 1 revisão → `suficiente:false`; revisões com s 0,9 após 15 dias e 0,5 após 30 → `maiorIntervaloBom=15`; domínio e retenção calculados das mesmas sessões dão números diferentes quando estudo vai bem e revisões vão mal.
- [ ] **Step 2–5:** FAIL → implementar → PASS → commit `feat(estudos): domínio e retenção separados`.

### Task 4: Núcleo — escada, diagnóstico, estado e agenda

**Files:** Modify `js/estudos-core.js`; Test `tests/estudos-core.test.js`

**Interfaces:**
- Consumes: Task 1 e Task 3.
- Produces: `escadaDo(item,aj)→int[]` (difícil: `round(d×0,7)` mínimo 1, mantendo 1 no primeiro degrau), `calcularEstado(item,sessoes,aj,hojeStr)→{status:'novo'|'ativo'|'retomada'|'sem-revisao',degrau:int,intervalo:int|null,ultima:data|null,proxima:data|null,atrasoDias:int,diagnostico:string|null,baixasSeguidas:int,revisoes:int,dominio,retencao}`, `agenda(itens,sessoesPorItem:Map,aj,hojeStr)→{atrasadas:[{item,estado}],hoje:[…],retomar:[…],proximos7:int}`. Diagnósticos: `'consolidado'|'progresso'|'estavel'|'esquecimento'|'compreensao'|'recorrente'`.

Algoritmo (repassa as sessões ativas em ordem `data`, depois `criadoEm`): primeira sessão → degrau 0; sessão `retomada` → degrau 0, `baixasSeguidas=0`, status `ativo`; sessão `revisao`/`estudo` posterior com `s`: domínio **antes** da sessão; tabela da seção 7.4; `s===null` mantém degrau e não conta retenção; ao atingir `recorrenteN` baixas seguidas → status `retomada`, `proxima=null`; degrau máximo = último da escada, e o extra (120) só por `consolidado`; `proxima = data da última sessão + escada[degrau]`; `semRevisao` → status `sem-revisao`.

- [ ] **Step 1: Testes** — um teste por linha da tabela 7.4 (consolidado sobe 2 até 120; progresso sobe 1; progresso com percebida difícil mantém; estável repete; esquecimento desce 1; compreensão volta a 0; 3 baixas seguidas → `retomada` e sai da agenda de revisões, entra em `retomar`); sessão `retomada` recomeça em 1 dia e mantém histórico (domínio ainda considera sessões antigas); item difícil usa `[1,5,10,21,42]`; revisão adiantada conta da data da sessão; atrasada aparece em `atrasadas` com `atrasoDias`; recálculo: estado com a sessão X excluída == estado de um histórico que nunca teve X; editar a data de uma sessão reordena e muda o resultado; `agenda.proximos7` conta só os próximos 7 dias sem hoje.
- [ ] **Step 2–5:** FAIL → implementar → PASS → commit `feat(estudos): escada adaptativa, diagnóstico e agenda`.

### Task 5: Núcleo — estatísticas, planejamento, erros, simulados, pontos fracos

**Files:** Modify `js/estudos-core.js`; Test `tests/estudos-core.test.js`

**Interfaces:**
- Produces:
  - `resumoDia(sessoes,simulados,data)→{assuntos,sessoes,questoes,acertos,minutos}`; `serieDiaria(sessoes,simulados,de,ate)→[{data,questoes,acertos,minutos}]`; `porMateria(itens,sessoes,aj,hoje)→[{materia,minutos,questoes,acertos,assuntos,criticos}]`; `porAssunto(itens,sessoes,aj,hoje)→[{item,estado,minutos,questoes,acertos}]`; `evolucaoMensal(sessoes,simulados)→[{mes,minutos,questoes,acertos}]`; `tempoMedioPorQuestao(sessoes,simulados)→segundos|null` (só registros com minutos e questões); `produtividade(sessoes,de,ate)→{diasEstudados,mediaMinutosDia,sequenciaAtual}`. Simulados entram nos totais de questões/minutos, nunca no domínio de um assunto.
  - Planejamento: `planoStatus(plano,sessoesLigadas,hoje)→'concluida'|'pendente'|'atrasada'|'reagendada'|'cancelada'` (concluída só se existir sessão ativa com `planoId`); `realizadoDoPlano(sessoesLigadas)→{minutos,questoes}`; `resumoSemana(planos,sessoes,inicio)→{dias:[{data,itens:[{plano,status,realizado}]}],planejado:{minutos,questoes},realizado:{minutos,questoes}}` (realizado da semana = todas as sessões ativas da semana); `reagendarPlano(col,id,novaData,agoraISO,novoId)→col` (original `status:'reagendada'`, `reagendadaPara`; novo com `origemId`).
  - Erros: `MOTIVOS_ERRO=[['desconhecimento','Desconhecimento'],['esquecimento','Esquecimento'],['interpretacao','Interpretação'],['calculo','Cálculo'],['confusao','Confusão conceitual'],['desatencao','Desatenção']]`; `estatisticasErros(erros,itens)→{total,porMotivo:{},porMateria:[{materia,total,porMotivo}],porAssunto:[{item,total,porMotivo}]}` (soma `quantidade`, padrão 1).
  - Simulados: `CRITERIOS_PADRAO=[{id:'cebraspe',nome:'Cebraspe (cada erro anula um acerto)',pontosAcerto:1,penalidadeErro:1,pontosBranco:0},{id:'simples',nome:'Sem penalidade',pontosAcerto:1,penalidadeErro:0,pontosBranco:0}]`; `validarSimulado(s)→string[]`; `notaSimulado(s,criterio)→{nota,maxima,percentual}`; `evolucaoSimulados(sims,criterios)→[{simulado,nota,percentual}]` por data.
  - `pontosFracos(itens,estados,estatErros)→[{item,motivos:string[],peso}]` (domínio crítico, retomada, retenção crítica, muitos erros), ordenado por peso.
- [ ] **Step 1: Testes** — Cebraspe: 100 questões, 70 certas, 20 erradas, 10 brancos → nota 50, máxima 100, 50%; 40 certas 50 erradas → nota −10 (permitida); `validarSimulado` acusa soma ≠ questões; planejado não conta como realizado sem sessão ligada; sessão excluída ligada → volta a `pendente`/`atrasada`; reagendar cria um novo e o original fica `reagendada`; `resumoDia` não conta sessão excluída nem duplicada por id; `tempoMedioPorQuestao` 60 min/40 questões → 90 s; erros por motivo somam `quantidade`; `produtividade` sequência de dias consecutivos até hoje.
- [ ] **Step 2–5:** FAIL → implementar → PASS → commit `feat(estudos): estatísticas, planejamento, erros e simulados`.

### Task 6: Persistência — chaves no Store, mescla atômica e diário local

**Files:**
- Modify: `js/util.js` (`pathOf` no `GitHubStore`; novo `setMesclando`), `server/server.js` (`keyPath` aceita `est:`)
- Create: `js/estudos-dados.js`
- Test: `tests/estudos-dados.test.js` (store falso em memória)

**Interfaces:**
- Produces (Store): chaves `est:<tipo>` → `estudos/<tipo>.json` e `est:<tipo>-AAAA-MM` → `estudos/<tipo>/AAAA-MM.json` (regex `^est:([a-z]+)(?:-(\d{4}-\d{2}))?$`), nos três modos. `Store.setMesclando(k,v,mesclar)→Promise<objeto|null>`: lê a versão remota, grava `mesclar(v,remoto)` e devolve o resultado (no GitHub, dentro da fila; em conflito 409/422, relê e mescla de novo antes de repetir).
- Produces (dados): `EstDadosCriar({store,local,core,agora,id})→api` com `carregar()`, `estado` (`itens,sessoes,planos,erros,simulados,ajustes,cronometro`), `salvarItem(i)`, `salvarSessao(s)` (escolhe o mês pela data; se a data mudou de mês, exclui no mês antigo e grava no novo com o mesmo id), `excluirSessao(id)`, `salvarPlano(p)`, `reagendarPlano(id,data)`, `excluirPlano(id)`, `salvarErro(e)`, `excluirErro(id)`, `salvarSimulado(s)`, `excluirSimulado(id)`, `salvarAjustes(a)`, `salvarCronometro(c|null)`, `sessoesDoItem(id)`, `todas(tipo)`, `sincronizar()`, `pendentes()→string[]`, `exportar()→objeto`, `importar(obj)`. Índice de meses em `est:indice` (coleção cujos ids são `tipo-AAAA-MM`). Toda escrita grava antes uma cópia em `local` (`estlocal:<chave>`); falha remota deixa a chave em `pendentes` e é repetida em `sincronizar()`; `carregar()` mescla remoto + cópia local e sobe o que faltava.
- [ ] **Step 1: Testes** — salvar sessão e recarregar de outro `EstDados` com o mesmo store → igual; duas instâncias ("aparelhos") salvando sessões diferentes no mesmo mês → ambas ficam; aparelho desatualizado não desfaz exclusão; store remoto falhando → `pendentes()` não vazio, dado no `local`; nova instância com store funcionando → `carregar()` recupera e sobe; mover sessão de nov para dez → uma só, em dez; `exportar`→`importar` em store vazio → mesmos dados.
- [ ] **Step 2–5:** FAIL → implementar → PASS (+ `node --check js/util.js server/server.js`) → commit `feat(estudos): persistência com mescla e recuperação`.

### Task 7: Área Estudos — modo, Hoje, registro, cronômetro e detalhe do assunto

**Files:** Modify `index.html` (botão `data-mode="est"` na `.seg`; `<div id="estView" class="est-only">`; `<script src="js/estudos-core.js">`, `js/estudos-dados.js`, `js/estudos.js` antes de `js/app.js`), `js/app.js` (`switchMode` com `'est'`; `appMode` aceita `'est'`; `renderSidebar` em `est` lista matérias com revisões pendentes), `css/app.css` (`body.mode-est .map-only, body.mode-est .doc-only{display:none}`; `body:not(.mode-est) .est-only{display:none}`; estilos `.est-*`); Create `js/estudos.js`.

**Interfaces:**
- Consumes: `EstCore`, `EstDadosCriar`, `Store`, `ws.items` (mapas), `Store.get('map:ID')` para indexar tópicos.
- Produces: `estShown()` (chamado por `switchMode`), `estAbrirRegistro({itemId?,planoId?,tipo?,data?})`, `estAbrirAssunto(itemId)`.
- Telas desta task: abas `Hoje | Calendário | Planejamento | Erros | Simulados | Desempenho | Ajustes` (as demais preenchidas nas Tasks 8–10); **Hoje** conforme seção 8 do spec; **Registro** (busca de tópicos em todos os mapas com caminho, item livre, difícil/sem revisão, tipo, métodos, explicação + "Conferir com o mapa" com checklist da sub-árvore ou nota manual, questões, classificar erros por motivo (gera registros de erro ligados à sessão), percebida, tempo/cronômetro, Salvar bloqueado durante gravação, mostra próxima revisão); **cronômetro** no topo da área (iniciar/pausar/retomar/finalizar → preenche o registro); **detalhe do assunto** (domínio e retenção lado a lado, escada, diagnóstico, histórico com resumos, editar/excluir sessão).
- [ ] **Step 1:** Implementar; `node --check` em todos os JS; `node --test tests/` continua PASS.
- [ ] **Step 2:** Teste no navegador (servidor isolado ou ramo `teste`): registrar estudo de um tópico, ver em Hoje no dia seguinte (relógio simulado via `EstCore.hoje` injetável), conferir checklist, cronômetro sobrevive a recarregar.
- [ ] **Step 3:** Commit `feat(estudos): área Estudos com Hoje, registro e cronômetro`.

### Task 8: Calendário e Planejamento semanal

**Files:** Modify `js/estudos.js`, `css/app.css`.
- **Calendário** do mês: feito (estudo/revisão/retomada), previsto (revisões da agenda), planejado (atividades), questões e tempo do dia; atrasadas destacadas; clicar abre o dia (sessões, previstas, planejadas, botão registrar).
- **Planejamento**: semana seg–dom navegável; adicionar atividade (tópico/matéria/livre, meta de minutos e questões); cada atividade mostra status (`planoStatus`) e realizado; "Registrar" abre o registro com `planoId`; "Reagendar" (para pendente/atrasada) e "Cancelar"; topo com planejado × realizado da semana.
- [ ] Implementar; checar no navegador que atividade planejada não conta em Hoje/Desempenho até existir sessão ligada; reagendar cria a nova e marca a antiga. Commit `feat(estudos): calendário e planejamento semanal`.

### Task 9: Banco de erros e Simulados

**Files:** Modify `js/estudos.js`, `css/app.css`.
- **Erros**: lista filtrável (matéria, assunto, motivo, período), adicionar/editar/excluir erro avulso (assunto, motivo, quantidade, observação), estatísticas por motivo, matéria e assunto (`estatisticasErros`).
- **Simulados**: cadastrar (data, concurso, banca, critério, questões, acertos, erros, brancos, tempo, por matéria opcional), nota calculada (`notaSimulado`) com validação (`validarSimulado`), histórico/evolução (`evolucaoSimulados`), critérios editáveis (adicionar critério próprio; Cebraspe e Sem penalidade vêm prontos e não podem ser apagados).
- [ ] Implementar; checar nota Cebraspe no navegador. Commit `feat(estudos): banco de erros e simulados`.

### Task 10: Desempenho ampliado, Ajustes, backup e documentação

**Files:** Modify `js/estudos.js`, `css/app.css`, `js/outline.js` (`exportAll` inclui `estudos: EstDados.exportar()`; `importBackup` chama `EstDados.importar(obj.estudos)` quando existir), `README.md`.
- **Desempenho**: cartões (horas, questões, taxa de acerto, tempo médio por questão, revisões pendentes, assuntos críticos) com filtro de período (7/30/90 dias/tudo); barras por dia; horas e acertos por matéria; tabela por assunto (domínio, retenção, questões); evolução mensal; produtividade; pontos fracos.
- **Ajustes**: todos os parâmetros de `AJUSTES_PADRAO` com "restaurar padrões".
- [ ] Implementar; `node --test tests/` PASS; commit `feat(estudos): desempenho ampliado, ajustes e backup`.

### Task 11: Integração final e publicação

- [ ] Teste de integração no navegador contra o ramo `teste` do repositório de dados (ponte local com a chave do `gh`), dois "aparelhos": registrar, revisar, editar/excluir, planejar, erros, simulado, desempenho; queda de rede simulada (ponte desligada) e recuperação.
- [ ] Apagar o ramo `teste`; limpar configuração de teste do navegador; fechar páginas de teste.
- [ ] `node --test tests/` PASS; commit; push (publica no GitHub Pages); conferir o site.
