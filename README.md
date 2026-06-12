1. Introdução
O sistema tem como objetivo permitir o gerenciamento de agendamentos de serviços em uma barbearia, oferecendo funcionalidades para clientes e administradores. Os clientes poderão realizar cadastro, login, visualizar horários disponíveis e agendar serviços. Já o administrador poderá gerenciar horários, serviços, clientes e acompanhar informações gerais do sistema. 
2. Usuários do Sistema
O usuário será responsável por acessar o aplicativo para realizar agendamentos, consultar horários disponíveis e acompanhar seus serviços marcados. Já o Administrador será responsável por gerenciar o sistema, cadastrar horários, serviços, visualizar agendamentos e acompanhar o funcionamento da barbearia. 

3. Requisitos Funcionais
O sistema deve permitir o cadastro de novos clientes.
O sistema deve permitir o login de clientes e administradores.
O sistema deve identificar automaticamente o tipo de usuário após o login.
O cliente deve conseguir visualizar os horários disponíveis para o serviço desejado.
O cliente deve conseguir realizar um agendamento.
O administrador deve conseguir cadastrar, editar e remover horários.
O administrador deve conseguir visualizar os agendamentos realizados.
O sistema deve permitir o cadastro de novos serviços oferecidos pela barbearia.
4. Requisitos Não Funcionais
O sistema deve possuir uma interface moderna, intuitiva e responsiva.
O sistema deve utilizar autenticação para proteger o acesso dos usuários.
O sistema deve armazenar os dados em um banco de dados seguro.
O sistema deve validar as informações antes de salvar no banco de dados.
O sistema deve ser desenvolvido com tecnologias compatíveis com aplicação mobile.
5. Regras de Negócio
Um cliente não pode agendar dois serviços no mesmo horário.
Apenas administradores podem cadastrar ou remover horários.
Um horário já reservado não deve aparecer como disponível para outros clientes.
O cliente precisa estar logado para realizar um agendamento.
O administrador poderá visualizar todos os agendamentos realizados.
6. Atores do Sistema
Cliente:
Cadastrar-se
Fazer login
Visualizar horários
Agendar serviço
Visualizar agendamentos
Visualizar comentários
Administrador:
Fazer login
Gerenciar horários
Gerenciar serviços
Visualizar agendamentos
Gerenciar clientes
Acessar dashboard
Gerenciar comentários
Visualizar comentários
7. Permissões e Casos de Uso  
Acesse aqui o Diagrama dos casos de uso no LucidChart  para uma melhor visualização dos casos de uso para cada ator do diagrama. Segue tabelas com as permissões de cada um.
CADASTRAR-SE
Cliente : Administrador
FAZER LOGIN
Cliente
VISUALIZAR HORÁRIOS
Cliente : Administrador
AGENDAR SERVIÇOS
Cliente : Administrador
VISUALIZAR AGENDAMENTOS
Cliente : Administrador
ACESSAR DASHBOARD
Administrador
GERENCIAR CLIENTES
Administrador
GERENCIAR HORÁRIOS
Administrador
GERENCIAR SERVIÇOS
Administrador


7.1 Agendamento
Descrição: Permitir que o cliente realize um agendamento.
Pré-condição: O cliente deve ter uma conta no sistema.
Trigger: Não há
Fluxo básico: O cliente deve acessar o site, após a criação de uma conta ele deverá acessar o botão de agendamentos para realizar o mesmo. O sistema permite que o usuário selecione o horário, o dia e o cabeleireiro desejado, após a seleção, o usuário confirma o agendamento.
Fluxo de exceção: 
O cliente consegue acessar o sistema de agendamentos antes de ter uma conta válida.
O cliente não seleciona algum dos campos obrigatórios no agendamento.
O sistema perde a conexão com a internet em meio ao processo de agendamento.
Pós-condições: 
O sistema deve informar o cliente via pop-in que o agendamento foi realizado com sucesso, e deve continuar no site normalmente.
Regras de negócio:
O sistema deve realizar a gestão de horários de forma que um não sobrepõe outro.
O sistema deve realizar a checagem se o usuário está logado no sistema a cada passo em que isso seja necessário.
O sistema deve conseguir realizar o controle de concorrência no agendamento de horários.
7.2 Cadastro
Descrição:  Permite que o usuário faça um cadastro no sistema.
Pré-condição: Não há
Trigger: Não há
Fluxo básico: O cliente deve acessar o site e clicar na opção realizar cadastro, após ele irá preencher os campos com seus dados, e submetê-los ao sistema, após isso ele receberá uma mensagem informando se o cadastro foi realizado corretamente.
Fluxo de exceções: 
O usuário cancela o processo de cadastro.
O usuário submete os dados com a falta de algum campo obrigatório.
O usuário insere um código inválido nos campos.
O usuário informa um email ou número de telefone já existentes no banco de dados.
Pós-condições:
O sistema informa ao usuário que o cadastro foi realizado com sucesso.
Regras de negócio:
O cliente deve inserir caracteres válidos nos campos de dados.
O sistema deve prever uma tentativa SQL injection nos campos do cadastro.
O cliente não deve possuir uma conta com o mesmo email e número de telefone.
7.3 Realizar comentários
Descrição: O usuário exibe um comentário avaliando os serviços do site.
Pré-condições:
O usuário deve possuir um cadastro.
O usuário deve possuir ao menos 3 serviços completos
Fluxo básico:
O usuário acessa a aba de comentários do site, para fazer uma avaliação dos serviços que foram prestados no site. Ele pode colocar uma quantidade de estrelas de 1 a 5 para outras pessoas verem. O usuário também pode adicionar um texto de até no máximo 50 palavras falando sobre os serviços.
Fluxo de exceções:
O usuário tenta realizar um comentário sem os pré requisitos.
Pós-condições:
O sistema agradece o usuário pelo feedback.
Regras de negócio:
O usuário deve possuir um cadastro.
O usuário deve possuir pelo menos 3 serviços completos.
O sistema deve verificar o conteúdo da mensagem antes de mandar para o banco de dados.                                       
7.4 Login
Login : Permite que o usuário consiga entrar na sua conta.
Pré-Condições: O usuário já deve ter efetuado um cadastro para conseguir fazer o login.
Trigger: Não há.
Fluxo básico:  O usuário deve abrir o aplicativo e apertar na opção de login, após isso deve preencher os campos obrigatórios para que o sistema verifique se as informações preenchidas estão corretas , após a verificação o aplicativo deve seguir o fluxo padrão e abrir a interface principal do aplicativo.
Fluxo de exceções: 
O usuário digitaliza errado algum dado durante o preenchimento do campo obrigatório.
O usuário submete os dados com a falta de algum campo obrigatório.
O usuário insere um código inválido nos campos.
O usuário tenta efetuar o login antes de criar o cadastro.
Pós-condições:
O sistema informa ao usuário que o login foi realizado com sucesso.
Regras de negócio:
O cliente deve inserir caracteres válidos nos campos de dados.
O sistema deve prever uma tentativa SQL injection nos campos do cadastro.
O cliente deve possuir uma conta com o mesmo email e número de telefone.
O sistema deve verificar se os dados passados coincidem corretamente com as informações do banco de dados.

8. Tecnologias utilizadas
O sistema será desenvolvido com HTML5, CSS3 e JavaScript puro no frontend, utilizando Firebase Authentication para autenticação de usuários e Cloud Firestore como banco de dados em nuvem. O projeto não utilizará frameworks visuais, sendo estilizado com CSS próprio e recursos externos como Google Fonts e Material Symbols.
