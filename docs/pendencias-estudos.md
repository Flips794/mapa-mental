# Estudos — pendências para a próxima atualização

Levantadas na auditoria técnica de 27/11/2026. Nenhuma causa perda de dados hoje; são melhorias
ou riscos conhecidos.

## Prioritárias

### 1. Restaurar registros excluídos
- **Hoje:** excluir é definitivo por desenho (um aparelho desatualizado nunca "ressuscita" o que foi
  excluído em outro). Importar um backup também não desfaz uma exclusão. Os dados continuam guardados
  (o registro fica marcado como excluído, com as versões anteriores, e tudo está no histórico do
  repositório de dados), mas não há tela para recuperar.
- **Proposta:** uma "Lixeira" nos Estudos que lista os excluídos e restaura criando uma **cópia com novo
  id** (a exclusão original continua definitiva, então a mescla entre aparelhos segue segura). Mesma
  ideia para "voltar a uma versão anterior" de uma sessão editada.

### 2. Identificar questões inéditas
- **Hoje:** o domínio usa a taxa de acerto sem saber se as questões já tinham sido feitas antes; refazer
  a mesma lista infla o domínio.
- **Proposta:** campo opcional "quantas eram inéditas" no registro de questões; o domínio pesa menos as
  repetidas (ou só conta as inéditas para a evidência mínima de 20 questões).

### 3. Evitar reagendamento duplicado
- **Hoje:** se dois aparelhos reagendarem a mesma atividade ao mesmo tempo, cada um cria uma atividade
  nova (ids diferentes) e a meta planejada fica dobrada.
- **Proposta:** id da nova atividade derivado do original (ex.: `<id original>-r<n>`), para que os dois
  aparelhos gerem o mesmo registro e a mescla junte os dois em um.

### 4. Atualizar o nome do tópico renomeado no mapa
- **Hoje:** o assunto guarda o caminho do tópico (Matéria › … › Tópico) no momento do primeiro registro;
  renomear ou mover o tópico no mapa não atualiza o nome nos Estudos (o vínculo pelo id do tópico
  continua, e a conferência da explicação usa o mapa atual).
- **Proposta:** ao abrir os Estudos, comparar o caminho guardado com o caminho atual do tópico
  (`mapId` + `nodeId`) e atualizar o nome; se o tópico foi apagado do mapa, mostrar "(removido do mapa)".

## Outros riscos conhecidos
- Só a dificuldade percebida já conta como evidência (pela especificação): uma revisão marcada apenas
  como "fácil", sem questões nem explicação, avança a escada.
- Cada registro gera de 1 a 3 commits no repositório de dados (histórico mais longo).
- A chave do GitHub fica no navegador (como no resto do aplicativo); recomenda-se chave com validade e
  acesso só ao repositório de dados.
- A cópia local sem escopo (anterior à auditoria) só é aproveitada para o repositório principal
  `Flips794/mapa-mental-dados`.

## Validação manual sugerida
- Dois aparelhos reais (computador e celular) no GitHub, incluindo modo avião e reconexão.
- Duas abas com o cronômetro: pausar numa e finalizar na outra.
- Exportar e importar um backup real (`.json`).
