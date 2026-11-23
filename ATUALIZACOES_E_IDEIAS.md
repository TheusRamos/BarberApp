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

- **Estado:** Concluído em 17/11/2026 — não reproduzido no sistema atual. Conferido no navegador com um banco descartável: o card "Pendentes" do painel do administrador mostrou a mesma quantidade de reservas pendentes que a API, e os cards de Agendamentos também contam corretamente (item 020).
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

Acrescente novas ideias nesta seção, usando o modelo abaixo e o próximo identificador disponível: **026**.

## Atualizações concluídas

### 025 — Fila de espera pela tela e título dos agendamentos do administrador

- **Estado:** Concluído
- **Registrado em:** 23/11/2026
- **Concluído em:** 23/11/2026
- **Objetivo:** Corrigir os dois pontos mais visíveis da bateria de testes de usabilidade de 23/11/2026: a fila de espera não tinha caminho pela tela, e o administrador via "Seus Agendamentos" numa lista com todos os clientes.
- **Resumo da entrega:**
  - **Fila de espera:** a lista de horários do Início passa a mostrar ao cliente os horários ocupados, marcados como "09:00 · ocupado, entrar na fila". Ao escolher um deles, aparece a explicação logo abaixo e o botão vira "Entrar na fila de espera"; o envio cria o pedido na fila (`POST /api/waitlist`), e o horário é limpo para não reenviar sem querer. Se o horário vagar entre a escolha e o envio, a lista é atualizada e o cliente é avisado para confirmar o agendamento. Na edição de um agendamento e para o administrador, a lista continua só com os horários livres. O aviso antigo, para quando o horário é tomado entre a escolha e o envio, continua valendo.
  - **Título:** em Agendamentos, o administrador vê "Todos os Agendamentos"; o cliente continua vendo "Seus Agendamentos".
  - Conferido no navegador com um banco descartável (horário ocupado marcado, dica e botão mudando nos dois sentidos, entrada na fila, pedido repetido recusado, e a cliente da fila agendada sozinha quando o dono do horário cancelou).

### 024 — Limpeza de contas que nunca confirmam o e-mail

- **Estado:** Concluído — no ar desde 17/11/2026 (commit 0d8b02f), com a migração 6 aplicada no Neon
- **Registrado em:** 17/11/2026
- **Objetivo:** Não deixar no banco contas com e-mail inexistente (criadas porque o domínio existe, mas a caixa não), que ocupam o e-mail e o telefone.
- **Resumo da entrega:**
  - A limpeza que já rodava ao iniciar o servidor e de hora em hora (enquanto ele está acordado) passa a apagar contas de cliente não confirmadas quando o e-mail voltou como inexistente e não foi corrigido em 24 horas, ou depois de 7 dias sem confirmação.
  - Migração 6: `usuarios.email_definido_em`, desde quando o e-mail atual está na conta. Ao corrigir o e-mail, o prazo de 7 dias recomeça.
  - Garantias: só com o envio de e-mails configurado (sem ele, ninguém tem como confirmar) e só contas sem agendamentos, fila ou avaliações. Contas confirmadas, do Google e o administrador nunca são apagadas. Sessões e links da conta apagada saem junto.
  - O teste de integração cobre os casos que somem (e-mail que voltou há 25 horas, pendente há 8 dias) e os que ficam (e-mail que voltou há 1 hora, quem corrigiu o e-mail, conta com agendamento, conta confirmada, envio desligado).

### 023 — Cadastro com e-mail inexistente

