# Rotina de testes — instruções para o Claude Code

Este arquivo é para o **Claude Code executar**. Para rodar, peça no chat do Claude Code:

> Roda a rotina de testes do `ROTINA_DE_TESTES.md`.

A rotina passa por todas as funcionalidades do BarberApp em três camadas:

1. `npm test` — testes automatizados já existentes (segurança e integração com PostgreSQL).
2. `npm run rotina` — [scripts/rotina-testes.mjs](scripts/rotina-testes.mjs), ~140 verificações da API com códigos (`AG-01`, `FL-08`…), cobrindo cadastro, perfil, permissões, serviços, barbeiros, agendamento, fila, limites, gestão do admin, avaliações e sessões.
3. **Navegador** — o que só dá para ver na tela (seção 4), feito pelo Claude Code com a ferramenta de navegador disponível.

---

## Instruções para o Claude Code

### Regras (valem para a rotina inteira)

- **Nunca rode a rotina contra produção** (Render/Neon) nem contra o banco do `DATABASE_URL` do `.env`. A rotina cria, altera e apaga dados.
- Use **apenas bancos novos, locais e descartáveis**, criados por você nesta execução. O script recusa sozinho bancos fora de `127.0.0.1`/`localhost` ou que não estejam vazios; não tente contornar isso.
- **Não corrija código durante a rotina.** O objetivo é diagnosticar. Ao achar falha, registre e continue; correções só depois, se o usuário pedir.
- Não faça commit nem push. Não edite o `.env`.
- Se algo da preparação falhar (sem PostgreSQL, sem credenciais), pare e pergunte ao usuário em vez de improvisar.

### 1. Preparação

1. Confira `node -v` (precisa ser 22 ou mais) e rode `npm ci`.
2. Descubra como acessar o PostgreSQL **local**:
   - Se o usuário informou uma URL, use-a.
   - Senão, leia o `DATABASE_URL` do `.env` **somente** se o host for `127.0.0.1` ou `localhost`, e use apenas o usuário e a senha dele para criar os bancos novos. Não rode nada no banco que está no `.env`.
   - Se não houver PostgreSQL local, pare e avise o usuário.
3. Crie dois bancos vazios com a data e hora no nome, por exemplo `barberapp_teste_20261110_1530` e `barberapp_rotina_20261110_1530`. O `psql` nem sempre está no PATH no Windows; se faltar, crie pelo Node:

   ```bash
   node -e "const {Client}=require('pg');const c=new Client({connectionString:process.env.PG_ADMIN_URL});c.connect().then(()=>c.query('CREATE DATABASE barberapp_rotina_20261110_1530')).then(()=>c.end())"
   ```

   (`PG_ADMIN_URL` aponta para o banco `postgres` do mesmo servidor local.)

### 2. Testes automatizados existentes

```bash
TEST_DATABASE_URL=postgresql://USUARIO:SENHA@127.0.0.1:5432/barberapp_teste_... npm test
```

Esperado: todos aprovados e **nenhum ignorado** (se a integração aparecer como `skipped`, o `TEST_DATABASE_URL` não chegou ao processo).

### 3. Rotina da API

Rode em segundo plano, porque `--manter-servidor` deixa o site no ar com os dados de teste para a etapa do navegador:

```bash
ROTINA_DATABASE_URL=postgresql://USUARIO:SENHA@127.0.0.1:5432/barberapp_rotina_... npm run rotina -- --manter-servidor --porta 3100
```

- Cada linha sai com ✅ ou ❌ e um código. No fim aparece `# Resultado: X de Y testes passaram` e a lista de falhas.
- O script não lê o `.env`, desliga Google e CAPTCHA e fixa o limite de 3 reservas por cliente.
- Ao terminar, ele imprime o endereço (`http://127.0.0.1:3100`) e as contas criadas:

| Conta | E-mail | Senha |
| --- | --- | --- |
| Admin | `admin@rotina.test` | `admin-rotina-123` |
| Cliente A (Ana) | `ana@rotina.test` | `senha-nova-1` (a rotina troca a senha original) |
| Cliente B (Bruno) | `bruno@rotina.test` | `senha-bruno-1` |
| Cliente C (Carla) | `carla@rotina.test` | `senha-carla-1` |

Barbeiros criados: **Teste Um** (seg a sáb, 09:00–18:00, Corte 30 min + Barba 15 min) e **Teste Dois** (seg a sex, 13:00–17:00, só Corte). Serviços: Corte (R$ 50 depois do teste de preço) e Barba (R$ 25).

> O limite de tentativas de login fica ativo depois do teste `RL-01`, mas só para o e-mail `alvo@rotina.test`; as contas acima entram normalmente.

### 4. Testes no navegador

Use a ferramenta de navegador que estiver disponível nesta sessão (Claude in Chrome, Playwright via MCP etc.) em `http://127.0.0.1:3100`. **Se nenhuma estiver disponível, não tente instalar nada:** marque a seção inteira como "não executada — sem navegador" no relatório e siga para a limpeza.

Em toda página, leia o console: qualquer erro vermelho é uma falha a registrar. Quando precisar de uma reserva ou situação específica, pode criá-la pela API (com `fetch` no console da página ou por script), usando as contas acima.

**Navegação e visitante**
- [ ] **UI-01** `index.html`, `agendamentos.html`, `comentarios.html`, `sobre.html`, `auth.html` e `admin.html` carregam sem erro no console.
- [ ] **UI-02** O menu lateral abre, fecha e leva às páginas certas.
- [ ] **UI-03** Sem login: o menu mostra "Entrar", a área de administração não aparece e tentar agendar pede login.
- [ ] **UI-04** Sobre Nós mostra os serviços com preço em reais (`R$ 50,00`) e a equipe ativa com foto/descrição.

