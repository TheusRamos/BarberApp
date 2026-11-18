-- Migração 4: confirmação de e-mail. As contas que já existiam contam como confirmadas;
-- as novas confirmam pelo link enviado por e-mail (as do Google já chegam confirmadas).
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email_verificado BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE usuarios ALTER COLUMN email_verificado SET DEFAULT FALSE;

-- Links enviados por e-mail: confirmação agora e, depois, recuperação de senha.
-- Como nas sessões, o banco guarda só o hash do token; o token vai apenas no link.
CREATE TABLE IF NOT EXISTS tokens_email (
  token_hash CHAR(64) PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('verificacao','senha')),
  expira_em TIMESTAMPTZ NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tokens_email_usuario ON tokens_email(usuario_id);
