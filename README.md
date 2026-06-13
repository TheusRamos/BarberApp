# 💈 Sistema de Agendamentos — Barbearia

Sistema web para gerenciamento de agendamentos em barbearia, com funcionalidades distintas para clientes e administradores.

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

O sistema tem como objetivo permitir o gerenciamento de agendamentos de serviços em uma barbearia, oferecendo funcionalidades para clientes e administradores. Clientes podem realizar cadastro, login, visualizar horários disponíveis e agendar serviços. O administrador pode gerenciar horários, serviços, clientes e acompanhar informações gerais do sistema.

---

## 📁 Estrutura do Projeto

```
BarberApp/
├── css/
│   ├── style.css           # Estilos globais (index, auth, sobre)
│   └── agendamentos.css    # Estilos das páginas de agendamentos e admin
├── js/
│   ├── app.js              # Lógica principal (agendamentos, admin, comentários)
│   ├── auth.js             # Autenticação e perfil do usuário
│   ├── sidebar.js          # Navegação lateral
│   └── theme.js            # Alternância de tema claro/escuro
├── resources/              # Imagens e recursos visuais
├── index.html              # Página inicial — formulário de agendamento
├── agendamentos.html       # Lista de agendamentos do cliente
├── admin.html              # Painel do administrador
├── auth.html               # Login, cadastro e perfil
├── comentarios.html        # Avaliações dos clientes
├── sobre.html              # Sobre a barbearia
└── firestore.rules         # Regras de segurança do Firestore
```

---

## 👥 Usuários do Sistema

| Perfil | Responsabilidades |
|---|---|
| **Cliente** | Acessar o aplicativo para realizar agendamentos, consultar horários disponíveis e acompanhar seus serviços marcados. |
| **Administrador** | Gerenciar o sistema, cadastrar horários e serviços, visualizar agendamentos e acompanhar o funcionamento da barbearia. |

---

## ✅ Funcionalidades

### Requisitos Funcionais

- Cadastro de novos clientes
- Login de clientes e administradores
- Identificação automática do tipo de usuário após o login
- Visualização de horários disponíveis para o serviço desejado
- Realização de agendamentos pelo cliente
- Cadastro, edição e remoção de horários pelo administrador
- Visualização de agendamentos pelo administrador
- Cadastro de novos serviços oferecidos pela barbearia

### Requisitos Não Funcionais

- Interface moderna, intuitiva e responsiva
- Autenticação para proteção do acesso dos usuários
- Armazenamento seguro em banco de dados em nuvem
- Validação de informações antes de salvar no banco de dados
- Compatibilidade com aplicação mobile

---

## 📐 Regras de Negócio

- Um cliente **não pode** agendar dois serviços no mesmo horário
- Apenas **administradores** podem cadastrar ou remover horários
- Um horário já reservado **não aparece** como disponível para outros clientes
- O cliente **precisa estar logado** para realizar um agendamento
- O administrador pode **visualizar todos** os agendamentos realizados

---

## 🎭 Casos de Uso

### Permissões por Perfil

| Funcionalidade | Cliente | Administrador |
|---|:---:|:---:|
| Cadastrar-se | ✅ | — |
| Fazer login | ✅ | ✅ |
| Visualizar horários | ✅ | ✅ |
| Agendar serviços | ✅ | ✅ |
| Visualizar agendamentos | ✅ | ✅ |
| Realizar comentários | ✅ | — |
| Acessar dashboard | — | ✅ |
| Gerenciar clientes | — | ✅ |
| Gerenciar horários | — | ✅ |
| Gerenciar serviços | — | ✅ |
| Gerenciar comentários | — | ✅ |

---

### 📌 Detalhamento dos Casos de Uso

<details>
<summary><strong>7.1 — Agendamento</strong></summary>

**Descrição:** Permitir que o cliente realize um agendamento.

**Pré-condição:** O cliente deve ter uma conta no sistema.

**Fluxo básico:**
1. O cliente acessa o site com uma conta já criada
2. Acessa o botão de agendamentos
3. Seleciona o horário, dia e cabeleireiro desejados
4. Confirma o agendamento

**Fluxo de exceção:**
- Cliente acessa o sistema sem conta válida
- Cliente não preenche todos os campos obrigatórios
- Perda de conexão durante o processo

**Pós-condição:** O sistema informa via pop-in que o agendamento foi realizado com sucesso.

**Regras:**
- Gestão de horários sem sobreposição
- Verificação de login a cada etapa necessária
- Controle de concorrência no agendamento

</details>

<details>
<summary><strong>7.2 — Cadastro</strong></summary>

**Descrição:** Permite que o usuário faça um cadastro no sistema.

**Fluxo básico:**
1. O cliente acessa o site e clica em "Realizar cadastro"
2. Preenche os campos com seus dados
3. Submete os dados ao sistema
4. Recebe mensagem de confirmação do cadastro

**Fluxo de exceção:**
- Usuário cancela o processo
- Campos obrigatórios não preenchidos
- Dados inválidos nos campos
- E-mail ou telefone já existentes no banco de dados

**Pós-condição:** O sistema informa que o cadastro foi realizado com sucesso.

**Regras:**
- Caracteres válidos em todos os campos
- Prevenção contra SQL Injection
- E-mail e telefone únicos por conta

</details>

<details>
<summary><strong>7.3 — Realizar Comentários</strong></summary>

**Descrição:** O usuário exibe um comentário avaliando os serviços.

**Pré-condições:**
- Possuir cadastro no sistema
- Ter ao menos 3 serviços completos

**Fluxo básico:**
1. O usuário acessa a aba de comentários
2. Seleciona de 1 a 5 estrelas como avaliação
3. Opcionalmente, adiciona um texto de até 50 palavras
4. Submete o comentário

**Fluxo de exceção:**
- Usuário tenta comentar sem os pré-requisitos

**Pós-condição:** O sistema agradece o usuário pelo feedback.

**Regras:**
- Cadastro obrigatório
- Mínimo de 3 serviços completos
- Verificação do conteúdo antes de enviar ao banco de dados

</details>

<details>
<summary><strong>7.4 — Login</strong></summary>

**Descrição:** Permite que o usuário entre na sua conta.

**Pré-condição:** O usuário já deve ter efetuado um cadastro.

**Fluxo básico:**
1. O usuário abre o aplicativo e acessa a opção de login
2. Preenche os campos obrigatórios
3. O sistema verifica as informações
4. O sistema redireciona para a interface principal

**Fluxo de exceção:**
- Dados preenchidos incorretamente
- Campos obrigatórios não preenchidos
- Tentativa de login sem cadastro prévio

**Pós-condição:** O sistema informa que o login foi realizado com sucesso.

**Regras:**
- Caracteres válidos nos campos
- Prevenção contra SQL Injection
- Verificação da correspondência entre dados e banco de dados

</details>

---

## 🛠️ Tecnologias Utilizadas

| Camada | Tecnologia |
|---|---|
| Frontend | HTML5, CSS3, JavaScript (puro) |
| Autenticação | Firebase Authentication |
| Banco de dados | Cloud Firestore |
| Fontes e ícones | Google Fonts, Material Symbols |

> O projeto **não utiliza frameworks visuais**, sendo estilizado com CSS próprio.

---

<p align="center">Desenvolvido com ☕ e tesoura ✂️</p>
