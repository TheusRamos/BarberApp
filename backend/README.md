# Backend do BarberApp

Node.js 22+ e PostgreSQL. O servidor entrega o site e `/api` na mesma origem.

Consulte o [README principal](../README.md) para a referência de variáveis, permissões, rotas REST, publicação, operação, limitações e gestão de riscos.

## Executar localmente

1. Crie um banco vazio chamado `barberapp` no PostgreSQL (pelo pgAdmin ou `CREATE DATABASE barberapp;`).
2. Na raiz do projeto, execute `npm ci` e copie `.env.example` para `.env` se ainda não possuir uma configuração própria.
3. Preencha `DATABASE_URL` com usuário, senha, host, porta e banco reais. Caracteres especiais na URL devem ser codificados. Nunca coloque essa URL no frontend.
4. Execute `npm run db:migrate` para criar/adaptar as tabelas.
5. Para criar o administrador, preencha os campos `ADMIN_*` no `.env`, execute `npm run admin:create` e remova a senha desse arquivo.
6. Execute `npm start` e abra **http://127.0.0.1:3000**. No PowerShell com scripts bloqueados, use `npm.cmd`.
7. Entre como administrador, cadastre os serviços e depois os profissionais com seus serviços, durações e dias. Os horários são criados ao reservar; não é preciso cadastrar cada horário manualmente.

## Modelo e migração

`schema.sql` (migração 1) parte das tabelas `usuarios`, `cabeleireiros`, `servicos`, `horarios`, `agendamentos` e `comentarios` fornecidas. As migrações seguintes ficam em `migrations/` e são listadas em `migrations/index.js`. Cada versão é aplicada uma única vez, em transação, e registrada em `schema_migrations`; por isso `npm run db:migrate` pode ser executado novamente com segurança. Para alterar o banco, crie um novo arquivo de migração em vez de editar os existentes.

Também pode ser aplicada sobre o modelo original já criado. Faça backup antes de migrar dados existentes. Emails duplicados ao ignorar maiúsculas, serviços com nomes duplicados ou agendamentos ligados a horários de outro profissional devem ser corrigidos antes: a migração falhará e reverterá as alterações nesses casos. Usuários existentes precisam ter senhas no formato scrypt gerado pelo backend; senhas em texto puro não são aceitas. Não há conversão automática de senhas.

Adaptações:

- `tipo` continua em português; a API traduz para `role: client/admin`.
- `agendado` corresponde a `Pendente`; `confirmado` foi acrescentado para suportar `Confirmado` na interface.
- A unicidade de horário vale para reservas ativas. Cancelamentos e conclusões preservam o histórico e liberam a reserva.
- Preço e duração são copiados do banco para cada agendamento, sem confiar nos valores enviados pelo navegador.
- `cabeleireiro_servicos` relaciona os profissionais aos serviços e guarda a duração por profissional. Configure os relacionamentos de profissionais existentes pelo painel após migrar.
- Fotos, descrição, dias e expediente completam o cadastro dos profissionais.
- `agendamento_servicos` (migração 2) guarda todos os serviços de cada reserva; `agendamentos.servico_id` mantém o primeiro serviço, e `duracao`/`valor` os totais.
- `fila_espera` guarda os pedidos em ordem de entrada, com os serviços desejados em `fila_espera_servicos`. Cancelamento, conclusão, exclusão ou mudança de horário promovem pedidos cujo intervalo total cabe no espaço liberado e que ainda atendem às regras do profissional.
- Comentários novos, inclusive os existentes na migração, precisam de aprovação. A regra de envio é login + 1 a 5 estrelas + até 50 palavras.
- `sessoes` guarda apenas o hash dos tokens, com validade de sete dias. Senhas usam scrypt com salt aleatório.
- `usuarios.google_id` (migração 3) liga a conta ao login com Google. Essas contas não têm senha e começam sem telefone; `senha` e `telefone` passaram a aceitar nulo, mas toda conta precisa de senha ou `google_id`, e a API exige o telefone para reservar ou entrar na fila.

O campo `horarios.disponivel` representa bloqueio manual; a ocupação é calculada a partir dos agendamentos ativos. A API serializa alterações da agenda com trava transacional do PostgreSQL e verifica intervalos sobrepostos. Escritas diretas no banco devem respeitar as mesmas regras; não há trigger para automatizar a fila ou verificar todos os intervalos fora da API.

Exclusão de usuários/serviços com histórico retorna conflito, preservando os registros relacionados. Profissionais sem reservas ativas são desativados, preservando o histórico.

## Hospedagem

A publicação atual usa o Render para este servidor, configurado em [render.yaml](../render.yaml), e o Neon para o PostgreSQL. Os passos estão em [Publicação](../README.md#publicação). Em outra hospedagem, use HTTPS em produção e `HOST=0.0.0.0` quando a plataforma precisar receber conexões externas. GitHub Pages hospeda apenas o frontend.

Para manter o frontend separado, configure `BarberApp/BarberApp/js/config.js` com a URL HTTPS terminada em `/api` e configure `CORS_ORIGIN` no servidor com a origem exata do site, sem caminho. `PGSSL=true` ativa TLS com validação do certificado; configure a CA necessária no ambiente se o provedor exigir.

## Validação

`npm test` executa os testes de segurança. Para executar também o teste de integração, defina `TEST_DATABASE_URL` apontando para um banco **vazio e descartável** e execute `npm test`. O teste cria tabelas e dados e recusa um banco já preenchido. Ele cobre autenticação, permissões, concorrência, fila, cotas, moderação, logout, troca de senha, saída de todos os dispositivos, limites de login, cabeçalhos de segurança e preservação de preço histórico. Não usa `DATABASE_URL` para criar os dados de teste.

O comando de testes não carrega `.env` automaticamente: defina `TEST_DATABASE_URL` no ambiente do terminal. As tabelas criadas permanecem depois do teste; uma nova execução exige um banco vazio novamente. Exemplos de comandos estão em [Testes e validação](../README.md#testes-e-validação).

`GET /api/health` verifica a conexão. Rotas públicas: serviços, profissionais, horários, reservas sem dados pessoais e comentários aprovados. As demais exigem token; a administração exige perfil administrador. O servidor aceita apenas campos permitidos e usa parâmetros SQL.

Referências: [transações com node-postgres](https://node-postgres.com/features/transactions) e [criptografia do Node.js](https://nodejs.org/api/crypto.html).
