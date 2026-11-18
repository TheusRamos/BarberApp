-- Migração 6: desde quando o e-mail atual está na conta (no cadastro ou ao corrigir o e-mail).
-- Conta de cliente que não confirma o e-mail em 7 dias a partir dessa data é apagada pela limpeza periódica.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email_definido_em TIMESTAMPTZ NOT NULL DEFAULT now();
