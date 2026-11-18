-- Migração 5: e-mail que voltou como inexistente (aviso do Brevo por webhook).
-- Enquanto a conta não é confirmada, o cliente pode corrigir o endereço no Perfil.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email_recusado_em TIMESTAMPTZ;
