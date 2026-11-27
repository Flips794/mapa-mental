# Calendário de estudos com revisão adaptativa — desenho

Data: 2026-11-27 · Projeto: Mapa Mental (https://flips794.github.io/mapa-mental/)

## 1. Intenção e o porquê

O usuário estuda para concursos de perito (PF, PCDF, Polícias Científicas). Os mapas mentais do app já
são o edital dele: uma matéria por mapa, tópicos numerados ("07. Razão, proporção e regra de três").

Hoje ele falha por dois motivos, nas palavras dele:
- "daqui uma semana não sei ao certo o que eu estudei";
- "não reviso por falta de organização".

O calendário resolve os dois: **registrar o que estudou tem que ser rápido o bastante para fazer todo
dia**, e ao abrir o app ele vê **o que revisar hoje**, calculado sozinho, sem ter que pensar.

O método dele: estuda um assunto; depois revisa escrevendo **um resumo sem consultar nada** e conferindo
se está completo; faz **questões**; e marca o que estudou no dia. Ele quer evoluir a ferramenta aos poucos
("vamos evoluindo ao longo do tempo").

## 2. Objetivos

1. Registrar o estudo do dia em menos de 1 minuto: o que estudou + como revisou + desempenho.
2. Agendar automaticamente as revisões de cada assunto, **sem rigidez**: o intervalo cresce ou encolhe
   conforme o desempenho; assuntos difíceis voltam mais vezes.
3. Tela "Hoje" com revisões atrasadas e do dia, em destaque, logo ao abrir a área.
4. Calendário do mês mostrando o que foi estudado/revisado em cada dia e as revisões previstas.
5. Quantidade de questões feitas e acertos por dia (e totais).
6. Resumo sem consulta escrito no app e conferido com os sub-tópicos do mapa (checklist), que calcula a
   completude sozinho.
7. Funcionar com tópicos dos mapas **e** com itens livres (aula, PDF, lei seca, simulado).
8. **Tempo de estudo opcional**: quem quiser registra quanto tempo estudou; quem não quiser ignora, sem
   deixar o registro mais lento.

## 3. Não-objetivos (agora — podem vir depois)

- Notificações/lembretes fora do app (push, e-mail, Google Agenda).
- Planejamento de estudo futuro (cronograma de conteúdo novo); o calendário só agenda **revisões**.
- Sistema próprio de flashcards (flashcard é só um rótulo de método).
- Gráficos elaborados de desempenho; no começo, totais simples por dia e por matéria.
- Mostrar status de revisão dentro do desenho do mapa (evolução natural, fica para depois).

## 4. Anti-objetivos (seria fracasso mesmo funcionando)

- Registrar demorar tanto que ele deixa de fazer.
- Revisões atrasadas sumirem ou serem empurradas em silêncio.
- Agenda rígida que ignora o desempenho.
- Perder registros (dados ficam no repositório privado; nada é apagado de vez).

## 5. Restrições (do projeto atual)

- App em HTML/CSS/JS puro, sem dependências; arquivos em `js/` (`util.js`, `map.js`, `docs.js`,
  `outline.js`, `app.js`).
- Áreas alternadas por botões no topo (`.seg button[data-mode]`), `switchMode(m)` em `app.js`, classes
  `body.mode-map`/`mode-doc` e `.map-only`/`.doc-only`.
- Armazenamento por chave/valor via `Store` (`util.js`), com três modos: GitHub (repositório privado
  `Flips794/mapa-mental-dados`, principal), servidor local (desligado) e só navegador. Chaves conhecidas
  viram caminhos (`ws`→`ws.json`, `map:ID`→`mapas/ID.json`…); cada gravação no GitHub é um commit, com
  fila única e intervalo mínimo de 2,5 s (`Store.delay`).
- Textos e interface em português do Brasil; tema claro/escuro por variáveis CSS existentes.

## 6. Abordagens consideradas

| Abordagem | Prós | Contras |
|---|---|---|
| **1. Nova área "Estudos" dentro do Mapa Mental** (escolhida) | mesmo site e mesma chave do GitHub; os mapas já estão carregados (escolher tópico e checklist do resumo saem fácil); evolui para o mapa mostrar revisões | o app cresce (mitigado com arquivo próprio `js/estudos.js`) |
| 2. Aplicativo separado lendo o mesmo repositório | independente | dois sites e duas configurações de chave por aparelho; ligação com os mapas mais frágil |
| 3. Ferramentas prontas (Anki, Google Agenda, planilha) | prontas | não enxergam os mapas nem fazem a conferência do resumo, que é o centro do método |

Escolha do usuário: **abordagem 1** ("um conjunto com o botão dentro do mapa mental").

## 7. O que foi decidido

### 7.1 Onde fica
Terceiro botão no topo: **Mapas | Documentos | Estudos**. Ao entrar em Estudos, a tela padrão é **Hoje**.

### 7.2 Registro de uma sessão (estudo ou revisão — o mesmo formulário)

1. **O que** — uma das opções:
   - **Tópico de um mapa**: busca por texto em todos os tópicos de todos os mapas, mostrando o caminho
     ("Direito Constitucional › 13. Garantias constitucionais penais"). Guardar `mapId`, `nodeId` e uma
     cópia do caminho/texto (para continuar legível se o tópico mudar ou sumir).
   - **Item livre**: texto digitado.
   - Opção **"assunto difícil"** (marca o item; afeta os intervalos, ver 7.3).
2. **Como revisou** — um ou mais métodos na mesma sessão:
   - **Resumo sem consulta**: caixa de texto para escrever de memória. Ao terminar, botão
     **"Conferir com o mapa"** mostra os sub-tópicos do tópico (a sub-árvore, achatada, com recuo) como
     checklist; ele marca o que o resumo cobriu → completude = marcados / total.
     Para item livre ou tópico sem sub-tópicos: nota manual **completo / faltou pouco / faltou muito**.
   - **Questões**: quantas fez e quantas acertou → percentual.
   - **Flashcards / Releitura / Outro**: autoavaliação de um clique **difícil / ok / fácil**.
3. **Tempo (opcional)** — campo vazio por padrão, que nunca é obrigatório: digitar a duração ("1h30",
   "45min", "45") **ou** usar o **cronômetro** (iniciar/pausar/parar) que preenche o campo. O cronômetro
   continua contando se ele trocar de área ou recarregar a página (guardar a hora de início).
4. **Salvar** → mostra a próxima revisão ("Próxima revisão: 3 dez, em 4 dias").

O primeiro registro de um assunto é o **estudo**; os seguintes são **revisões** (mesmo formulário,
aberto já com o assunto quando vem da lista "Hoje").

### 7.3 Cálculo das revisões (adaptativo, valores ajustáveis)

Desempenho da sessão, de 0 a 1:
- questões: acertos/feitas;
- resumo conferido: completude; nota manual completo=1, faltou pouco=0,7, faltou muito=0,4;
- difícil/ok/fácil = 0,4 / 0,75 / 0,95;
- vários métodos na mesma sessão: média, com questões e resumo pesando o dobro da autoavaliação.

Intervalo (em dias) guardado por assunto:
- primeiro estudo → próxima revisão em **1 dia**;
- a cada revisão, conforme o desempenho `d`:
  - `d < 0,60` → intervalo **encolhe**: `max(1, intervalo × 0,5)`;
  - `0,60 ≤ d < 0,85` → **cresce pouco**: `intervalo × 1,5` (mínimo +1 dia);
  - `d ≥ 0,85` → **cresce bastante**: `intervalo × 2,5`;
- assunto marcado como **difícil**: o crescimento é multiplicado por 0,7;
- teto de 120 dias; arredondar para dias inteiros;
- próxima revisão = data da sessão + intervalo;
- revisão **atrasada continua aparecendo** em "Atrasadas" até ser feita; não move outras revisões.

Limiares (0,60 / 0,85), multiplicadores e teto ficam numa pequena tela de **Ajustes** para calibrar.

### 7.4 Telas

**Hoje** (padrão):
```
Estudos   [Hoje] [Calendário] [Desempenho]            [＋ Registrar estudo]
──────────────────────────────────────────────────────────────────────
⚠ Atrasadas (2)
  Direito Penal › 31 | Estatuto do Desarmamento     venceu há 3 dias  [Revisar]
  Química Analítica › 04 | Equilíbrios ácido-base    venceu ontem      [Revisar]
Hoje (3)
  Matemática › 44. Fundamentos de probabilidade     2ª revisão        [Revisar]
  Lei seca: CPP arts. 158-A a 158-F (item livre)    1ª revisão        [Revisar]
  Informática › 36 — IPv4, CIDR                      4ª revisão        [Revisar]
Estudado hoje: 2 assuntos · 45 questões · 78% de acertos · 2h10 (quando houver tempo registrado)
Próximos 7 dias: 9 revisões
```

**Calendário** (mês): cada dia mostra marcas de **estudado/revisado** (feito) e **revisões previstas**,
e o total de questões do dia (e o tempo, se registrado); dias com atrasadas destacados. Clicar num dia abre a lista daquele dia
(sessões feitas com métodos, questões e desempenho; revisões previstas).

**Desempenho** (começo simples): questões e acertos por dia (últimos 30 dias, em barras) e por matéria
(mapa), tempo estudado por dia e por matéria (só aparece se houver tempo registrado), e a lista de
assuntos com pior desempenho recente.

**Formulário de registro**: painel lateral ou janela, seguindo 7.2; tem que caber em uma tela.

### 7.5 Dados (no repositório privado, mesma camada `Store`)

- `estudos/itens.json` — assuntos acompanhados: `id`, tipo (`topico`|`livre`), `mapId`, `nodeId`,
  `caminho` (cópia legível), `dificil`, estado da revisão (`intervalo`, `proxima` data, `revisoes`
  feitas), datas de criação.
- `estudos/sessoes/AAAA-MM.json` — sessões do mês: `id`, `itemId`, `data` (AAAA-MM-DD, fuso local),
  `tipo` (`estudo`|`revisao`), `metodos` [{`tipo`, `feitas`, `acertos`, `resumo` (texto),
  `checklist` [nodeIds marcados], `total`, `nota`}], `desempenho`, intervalo calculado, `minutos`
  (opcional, vazio quando não registrado).
- `estudos/ajustes.json` — limiares e multiplicadores.
- Separar sessões por mês evita reescrever um arquivo gigante a cada salvamento (cada gravação no GitHub
  é um commit).
- `Store` precisa aceitar a nova família de chaves (`est:itens`, `est:ajustes`, `est:sessoes-AAAA-MM`)
  mapeada para a pasta `estudos/` no GitHub, no servidor local e no navegador.

### 7.6 Decisões do construtor (revisão do desenho — podem ser corrigidas)

- **Assunto já acompanhado registrado de novo** (pelo botão "Registrar estudo", não pela lista Hoje):
  vira revisão do item existente (mesmo `nodeId`, ou mesmo texto no caso de item livre).
- **Revisar antes do dia previsto**: permitido; o novo intervalo conta a partir da data da sessão.
- **Primeiro estudo sem métodos/desempenho**: permitido; a primeira revisão fica em 1 dia mesmo assim.
- **Item livre "sem revisão"** (ex.: simulado misto): opção no registro; conta questões no dia, mas não
  agenda revisões.
- **Corrigir erros**: sessões podem ser editadas ou excluídas; o estado do assunto é recalculado
  repassando o histórico de sessões dele. Sessão excluída vai para a lixeira como o resto.
- **Duas sessões do mesmo assunto no mesmo dia**: as duas ficam no histórico; a última define o intervalo.
- **Tópico pai e tópicos filhos** acompanhados separadamente são independentes; o checklist do pai usa
  a sub-árvore inteira.
- **Resumos escritos ficam guardados** e aparecem no detalhe do dia, para ver a evolução.

## 8. Deixado para quem constrói

- Layout fino das telas e do formulário, dentro do visual atual do app (barra lateral, painel, tema
  claro/escuro). Na área Estudos, a barra lateral pode listar as matérias (mapas) com o número de
  revisões pendentes.
- Busca de tópicos: indexar todos os mapas (lendo cada `map:ID`) com cache em memória.
- Tópico que deixou de existir no mapa: continua no calendário com o caminho salvo e um aviso discreto.
- Arquivo próprio `js/estudos.js` (+ estilos no `css/app.css`); `switchMode` aprende o modo `est`.
- Exportar/backup "Tudo" deve incluir os dados de estudo.
- Testes no ramo `teste` do repositório de dados ou com armazenamento isolado — nunca nos dados reais.
