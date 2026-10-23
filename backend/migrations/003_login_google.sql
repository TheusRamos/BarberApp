-- Migração 3: login com Google. Contas criadas pelo Google não têm senha e informam o telefone depois;
-- a API exige o telefone antes de agendar ou entrar na fila.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS google_id VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_google_id ON usuarios(google_id);
ALTER TABLE usuarios ALTER COLUMN senha DROP NOT NULL;
ALTER TABLE usuarios ALTER COLUMN telefone DROP NOT NULL;
ALTER TABLE usuarios ADD CONSTRAINT usuario_com_acesso CHECK (senha IS NOT NULL OR google_id IS NOT NULL);
