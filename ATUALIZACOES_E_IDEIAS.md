# Atualizações futuras e ideias pendentes

Registro de melhorias, correções e ideias para o BarberApp. Os itens abaixo estão pendentes de implementação; sua inclusão neste arquivo não significa que já foram desenvolvidos.

Estados sugeridos: **Pendente**, **Em andamento**, **Concluído** e **Adiado**. Ao concluir um item, registre a data e um breve resumo da entrega.

## Sugestões de melhoria (Wagner)

### 001 — Selecionar vários serviços no mesmo agendamento

- **Estado:** Pendente
- **Registrado em:** 22/09/2026
- **Objetivo:** Permitir que o cliente selecione mais de um serviço disponível em um único agendamento.
- **Origem:** Sugestão de Wagner.
- **Comportamento esperado:** O backend deverá somar a duração de todos os serviços selecionados e procurar horários com um intervalo livre suficiente para realizar todos eles. A disponibilidade deverá considerar o expediente do barbeiro e os agendamentos existentes.
- **Critérios de aceite:**
  - Permitir selecionar um ou mais serviços disponíveis para o barbeiro escolhido.
  - Calcular a duração total no backend, usando as durações cadastradas dos serviços para o profissional.
  - Somar os valores dos serviços selecionados e apresentar o preço total do agendamento.
  - Oferecer apenas horários que comportem a duração total, sem sobreposição com outras reservas nem ultrapassar o expediente.
  - Revalidar a disponibilidade no backend ao confirmar a reserva.
  - Registrar e apresentar todos os serviços selecionados no agendamento.
- **Pontos a definir:** Comportamento da fila de espera para agendamentos com vários serviços.

### 002 — Mostrar a média de avaliação de cada barbeiro

- **Estado:** Pendente
- **Registrado em:** 22/09/2026
- **Objetivo:** Exibir, na seção de comentários, a média de avaliação individual de cada barbeiro.
- **Origem:** Sugestão de Wagner.
- **Comportamento esperado:** Agrupar as avaliações por barbeiro e apresentar a média correspondente a cada profissional, com identificação clara.
- **Critérios de aceite:**
  - Calcular e exibir a média individual de cada barbeiro.
  - Atualizar a média quando as avaliações consideradas no cálculo mudarem.
  - Mostrar uma indicação de ausência de avaliações quando o barbeiro ainda não tiver notas.
- **Pontos a definir:** Como vincular cada avaliação ao barbeiro; quais avaliações entram no cálculo (por exemplo, somente as aprovadas); arredondamento da média e exibição da quantidade de avaliações.

## Problemas e ajustes pendentes

Os problemas abaixo foram relatados e ainda precisam ser investigados. As causas e o alcance das correções não foram confirmados.

### 003 — Requisição de permissões ao agendar e observações opcionais

- **Estado:** Pendente
- **Relato:** Requisição de permissões ao tentar agendar com uma conta que não era do Google ou sem preencher o campo de observações.
- **Objetivo:** Investigar os dois cenários e corrigir eventuais bloqueios indevidos de agendamento.
- **Comportamento esperado:** Uma conta de cliente autorizada deve conseguir agendar independentemente da origem do cadastro. O campo de observações deve ser opcional.
- **Pontos a verificar:** Mensagem apresentada, permissões da conta e comportamento ao enviar observações vazias ou omitir o campo.

### 004 — Comentários duplicados dos clientes

- **Estado:** Pendente
- **Relato:** Comentários dos clientes aparecem duplicados.
- **Objetivo:** Investigar se a duplicação ocorre no envio, armazenamento ou exibição e corrigir a causa.
- **Comportamento esperado:** Um comentário enviado uma única vez deve ser registrado e exibido uma única vez.

### 005 — Bug na avaliação de comentários pelo administrador

- **Estado:** Pendente
- **Relato:** Falha na avaliação dos comentários por parte do administrador.
- **Objetivo:** Reproduzir e corrigir o problema no fluxo administrativo de análise dos comentários.
- **Pontos a definir:** Ação afetada, resultado esperado, resultado observado e passos para reproduzir.

### 006 — Alteração do banco de dados

- **Estado:** Pendente
- **Objetivo:** Planejar as alterações necessárias no banco de dados.
- **Pontos a definir:** Tabelas e campos afetados, novas regras, necessidade de migração e preservação dos dados existentes.

### 007 — Alterar o layout e o visual do sistema

- **Estado:** Pendente
- **Objetivo:** Revisar o layout e a apresentação visual das telas do sistema.
- **Pontos a definir:** Telas prioritárias, referências visuais e relação com a identidade visual prevista no item 012.

### 008 — Retirar dados pessoais dos alunos do sistema

- **Estado:** Pendente
- **Objetivo:** Identificar e remover todo tipo de dado pessoal dos alunos presente no sistema.
- **Pontos a verificar:** Textos, imagens, contatos, créditos, dados de exemplo e registros armazenados, conforme aplicável.
- **Comportamento esperado:** O sistema não deve conter dados pessoais dos alunos após a conclusão da revisão e remoção.

### 009 — Verificar possíveis bugs no cadastro de clientes

- **Estado:** Pendente
- **Objetivo:** Revisar o fluxo de cadastro de clientes e corrigir bugs, se encontrados.
- **Pontos a verificar:** Validação dos campos, envio, mensagens de erro, duplicidade de contas e conclusão do cadastro.
- **Observação:** Não há um defeito específico confirmado neste registro.

### 010 — Dashboard de agendamentos pendentes parado em zero

- **Estado:** Pendente
- **Relato:** O indicador de agendamentos pendentes permanece em 0.
- **Objetivo:** Investigar e corrigir a contagem e a atualização do indicador.
- **Comportamento esperado:** Exibir a quantidade de agendamentos pendentes correspondente ao período e aos filtros aplicáveis, atualizando após mudanças relevantes.

## Melhorias futuras

### 011 — Disponibilizar uma aplicação mobile com Cordova

- **Estado:** Pendente
- **Objetivo:** Converter o site em uma aplicação mobile também, utilizando Cordova.
- **Pontos a definir:** Plataformas atendidas, adaptação das telas, integração com o backend, permissões necessárias e forma de distribuição.

### 012 — Criar uma identidade visual para a barbearia

- **Estado:** Pendente
- **Objetivo:** Desenvolver a identidade visual da barbearia (design).
- **Pontos a definir:** Logotipo, paleta de cores, tipografia e diretrizes de aplicação no site e na futura aplicação mobile.

## Outras ideias pendentes

Acrescente novas ideias nesta seção, usando o modelo abaixo e o próximo identificador disponível: **013**.

## Atualizações concluídas

Nenhuma implementação registrada neste arquivo até o momento.

## Modelo para novos registros

```markdown
### 013 — Título da melhoria, correção ou ideia

- **Estado:** Pendente
- **Registrado em:** DD/MM/AAAA
- **Objetivo:**
- **Comportamento esperado:**
- **Critérios de aceite:**
- **Pontos a definir:**
- **Concluído em:**
- **Resumo da entrega:**
```
