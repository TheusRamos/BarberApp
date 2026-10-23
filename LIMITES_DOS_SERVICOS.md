# Limites dos serviços gratuitos do BarberApp

Levantamento feito em **23/10/2026** nas páginas oficiais de cada serviço (links em [Fontes](#fontes)). Os planos gratuitos mudam com frequência: confira os valores antes de tomar decisões com base neles.

Serviços usados pelo sistema publicado em https://barberapp-at0n.onrender.com:

| Serviço | Uso no projeto | Plano |
| --- | --- | --- |
| Render | Hospeda o site e a API (`render.yaml`) | Hobby, serviço web grátis |
| Neon | Banco PostgreSQL de produção | Free |
| GitHub Actions | Testes a cada push (`.github/workflows/ci.yml`) | Grátis em repositório público |
| Google Cloud (OAuth) | Login com Google | Grátis |

## Resumo

- Com o uso de um trabalho de faculdade, o sistema fica muito abaixo de todos os limites.
- Se o site ganhar movimento constante, o primeiro limite a estourar é o **compute do Neon**: ele permite o banco ficar acordado em média **cerca de 13 horas por dia**. O segundo é a **banda do Render**, de **5 GB por mês**.
- Sem cartão de crédito cadastrado, estourar um limite **não gera cobrança**: o serviço é suspenso até o início do mês seguinte, e o site fica fora do ar nesse período.

## Render (Hobby, serviço web grátis)

| Recurso | Limite | O que significa para o projeto | Se estourar |
| --- | --- | --- | --- |
| Horas de instância | 750 h por mês **por workspace**, somando todos os serviços grátis | Um serviço ligado o mês inteiro usa no máximo 744 h, então cabe. Um segundo serviço grátis na mesma conta divide essas horas | Todos os serviços grátis são suspensos até o mês seguinte |
| Banda de saída | **5 GB por mês** | Estimativa de **10 a 12 mil visitas por mês** (cerca de 300 a 400 por dia). Veja [Estimativa de capacidade](#estimativa-de-capacidade) | Sem cartão: suspensão até o mês seguinte. Com cartão: US$ 0,15 por GB extra |
| Minutos de build | 500 por mês | Cada deploy leva de 1 a 2 minutos, o que permite centenas de deploys | Sem cartão: novos deploys param, mas o site continua no ar. Com cartão: US$ 5 por 1.000 minutos |
| Máquina | 0,1 CPU e 512 MB de RAM, uma única instância | Cada login com senha leva cerca de 0,5 s (estimativa). Muitos logins ao mesmo tempo deixam o site lento | Lentidão; não há suspensão |
| Hibernação | Dorme após 15 minutos sem acesso | O primeiro acesso depois de um período parado demora cerca de 1 minuto. Enquanto dorme, não consome horas | — |

Outras restrições do plano grátis:

- O Render pode reiniciar o serviço a qualquer momento. Os contadores de tentativas de login e os códigos do login com Google ficam na memória e são zerados; as sessões ficam no banco e não se perdem.
- Não há disco persistente: arquivos gravados no servidor se perdem a cada deploy ou reinício.
- Não há acesso ao terminal (shell) do servidor.
- **As portas de e-mail SMTP (25, 465 e 587) são bloqueadas.** O envio de e-mails (por exemplo, a recuperação de senha pela Brevo) precisa usar uma API HTTP.
- O rollback só volta para os dois deploys anteriores.

## Neon (Free)

| Recurso | Limite | O que significa para o projeto | Se estourar |
| --- | --- | --- | --- |
| Compute | **100 CU-horas por projeto por mês**, o equivalente a 400 h no tamanho mínimo (0,25 CU) | O banco fica acordado enquanto o Render está acordado, porque o `/api/health` consulta o banco. Na média, cabem **cerca de 13 h por dia** de site acordado | O banco é suspenso até o mês seguinte e o site para de funcionar |
| Armazenamento | 1 GB por projeto | Em 23/10/2026: **8,3 MB usados** (menos de 1%). Cabem centenas de milhares de agendamentos ou dezenas de milhares de clientes com foto | Cadastros e alterações falham. Os dados existentes não são apagados |
| Transferência (egress) | 5 GB por projeto por mês | Corresponde ao volume das respostas do banco, principalmente as fotos dos barbeiros. Cerca de 70 mil visualizações de página | O banco é suspenso até o mês seguinte |
| Restauração | 6 horas de histórico (até 1 GB) | **Não há backup de longo prazo.** Um erro percebido depois de 6 horas não pode ser desfeito pelo Neon | — |
| Conexões | 104 no tamanho mínimo (7 reservadas ao Neon) | O sistema abre no máximo 10 conexões | — |
| Hibernação | Suspende após 5 minutos sem consultas (não pode ser desligado) | A primeira consulta depois de suspenso leva um pouco mais | — |
| Ramificações (branches) | 10 por projeto | Não usamos | Não é possível criar novas |

## GitHub Actions

| Situação | Limite |
| --- | --- |
| Repositório público (situação atual) | **Ilimitado** nos runners padrão do GitHub |
| Se o repositório virar privado | 2.000 minutos por mês, 500 MB de artefatos e 10 GB de cache por repositório |

Cada execução dos testes leva menos de 1 minuto.

## Login com Google (Google Cloud)

- O login com Google é gratuito.
- O sistema pede só os escopos básicos (`openid`, `email`, `profile`). Para esses escopos, não é exigida verificação do app, e não há limite de usuários depois que o app é publicado.
- No status **Em teste**, só entram até **100 usuários de teste** cadastrados. Confira em **Google Auth Platform → Público** se o app está **Em produção**.
- O limite de 100 usuários de apps não verificados vale apenas para escopos sensíveis ou restritos, que o sistema não usa.

## Estimativa de capacidade

Medições feitas em 23/10/2026 no site publicado:

- O site inteiro (HTML, CSS, JavaScript e imagem) tem 390 KB. O Render entrega texto comprimido (Brotli). A maior peça é `resources/barbearia.jpg`, com **165 KB**, que não comprime.
- A primeira visita à página inicial baixa cerca de 195 KB comprimidos (271 KB sem compressão). Nas visitas seguintes, o navegador confirma que os arquivos não mudaram e baixa quase nada.
- Toda página que usa `js/app.js` (início, agendamentos, administração e avaliações) baixa de novo serviços, horários, ocupações, barbeiros e avaliações, sem cache. **As fotos dos barbeiros vêm em base64 em toda visualização**: com 4 barbeiros com foto, cerca de 70 KB por página.

Considerando uma visita de 3 páginas: 0,4 a 0,5 MB por visita, o que dá **10 a 12 mil visitas por mês** dentro dos 5 GB do Render. A estimativa é conservadora, porque não foi possível confirmar se o Render conta a banda antes ou depois da compressão.

Compute do Neon: 400 h por mês ÷ 30 dias ≈ **13 h por dia** de site acordado. Como o Render dorme 15 minutos depois do último acesso e o Neon 5 minutos depois da última consulta, visitas espalhadas ao longo do dia mantêm os dois acordados por mais tempo do que a soma das visitas.

## Limites do próprio sistema

Regras definidas no código, independentes dos planos:

| Regra | Valor |
| --- | --- |
| Tentativas de login | 30 por IP e 10 por conta a cada 15 minutos |
| Cadastros | 10 por IP por hora |
| Troca de senha | 5 tentativas por usuário a cada 15 minutos |
| Reservas ativas + pedidos na fila por cliente | 3 (`MAX_ACTIVE_BOOKINGS`) |
| Avaliações | 1 aguardando aprovação por usuário, até 50 palavras |
| Sessão | 7 dias |
| Código do login com Google | 1 minuto, uso único |
| Corpo das requisições | 400 KB |
| Foto | 300.000 caracteres (a interface reduz para 180×180 ou 200×200 em JPEG) |
| Conexões com o banco | 10 |

## Pontos de atenção

1. **Não use serviços que acessam o site para ele não dormir** (UptimeRobot, cron e similares). Com o Render acordado o tempo todo, o compute do Neon acaba por volta do dia 17, e o site fica fora do ar até o mês seguinte.
2. **Faça backup do banco.** O Neon grátis só guarda 6 horas de histórico. O recomendado é um `pg_dump` mensal, guardado fora do Neon.
3. **Envio de e-mails:** como o Render grátis bloqueia SMTP, a recuperação de senha pela Brevo deve usar a API HTTP da Brevo.
4. **Se o movimento crescer**, o que mais consome banda é a foto `barbearia.jpg` e as fotos dos barbeiros baixadas a cada página. Otimizar essas imagens aproximadamente dobra a capacidade.
5. **Contas separadas:** as 750 horas do Render são da conta inteira. Outro projeto grátis na mesma conta divide essas horas com o BarberApp.

## Onde acompanhar o consumo

| Serviço | Onde ver |
| --- | --- |
| Render | Dashboard → **Billing**: banda, horas de instância e minutos de build do mês |
| Neon | Console do projeto → página de uso: CU-horas, armazenamento e transferência |
| GitHub Actions | Repositório → aba **Actions** (execuções) |
| Google Cloud | **Google Auth Platform** → Público (status do app) |

Recomendação: conferir Render e Neon uma vez por mês, ou antes de divulgar o site para muita gente.

## Fontes

- [Render: Free instances](https://render.com/docs/free)
- [Render: Outbound bandwidth](https://render.com/docs/outbound-bandwidth)
- [Render: Pricing](https://render.com/pricing)
- [Render: Build pipeline](https://render.com/docs/build-pipeline)
- [Render: Blueprint YAML Reference (CPU e RAM do plano free)](https://render.com/docs/blueprint-spec)
- [Neon: Plans](https://neon.com/docs/introduction/plans)
- [Neon: Connection pooling (max_connections)](https://neon.com/docs/connect/connection-pooling)
- [GitHub: Billing for GitHub Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [Google Cloud: OAuth user cap](https://support.google.com/cloud/answer/15549945)
- [Google Identity: OAuth production readiness](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