**Conta**
- [ ] **UI-05** Entrar como Cliente C pela tela: o menu mostra o nome; recarregar (F5) mantém o login.
- [ ] **UI-06** Cadastro pela tela com senha e confirmação diferentes, e com campos vazios: mensagem em cada campo, sem enviar.
- [ ] **UI-07** Perfil: trocar nome e enviar uma foto JPG/PNG; ambos persistem depois de recarregar. Não existe campo para trocar e-mail.
- [ ] **UI-08** Perfil: troca de senha mostra erro com a senha atual errada; "Sair" volta para o login.

**Agendamento (como Cliente C)**
- [ ] **UI-09** Nome e e-mail vêm preenchidos e bloqueados com os dados da conta.
- [ ] **UI-10** Trocar de barbeiro troca os serviços: Teste Dois mostra só Corte.
- [ ] **UI-11** Marcar Corte + Barba em Teste Um mostra o total em reais e a duração de 45 min.
- [ ] **UI-12** Num domingo nenhum horário aparece; num dia normal o último horário com 45 min termina até 18:00; horários já ocupados (veja `GET /api/slots`) não aparecem.
- [ ] **UI-13** Confirmar sem observações funciona e a reserva aparece em "Seus agendamentos" como Pendente.
- [ ] **UI-14** Conflito: com o formulário preenchido num horário livre, ocupe esse horário pela API com outro cliente e então confirme na tela. Esperado: aviso de horário ocupado e oferta de entrar na fila; aceitar mostra sucesso.
- [ ] **UI-15** Clique duplo rápido em "Confirmar" cria uma reserva só (o botão fica desabilitado durante o envio).

**Meus agendamentos**
- [ ] **UI-16** Cliente vê só as próprias reservas, com data `dd/mm/aaaa`, serviços, valor e status com cor; não vê botões de editar, excluir ou mudar status.
- [ ] **UI-17** Cancelar uma reserva própria futura: vira Cancelado.
- [ ] **UI-18** Filtros por nome, serviço (achando reserva com vários serviços) e data funcionam juntos.

**Administração (como Admin)**
- [ ] **UI-19** Serviços: criar, editar e excluir pela tela; erros de validação aparecem.
- [ ] **UI-20** Barbeiros: criar com dias, horário, serviços com duração e foto; editar; remover um sem reservas. Remover Teste Um (tem reservas) mostra o aviso de bloqueio.
- [ ] **UI-21** Clientes: a lista aparece; excluir um cliente com reservas mostra o aviso de bloqueio.
- [ ] **UI-22** Agendamentos: o admin vê todos; **Previsão** soma Pendente + Confirmado e **Faturado** soma só Concluído, e os dois acompanham os filtros (confira a conta).
- [ ] **UI-23** O seletor de status muda o status e fecha ao clicar fora; editar uma reserva ativa leva ao formulário preenchido e salva; excluir pede confirmação.

**Avaliações**
- [ ] **UI-24** O seletor de estrelas funciona com mouse e teclado; o texto para em 350 caracteres; enviar mostra "aguardando aprovação".
- [ ] **UI-25** Envie pela tela o texto `<b>oi</b><img src=x onerror=alert(1)>`: depois de aprovado, aparece como texto puro e nenhum alerta é executado.
- [ ] **UI-26** Como admin, a moderação mostra as pendentes com nome completo; aprovar publica (em público aparece "Carla R."), ocultar devolve para a moderação, reprovar exclui.
- [ ] **UI-27** Clientes não veem a área de moderação.

**Responsividade, acessibilidade e tema**
- [ ] **UI-28** Em 375 px, 768 px e 1440 px de largura: nada cortado, sem rolagem horizontal, menu utilizável (repita UI-13 no celular).
- [ ] **UI-29** Só com Tab/Enter dá para entrar, agendar e avaliar; o foco é visível.
- [ ] **UI-30** Tema escuro: textos, inputs, selects e o seletor de data com contraste legível.
- [ ] **UI-31** Com a rede offline (DevTools), uma ação mostra erro de conexão em vez de travar.

### 5. Limpeza

1. Encerre o servidor da rotina (o processo em segundo plano).
2. Apague os dois bancos que **você** criou nesta execução (`DROP DATABASE ...`). Não apague nenhum outro.

### 6. Relatório

Responda ao usuário em português, no tom de sempre, com:

1. **Resumo:** `npm test` (aprovados/falhas), API (X de Y) e navegador (X de Y ou "não executada").
2. **Falhas:** uma linha por falha, com código, o que aconteceu, o esperado e, se der, o arquivo e a linha prováveis da causa. Não corrija.
3. **Não testado:** o que ficou de fora e por quê (veja abaixo).
4. Pergunte se ele quer que as falhas virem itens no [ATUALIZACOES_E_IDEIAS.md](ATUALIZACOES_E_IDEIAS.md) ou que você comece a corrigir.

### O que fica para o teste manual

Estes pontos dependem de contas e serviços externos e **não** fazem parte da rotina automática. Liste-os no relatório como pendentes para o usuário:

- Login com Google de verdade (conta nova sem telefone, `PHONE_REQUIRED`, mesmo e-mail com senha).
- CAPTCHA do Turnstile na tela de cadastro/login.
- Site publicado: hibernação do Render, Google voltando para o domínio publicado, uma reserva de teste em produção feita e apagada pelo admin.

O `npm test` já cobre o Google e o Turnstile com servidores falsos, então esses pontos manuais conferem só a configuração real.
