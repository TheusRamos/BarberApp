# 💈 BarberApp — Sistema de Agendamentos

Sistema web completo para gerenciamento de uma barbearia, com funcionalidades distintas para clientes e administradores, sincronização em tempo real via Firebase e interface responsiva.

---

## 📋 Índice

- [Sobre o Projeto](#sobre-o-projeto)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Usuários do Sistema](#usuários-do-sistema)
- [Funcionalidades](#funcionalidades)
- [Regras de Negócio](#regras-de-negócio)
- [Casos de Uso](#casos-de-uso)
- [Tecnologias Utilizadas](#tecnologias-utilizadas)

---

## Sobre o Projeto

O BarberApp permite o gerenciamento completo de agendamentos em uma barbearia. Clientes podem reservar horários, entrar em filas de espera e avaliar os serviços. Administradores gerenciam barbeiros, serviços, horários, agendamentos e moderam avaliações — tudo com sincronização em tempo real via Firestore.

---

## 📁 Estrutura do Projeto

```
BarberApp/
├── css/
│   ├── style.css           # Estilos globais (index, auth, sobre)
│   ├── agendamentos.css    # Estilos das páginas de agendamentos, admin e status picker
│   └── barbeiros.css       # Estilos do painel de barbeiros
├── js/
│   ├── app.js              # Lógica principal (agendamentos, fila de espera, admin, comentários)
│   ├── auth.js             # Autenticação e perfil do usuário
│   ├── barbeiros.js        # Página pública de barbeiros
│   ├── sidebar.js          # Navegação lateral
│   └── theme.js            # Alternância de tema claro/escuro
├── resources/              # Imagens e recursos visuais
├── index.html              # Página inicial — formulário de agendamento + fila de espera
├── agendamentos.html       # Lista de agendamentos com estatísticas
├── admin.html              # Painel do administrador
├── auth.html               # Login, cadastro e perfil
├── barbeiros.html          # Página pública dos barbeiros
├── comentarios.html        # Avaliações dos clientes + moderação
├── sobre.html              # Sobre a barbearia
└── firestore.rules         # Regras de segurança do Firestore
```

---

## 👥 Usuários do Sistema

| Perfil | Responsabilidades |
|---|---|
| **Cliente** | Realizar agendamentos, acompanhar seus serviços, entrar em fila de espera e deixar avaliações. |
| **Administrador** | Gerenciar barbeiros, serviços, horários e agendamentos; moderar avaliações; acompanhar faturamento. |

---

## ✅ Funcionalidades

### Agendamento e Fila de Espera

- Realização de agendamentos com seleção de barbeiro, serviço, data e horário
- Controle de concorrência via transação atômica no Firestore (sem dupla reserva)
- **Fila de espera**: se um horário estiver ocupado, o cliente pode entrar na fila; ao cancelar o agendamento original, o primeiro da fila é reagendado automaticamente
- Cancelamento de agendamento pelo próprio cliente
- Edição de agendamento existente

### Painel de Agendamentos

- Visualização de todos os agendamentos (admin) ou apenas os próprios (cliente)
- Filtros por nome, serviço e data
- **5 estatísticas**: Total, Confirmados, Pendentes, Previsão de receita (Pendente + Confirmado) e **Faturado** (Concluído)
- **Status picker**: ao clicar em "Status", abre um dropdown com as 4 etiquetas coloridas (Pendente, Confirmado, Concluído, Cancelado) para troca direta
- Ao marcar como **Concluído**, o slot é liberado e o valor é contabilizado no faturamento
- Ao marcar como **Cancelado**, o slot é liberado e a fila de espera é processada automaticamente

### Avaliações com Moderação

- Clientes com login podem enviar avaliações (nota + texto de até 50 palavras)
- Novas avaliações ficam com status `pendente` até revisão do admin
- **Painel de moderação** (exclusivo para admin) na página de avaliações: lista todos os pendentes com botões **Aprovar** (publica) ou **Reprovar** (remove)
- Clientes só visualizam avaliações aprovadas; comentários antigos sem campo `approved` são tratados como aprovados (retrocompatibilidade)
- Badge contador de pendentes visível apenas para admin

### Gestão de Barbeiros

- Cadastro de barbeiros com foto, bio, serviços e duração, horário de atendimento e dias disponíveis
- Geração automática de slots por barbeiro com base nas configurações
- Página pública de barbeiros (`barbeiros.html`)

### Gestão de Serviços e Horários

- Cadastro e remoção de serviços com ícone e preço
- Gerenciamento de horários manuais (legado) e automáticos (por barbeiro)

### Autenticação

- Cadastro e login via Firebase Authentication
- Identificação automática de perfil (cliente / admin)
- Perfil editável com foto

---

## 📐 Regras de Negócio

- Um horário reservado **não aparece** como disponível para outros clientes
- Ao cancelar um agendamento, o **primeiro cliente da fila de espera** daquele horário é reagendado automaticamente como "Pendente"
- Agendamentos **Concluídos** têm seu valor contabilizado separadamente no stat "Faturado"
- Avaliações **precisam de aprovação** do admin antes de aparecerem para os clientes
- O cliente **precisa estar logado** para agendar, entrar na fila ou avaliar
- Apenas admins podem alterar status de agendamentos, moderar avaliações e gerenciar barbeiros/serviços

---

## 🎭 Casos de Uso

### Permissões por Perfil

| Funcionalidade | Cliente | Administrador |
|---|:---:|:---:|
| Cadastrar-se | ✅ | — |
| Fazer login | ✅ | ✅ |
| Visualizar horários | ✅ | ✅ |
| Agendar serviços | ✅ | ✅ |
| Entrar na fila de espera | ✅ | — |
| Cancelar próprio agendamento | ✅ | — |
| Visualizar agendamentos | ✅ | ✅ |
| Realizar comentários | ✅ | — |
| Acessar dashboard admin | — | ✅ |
| Alterar status de agendamento | — | ✅ |
| Gerenciar clientes | — | ✅ |
| Gerenciar horários | — | ✅ |
| Gerenciar serviços | — | ✅ |
| Gerenciar barbeiros | — | ✅ |
| Moderar comentários | — | ✅ |

---

### 📌 Detalhamento dos Casos de Uso

<details>
<summary><strong>Agendamento</strong></summary>

**Descrição:** Permitir que o cliente realize um agendamento.

**Pré-condição:** O cliente deve ter uma conta no sistema.

**Fluxo básico:**
1. O cliente acessa o site
2. Seleciona barbeiro, serviço, data e horário disponível
3. Confirma o agendamento

**Fluxo de exceção — horário ocupado:**
1. A transação detecta conflito
2. O sistema oferece a opção de entrar na fila de espera
3. Ao confirmar, o cliente entra na fila e é reagendado automaticamente quando o horário abrir

**Regras:**
- Controle de concorrência via transação atômica (Firestore)
- Verificação de login antes do envio
- Sem sobreposição de horários por barbeiro

</details>

<details>
<summary><strong>Alteração de Status</strong></summary>

**Descrição:** Admin altera o status de um agendamento via dropdown.

**Fluxo básico:**
1. Admin clica no botão "Status" no card do agendamento
2. Abre dropdown com etiquetas coloridas: Pendente, Confirmado, Concluído, Cancelado
3. Admin seleciona o novo status
4. Sistema aplica a mudança via transação

**Efeitos colaterais:**
- **→ Concluído**: slot liberado; valor contabilizado no faturamento real
- **→ Cancelado**: slot liberado; fila de espera processada (primeiro na fila é reagendado)
- **← Cancelado → ativo**: slot re-ocupado (verifica disponibilidade)

</details>

<details>
<summary><strong>Moderação de Avaliações</strong></summary>

**Descrição:** Admin revisa avaliações pendentes antes de publicá-las.

**Fluxo básico:**
1. Cliente envia avaliação → salva com `approved: false`
2. Admin acessa página de Avaliações
3. Painel de moderação exibe avaliações pendentes com badge contador
4. Admin clica **Aprovar** → `approved: true` → avaliação aparece para todos
5. Admin clica **Reprovar** → avaliação removida permanentemente

</details>

<details>
<summary><strong>Cadastro</strong></summary>

**Descrição:** Permite que o usuário faça um cadastro no sistema.

**Fluxo básico:**
1. O cliente acessa o site e clica em "Realizar cadastro"
2. Preenche os campos com seus dados
3. Submete os dados ao sistema
4. Recebe mensagem de confirmação

**Fluxo de exceção:**
- Campos obrigatórios não preenchidos
- E-mail já existente no banco de dados

**Regras:**
- Validação de campos antes do envio
- E-mail único por conta

</details>

<details>
<summary><strong>Login</strong></summary>

**Descrição:** Permite que o usuário entre na sua conta.

**Pré-condição:** O usuário já deve ter efetuado um cadastro.

**Fluxo básico:**
1. O usuário acessa a opção de login
2. Preenche email e senha
3. O sistema verifica as credenciais
4. Redireciona para a interface principal com perfil identificado

</details>

---

## 🛠️ Tecnologias Utilizadas

| Camada | Tecnologia |
|---|---|
| Frontend | HTML5, CSS3, JavaScript ES Modules |
| Autenticação | Firebase Authentication |
| Banco de dados | Cloud Firestore (tempo real) |
| Fontes e ícones | Google Fonts (Manrope, Inter), Material Symbols |

> O projeto **não utiliza frameworks visuais**, sendo estilizado com CSS próprio.

### Coleções Firestore

| Coleção | Descrição |
|---|---|
| `agendamentos` | Agendamentos dos clientes |
| `slots` | Controle de horários ocupados (chave de conflito) |
| `waitlist` | Fila de espera por horário |
| `services` | Serviços oferecidos |
| `barbeiros` | Dados e configurações dos barbeiros |
| `horarios` | Horários manuais (legado) |
| `users` | Perfis dos usuários |
| `comments` | Avaliações dos clientes (com campo `approved`) |

---

<p align="center">Desenvolvido com ☕ e tesoura ✂️</p>
