# Atualizações futuras e ideias pendentes

Registro de melhorias, correções e ideias para o BarberApp. Os itens abaixo estão pendentes de implementação; sua inclusão neste arquivo não significa que já foram desenvolvidos.

Estados sugeridos: **Pendente**, **Em andamento**, **Concluído** e **Adiado**. Ao concluir um item, registre a data e um breve resumo da entrega.

## Sugestões de melhoria (Wagner)

### 001 — Selecionar vários serviços no mesmo agendamento

- **Estado:** Em andamento — implementado e testado na API; aguardando validação no navegador
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
- **Decisão (20/10/2026):** O pedido na fila guarda todos os serviços desejados e só é promovido quando houver tempo livre para todos eles a partir do horário pedido (soma das durações do profissional). Assim, quem pediu os mesmos serviços de uma reserva cancelada sempre cabe no espaço liberado.
- **Andamento (20/10/2026):** Migração 2 com `agendamento_servicos` e `fila_espera_servicos`. A API aceita `servicos` (1 a 5) e soma duração e preço. A interface usa múltipla escolha e mostra o total. A promoção da fila revalida dias, expediente e serviços do profissional. O teste de integração cobre reserva combinada, edição e promoção somente com intervalo suficiente.

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

- **Estado:** Em andamento — aguardando validação no navegador
- **Relato:** Comentários dos clientes aparecem duplicados.
- **Objetivo:** Investigar se a duplicação ocorre no envio, armazenamento ou exibição e corrigir a causa.
- **Comportamento esperado:** Um comentário enviado uma única vez deve ser registrado e exibido uma única vez.
- **Andamento (20/10/2026):** Causa provável identificada no envio: o botão não era desabilitado durante a requisição e a API aceitava envios repetidos. O botão agora fica bloqueado durante o envio, e a API aceita apenas uma avaliação pendente por usuário, de forma atômica (`COMMENT_PENDING`). O teste de integração cobre dois envios simultâneos. A exibição não duplica registros.

### 005 — Bug na avaliação de comentários pelo administrador

- **Estado:** Pendente
- **Relato:** Falha na avaliação dos comentários por parte do administrador.
- **Objetivo:** Reproduzir e corrigir o problema no fluxo administrativo de análise dos comentários.
- **Pontos a definir:** Ação afetada, resultado esperado, resultado observado e passos para reproduzir.
- **Andamento (20/10/2026):** O defeito relatado não foi reproduzido pela leitura do código. Foram corrigidos: resposta da aprovação sem o nome do autor, cliques repetidos em Aprovar/Reprovar/Remover e ausência de forma de despublicar. O administrador agora pode **ocultar** uma avaliação aprovada, que volta para a moderação. "Reprovar" continua excluindo o registro. Falta confirmar com os passos do relato original.

### 006 — Alteração do banco de dados

- **Estado:** Em andamento
- **Objetivo:** Planejar as alterações necessárias no banco de dados.
- **Pontos a definir:** Tabelas e campos afetados, novas regras, necessidade de migração e preservação dos dados existentes.
- **Andamento (20/10/2026):** Criado o mecanismo de migrações incrementais (`backend/migrations/`). Cada versão é aplicada uma única vez por `npm run db:migrate`. A migração 2 (vários serviços) preserva os dados existentes; a atualização v1 → v2 foi ensaiada em um banco com dados. Outras alterações planejadas devem virar novas migrações.

### 007 — Alterar o layout e o visual do sistema

- **Estado:** Pendente
- **Objetivo:** Revisar o layout e a apresentação visual das telas do sistema.
- **Pontos a definir:** Telas prioritárias, referências visuais e relação com a identidade visual prevista no item 012.

### 008 — Retirar dados pessoais dos alunos do sistema

- **Estado:** Pendente
- **Objetivo:** Identificar e remover todo tipo de dado pessoal dos alunos presente no sistema.
- **Pontos a verificar:** Textos, imagens, contatos, créditos, dados de exemplo e registros armazenados, conforme aplicável.
- **Comportamento esperado:** O sistema não deve conter dados pessoais dos alunos após a conclusão da revisão e remoção.
- **Decisão (20/10/2026):** Os créditos com os nomes dos autores, no rodapé de `index.html` e no README, permanecem. Ainda falta revisar o histórico do git e os dados do banco.

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

Acrescente novas ideias nesta seção, usando o modelo abaixo e o próximo identificador disponível: **017**.

## Atualizações concluídas

### 016 — Entrar com uma conta do Google

