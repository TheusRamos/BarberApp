-- Migração 2: vários serviços por agendamento e por pedido na fila de espera.
-- agendamentos.servico_id e fila_espera.servico_id passam a guardar o primeiro serviço;
-- duracao e valor guardam os totais. A lista completa fica nas tabelas abaixo.
CREATE TABLE IF NOT EXISTS agendamento_servicos (
  agendamento_id INTEGER NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  servico_id INTEGER NOT NULL REFERENCES servicos(id),
  ordem SMALLINT NOT NULL CHECK (ordem > 0),
  duracao INTEGER NOT NULL CHECK (duracao > 0),
  valor NUMERIC(10,2) NOT NULL CHECK (valor >= 0),
  PRIMARY KEY (agendamento_id, servico_id)
);
INSERT INTO agendamento_servicos(agendamento_id,servico_id,ordem,duracao,valor)
  SELECT id,servico_id,1,duracao,valor FROM agendamentos ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS fila_espera_servicos (
  fila_id INTEGER NOT NULL REFERENCES fila_espera(id) ON DELETE CASCADE,
  servico_id INTEGER NOT NULL REFERENCES servicos(id),
  ordem SMALLINT NOT NULL CHECK (ordem > 0),
  PRIMARY KEY (fila_id, servico_id)
);
INSERT INTO fila_espera_servicos(fila_id,servico_id,ordem)
  SELECT id,servico_id,1 FROM fila_espera ON CONFLICT DO NOTHING;
CREATE INDEX IF NOT EXISTS idx_agendamento_servicos_servico ON agendamento_servicos(servico_id);
CREATE INDEX IF NOT EXISTS idx_fila_servicos_servico ON fila_espera_servicos(servico_id);