- **Estado:** Concluído — no ar desde 17/11/2026 (commit d40fd8b), com a migração 5 no Neon, `BREVO_WEBHOOK_SECRET` no Render e o webhook transacional criado no Brevo (eventos hard bounce, invalid e blocked)
- **Registrado em:** 17/11/2026
- **Concluído em:** 17/11/2026
- **Objetivo:** Recusar ou corrigir cadastros com e-mail que não existe. Como não há como confirmar uma caixa de e-mail sem enviar uma mensagem, a solução tem três camadas.
- **Resumo da entrega:**
  - **Domínio:** o cadastro e a troca de e-mail consultam o DNS e recusam domínios que não recebem e-mail (`EMAIL_DOMAIN_INVALID`), como `gmail.cm` ou `gmail.con`. Falha de rede na consulta não barra ninguém.
  - **Sugestão:** o formulário sugere a correção de domínios parecidos com os comuns no Brasil (`gmial.com` → `gmail.com`) e segura o primeiro envio. Na conferência com o DNS real, `gmial.com` e `hotmial.com` recebem e-mail (domínios de terceiros), por isso a sugestão é necessária.
  - **Aviso do Brevo (webhook):** quando o e-mail volta como inexistente (`hard_bounce`, `invalid_email`, `blocked`), a conta não confirmada é marcada (migração 5: `usuarios.email_recusado_em`). O Início e o Perfil mostram "Esse e-mail parece não existir" e se atualizam sozinhos por alguns minutos; o cliente corrige o e-mail no Perfil (permitido só antes da confirmação), e um novo link é enviado. O webhook só aceita chamadas com o segredo `BREVO_WEBHOOK_SECRET`.
  - Testes: o de integração cobre os domínios (DNS falso), o webhook (com e sem segredo, conta confirmada intocada) e a troca de e-mail (domínio ruim, e-mail de outra conta, admin, link antigo invalidado, bloqueio depois de confirmar). Conferido no navegador (11 verificações), o que achou e corrigiu um clique perdido na sugestão.

### 022 — Recuperação de senha por e-mail (fase 4 da lista `alterações.md`)

- **Estado:** Concluído
- **Registrado em:** 17/11/2026
- **Objetivo:** Resolver o item 3 da lista de alterações e a pendência "recuperação de senha por e-mail" da revisão de segurança (item 013), reaproveitando o envio pelo Brevo e a tabela `tokens_email` do item 021 (sem migração nova).
- **Concluído em:** 17/11/2026
- **Resumo da entrega:**
  - Login com o link **Esqueci minha senha** (só aparece com o envio de e-mails configurado): pede o e-mail e mostra sempre a mesma mensagem, com o aviso de conferir o spam. O e-mail sai depois da resposta, para que nem o texto nem o tempo revelem quem tem cadastro.
  - Link `auth.html#redefinir=...`, válido por 1 hora e uma única vez, que abre o formulário **Nova senha** (com o botão de olho), mesmo com outra pessoa logada no aparelho.
  - Ao salvar: senha trocada, todas as sessões encerradas, e-mail confirmado e bloqueio de login (10 senhas erradas) liberado; a tela volta ao login com o e-mail preenchido. Link usado ou vencido leva de volta a **Recuperar senha**.
  - Conta só do Google recebe um e-mail explicando que entra pelo Google, sem link de redefinição.
  - Limites: 3 e-mails por conta e 10 pedidos por IP a cada hora; 30 usos de link por IP a cada 15 minutos.
  - Testes: o de integração cobre o fluxo contra o Brevo falso (conta existente, inexistente e do Google, senha curta sem gastar o link, sessões encerradas, bloqueio liberado, link usado, vencido e inválido, e-mail confirmado e limites). Conferido no navegador com um banco descartável (9 verificações).

### 021 — Confirmação de e-mail com o Brevo (fase 3 da lista `alterações.md`)

