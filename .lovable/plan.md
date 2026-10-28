# Auditoria somente leitura — liberação Arilson (gestor) e Marquinho (consultor_tecnico)

Nada foi alterado. "NV" = não verificado.

## Parte 1 — Acesso por papel

### 1. Rotas por papel (front: `src/hooks/use-permissions.ts` l.26–115; guard: `src/components/ProtectedRoute.tsx` l.38 redireciona para /dashboard)

| Papel | Rotas liberadas | Bloqueadas (exemplos) |
|---|---|---|
| admin | todas (`*`, l.37) | — |
| gestor | dashboard, ekkoa, clientes, leads, propostas, produtos, financeiro, relatorios, areas-cobertura, agenda, suporte, equipamentos, comodatos, inventario, manutencoes, configuracoes (l.47) | usuarios, admin/* |
| vendedor | dashboard, clientes, leads, propostas, produtos, ekkoa, agenda, suporte, equipamentos, comodatos, inventario, manutencoes (l.57) | financeiro, relatorios, configuracoes, usuarios |
| consultor_tecnico | dashboard, ekkoa, agenda, suporte, equipamentos, comodatos, inventario, manutencoes (l.67) | **leads**, clientes, propostas, produtos, financeiro, configuracoes |
| operacional | igual ao consultor_tecnico (l.77) | igual |

RLS no banco (relevante):

| Tabela | SELECT | UPDATE / INSERT |
|---|---|---|
| leads | org + (admin/super_admin/gestor OU created_by OU assigned_to) | UPDATE: qualquer usuário da org (sem filtro de responsável) |
| clients | org + (privilegiado/financeiro OU created_by OU assigned_user_id) | UPDATE: qualquer usuário da org |
| schedules | **toda a org** | UPDATE: qualquer usuário da org; DELETE só admin |
| pessoas | **toda a org** (telefones, e-mails) | INSERT/UPDATE: qualquer usuário da org |
| client_contacts, comodatos, notification_logs, otp_verifications | ALL para quem é da org | ALL |

### 2. Links das notificações
| Link | gestor | consultor_tecnico |
|---|---|---|
| `/agenda?agendamento=<id>` | abre o detalhe (Agenda.tsx l.58) | abre (schedules visível para a org) |
| `/leads?lead=<id>` | abre | **não abre**: rota /leads bloqueada → cai no Dashboard; e RLS só mostra leads dele (leads da Flora têm created_by/assigned_to nulos) |

Deslogado: ProtectedRoute envia para `/auth?returnTo=<path+query>` (l.26–28) e Auth.tsx l.18/32 volta ao destino após login. Ponta a ponta com login real: **NV** (não havia conta de teste).

### 3. Isolamento entre vendedores
- Leads e clientes: por responsável (OK na leitura), **mas UPDATE é só por organização** — um vendedor pode alterar lead/cliente de outro se souber o id.
- Agenda e pessoas: **só por organização** — todos veem todos.

### 4. Agenda
Tipo de serviço: sim, filtro por `schedule_subtype` (Agenda.tsx l.108, selo l.410). Filtro por consultor/"Sem responsável": sim (l.107, l.345).

### 5. Criação de usuário
Tela /usuarios (só admin/super_admin) → edge function `create-user` valida o chamador com `getUser` e consulta `user_roles` (create-user l.31–42) e grava o papel (l.117). Fluxo detalhado na tela: NV.

### 6. Celular
Layout tem classes responsivas mínimas (Agenda.tsx e ScheduleFormDialog com 1 ocorrência de breakpoint cada; lista tem modo cartão l.217/243). Uso real no celular: **NV** (sem teste visual).

## Parte 2 — Checklist de segurança

| # | Item | Status | Evidência |
|---|---|---|---|
| 1 | Chaves fora do front | OK | service_role só em `supabase/functions/*` e migrations; front usa `.env` VITE_* |
| 2 | Secrets no Git | Atenção | `.env` versionado (só chaves públicas). Token MCP não encontrado no repositório (busca incluiu arquivos ocultos). Repositório público? NV. Histórico (500 commits) não varrido |
| 3 | Só chave pública no front | OK | `.env`: URL, PROJECT_ID, PUBLISHABLE_KEY |
| 4 | RLS em todas as tabelas | Atenção | RLS ativo em todas, inclusive 10 `backup_*` e `mcp_request_log` (0 políticas = bloqueadas). Políticas amplas: schedules/pessoas leitura por org; UPDATE de leads/clients/schedules sem filtro de responsável; `audit_logs` INSERT para `public` (usuário pode forjar log da própria org) |
| 5 | Dados sensíveis | Atenção | Telefones/e-mails em texto puro (padrão), protegidos só por RLS; `pessoas` legível por toda a org |
| 6 | Autorização no servidor | Atenção | create-user/manage-user/ekkoa-automations validam token e papel. **`user_roles` ALL para admin da org: limite de quais papéis podem ser atribuídos NV** (possível um admin conceder `super_admin`) |
| 7 | Restrição por papel | Atenção | Ver Parte 1 (consultor sem /leads; agenda e pessoas abertas) |
| 8 | Mass assignment | **Falha** | `handle_new_user` lê `organization_id` dos metadados de cadastro e dá papel **admin** a todo novo usuário → quem se cadastrar informando o id da NitsClean vira admin dela. Também: UPDATE permite trocar `created_by`/`assigned_to` livremente |
| 9 | Sessão | Atenção | Token em localStorage (`persistSession: true`, client.ts l.15) — padrão, exposto a XSS |
| 10 | Senhas | OK/NV | Só Supabase Auth (hash nativo). Política mínima e checagem de senhas vazadas: NV |
| 11 | Rate limit | Atenção | Nenhum (`mcp` protegido só por Bearer). Sem primitiva nativa |
| 12 | Bots / cadastro | **Falha** | Aba de cadastro pública em Auth.tsx l.65 (`signUp`); combinado com item 8. Captcha: não há. Confirmação de e-mail: NV |
| 13 | Queries parametrizadas | OK | Edge functions usam o client (sem SQL concatenado encontrado) |
| 14 | Validação de inputs | OK | `mcp` normaliza/valida params; create-user parcial (NV detalhado) |
| 15 | Vazamento | Atenção | `mcp` devolve `error.message` do banco ao chamador (ex. l.235, 264, 288, 733); l.2784 loga o erro completo. Tokens não são logados |
| 16 | Uploads | OK | Bucket `visit-photos` privado; limites 5MB/MIME conforme memória (config atual NV) |
| 17 | Limites de resposta | Atenção | `leads_da_pessoa` limita 5; listas do front (leads/agenda) sem paginação aparente — NV |
| 18 | Security headers | Atenção | Publicado tem HSTS, nosniff, referrer-policy; **sem CSP e sem X-Frame-Options** |
| 19 | HTTPS | OK | HTTP → 301; HSTS 1 ano |
| 20 | Dependências | **Falha** | `npm audit`: 1 crítica, 15 altas, 5 moderadas (ex.: zod <4.6.6 alta). Pacote da crítica: NV na listagem resumida |

## Prioridade antes de liberar

1. **Crítico** — Cadastro aberto + `handle_new_user` aceitando `organization_id` dos metadados e dando `admin`: desligar cadastro público e criar usuário só pela tela /usuarios; trigger nunca confiar em metadados para organização/papel.
2. **Crítico** — Marquinho (consultor_tecnico) não abre `/leads?lead=` (rota bloqueada + RLS): decidir se ele recebe só links de agenda ou ganha leitura dos leads atribuídos a ele.
3. **Alto** — Restringir quais papéis um admin pode atribuir em `user_roles` (bloquear super_admin) — confirmar primeiro.
4. **Alto** — UPDATE de leads/clients/schedules limitado a responsável ou privilegiado; travar `created_by`.
5. **Alto** — Atualizar dependências com vulnerabilidade crítica/alta.
6. **Médio** — `pessoas` e agenda: decidir se consultor/vendedor devem ver só os seus.
7. **Médio** — `audit_logs` INSERT só pelo servidor; não devolver `error.message` do banco no `mcp`.
8. **Médio** — Adicionar CSP e X-Frame-Options.
9. **Baixo** — Verificar política de senha/HIBP, captcha, teste real no celular e login ponta a ponta com conta de teste.
