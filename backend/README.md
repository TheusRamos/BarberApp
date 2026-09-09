# Backend do BarberApp

Node.js 22+ e PostgreSQL. O servidor entrega o site e `/api` na mesma origem.

## Executar localmente

1. Crie um banco vazio chamado `barberapp` no PostgreSQL (pelo pgAdmin ou `CREATE DATABASE barberapp;`).
2. Na raiz do projeto, execute `npm install` e copie `.env.example` para `.env`.
3. Preencha `DATABASE_URL` com usuário, senha, host, porta e banco reais. Caracteres especiais na URL devem ser codificados. Nunca coloque essa URL no frontend.
4. Execute `npm run db:migrate` para criar/adaptar as tabelas.
5. Para criar o administrador, preencha os campos `ADMIN_*` no `.env`, execute `npm run admin:create` e remova a senha desse arquivo.
6. Execute `npm start` e abra **http://127.0.0.1:3000**. No PowerShell com scripts bloqueados, use `npm.cmd`.
7. Entre como administrador, cadastre os serviços e depois os profissionais com seus serviços, durações e dias. Os horários são criados ao reservar; não é preciso cadastrar cada horário manualmente.

## Modelo e migração

`schema.sql` parte das tabelas `usuarios`, `cabeleireiros`, `servicos`, `horarios`, `agendamentos` e `comentarios` fornecidas. A migração é transacional e registrada em `schema_migrations`, portanto pode ser executada novamente sem repetir as alterações.

Também pode ser aplicada sobre o modelo original já criado. Faça backup antes de migrar dados existentes. Emails duplicados ao ignorar maiúsculas, serviços com nomes duplicados ou agendamentos ligados a horários de outro profissional devem ser corrigidos antes: a migração falhará e reverterá as alterações nesses casos. Usuários existentes precisam ter senhas no formato scrypt gerado pelo backend; senhas em texto puro não são aceitas. Não há conversão automática de senhas.

Adaptações:

- `tipo` continua em português; a API traduz para `role: client/admin`.
- `agendado` corresponde a `Pendente`; `confirmado` foi acrescentado para suportar `Confirmado` na interface.
- A unicidade de horário vale para reservas ativas. Cancelamentos e conclusões preservam o histórico e liberam a reserva.
- Preço e duração são copiados do banco para cada agendamento, sem confiar nos valores enviados pelo navegador.
- `cabeleireiro_servicos` relaciona os profissionais aos serviços e guarda a duração por profissional. Configure os relacionamentos de profissionais existentes pelo painel após migrar.
- Fotos, descrição, dias e expediente completam o cadastro dos profissionais.
- `fila_espera` guarda os pedidos em ordem de entrada; cancelamento, conclusão, exclusão ou mudança de horário promovem pedidos que cabem no intervalo liberado.
- Comentários novos, inclusive os existentes na migração, precisam de aprovação. A regra de envio é login + 1 a 5 estrelas + até 50 palavras.
- `sessoes` guarda apenas o hash dos tokens, com validade de sete dias. Senhas usam scrypt com salt aleatório.

O campo `horarios.disponivel` representa bloqueio manual; a ocupação é calculada a partir dos agendamentos ativos. A API serializa alterações da agenda com trava transacional do PostgreSQL e verifica intervalos sobrepostos. Escritas diretas no banco devem respeitar as mesmas regras; não há trigger para automatizar a fila ou verificar todos os intervalos fora da API.

Exclusão de usuários/serviços com histórico retorna conflito, preservando os registros relacionados. Profissionais sem reservas ativas são desativados, preservando o histórico.

## Hospedagem

GitHub Pages hospeda apenas o frontend. Para executar a aplicação completa, hospede este servidor Node.js e um PostgreSQL. Use HTTPS em produção e `HOST=0.0.0.0` quando a plataforma precisar receber conexões externas.

Para manter o frontend separado, configure `BarberApp/BarberApp/js/config.js` com a URL HTTPS terminada em `/api` e configure `CORS_ORIGIN` no servidor com a origem exata do site, sem caminho. `PGSSL=true` ativa TLS com validação do certificado; configure a CA necessária no ambiente se o provedor exigir.

## Validação

`npm test` executa os testes de segurança. Para executar também o teste de integração, defina `TEST_DATABASE_URL` apontando para um banco **vazio e descartável** e execute `npm test`. O teste cria tabelas e dados e recusa um banco já preenchido. Ele cobre autenticação, permissões, concorrência, fila, moderação, logout e preservação de preço histórico. Não usa `DATABASE_URL` para criar os dados de teste.

`GET /api/health` verifica a conexão. Rotas públicas: serviços, profissionais, horários, reservas sem dados pessoais e comentários aprovados. As demais exigem token; a administração exige perfil administrador. O servidor aceita apenas campos permitidos e usa parâmetros SQL.

Referências: [transações com node-postgres](https://node-postgres.com/features/transactions) e [criptografia do Node.js](https://nodejs.org/api/crypto.html).