- **Estado:** Concluído — no ar desde 17/11/2026 (commit c5e1ad9), com a migração 4 aplicada no Neon (as 5 contas existentes ficaram confirmadas) e `BREVO_API_KEY` e `EMAIL_FROM` no Render
- **Teste real (17/11/2026):** o Brevo entregou o e-mail em 4 segundos, e o link confirmou a conta. A mensagem caiu no **spam**, com o remetente trocado pelo Brevo (`…@…k1.brevosend.com`), porque o remetente (e-mail institucional) não pode ser autenticado. O bloqueio por IP do Brevo foi desativado, para o Render conseguir enviar. Um domínio próprio, autenticado no Brevo, melhoraria a entrega.
- **Registrado em:** 17/11/2026
- **Objetivo:** Resolver o item 2 da lista de alterações e a pendência "verificação de e-mail" da revisão de segurança (item 013).
- **Decisões:** Envio pela API HTTP do Brevo (o Render bloqueia SMTP). Sem confirmar, o cliente entra, mas não agenda, não entra na fila e não avalia. Contas que já existiam, contas do Google e o administrador contam como confirmadas. O remetente é um e-mail grátis, que o Brevo troca por um endereço dele; por isso os avisos pedem para conferir o spam.
- **Concluído em:** 17/11/2026
- **Resumo da entrega:**
  - Migração 4: `usuarios.email_verificado` e tabela `tokens_email` (só o hash do token, validade e uso único; servirá também para a recuperação de senha).
  - `backend/email.js`: envio pelo Brevo, desligado sem `BREVO_API_KEY`, `EMAIL_FROM` e `PUBLIC_URL`, e e-mail de confirmação com link de 24 horas para `auth.html#verificar=...`.
  - API: o cadastro envia o link (a conta é criada mesmo se o envio falhar); `POST /api/auth/verify-email` confirma sem exigir login; `POST /api/auth/verify-email/resend` reenvia (3 por hora); `EMAIL_NOT_VERIFIED` bloqueia reserva, fila e avaliação.
  - Telas: aviso "Confirme seu e-mail para agendar" no Início (com o formulário travado) e no Perfil, ambos com **Reenviar link**; o link funciona mesmo aberto em outro aparelho ou colado com a página já aberta.
  - Mensagens de erro 5xx criadas de propósito (ex.: "Não foi possível enviar o e-mail agora") deixam de ser trocadas pela mensagem genérica de banco de dados.
  - Testes: o de integração cobre o fluxo contra um Brevo falso (envio, bloqueio, reenvio, limite, link usado, vencido e inválido, Brevo fora do ar). Conferido no navegador com um banco descartável: cadastro, avisos, reenvio, confirmação pelo link e desbloqueio (9 verificações).

### 020 — Cards de status clicáveis e horários do barbeiro em 24 h

- **Estado:** Concluído
- **Registrado em:** 17/11/2026
- **Objetivo:** Completar os ajustes das fases 1 e 2 da lista `alterações.md`: filtrar a lista pelos cards de Agendamentos e acabar com o formato "09:00 AM" no painel do administrador.
- **Concluído em:** 17/11/2026
- **Resumo da entrega:**
  - Página de agendamentos: os cards "Confirmados" e "Pendentes" mostram só os agendamentos daquele status e descem até a lista. O card ativo fica destacado, e a lista avisa "Mostrando só os agendamentos pendentes. Mostrar todos". Clicar de novo no card, em "Mostrar todos" ou no card "Agendamentos" volta a mostrar todos.
  - Os números dos cards contam sem o filtro de status (escolher "Pendentes" não zera "Confirmados"), mas respeitam os outros filtros.
  - Painel do administrador: início e fim do expediente do barbeiro passam a ser listas de 15 em 15 minutos, sempre no formato 24 h. Um horário salvo antes fora dessa lista (ex.: 09:10) continua aparecendo e não se perde ao editar.
  - Item 010 conferido e fechado.
  - Conferido no navegador (Chrome) com um banco descartável, como cliente (celular) e como administrador (computador).

### 019 — Calendário em português e filtro de data a partir de hoje (fase 2 da lista `alterações.md`)

- **Estado:** Concluído
- **Registrado em:** 17/11/2026
- **Objetivo:** Resolver os itens 4 e 8 da lista de alterações. No celular, o campo de data do navegador seguia o idioma do aparelho e aparecia no formato inglês (mm/dd/yyyy).
- **Concluído em:** 17/11/2026
- **Resumo da entrega:**
  - Calendário próprio (`js/calendario.js`) no lugar do `<input type="date">`, no agendamento e no filtro de Agendamentos: sempre em português, semana começando no domingo, dia de hoje marcado, uso pelo teclado (setas, PageUp/PageDown, Enter e Esc). O painel fica no `<body>`, para não ser cortado pelo formulário, e abre em cima do campo quando não cabe embaixo.
  - No agendamento, a data aparece como "Quarta-feira, 19/11/2026"; dias passados e dias em que o barbeiro escolhido não atende ficam bloqueados.
  - Filtro do cliente: começa em hoje e mostra os agendamentos de hoje em diante ("A partir de 17/11/2026"); "Todas as datas" mostra também os que já passaram. O administrador continua com o filtro vazio e, ao escolher uma data, vê só aquele dia.
  - Quando os filtros escondem todos os agendamentos, a página avisa e oferece "Ver todos os agendamentos".
  - Conferido no navegador (Chrome) com um banco descartável: 23 verificações, como cliente e como administrador, no celular e no computador, incluindo um agendamento feito pelo calendário.
