# BarberApp — Sistema de agendamentos

Aplicação web para uma barbearia, com cadastro de clientes, reservas por profissional, fila de espera, avaliações moderadas e painel administrativo. O frontend usa HTML, CSS e JavaScript; a API usa Node.js/Express e persiste os dados em PostgreSQL.

O servidor Node.js entrega o site e a API na mesma origem. **Abrir o HTML diretamente ou publicar apenas no GitHub Pages não disponibiliza o sistema completo.**

## Índice

- [Arquitetura e tecnologias](#arquitetura-e-tecnologias)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Instalação e execução](#instalação-e-execução)
- [Configuração](#configuração)
- [Comandos disponíveis](#comandos-disponíveis)
- [Uso e permissões](#uso-e-permissões)
- [Regras de negócio](#regras-de-negócio)
- [Banco de dados e migrações](#banco-de-dados-e-migrações)
- [API REST](#api-rest)
- [Testes e validação](#testes-e-validação)
- [Publicação](#publicação)
- [Operação e segurança](#operação-e-segurança)
- [Gestão de riscos](#gestão-de-riscos)
- [Limitações conhecidas](#limitações-conhecidas)
- [Solução de problemas](#solução-de-problemas)
- [Manutenção e documentação](#manutenção-e-documentação)

## Arquitetura e tecnologias

```text
Navegador: páginas HTML + CSS + JavaScript
    → js/api.js: fetch + token Bearer
    → /api: Express, validação e autorização
    → PostgreSQL: usuários, agenda, serviços, fila e sessões
```

| Camada | Implementação |
| --- | --- |
| Interface | HTML5, CSS próprio e JavaScript ES Modules, sem etapa de build |
| Fontes e ícones | Google Fonts: Manrope, Inter e Material Symbols |
| Backend | Node.js, Express 5 e driver `pg` |
| Persistência | PostgreSQL, consultas parametrizadas e transações |
| Autenticação | Senhas scrypt com salt; tokens de sessão com hash no banco |
| Testes | Executor nativo `node:test` |
| Publicação automatizada atual | GitHub Actions → GitHub Pages, somente frontend |

## Estrutura do repositório

```text
.
├── .env.example                 # Modelo de configuração, sem credenciais reais
├── .github/workflows/deploy.yml  # Publicação do frontend no GitHub Pages
├── .gitignore
├── package.json
├── package-lock.json
├── README.md
├── Gestão de Riscos.docx         # Análise, respostas e monitoramento de 18 riscos
├── backend/
│   ├── README.md                # Notas específicas do backend
│   ├── server.js                # Inicialização e encerramento
│   ├── app.js                   # Rotas REST, autorização e erros
│   ├── db.js                    # Pool PostgreSQL e transações
│   ├── security.js              # Validações, senhas e sessões
│   ├── bookings.js              # Conflitos, reservas e promoção da fila
│   ├── schema.sql               # Estrutura e adaptação inicial do banco
│   ├── migrate.js               # Migração versionada
│   ├── admin.js                 # Criação de administrador via terminal
│   └── test/
│       ├── security.test.js
│       └── integration.test.js
└── BarberApp/BarberApp/
    ├── index.html               # Reserva e oferta de fila de espera
    ├── agendamentos.html        # Agenda, filtros e estatísticas
    ├── admin.html               # Serviços, profissionais e clientes
    ├── auth.html                # Login, cadastro e perfil
    ├── comentarios.html         # Avaliações e moderação
    ├── sobre.html               # Serviços, equipe e informações públicas
    ├── barbeiros.html           # Página legada; redireciona para admin.html
    ├── LEIA-ME.txt
    ├── css/
    │   ├── style.css
    │   ├── agendamentos.css
    │   └── barbeiros.css
    ├── js/
    │   ├── api.js               # Cliente REST e armazenamento do token
    │   ├── config.js            # URL base da API
    │   ├── app.js               # Agenda, administração, fila e avaliações
    │   ├── auth.js              # Cadastro, login, logout e perfil
    │   ├── barbeiros.js         # Gestão legada de profissionais
    │   ├── sidebar.js
    │   └── animations.js
    └── resources/barbearia.jpg
```

## Instalação e execução

### Pré-requisitos

- Node.js **22 ou superior**, conforme `package.json`, com suporte à opção `--env-file-if-exists` usada pelos scripts. Use uma versão atualizada da linha escolhida.
- npm disponível no terminal.
- PostgreSQL acessível e uma conta autorizada a criar o esquema no banco da aplicação. O repositório não declara uma versão mínima específica do PostgreSQL.
- Navegador com suporte a ES Modules, `fetch` e `IntersectionObserver`.

Execute os comandos na **raiz do repositório**, onde está `package.json`.

### 1. Instalar dependências

```powershell
npm.cmd ci
```

Os exemplos usam PowerShell e `npm.cmd`, evitando bloqueios do `npm.ps1`. Em outros terminais, use `npm`. `npm ci` instala as versões do lockfile; ao alterar dependências intencionalmente, atualize também `package-lock.json`.

### 2. Criar o banco e configurar o ambiente

No pgAdmin ou em uma sessão PostgreSQL com permissão para criar bancos:

```sql
CREATE DATABASE barberapp;
```

No terminal, copie o modelo **somente se ainda não tiver um `.env` próprio**:

```powershell
Copy-Item .env.example .env
```

Edite `.env` e substitua os valores de exemplo da conexão:

```dotenv
DATABASE_URL=postgresql://USUARIO:SENHA@127.0.0.1:5432/barberapp
HOST=127.0.0.1
PORT=3000
APP_TIMEZONE=America/Sao_Paulo
PGSSL=false
```

Codifique caracteres especiais do usuário/senha na URL, como `@` → `%40`. O arquivo `.env` é ignorado pelo Git. A conexão PostgreSQL deve permanecer no backend.

### 3. Aplicar a migração

```powershell
npm.cmd run db:migrate
```

O comando cria/adapta as tabelas e registra a versão aplicada. Para um banco com dados existentes, siga primeiro [Banco de dados e migrações](#banco-de-dados-e-migrações).

### 4. Criar o administrador

Preencha temporariamente `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PHONE` e `ADMIN_PASSWORD` no `.env`, conforme o modelo. Use dados próprios e uma senha forte, sem reutilizar credenciais de exemplo.

```powershell
npm.cmd run admin:create
```

Depois do sucesso, remova `ADMIN_PASSWORD` do arquivo. O comando **insere uma conta nova**; não promove nem atualiza automaticamente uma conta existente. E-mail e telefone precisam ser únicos. O cadastro público cria apenas clientes.

### 5. Iniciar e preparar a agenda

```powershell
npm.cmd start
```

Acesse **http://127.0.0.1:3000**. Para desenvolvimento com reinício automático, use `npm.cmd run dev`.

1. Entre com o administrador criado.
2. Em **Administração**, cadastre os serviços, com preço e duração padrão.
3. Cadastre os profissionais e associe seus serviços, duração por serviço, dias e expediente.
4. Crie uma conta de cliente e faça uma reserva de teste.
5. Confira a reserva em **Agendamentos** e teste o cancelamento.

Não há dados iniciais de serviços ou profissionais. Os horários são calculados na interface; os registros de horário no banco são criados ao reservar ou entrar na fila.

## Configuração

Os scripts de inicialização, desenvolvimento, migração e criação de administrador carregam `.env` quando presente. Variáveis já definidas no ambiente têm precedência. **`npm test` não carrega `.env` automaticamente.**

| Variável | Uso | Padrão / requisito |
| --- | --- | --- |
| `DATABASE_URL` | Conexão PostgreSQL da aplicação | Obrigatória para inicializar/migrar; configure também para criar o administrador |
| `HOST` | Endereço de escuta HTTP | `127.0.0.1`; use `0.0.0.0` quando a hospedagem exigir acesso externo |
| `PORT` | Porta HTTP | `3000` |
| `APP_TIMEZONE` | Fuso da sessão PostgreSQL | `America/Sao_Paulo` |
| `PGSSL` | Ativa TLS PostgreSQL com validação de certificado | Ativado apenas pelo valor `true`; não força TLS quando omitido ou `false` |
| `CORS_ORIGIN` | Origem autorizada do frontend separado | Sem padrão; exemplo: `https://organizacao.github.io`, sem caminho ou barra final |
| `ADMIN_NAME` | Nome da nova conta administrativa | Apenas em `admin:create`; mínimo de 3 caracteres |
| `ADMIN_EMAIL` | E-mail da nova conta administrativa | Apenas em `admin:create`; único |
| `ADMIN_PHONE` | Telefone da nova conta administrativa | Apenas em `admin:create`; único, 10 a 15 dígitos após normalização |
| `ADMIN_PASSWORD` | Senha da nova conta administrativa | Apenas em `admin:create`; validação atual de 6 a 128 caracteres |
| `TEST_DATABASE_URL` | Banco de integração | Opcional para testes; deve apontar para banco vazio e descartável |

No navegador, a URL da API é definida em [config.js](BarberApp/BarberApp/js/config.js), com padrão `/api`. `window.API_BASE_URL`, se definido antes do carregamento do módulo, tem precedência. Esses valores são públicos e não devem conter credenciais de banco.

## Comandos disponíveis

| Comando | Finalidade |
| --- | --- |
| `npm ci` | Instalar dependências do lockfile |
| `npm start` | Iniciar servidor e frontend |
| `npm run dev` | Iniciar com observação de alterações no servidor |
| `npm run db:migrate` | Aplicar a migração inicial uma vez |
| `npm run admin:create` | Inserir administrador usando `ADMIN_*` |
| `npm test` | Executar testes unitários e integração, quando configurada |

Não há scripts de build, lint, rollback de migração ou backup automatizado.

## Uso e permissões

| Operação | Visitante | Cliente | Administrador |
| --- | --- | --- | --- |
| Consultar serviços, equipe e comentários aprovados | Sim | Sim | Sim |
| Cadastrar conta de cliente | Sim | Sim | Sim, pelo cadastro público |
| Agendar | Não | Para si | Para si |
| Consultar agendamentos | Não | Próprios | Todos |
| Editar reserva ativa | Não | Não | Sim |
| Cancelar reserva | Não | Própria e ativa | Sim |
| Alterar status ou excluir reserva | Não | Não | Sim |
| Entrar na fila de espera | Não | Sim | Não |
| Enviar avaliação | Não | Sim | Sim, permitido pela API |
| Excluir avaliação | Não | Própria, pela API | Qualquer avaliação |
| Moderar avaliações | Não | Não | Sim |
| Editar perfil | Não | Próprio | Próprio ou de outro usuário pela API |
| Gerenciar serviços, profissionais e clientes | Não | Não | Sim |

A interface não expõe todas as operações permitidas pela API, como a exclusão da própria avaliação pelo cliente. A autorização é verificada no servidor, independentemente da visibilidade de botões.

### Fluxos principais

- **Cliente:** cadastrar/entrar → escolher profissional, serviço, data e horário → confirmar → acompanhar a reserva. Nome e e-mail pertencem ao usuário autenticado.
- **Conflito de reserva:** se o servidor retornar `SLOT_TAKEN`, a interface oferece entrada na fila. Horários já ocupados são normalmente ocultados, portanto essa oferta ocorre principalmente quando outra reserva foi feita após carregar a tela.
- **Administrador:** cadastrar serviços e profissionais → acompanhar reservas → editar reservas ativas ou alterar status → moderar avaliações na página **Avaliações**.
- **Perfil:** atualizar nome, telefone e foto. A interface converte a imagem para JPEG redimensionado. Não há troca de e-mail ou senha pelo perfil.

## Regras de negócio

### Reservas e disponibilidade

- O backend exige profissional ativo, serviço associado ao profissional, data/hora futuras e atendimento dentro dos dias e do expediente configurados.
- A duração usada na reserva é a duração do serviço **para aquele profissional**. O passo dos horários é a menor duração entre seus serviços.
- Sobreposições de intervalos ativos para o mesmo profissional são rejeitadas pela API. A duração inteira deve caber no expediente.
- Identidade do cliente, preço e duração são obtidos no servidor; valores enviados pelo navegador não substituem essas informações.
- Somente administradores editam reservas, e apenas enquanto ativas. A edição recebe novamente profissional, serviço, data e hora; recalcula preço e duração com os valores atuais.
- Mudanças posteriores no preço de um serviço não alteram o valor de reservas existentes que não forem editadas.

### Status e indicadores

| Interface/API | Banco | Ocupa a agenda? | Indicador |
| --- | --- | --- | --- |
| `Pendente` | `agendado` | Sim | Previsão |
| `Confirmado` | `confirmado` | Sim | Previsão |
| `Concluído` | `concluido` | Não | Faturado |
| `Cancelado` | `cancelado` | Não | Fora dos dois totais monetários |

O painel calcula estatísticas sobre os agendamentos exibidos após os filtros. **“Faturado” representa a soma dos serviços concluídos, não confirmação de pagamento recebido.** Não existe módulo de pagamentos ou conciliação.

Ao sair de um status ativo, a reserva libera o intervalo e o backend processa a fila. Reativar uma reserva encerrada exige nova validação de disponibilidade e conflito. A API permite alterações administrativas entre estados encerrados; não há trilha de auditoria dessas mudanças.

### Fila de espera

- Apenas clientes autenticados podem entrar; deve existir conflito no intervalo solicitado.
- Há no máximo uma entrada por cliente e horário.
- Cancelamento, conclusão, exclusão ou edição de uma reserva disparam o processamento da fila do profissional/data envolvidos.
- O processamento segue a ordem dos IDs, promovendo pedidos futuros que caibam sem conflito. Pedidos que ainda conflitam são pulados; mais de um pedido pode ser promovido na mesma execução.
- A promoção cria reserva `Pendente`, usando preço e duração guardados na entrada da fila.
- Não há consulta, desistência ou notificação da fila pela aplicação. Mudanças posteriores no expediente/serviços não são integralmente revalidadas na promoção; veja as limitações conhecidas.

### Avaliações e exclusões

- Envio exige autenticação, nota inteira de 1 a 5 e texto de até 50 palavras. A API limita a 500 caracteres; a interface atual limita a 350.
- Não é exigido atendimento anterior para avaliar. Novas avaliações ficam pendentes; aprovação publica e reprovação pela interface exclui o registro.
- A API retorna apenas avaliações aprovadas ao público e aos clientes; administradores recebem todas. A migração acrescenta aprovação com padrão `false` aos registros existentes quando a coluna ainda não existe.
- Clientes/serviços com vínculos podem ter exclusão impedida pelo banco, retornando conflito. A remoção de profissional exige ausência de reservas ativas, desativa o cadastro e remove suas entradas de fila.
- A exclusão administrativa de agendamento é física. Cancelar mantém o registro; excluir remove o histórico correspondente.

## Banco de dados e migrações

| Tabela | Responsabilidade |
| --- | --- |
| `usuarios` | Identidade, contato, senha, perfil e foto |
| `sessoes` | Hash do token, usuário e validade |
| `servicos` | Nome, preço, duração padrão e ícone |
| `cabeleireiros` | Profissionais, expediente, dias, foto e situação |
| `cabeleireiro_servicos` | Serviços e duração por profissional |
| `horarios` | Data/hora por profissional e disponibilidade manual |
| `agendamentos` | Cliente, serviço, profissional, horário, status, valor e duração históricos |
| `fila_espera` | Pedidos aguardando disponibilidade |
| `comentarios` | Nota, texto, autor e aprovação |
| `schema_migrations` | Versões de migração aplicadas |

`slots` é uma **consulta de ocupações**, não uma tabela separada. `horarios.disponivel` representa bloqueio manual; a ocupação resulta dos agendamentos ativos. Não existe rota administrativa de bloqueio manual atualmente.

`migrate.js` aplica `schema.sql` dentro de transação, sob trava, e registra a versão `1`. Reexecutar `npm run db:migrate` não reaplica essa versão. **Editar `schema.sql` depois de migrar não atualiza automaticamente um banco existente.** Novas alterações exigem implementar migrações incrementais. Executar o SQL diretamente repetidas vezes não substitui o comando de migração.

Antes de migrar um banco legado:

1. Faça backup e comprove que pode restaurá-lo.
2. Ensaie a migração em uma cópia.
3. Verifique e-mails duplicados sem considerar maiúsculas, nomes de serviços repetidos, status inválidos, vínculos de horários e demais restrições de `schema.sql`.
4. Planeje a recuperação de contas cujas senhas não estejam em scrypt; não há conversão automática de texto puro.
5. Configure os relacionamentos de serviços/profissionais e confira aprovação de comentários, contagens e reservas após migrar.

O índice de reserva ativa impede o mesmo horário ativo duplicado. A verificação completa de intervalos e a promoção da fila dependem da API; escritas diretas no banco não recebem automaticamente essas proteções.

## API REST

Base local: `http://127.0.0.1:3000/api`. Corpos e respostas usam JSON. Envie `Content-Type: application/json` nas escritas e, nas operações autenticadas:

```http
Authorization: Bearer TOKEN_DA_SESSAO
```

Cadastro/login retornam `{ "token": "...", "user": { ... } }`. Os IDs expostos pelos DTOs são strings. Datas de agenda usam `YYYY-MM-DD`, horários `HH:mm` e dias da semana `0` (domingo) a `6` (sábado).

### Rotas

Todas as rotas abaixo são relativas a `/api`.

| Método | Rota | Acesso e resultado |
| --- | --- | --- |
| GET | `/health` | Público; consulta o banco e retorna `{ "status": "ok" }` |
| POST | `/auth/register` | Público; cria cliente e sessão |
| POST | `/auth/login` | Público; cria sessão |
| GET | `/auth/me` | Autenticado; perfil atual |
| POST | `/auth/logout` | Autenticado; revoga a sessão enviada |
| GET | `/users` | Admin; usuários, incluindo administradores |
| PATCH | `/users/:id` | Titular ou admin; nome, telefone e foto |
| DELETE | `/users/:id` | Admin; exclui cliente sem vínculos impeditivos |
| GET | `/services` | Público; serviços |
| POST / PATCH / DELETE | `/services` / `/services/:id` / `/services/:id` | Admin; criar, editar ou remover serviço |
| GET | `/barbeiros` | Público; profissionais ativos e serviços |
| POST / PATCH / DELETE | `/barbeiros` / `/barbeiros/:id` / `/barbeiros/:id` | Admin; criar, editar ou desativar profissional |
| GET | `/horarios` | Público; horários materializados, disponíveis manualmente e com data de hoje em diante |
| GET | `/slots` | Público; ocupações ativas com data de hoje em diante, sem nome/e-mail do cliente |
| GET | `/agendamentos` | Cliente: próprios; admin: todos |
| GET | `/agendamentos/:id` | Titular ou admin; uma reserva |
| POST | `/agendamentos` | Autenticado; reserva para o usuário atual |
| PATCH | `/agendamentos/:id` | Admin; edita reserva ativa |
| PATCH | `/agendamentos/:id/status` | Admin; altera status |
| POST | `/agendamentos/:id/cancel` | Titular de reserva ativa ou admin; cancela |
| DELETE | `/agendamentos/:id` | Admin; exclui e processa fila |
| POST | `/waitlist` | Cliente; entra na fila |
| GET | `/comments` | Público: aprovados; admin autenticado: todos |
| POST | `/comments` | Autenticado; envia avaliação pendente |
| PATCH | `/comments/:id` | Admin; altera aprovação |
| DELETE | `/comments/:id` | Autor ou admin; exclui avaliação |

`GET /horarios` não representa toda a disponibilidade calculada e pode incluir horários ocupados ou já passados no dia atual. Consulte as ocupações e a configuração do profissional; a validação definitiva ocorre ao reservar.

### Corpos de requisição

| Operação | Campos |
| --- | --- |
| Cadastro | `name`, `email`, `phone`, `password` |
| Login | `email`, `password` |
| Atualização de perfil | `name`, `phone`, `photoURL` (campos opcionais) |
| Serviço | `name`, `price`, `duration` (padrão 60), `icon` (padrão `content_cut`) |
| Profissional | `name`, `bio`, `photo`, `horarioInicio`, `horarioFim`, `diasDisponiveis`, `services` |
| Reserva, edição e fila | `barbeiroId`, `servico`, `data`, `hora`, `observacoes` (opcional) |
| Status | `status`: `Pendente`, `Confirmado`, `Concluído` ou `Cancelado` |
| Avaliação | `rating` (inteiro 1–5), `text` |
| Aprovação | `approved` (booleano) |

Em `services` do profissional, use um objeto com **nome exato do serviço → duração em minutos**, por exemplo `{ "Corte": 30, "Barba": 15 }`. Durações configuradas pela API variam de 5 a 480 minutos. As fotos aceitas são data URLs JPEG, PNG ou WebP em base64, limitadas a 300.000 caracteres; o corpo JSON tem limite de 400 kB.

Exemplo de criação de reserva (substitua o ID/nome por cadastros existentes e escolha uma data futura atendida pelo profissional):

```json
{
  "barbeiroId": "1",
  "servico": "Corte",
  "data": "2030-10-07",
  "hora": "10:00",
  "observacoes": "Preferência por tesoura."
}
```

Exemplo de consulta de saúde no PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

### Erros

```json
{ "message": "Horário já reservado.", "code": "SLOT_TAKEN" }
```

| HTTP | Exemplos de código / motivo |
| --- | --- |
| 400 | `VALIDATION_ERROR`, `WEAK_PASSWORD`; campos ou regras inválidos |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS`; sessão ausente/expirada ou login inválido |
| 403 | `FORBIDDEN`; perfil ou titularidade sem permissão |
| 404 | `NOT_FOUND`; recurso ou rota inexistente |
| 409 | `SLOT_TAKEN`, `SLOT_AVAILABLE`, `ALREADY_ON_WAITLIST`, `EMAIL_IN_USE`, `DUPLICATE`, `IN_USE` |
| 413 | Corpo JSON excede o limite |
| 429 | `RATE_LIMIT`; limite de login/cadastro atingido |
| 500 | Falha interna; mensagem genérica ao cliente |

`NETWORK_ERROR` é produzido pelo cliente JavaScript quando `fetch` falha; não é um status HTTP. Consulte `message` e `code`, pois nem toda falha interna tem o mesmo código.

## Testes e validação

### Segurança e validações unitárias

```powershell
npm.cmd test
```

Sem `TEST_DATABASE_URL`, os testes de segurança executam e o teste de integração aparece como **ignorado**. Isso não comprova o funcionamento completo da API.

### Integração com PostgreSQL

Crie um banco separado, vazio e descartável. Defina a variável no terminal antes de executar:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://USUARIO:SENHA@127.0.0.1:5432/barberapp_test'
npm.cmd test
Remove-Item Env:TEST_DATABASE_URL
```

O teste utiliza essa conexão no lugar de `DATABASE_URL`, recusa um banco com tabelas no esquema `public` e cria seus próprios dados. **Não apaga as tabelas ao terminar**; prepare um novo banco vazio para outra execução. Não aponte para o banco da aplicação.

Cobertura existente: hashing/validação, cadastro, autorização, concorrência, sobreposição, fila, moderação, logout e preservação de preço histórico. Não há suíte de navegador, teste de carga ou restauração automatizada.

Última verificação nesta revisão documental, em **21/09/2026**: 2 testes aprovados, 0 falhas e 1 integração ignorada por ausência de `TEST_DATABASE_URL`.

### Conferência funcional antes de publicar

1. Verificar `/api/health` e carregamento de serviços/profissionais.
2. Confirmar login e separação entre cliente e administrador.
3. Validar reserva, tentativa de conflito, cancelamento e promoção da fila em homologação.
4. Verificar moderação e visibilidade pública das avaliações.
5. Conferir navegação móvel, teclado, mensagens de erro e fuso horário.

## Publicação

### Frontend e backend juntos

Disponibilize um ambiente Node.js e PostgreSQL, instale dependências com `npm ci`, configure as variáveis da plataforma, aplique a migração e inicie com `npm start`. Mantenha `apiBaseUrl = '/api'`.

Configure HTTPS na hospedagem/proxy e `HOST=0.0.0.0` se a plataforma exigir. O servidor do projeto escuta HTTP; não provisiona certificado HTTPS. Configure TLS PostgreSQL conforme o provedor; `PGSSL=true` exige certificado confiável.

### Frontend separado ou GitHub Pages

Hospede primeiro a API Node.js e o banco. Em [config.js](BarberApp/BarberApp/js/config.js):

```js
export const apiBaseUrl = 'https://api.seu-dominio.com/api';
```

No backend, configure a origem exata do site:

```dotenv
CORS_ORIGIN=https://organizacao.github.io
```

Mesmo que o site esteja em `https://organizacao.github.io/BarberApp/`, a origem CORS não inclui `/BarberApp/`.

O [workflow atual](.github/workflows/deploy.yml) publica `BarberApp/BarberApp` a cada push em `main`. Ele não provisiona Node.js/PostgreSQL, não aplica migrações e não executa testes. Para frontend separado, deixar `/api` aponta as requisições para o host estático, onde não existe a API.

## Operação e segurança

### Controles implementados

- Senhas com scrypt e salt aleatório; comparação com `timingSafeEqual`.
- Token aleatório de 32 bytes; somente hash SHA-256 armazenado no banco; validade de sete dias.
- Logout revoga a sessão apresentada. O navegador armazena o token no `localStorage`.
- Autorização no backend por perfil e titularidade; cadastro não aceita escolher perfil administrativo.
- Consultas SQL parametrizadas, transações, chaves estrangeiras e verificação de conflitos na API.
- Validação de campos/fotos; escape de conteúdo dinâmico na interface.
- `X-Content-Type-Options: nosniff` e `Cache-Control: no-store` para a API.
- Limite compartilhado entre login/cadastro de 30 chamadas em 15 minutos por endereço de conexão, mantido em memória no processo.

O limitador usa `req.socket.remoteAddress`: atrás de proxy, vários clientes podem compartilhar o mesmo endereço; em múltiplas instâncias, os contadores são separados. Não existe autenticação multifator, recuperação de senha, CSP configurada pela aplicação ou revogação de todas as sessões pela interface.

### Rotina operacional recomendada

As ações abaixo são recomendações; não estão automatizadas pelo repositório:

| Frequência | Acompanhamento | Papel sugerido |
| --- | --- | --- |
| Contínua | Saúde da API, erros 5xx e tempo de resposta | Infraestrutura |
| Diária | Sucesso dos backups, fila, reservas incompatíveis e alterações administrativas | Infraestrutura e administrador |
| Semanal | Riscos prioritários, ações vencidas e mudanças no calendário | Liderança técnica e gestão |
| Mensal | Restauração de backup, permissões, retenção de dados e dependências | Responsável pelo banco e desenvolvimento |
| A cada versão | Testes, migrações, configuração e fluxo completo em homologação | Desenvolvimento e qualidade |

Defina responsável, local de armazenamento e retenção para os backups; mantenha cópias separadas do banco principal e registre ensaios de restauração. As metas propostas no documento de riscos são perda máxima de 24 horas de dados (RPO) e recuperação em até 4 horas (RTO), sujeitas à validação da gestão.

Em incidente, registre impacto, horário, versão e evidências sem senhas/tokens; contenha a causa, use uma agenda manual única se necessário, restaure/reconcilie os dados e valide os fluxos antes de retomar. Reverter código não desfaz uma migração de banco; planeje a compatibilidade entre versão e esquema.

## Gestão de riscos

Consulte [Gestão de Riscos.docx](<Gestão de Riscos.docx>) para a análise completa dos **18 riscos**, com cenários potenciais, controles preventivos a considerar, respostas, contingência, monitoramento, responsáveis e prazos sugeridos. A análise é prospectiva e independente do código atual: considera eventos que poderão ocorrer na futura implantação e operação.

A avaliação usa estimativas preliminares de probabilidade e impacto de 1 a 5, condicionadas aos cenários hipotéticos descritos. O escore `P × I` é convertido no nível final:

| Escore | Nível | Classificação |
| --- | --- | --- |
| 1–4 | 1 | Muito baixo |
| 5–8 | 2 | Baixo |
| 9–12 | 3 | Moderado |
| 13–19 | 4 | Alto |
| 20–25 | 5 | Crítico |

Referências preliminares de prioridade, a validar no planejamento da implantação: publicação sem backend funcional (R01, nível 5), recuperação de dados (R02, nível 4), proteção de sessões (R03, nível 4), promoção incompatível da fila (R05, nível 4) e regressões sem validação automática (R07, nível 4).

Os níveis são referências de planejamento, não um diagnóstico da implementação existente nem uma previsão de que os eventos ocorrerão. A arquitetura, a infraestrutura e os controles da versão final deverão fundamentar uma nova avaliação antes da publicação. Os riscos iniciam como “Potencial — a validar”; as medidas propostas deverão ser verificadas conforme sua aplicabilidade.

Para acompanhar ações, registre: ID, responsável nominal, estado, prazo, indicador, evidência de eficácia do controle, data de revisão e nível residual. Os papéis e prazos do documento são propostas, não atribuições já aprovadas.

## Limitações conhecidas

- A fila só é oferecida na interface após conflito; não há listagem, desistência ou aviso de promoção ao cliente.
- Mudanças de dias, expediente e serviços não reconciliam automaticamente reservas/fila. A promoção não revalida todas essas condições.
- Não há calendário de feriados, férias, pausas ou rota de bloqueio manual. Horários e contatos da página **Sobre** são textos fixos a revisar antes de publicar.
- O navegador usa seu próprio fuso/relógio para filtrar horários, enquanto o banco usa `APP_TIMEZONE`.
- Listagens não têm paginação e a trava global serializa escritas de agenda de todos os profissionais.
- Falhas de carregamento podem virar listas/caches vazias; `fetch` não possui timeout explícito no cliente REST.
- Seletores visuais e animações têm barreiras de acessibilidade; os fluxos precisam de validação por teclado e leitor de tela.
- Exclusões e alterações de status não possuem trilha de auditoria. O painel “Clientes” recebe também contas administrativas da API.
- Não há controle de pagamento, integração de notificações, quotas de reservas/comentários ou exigência de atendimento anterior para avaliar.
- Não há política de retenção/privacidade, fluxo de anonimização ou backup implementados no projeto.

## Solução de problemas

| Sintoma | Verificação / ação |
| --- | --- |
| PowerShell bloqueia `npm.ps1` | Use `npm.cmd` nos comandos |
| Opção de Node desconhecida | Confira `node --version` e atualize para uma versão compatível com os scripts |
| `Configure DATABASE_URL` | Crie `.env` na raiz ou configure a variável no ambiente |
| Falha ao conectar ao banco | Confira serviço PostgreSQL, host, porta, credenciais, nome do banco, rede e TLS |
| Servidor pede migração | Execute `npm run db:migrate` usando a mesma conexão do servidor |
| Migração falha em dados legados | Analise as restrições, ensaie a correção em cópia e preserve o backup |
| Administrador não é criado | Confira os quatro `ADMIN_*` e duplicidade de e-mail/telefone |
| Site abre, mas serviços/login falham | Use o servidor Node.js ou configure API externa e CORS; HTML/Pages não executam o backend |
| Nenhum horário disponível | Confira serviços associados, durações, dias, expediente, data futura e reservas ativas |
| Não é possível entrar na fila pelo horário desejado | Horários ocupados são ocultados; a oferta atual aparece após `SLOT_TAKEN` |
| Exclusão retorna `IN_USE` | Há vínculos que precisam ser preservados; cancelar/desativar pode ser adequado ao caso |
| Login retorna 429 para vários usuários | Confira limite por endereço de conexão e configuração do proxy |
| Integração aparece como ignorada | Defina `TEST_DATABASE_URL` no ambiente do terminal |
| Integração recusa o banco | Use outro banco vazio e descartável; a execução anterior mantém os dados |
| Falha CORS | Compare esquema, domínio e porta de `CORS_ORIGIN` com a origem real do frontend |

## Manutenção e documentação

Ao alterar o projeto, atualize os contratos de API, variáveis, regras e testes afetados. Alterações de banco devem ganhar uma nova etapa de migração; mudanças de frontend/API precisam ser publicadas de forma compatível.

- [Backend: instalação e modelo](backend/README.md)
- [Esquema SQL](backend/schema.sql)
- [Manifesto e scripts](package.json)
- [Cliente REST](BarberApp/BarberApp/js/api.js)
- [Publicação no GitHub Pages](.github/workflows/deploy.yml)
- [Análise de riscos](<Gestão de Riscos.docx>)

O repositório não contém arquivo de licença. Créditos exibidos na página inicial: Matheus Ramos e Lukas Raymond.
