# Calendário de estudos com revisão adaptativa — desenho

Data: 2026-11-27 · Projeto: Mapa Mental (https://flips794.github.io/mapa-mental/)
Versão 2 — incorpora as melhorias pedidas (planejamento, domínio × retenção, revisões espaçadas,
banco de erros, simulados, desempenho, integridade) divididas em 4 etapas aprovadas.

## 1. Intenção e o porquê

O usuário estuda para concursos de perito (PF, PCDF, Polícias Científicas). Os mapas mentais do app já
são o edital dele: uma matéria por mapa, tópicos numerados.

Hoje ele falha por dois motivos, nas palavras dele:
- "daqui uma semana não sei ao certo o que eu estudei";
- "não reviso por falta de organização".

O calendário resolve os dois: **registrar o estudo do dia tem que ser rápido**, e ao abrir o app ele vê
**o que revisar hoje**, calculado sozinho. O método dele: estuda; revisa escrevendo um **resumo sem
consultar** e conferindo se está completo; faz **questões**; marca o que estudou no dia.

## 2. Etapas (aprovadas, nesta ordem)

Cada etapa é concluída, testada e validada pelo usuário antes de a próxima começar. A estrutura de
dados nasce preparada para as quatro; só as funcionalidades da etapa em curso são construídas.

| Etapa | Conteúdo |
|---|---|
| **1 — Essencial** | registro do dia, revisões espaçadas adaptativas, domínio e retenção, retomada de conteúdo, cronômetro, integridade dos dados, telas Hoje / Calendário / Desempenho básico, Ajustes, testes |
| 2 — Planejamento semanal | atividades planejadas por dia com metas de tempo e questões, planejado × realizado, reagendamento |
| 3 — Banco de erros e Simulados | erros por motivo com estatísticas; simulados com banca, nota, tempo, evolução e critérios de pontuação (incl. Cebraspe) |
| 4 — Desempenho ampliado | horas por matéria, evolução mensal, tempo médio por questão, assuntos críticos, revisões pendentes |

## 3. Objetivos da Etapa 1

1. Registrar estudo ou revisão em menos de 1 minuto.
2. Agendar revisões sozinho, com escada progressiva **ajustada** pelo desempenho (seção 7).
3. Medir **domínio** (compreensão) e **retenção** (recuperação após intervalo) **separadamente**, com
   várias evidências, sem classificar com pouca evidência.
4. Quando o desempenho é baixo **de forma recorrente**, recomendar **retomar o conteúdo** em vez de
   encurtar revisões indefinidamente.
5. Tela **Hoje** com atrasadas, revisões do dia e retomadas recomendadas.
6. **Calendário** do mês (feito e previsto) e **Desempenho básico**.
7. **Cronômetro** opcional que guarda início, pausas e retomadas.
8. Editar/excluir sessões **recalcula** tudo **sem destruir o histórico**; nada é contado duas vezes.
9. **Testes automáticos** das regras de revisão, cronômetro, cálculos e estatísticas.

## 4. Não-objetivos e anti-objetivos

Não-objetivos da Etapa 1 (ficam para as etapas seguintes ou para depois): planejamento semanal, banco
de erros, simulados, desempenho ampliado, lembretes fora do app (push/e-mail/agenda), sistema próprio de
flashcards, mostrar revisões dentro do desenho do mapa.

Anti-objetivos (seria fracasso mesmo funcionando):
- registrar demorar tanto que ele deixa de fazer;
- revisões atrasadas sumirem ou serem empurradas em silêncio;
- classificar um assunto como dominado com poucas questões;
- reduzir tudo à porcentagem de acertos;
- encurtar revisões indefinidamente em vez de indicar retomada;
- perder, duplicar ou inventar registros (nenhum dado fictício nos registros reais).

## 5. Restrições

- **Sem grandes mudanças visuais ou de arquitetura**; não mexer nas outras áreas além do necessário.
- App em HTML/CSS/JS puro, sem dependências. Áreas alternadas por `.seg button[data-mode]` e
  `switchMode(m)` (`app.js`); classes `body.mode-*` e `.map-only`/`.doc-only`.
- Armazenamento pela camada `Store` (`util.js`), modo principal GitHub (repositório privado
  `Flips794/mapa-mental-dados`), com fila única de gravação e intervalo mínimo (`Store.delay`). Cada
  gravação no GitHub é um commit.
- Português do Brasil; tema claro/escuro pelas variáveis CSS existentes.
- Preservar todos os dados existentes (mapas, documentos).
- Testes com o executor nativo do Node (`node --test`), sem dependências, em `tests/`, usando dados de
  teste em memória. Testes de navegador só no ramo `teste` do repositório de dados ou com
  armazenamento isolado.

## 6. Abordagens consideradas

| Abordagem | Prós | Contras |
|---|---|---|
| **1. Área "Estudos" dentro do Mapa Mental** (escolhida) | mesmo site e mesma chave do GitHub; mapas já carregados (escolher tópico e conferir resumo saem fácil); evolui para o mapa mostrar revisões | app cresce (mitigado com arquivos próprios) |
| 2. Aplicativo separado lendo o mesmo repositório | independente | dois sites, duas chaves por aparelho, ligação com os mapas frágil |
| 3. Ferramentas prontas (Anki, agenda, planilha) | prontas | não enxergam os mapas nem conferem o resumo |

Escolha do usuário: **abordagem 1**, com o botão dentro do Mapa Mental.

Organização do código (decisão do construtor): `js/estudos-core.js` com **toda a regra** em funções
puras (sem DOM), usável no navegador e no Node para os testes; `js/estudos.js` com as telas; estilos
acrescentados ao `css/app.css`.

## 7. Regras (Etapa 1)

Todos os números abaixo são **valores iniciais configuráveis** na tela Ajustes.

### 7.1 Evidências de uma sessão

Uma sessão pode trazer qualquer combinação de:
- **Questões**: feitas `n`, acertos `a` → acerto `q = a/n`.
- **Explicação sem consulta** (resumo escrito de memória): completude `r` de 0 a 1 — pelo checklist dos
  sub-tópicos do mapa (marcados/total), ou nota manual completo = 1, faltou pouco = 0,7,
  faltou muito = 0,4 (item livre ou tópico sem sub-tópicos).
- **Dificuldade percebida**: fácil / ok / difícil (um clique). É a percepção dele, não um resultado.
- **Outros métodos** (flashcards, releitura, outro): só registram o método; contam como evidência
  através da dificuldade percebida.

**Resultado de recuperação da sessão** `s` (usado na revisão): média ponderada das evidências
disponíveis — questões (peso 2 × min(1, n/10)), explicação (peso 2) e dificuldade percebida
(peso 1; fácil = 0,9, ok = 0,7, difícil = 0,4). Sem nenhuma evidência, a sessão não tem `s` (não mexe
na escada, só registra que estudou).

### 7.2 Domínio (compreensão)

Representa o quanto ele entende o conteúdo, olhando **todo o histórico**:
- acerto acumulado em questões, ponderado pela recência (meia-vida de 60 dias) e pela quantidade;
- média recente das explicações sem consulta;
- dificuldade percebida recente como ajuste pequeno (difícil −5 pontos; fácil +2);
- valor = 0,6 × questões + 0,4 × explicação (quando só houver um dos dois, vale o que houver),
  mais o ajuste.

**Evidência mínima** para classificar: pelo menos **20 questões** e **2 sessões avaliadas**. Abaixo
disso o assunto aparece **"Em avaliação"** (com o número parcial esmaecido, sem categoria).

Categorias: **Excelente** 90–100 · **Bom** 75–89 · **Regular** 60–74 · **Crítico** < 60.

### 7.3 Retenção (recuperação após intervalo)

Representa a capacidade de lembrar **depois de um tempo sem ver**. Só é medida em **revisões** (não no
estudo), usando o resultado de recuperação `s` daquela revisão e o intervalo decorrido:
- retenção atual = média ponderada pela recência dos `s` das últimas 5 revisões;
- mostrada junto com o maior intervalo em que ele recuperou bem (s ≥ 0,85), ex.:
  "Retenção 82% · lembra bem após 15 dias".
- Mesmas categorias e evidência mínima de 2 revisões; antes disso, "Em avaliação".

Domínio e retenção são exibidos lado a lado e **nunca** combinados num número só.

### 7.4 Escada de revisões e diagnóstico

Escada progressiva: **1 → 7 → 15 → 30 → 60 dias** (+ **120** só para domínio consolidado).
- Primeiro estudo → degrau 1 (revisão em 1 dia).
- Assunto marcado como **difícil** usa a escada encurtada (× 0,7, arredondado: 1 → 5 → 10 → 21 → 42).

A cada revisão com resultado `s`, o sistema define um **diagnóstico** e o próximo degrau:

| Diagnóstico | Quando | O que acontece |
|---|---|---|
| **Domínio consolidado** | `s ≥ 0,85` **e** domínio ≥ 85 com evidência mínima **e** a revisão anterior também ≥ 0,85 | sobe **2** degraus (pode chegar a 120) |
| **Progresso** | `s ≥ 0,85` (sem os demais requisitos) | sobe 1 degrau; se percebeu **difícil**, mantém o degrau |
| **Estável** | `0,60 ≤ s < 0,85` | **mantém** o degrau (repete o intervalo) |
| **Esquecimento** | `s < 0,60` **e** o domínio é ≥ 75 (ou havia ido bem antes) | **desce 1** degrau — esqueceu, mas entende |
| **Dificuldade de compreensão** | `s < 0,60` **e** domínio < 75 (ou "em avaliação" com histórico ruim) | volta ao degrau 1 (1 dia) |
| **Dificuldade recorrente** | **3 revisões seguidas** com `s < 0,60` (configurável) | **pausa as revisões** e recomenda **retomar o conteúdo** |

**Retomada**: o assunto sai da fila de revisões e aparece em **"Retomar conteúdo"** na tela Hoje, com
o motivo. Ao registrar uma sessão do tipo **retomada** (novo estudo do zero), a escada recomeça no
degrau 1 e a contagem de dificuldade recorrente zera — o histórico anterior continua guardado.

Outras regras: próxima revisão = data da sessão + intervalo do degrau; revisar antes do dia é
permitido (o intervalo conta da data da sessão); revisão atrasada **continua em "Atrasadas"** até ser
feita e não move as outras; o atraso fica registrado (conta para a retenção, porque o intervalo real foi
maior).

### 7.5 Estado é sempre recalculado do histórico

O estado de cada assunto (degrau, próxima revisão, diagnóstico, domínio, retenção, recomendação) é
**calculado repassando as sessões em ordem de data** — nunca editado à mão. Editar ou excluir uma sessão
apenas muda o histórico de entrada; o estado é recalculado. Uma cópia do estado pode ser guardada como
cache, mas a fonte da verdade são as sessões.

### 7.6 Cronômetro

- Guarda a lista de **eventos com hora**: início, pausa, retomada, fim. Duração = soma dos trechos em
  andamento. O estado vai para o armazenamento a cada evento, então sobrevive a recarregar a página,
  trocar de área ou fechar o navegador.
- Ao finalizar, preenche o campo de tempo do registro (que continua editável e opcional).
- Proteções: aviso se passar de 6 h sem pausa; um único cronômetro ativo por vez; a sessão fica com a
  data do início.
- Tempo também pode ser digitado: "1h30", "1:30", "45min", "45" (minutos).

### 7.7 Integridade dos dados

- **Identificador único** em cada sessão e assunto, criado quando o formulário abre; salvar de novo é
  **atualizar** o mesmo registro (nunca cria duplicata). O botão Salvar fica bloqueado enquanto salva.
- **Histórico de edições**: editar guarda a versão anterior dentro do registro (`versoes`); excluir
  marca como excluída (`excluida` + data) em vez de apagar. Sessões excluídas não contam em nada, mas
  ficam no arquivo.
- **Vários aparelhos**: ao gravar um arquivo de estudos, o app primeiro **mescla** com a versão do
  repositório — junta por identificador; quando o mesmo registro mudou nos dois, vale o
  `atualizadoEm` mais recente; exclusões nunca são desfeitas por um aparelho desatualizado.
- **Planejado não é realizado** (preparado para a Etapa 2): uma atividade planejada só conta como
  estudo quando existe uma sessão registrada ligada a ela.

## 8. Telas da Etapa 1

Terceiro botão no topo: **Mapas | Documentos | Estudos**. Dentro de Estudos: **Hoje**, **Calendário**,
**Desempenho**, **Ajustes**, e o botão **＋ Registrar estudo** (e o cronômetro).

**Hoje** (padrão):
```
Estudos  [Hoje] [Calendário] [Desempenho] [Ajustes]      ⏱ 00:00  [＋ Registrar estudo]
──────────────────────────────────────────────────────────────────────────────
⚠ Atrasadas (2)
  Direito Penal › 31 | Estatuto do Desarmamento   venceu há 3 dias   Bom · ret. 70%   [Revisar]
  Química Analítica › 04 | Equilíbrios ácido-base  venceu ontem       Em avaliação     [Revisar]
Hoje (3)
  Matemática › 44. Fundamentos de probabilidade   degrau 7 dias      Regular          [Revisar]
  Lei seca: CPP arts. 158-A a 158-F (livre)        degrau 1 dia       Em avaliação     [Revisar]
↻ Retomar conteúdo (1)
  Física › 22. Radiação…  3 revisões abaixo de 60% — recomendado estudar de novo   [Retomar]
Hoje você: 2 assuntos · 45 questões · 78% · 1h50 (se houver tempo)   ·   Próximos 7 dias: 9 revisões
```

**Registro** (estudo, revisão ou retomada — mesmo formulário, cabe numa tela):
```
O que:   [🔎 buscar tópico nos mapas…]  ou  [item livre]      ☐ assunto difícil  ☐ sem revisão (livre)
Tipo:    (•) estudo  ( ) revisão  ( ) retomada           (preenchido sozinho quando vem da lista)
Como:    ☐ Explicação sem consulta  ☐ Questões  ☐ Flashcards  ☐ Releitura  ☐ Outro
         [texto do resumo…]  → [Conferir com o mapa] → checklist dos sub-tópicos (ou nota manual)
         Questões: feitas [  ]  acertos [  ]
Senti:   ( ) fácil  ( ) ok  ( ) difícil
Tempo:   [      ] opcional  (ou usar o cronômetro)
                                                     [Salvar]  → "Próxima revisão: 3 dez (em 7 dias)"
```

**Detalhe do assunto** (ao clicar num assunto): domínio e retenção lado a lado, degrau atual, próxima
revisão, diagnóstico da última revisão, histórico de sessões (com resumos escritos), editar/excluir
sessão.

**Calendário** (mês): em cada dia, marcas de feito (estudo/revisão/retomada) e previsto (revisões), total
de questões e tempo; dias com atrasadas destacados. Clicar no dia abre a lista daquele dia.

**Desempenho básico**: questões e acertos por dia (últimos 30 dias, barras), por matéria (mapa), e
assuntos com domínio Crítico ou em retomada. (O ampliado é a Etapa 4.)

**Ajustes**: escada, limiares de diagnóstico, categorias e evidência mínima de domínio e retenção,
número de revisões para dificuldade recorrente. Botão "restaurar padrões".

## 9. Dados (preparados para as 4 etapas)

Tudo no repositório privado, pasta `estudos/`, via `Store`. Chaves novas (o `Store` passa a aceitá-las
nos três modos):

| Chave | Arquivo | Conteúdo | Etapa |
|---|---|---|---|
| `est:itens` | `estudos/itens.json` | assuntos acompanhados | 1 |
| `est:sessoes-AAAA-MM` | `estudos/sessoes/AAAA-MM.json` | sessões do mês | 1 |
| `est:cronometro` | `estudos/cronometro.json` | cronômetro ativo | 1 |
| `est:ajustes` | `estudos/ajustes.json` | parâmetros | 1 |
| `est:planos-AAAA-MM` | `estudos/planos/AAAA-MM.json` | atividades planejadas | 2 |
| `est:erros-AAAA-MM` | `estudos/erros/AAAA-MM.json` | banco de erros | 3 |
| `est:simulados` | `estudos/simulados.json` | simulados e critérios de pontuação | 3 |

Arquivos de coleção têm o formato `{versao:1, registros:{id: registro}}`; todo registro tem `id`,
`criadoEm`, `atualizadoEm` e opcionalmente `excluida`/`excluidaEm` e `versoes`.

- **Assunto** (`itens`): `tipo` (`topico`|`livre`), `mapId`, `nodeId`, `caminho` (cópia legível),
  `materia` (nome do mapa ou digitado), `dificil`, `semRevisao`, `estado` (cache do cálculo).
- **Sessão** (`sessoes`): `itemId`, `data` (AAAA-MM-DD, fuso local), `tipo`
  (`estudo`|`revisao`|`retomada`), `questoes {feitas, acertos}`, `explicacao {texto, marcados[],
  total, nota}`, `percebida` (`facil`|`ok`|`dificil`), `metodos[]` (rótulos), `minutos`,
  `cronometro {eventos[]}`, e campos reservados: `planoId` (Etapa 2), `errosPorMotivo` (Etapa 3).
- **Atividade planejada** (Etapa 2): `data`, `itemId` ou `materia`, `metaMinutos`, `metaQuestoes`,
  `status` (`planejada`|`reagendada`|`cancelada`), `reagendadaPara`, `origemId`. Concluída = existe
  sessão com `planoId` igual.
- **Erro** (Etapa 3): `data`, `itemId`, `sessaoId`, `motivo` (`desconhecimento`|`esquecimento`|
  `interpretacao`|`calculo`|`confusao`|`desatencao`), `observacao`.
- **Simulado** (Etapa 3): `data`, `concurso`, `banca`, `criterioId`, `questoes`, `acertos`, `erros`,
  `brancos`, `minutos`, `nota`, `porMateria[]`; **critério**: `nome`, `pontosAcerto`, `penalidadeErro`,
  `pontosBranco` (Cebraspe: +1 / −1 / 0).

Backup "Exportar → Tudo" passa a incluir a pasta `estudos/`.

## 10. Testes (Etapa 1)

`node --test tests/` cobrindo `estudos-core.js`:
- resultado de recuperação com cada combinação de evidências;
- domínio e retenção: valores, categorias, evidência mínima ("Em avaliação"), separação entre os dois;
- escada e todos os diagnósticos (consolidado, progresso, estável, esquecimento, dificuldade de
  compreensão, dificuldade recorrente → retomada → recomeço), assunto difícil, revisão adiantada e
  atrasada;
- recálculo após editar e excluir sessões (mesmo resultado que um histórico sem a sessão);
- cronômetro: início/pausa/retomada/fim, recarregar no meio, passar da meia-noite, leitura de durações
  digitadas;
- estatísticas do dia, do mês e por matéria, sem contar sessões excluídas nem duplicadas;
- mescla entre aparelhos (união, mais recente vence, exclusão não é desfeita).

Validação de fim de etapa: testes automáticos passando + teste no navegador contra o ramo `teste` do
repositório de dados (apagado depois) + validação do usuário no uso real.

## 11. Deixado para quem constrói

- Layout fino das telas dentro do visual atual; na área Estudos, a barra lateral pode listar as matérias
  com o número de revisões pendentes.
- Busca de tópicos: indexar todos os mapas com cache em memória.
- Tópico que sumiu do mapa: continua com o caminho salvo e um aviso discreto.
- `switchMode` aprende o modo `est`; esconder o que é só de mapas/documentos.

## 12. Decisões do construtor (podem ser corrigidas)

- Registrar de novo um assunto já acompanhado vira revisão dele (mesmo `nodeId` ou mesmo texto livre).
- Primeiro estudo pode ser salvo sem evidências; a primeira revisão fica em 1 dia.
- Item livre "sem revisão" (ex.: simulado misto) conta no dia, mas não agenda revisões.
- Duas sessões do mesmo assunto no mesmo dia: as duas ficam; a de horário mais tardio define o degrau.
- Tópico pai e tópicos filhos acompanhados separadamente são independentes; o checklist do pai usa a
  sub-árvore inteira.
- Pesos e números das seções 7.1 a 7.4 são o ponto de partida, ajustáveis em Ajustes.
- Para separar **esquecimento** de **dificuldade de compreensão**, o diagnóstico usa o domínio calculado
  **antes** da revisão atual (senão o próprio resultado ruim puxaria o domínio para baixo e tudo viraria
  "dificuldade").
- Revisão registrada **sem nenhuma evidência**: conta como revisada, mantém o degrau e agenda a próxima
  com o intervalo do degrau atual; não entra no cálculo de retenção.