- **Pendências:** nenhuma. Os campos de horário do barbeiro, no painel do administrador, que apareciam como "09:00 AM" num celular em inglês, foram resolvidos no item 020.

### 018 — Ajustes de login e da página de agendamentos (fase 1 da lista `alterações.md`)

- **Estado:** Concluído
- **Registrado em:** 17/11/2026
- **Objetivo:** Resolver os itens 1, 5, 6 e 7 da lista de alterações. As fases seguintes são: datas em PT-BR e filtro de data (itens 4 e 8), confirmação de e-mail (item 2) e recuperação de senha (item 3).
- **Concluído em:** 17/11/2026
- **Resumo da entrega:**
  - Botão de olho ("Mostrar senha") em todos os campos de senha: login, cadastro e "Alterar senha" do Perfil. Com o mouse, o foco continua no campo; ao enviar o formulário, a senha volta a ficar escondida.
  - Login recusado: a mensagem continua "Email ou senha incorretos." (dizer que a conta não existe revelaria quem é cliente) e, logo abaixo, "Ainda não tem conta? Criar conta", que abre a aba de cadastro com o e-mail já preenchido, sem sair da página.
  - Página de agendamentos: o card "Agendamentos" leva até a lista, com rolagem suave (instantânea para quem pediu menos movimento no aparelho); a busca por nome do cliente só aparece para o administrador.
  - Conferido no navegador (Chrome) com um banco descartável: 18 verificações, como cliente e como administrador, no celular e no computador.

### 017 — Correções da auditoria de segurança

- **Estado:** Concluído — o CAPTCHA aguarda as chaves do Cloudflare Turnstile no Render; o projeto antigo do Firebase aguarda exclusão pelo responsável
- **Registrado em:** 23/10/2026
- **Objetivo:** Corrigir as vulnerabilidades e os bugs encontrados nos testes de segurança e de funcionamento (124 verificações automáticas numa cópia local, checagens de leitura em produção, revisão do código e do histórico do git).
- **Concluído em:** 23/10/2026
- **Resumo da entrega:**
  - Dependência `proxy-addr` atualizada (alerta crítico do `npm audit`, GHSA-jqcg-44mw-7w3h).
  - CAPTCHA opcional (Cloudflare Turnstile): exigido no cadastro, contra contas falsas que lotariam a agenda, e no login de uma conta com muitas tentativas, no lugar do bloqueio de 15 minutos que permitia travar o acesso de outra pessoa.
  - O cliente só cancela a própria reserva antes do horário; o botão some para reservas que já passaram.
  - Textos sem caracteres invisíveis ou de controle; fotos conferidas pela assinatura do arquivo.
  - Lista pública de ocupações sem ids sequenciais; rota legada `GET /api/horarios` removida.
  - Avaliações públicas com o nome abreviado (primeiro nome e inicial do sobrenome).
  - Conta do Google com nome curto passa a se chamar "Cliente" em vez de ficar impedida de agendar; o formulário de reserva deixa de validar nome e e-mail, que vêm da conta.
  - Painel "Clientes" sem os administradores; horários filtrados no fuso da barbearia.
- **Pendências:** excluir o projeto antigo do Firebase (`barbearia-7387c`), ainda ativo e com dados de junho, cuja configuração está no histórico público do git; exclusão da própria conta pelo cliente (LGPD), que depende de decidir como preservar o histórico de reservas.

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
- **Pendências da revisão:** revisão do histórico do git para o item 008. A verificação de e-mail foi entregue no item 021, e a recuperação de senha por e-mail, no item 022. A revalidação da fila foi entregue com o item 001; troca de senha e "sair de todos os dispositivos", no item 014; publicação do backend com testes no CI, no item 015.

## Modelo para novos registros

```markdown
### 018 — Título da melhoria, correção ou ideia

- **Estado:** Pendente
- **Registrado em:** DD/MM/AAAA
- **Objetivo:**
- **Comportamento esperado:**
- **Critérios de aceite:**
- **Pontos a definir:**
- **Concluído em:**
- **Resumo da entrega:**
```
