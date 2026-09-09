-- Compatível com as seis tabelas fornecidas; executado uma vez pela migração.
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY, nome VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE, telefone VARCHAR(20) NOT NULL UNIQUE,
  senha VARCHAR(255) NOT NULL,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('cliente','administrador'))
);
CREATE TABLE IF NOT EXISTS cabeleireiros (
  id SERIAL PRIMARY KEY, nome VARCHAR(150) NOT NULL, telefone VARCHAR(20),
  email VARCHAR(150), ativo BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS servicos (
  id SERIAL PRIMARY KEY, nome VARCHAR(100) NOT NULL, descricao TEXT,
  preco NUMERIC(10,2) NOT NULL CHECK (preco >= 0),
  duracao INTEGER NOT NULL CHECK (duracao > 0)
);
CREATE TABLE IF NOT EXISTS horarios (
  id SERIAL PRIMARY KEY, data DATE NOT NULL, hora TIME NOT NULL,
  cabeleireiro_id INTEGER NOT NULL REFERENCES cabeleireiros(id),
  disponivel BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT horario_unico UNIQUE (data,hora,cabeleireiro_id)
);
CREATE TABLE IF NOT EXISTS agendamentos (
  id SERIAL PRIMARY KEY, cliente_id INTEGER NOT NULL REFERENCES usuarios(id),
  servico_id INTEGER NOT NULL REFERENCES servicos(id),
  cabeleireiro_id INTEGER NOT NULL REFERENCES cabeleireiros(id),
  horario_id INTEGER NOT NULL REFERENCES horarios(id),
  status VARCHAR(30) NOT NULL DEFAULT 'agendado'
);
CREATE TABLE IF NOT EXISTS comentarios (
  id SERIAL PRIMARY KEY, cliente_id INTEGER NOT NULL REFERENCES usuarios(id),
  estrelas INTEGER NOT NULL CHECK (estrelas BETWEEN 1 AND 5),
  texto VARCHAR(500), data DATE NOT NULL DEFAULT CURRENT_DATE
);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_normalizado ON usuarios(lower(email));
ALTER TABLE cabeleireiros ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '';
ALTER TABLE cabeleireiros ADD COLUMN IF NOT EXISTS foto TEXT NOT NULL DEFAULT '';
ALTER TABLE cabeleireiros ADD COLUMN IF NOT EXISTS inicio TIME NOT NULL DEFAULT '09:00';
ALTER TABLE cabeleireiros ADD COLUMN IF NOT EXISTS fim TIME NOT NULL DEFAULT '20:00';
ALTER TABLE cabeleireiros ADD COLUMN IF NOT EXISTS dias INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5,6}';
ALTER TABLE servicos ADD COLUMN IF NOT EXISTS icone VARCHAR(80) NOT NULL DEFAULT 'content_cut';
CREATE UNIQUE INDEX IF NOT EXISTS servicos_nome_unico ON servicos(nome);
CREATE TABLE IF NOT EXISTS cabeleireiro_servicos (
  cabeleireiro_id INTEGER REFERENCES cabeleireiros(id) ON DELETE CASCADE,
  servico_id INTEGER REFERENCES servicos(id) ON DELETE CASCADE,
  duracao INTEGER NOT NULL CHECK (duracao BETWEEN 5 AND 480),
  PRIMARY KEY(cabeleireiro_id,servico_id)
);
ALTER TABLE agendamentos DROP CONSTRAINT IF EXISTS agendamento_horario_unico;
ALTER TABLE agendamentos DROP CONSTRAINT IF EXISTS agendamentos_status_check;
ALTER TABLE agendamentos ADD CONSTRAINT agendamentos_status_check
  CHECK (status IN ('agendado','confirmado','concluido','cancelado'));
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS observacoes VARCHAR(240) NOT NULL DEFAULT '';
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS valor NUMERIC(10,2);
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS duracao INTEGER;
UPDATE agendamentos a SET valor=s.preco, duracao=s.duracao FROM servicos s
  WHERE a.servico_id=s.id AND (a.valor IS NULL OR a.duracao IS NULL);
ALTER TABLE agendamentos ALTER COLUMN valor SET NOT NULL;
ALTER TABLE agendamentos ALTER COLUMN duracao SET NOT NULL;
ALTER TABLE agendamentos ADD CONSTRAINT agendamento_valor_valido CHECK (valor >= 0);
ALTER TABLE agendamentos ADD CONSTRAINT agendamento_duracao_valida CHECK (duracao > 0);
CREATE UNIQUE INDEX IF NOT EXISTS agendamento_horario_ativo ON agendamentos(horario_id)
  WHERE status IN ('agendado','confirmado');
-- Impede apontar para um horário de outro profissional.
ALTER TABLE horarios ADD CONSTRAINT horario_id_cabeleireiro_unico UNIQUE(id,cabeleireiro_id);
ALTER TABLE agendamentos ADD CONSTRAINT agendamento_horario_cabeleireiro
  FOREIGN KEY(horario_id,cabeleireiro_id) REFERENCES horarios(id,cabeleireiro_id);
ALTER TABLE comentarios ADD COLUMN IF NOT EXISTS aprovado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE comentarios ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE comentarios DROP CONSTRAINT IF EXISTS comentario_max_50_palavras;
ALTER TABLE comentarios ADD CONSTRAINT comentario_max_50_palavras CHECK
  (texto IS NULL OR cardinality(regexp_split_to_array(trim(texto), '\s+')) <= 50);
CREATE TABLE IF NOT EXISTS sessoes (
  token_hash CHAR(64) PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em TIMESTAMPTZ NOT NULL DEFAULT now()+interval '7 days'
);
CREATE TABLE IF NOT EXISTS fila_espera (
  id SERIAL PRIMARY KEY, cliente_id INTEGER NOT NULL REFERENCES usuarios(id),
  servico_id INTEGER NOT NULL REFERENCES servicos(id),
  horario_id INTEGER NOT NULL REFERENCES horarios(id),
  duracao INTEGER NOT NULL CHECK(duracao>0), valor NUMERIC(10,2) NOT NULL,
  observacoes VARCHAR(240) NOT NULL DEFAULT '', criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cliente_id,horario_id)
);
CREATE INDEX IF NOT EXISTS idx_horarios_data ON horarios(data);
CREATE INDEX IF NOT EXISTS idx_horarios_cabeleireiro ON horarios(cabeleireiro_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_cliente ON agendamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_servico ON agendamentos(servico_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_cabeleireiro ON agendamentos(cabeleireiro_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_cliente ON comentarios(cliente_id);
CREATE INDEX IF NOT EXISTS idx_fila_horario ON fila_espera(horario_id,id);