- **Estado:** Concluído — no ar desde 23/10/2026; até a análise do Google Safe Browsing, o Chrome mostra "Site perigoso" ao clicar no botão do Google (ver README, "Aviso 'Site perigoso' do Chrome")
- **Registrado em:** 23/10/2026
- **Objetivo:** Permitir cadastro e login pelo Google, sem criar senha.
- **Concluído em:** 23/10/2026
- **Resumo da entrega:**
  - Botão **Continuar com o Google** na página de login, exibido só quando o servidor tem `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `PUBLIC_URL`.
  - Fluxo de código do OpenID Connect feito no servidor, com `state`, PKCE e `nonce`; nenhum script do Google nas páginas. O token da sessão não passa pela URL: a página troca um código de uso único pela sessão.
  - O primeiro acesso cria uma conta de cliente sem senha e sem telefone. O Perfil pede o telefone, e a API exige o número para agendar ou entrar na fila (`PHONE_REQUIRED`). O formulário de troca de senha não aparece para essas contas.
  - Um e-mail já cadastrado com senha não é vinculado ao Google (o site não confirma e-mails); o usuário continua entrando com e-mail e senha.
  - Migração 3: `usuarios.google_id`, com `senha` e `telefone` opcionais. O teste de integração cobre o fluxo completo contra um servidor falso do Google.
  - Limpeza: removidos `barbeiros.html` e `js/barbeiros.js` (página legada), `LEIA-ME.txt` (repetia o README) e `backend/criar_banco_local.sql` (repetia as migrações).

### 015 — Publicação no Render com testes automáticos

- **Estado:** Concluído — aguardando o cadastro de serviços e profissionais no banco de produção
- **Registrado em:** 23/10/2026
- **Objetivo:** Publicar o sistema completo (site, API e banco) sem custo e executar os testes a cada envio ao GitHub, pendência da revisão de segurança (item 013).
- **Concluído em:** 23/10/2026
- **Resumo da entrega:**
  - Site e API em https://barberapp-at0n.onrender.com (Render, plano grátis, região Ohio), configurados em `render.yaml`. Banco PostgreSQL no Neon, na mesma região.
  - O workflow do GitHub Pages foi substituído por `ci.yml`, que executa `npm test` com um PostgreSQL descartável a cada push e pull request. O Render só publica depois que os testes passam. O GitHub Pages foi desativado.
  - Os limites de login e cadastro por IP passam a usar o IP real do cliente atrás do Cloudflare do Render (`CLIENT_IP_HEADER=CF-Connecting-IP`), com teste de integração.
  - Versão do Node.js fixada em `.node-version` (24) para o CI e o Render.

### 014 — Troca de senha e "Sair de todos os dispositivos"

- **Estado:** Concluído — testado na API; aguardando validação no navegador
- **Registrado em:** 21/10/2026
- **Objetivo:** Permitir que o usuário troque a senha e encerre todas as sessões abertas, pendências da revisão de segurança (item 013).
- **Concluído em:** 21/10/2026
- **Resumo da entrega:**
  - `POST /api/auth/password`: exige a senha atual (`WRONG_PASSWORD` se incorreta), recusa repetir a mesma senha, valida 8 a 128 caracteres e encerra as outras sessões, mantendo a do dispositivo que fez a troca. Limite de 5 tentativas por usuário a cada 15 minutos.
  - `POST /api/auth/logout-all`: encerra todas as sessões do usuário, inclusive a atual.
  - Página **Perfil**: formulário "Alterar senha" e botão "Sair de todos os dispositivos", com confirmação. O token local só é apagado se o servidor confirmar o encerramento.
  - O teste de integração cobre senha atual errada, senha repetida, senha curta, troca bem-sucedida, revogação das outras sessões, login com a senha antiga e nova, e saída de todos os dispositivos.

### 013 — Endurecimento de segurança (primeira etapa)

- **Estado:** Concluído
- **Registrado em:** 20/10/2026
- **Objetivo:** Corrigir as vulnerabilidades prioritárias da revisão geral do sistema.
- **Concluído em:** 20/10/2026
- **Resumo da entrega:**
  - Cota por cliente de reservas ativas futuras + pedidos na fila (`MAX_ACTIVE_BOOKINGS`, padrão 3) e uma avaliação pendente por usuário.
  - Cabeçalhos de segurança e CSP sem scripts inline (scripts de `comentarios.html` e `sobre.html` movidos para `js/star-picker.js` e `js/sobre.js`).
  - Limites de login por IP e por conta, limite de cadastro por IP e suporte a proxy (`TRUST_PROXY`).
  - Login sem diferença de tempo para e-mail inexistente; senha mínima de 8 caracteres; limpeza periódica de sessões expiradas.
  - Lista pública de avaliações sem identificador do autor; erros de JSON malformado sem mensagem interna.
  - Bloqueio de cliques repetidos em login, cadastro, reserva, fila, serviços, profissionais e moderação.
- **Pendências da revisão:** recuperação de senha por e-mail, verificação de e-mail e revisão do histórico do git para o item 008. A revalidação da fila foi entregue com o item 001; troca de senha e "sair de todos os dispositivos", no item 014; publicação do backend com testes no CI, no item 015.

## Modelo para novos registros

```markdown
### 017 — Título da melhoria, correção ou ideia

- **Estado:** Pendente
- **Registrado em:** DD/MM/AAAA
- **Objetivo:**
- **Comportamento esperado:**
- **Critérios de aceite:**
- **Pontos a definir:**
- **Concluído em:**
- **Resumo da entrega:**
```
