-- Corrigir nome: 'Caio' → 'PH', cargo CAIO vai para notes
UPDATE notification_recipients
SET 
  nome  = 'PH',
  notes = 'CAIO (Chief AI Officer) — ExudusTech. Destinatário de testes e supervisão técnica.'
WHERE whatsapp = '5521979047667';

-- Confirmar:
SELECT organization_id, nome, roles, whatsapp, notes, ativo FROM notification_recipients ORDER BY created_at;