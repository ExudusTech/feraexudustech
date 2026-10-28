# Lote 2 — Vários perfis, marca por organização e uso no celular

Fora do escopo (não será tocado): função mcp, Flora, secrets, autenticação (login/cadastro/sessão). Backup `backup_20261028b_*` antes de qualquer alteração de linha (previsto: `organizations` para as cores da NitsClean e `user_roles` dos usuários editados).

## A) Usuário com vários perfis

Situação verificada: o banco já guarda vários papéis e `has_role` checa cada um (RLS já soma os papéis). Mas o app lê só o primeiro papel (`use-auth` usa `roles[0]`) e `usePermissions` monta o menu a partir de um único papel. Hoje, então, Marcos com vendedor + consultor veria só um dos dois.

1. `use-auth` carrega todos os papéis (`roles: string[]`); `role` continua existindo como o papel de maior prioridade (super_admin > admin > gestor > financeiro > vendedor > consultor_tecnico > operacional > user > visitante), para não quebrar quem já usa esse campo.
2. `usePermissions` junta as permissões de todos os papéis: rotas = soma; canEdit/canDelete/finanças/relatórios/config = verdadeiro se qualquer papel tiver. `isAdmin`/`isSuperAdmin` passam a checar a lista.
3. Formulário de usuário (/usuarios): seleção múltipla com caixas de marcação (pelo menos 1 perfil); "Super Admin" aparece só para super admin.
4. `create-user` e `manage-user` aceitam `roles[]` (e ainda `role` por compatibilidade): validam cada papel, recusam super_admin vindo de admin comum e usuário de outra organização (regras do lote 1 mantidas), e trocam o conjunto de papéis inteiro.
5. Lista de usuários mostra cada perfil como etiqueta.
6. Testes: união de permissões (vendedor+consultor abre /leads e /agenda; gestor+vendedor), escolha do papel principal, recusa de super_admin por admin.

## B) Marca por organização

1. O provedor de marca passa a aplicar principal, secundária e destaque (não só a principal), o logo na barra lateral e no cabeçalho, o favicon e a cor do navegador. Sem organização (super admin) ou sem cores → marca Exudus atual.
2. Contraste AA: para cada cor, calcular automaticamente a cor do texto por cima (branco ou escuro) pela razão de contraste ≥ 4,5; se a cor da marca for escura demais para destacar no fundo preto, usar uma variante clareada só para textos/realces no tema escuro.
3. Tela de login: depois de digitar o e-mail não há como saber a organização antes de entrar sem expor dados; proposta: a marca da organização aparece logo após o login (seleção de organização e app). Login continua com marca Exudus. (Se quiser logo no login, seria por endereço próprio, ex. `?org=nitsclean` — fica fora deste lote, salvo pedido.)
4. Configurações → Identidade Visual: upload do logo (PNG/JPG/SVG, até 2 MB, validado na tela e no armazenamento), pré-visualização lado a lado em fundo claro e escuro; salva em `organizations.logo_url`.
5. Armazenamento: nova pasta pública `org-logos` só para logos, limite 2 MB e tipos permitidos; gravar só admin/gestor/super admin na pasta da própria organização (`<org_id>/...`).
6. Barra lateral escura: logo dentro de uma placa clara arredondada (opção fixa, simples e previsível).
7. NitsClean: cores atualizadas para principal #025159, secundária #91BF4B, destaque #5EB5BF (apoio #182859 guardado no campo de configurações da organização) — com backup antes.
8. Fonte: Montserrat aplicada aos títulos apenas da organização NitsClean via configuração por organização (campo `heading_font` nas configurações; padrão continua Plus Jakarta Sans/Inter).

## C) Celular (Arilson e Marcos)

1. Links das notificações: `/agenda?agendamento=` e `/leads?lead=` abrem o detalhe em tela cheia no celular (folha de baixo para cima ocupando a tela), também depois do login (o retorno já existe do lote anterior; será conferido).
2. Agenda no celular: abas "Hoje" e "Amanhã" em lista por horário. Cada cartão: horário, cliente, tipo (Visita comercial / Visita técnica / Entrega / Manutenção, derivado do tipo de agendamento já existente), endereço e botões grandes Abrir no Maps, Ligar, WhatsApp (só aparecem quando há dado).
3. Detalhe do lead e do agendamento: layout em coluna única, sem tabelas com rolagem lateral; ações principais (Ligar, WhatsApp, Maps, Editar) fixas no topo/rodapé.
4. Navegação inferior no celular: Agenda, Leads, Clientes, Mais (Mais abre o menu completo filtrado por permissão). Menu lateral só em telas maiores.
5. Toque ≥ 44px nos botões e itens; campos com fonte 16px no celular.
6. App instalável (só "adicionar à tela inicial", sem modo offline): manifest com nome/cor da organização, ícones 192/512 (Exudus padrão; logo da organização quando houver), abertura em tela cheia, e um aviso com instruções "Adicionar à tela inicial" para iPhone e Android (dispensável). Obs.: o celular grava nome/ícone na instalação; mudar a marca depois exige reinstalar.
7. Teste em 360px e 390px com Playwright logado (Agenda, Leads, detalhes, Clientes, Configurações, Usuários) e relatório das telas que ainda quebrarem.

## D) Limite de usuários

Sem alteração. No relatório: Super Admin → Organizações → coluna "Usuários" da NitsClean → escolher 10 (opções 3/5/10/15/25/50/100).

## Detalhes técnicos

- Migração: bucket via ferramenta de armazenamento + políticas em `storage.objects` (`(storage.foldername(name))[1] = get_user_organization_id(auth.uid())::text` e papel privilegiado); sem tabelas novas. Backups `backup_20261028b_organizations` / `backup_20261028b_user_roles` com RLS e sem acesso por anon/authenticated.
- `AuthUser.roles: AppRole[]`; `usePermissions` usa `mergePermissions(roles)` (função pura testável em `src/lib/permissions.ts`).
- Funções `create-user` e `manage-user` republicadas; mcp não.
- PWA: só `public/manifest.webmanifest` + tags no `index.html`; manifest dinâmico por organização via `link rel=manifest` trocado em tempo de execução com blob; sem service worker.
- Contraste: helper `readableForeground(hex)` (WCAG) com testes.
- Rodar todos os testes (vitest + testes das funções) e relatar.
