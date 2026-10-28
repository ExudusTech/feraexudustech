DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','user_roles','organizations','notification_recipients','clients','ekkoa_clients','ekkoa_installations','operations','inventory_items','schedules'] LOOP
    EXECUTE format('CREATE TABLE public.%I AS SELECT * FROM public.%I', 'backup_20261028d_'||t, t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'backup_20261028d_'||t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', 'backup_20261028d_'||t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', 'backup_20261028d_'||t);
  END LOOP;
END $$;
CREATE TABLE public.backup_20261028d_auth_users AS SELECT id, email, created_at, raw_user_meta_data FROM auth.users
  WHERE email IN ('consultorteste@email.com','vendedorteste@email.com','teste@clientemanager.com','admin2@teste.com');
ALTER TABLE public.backup_20261028d_auth_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.backup_20261028d_auth_users FROM anon, authenticated;
GRANT ALL ON public.backup_20261028d_auth_users TO service_role;