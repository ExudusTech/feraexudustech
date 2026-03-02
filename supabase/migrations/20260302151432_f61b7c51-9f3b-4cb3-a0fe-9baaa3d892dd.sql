
-- Adicionar flag has_ekkoa_access na tabela organizations
ALTER TABLE public.organizations ADD COLUMN has_ekkoa_access boolean NOT NULL DEFAULT false;

-- Criar organização NitsClean com acesso Ekkoa habilitado
INSERT INTO public.organizations (name, trading_name, email, has_ekkoa_access, is_active)
VALUES ('NitsClean', 'NitsClean', 'contato@nitsclean.com.br', true, true);
