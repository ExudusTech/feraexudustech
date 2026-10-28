# Lote 3 — Usuários/notificações e reorganização do módulo Ekkoa

Backups antes de qualquer alteração: `backup_20261028d_<tabela>` (protegidas, RLS sem políticas, só service role).

## Estado verificado hoje

| Item | Evidência |
|---|---|
| `profiles` já tem `phone`; nenhum perfil tem telefone preenchido (0) | consulta em profiles |
| `notification_recipients`: 3 linhas — "PH" (ExudusTech, 5521979047667, sem eventos), "PH" (NitsClean, 5521979047667, sem eventos), "PH (teste)" (NitsClean, 5521995367752, 3 eventos) | consulta |
| Contagens: ekkoa_installations 2, ekkoa_clients 3, ekkoa_coverage_areas 15; billing/contracts/equipment/fragrance_lines/installation_equipment/leads/product_fragrance_lines/technical_visits = 0; comodatos 0, maintenance_schedule 0, operations 2, inventory_items 2 | consulta |
| `has_ekkoa_access = true` em 1 organização | consulta |
| A Flora (mcp) lê `ekkoa_coverage_areas` (3 pontos) e `notification_recipients` (1 ponto) | mcp/index.ts |
| Menu "Ekkoa" em AppSidebar; rota `/ekkoa` em App.tsx; `/ekkoa` nas rotas de 6 perfis em permissions.ts | arquivos |

## Frente 1 — Usuários e destinatários

1. **WhatsApp obrigatório no cadastro.** Usar a coluna existente `profiles.phone` (já existe, está vazia em todos, evita dois campos de telefone para a mesma coisa). Rótulo na tela: "WhatsApp". Normalização: só dígitos; se vier 10–11 dígitos (DDD+número), acrescenta 55; validação BR = 12–13 dígitos começando com 55. Validado na tela e de novo em create-user/manage-user (fonte da verdade no servidor). Nome, e-mail e WhatsApp obrigatórios ao criar; ao editar, só exigido se for preenchido/alterado.
2. **Usuários sem WhatsApp**: etiqueta "complete o WhatsApp" na lista de /usuarios; edição do WhatsApp permitida (admin da própria org / super admin; o próprio usuário em Meu Perfil).
3. **Novo destinatário** (Configurações → Notificações da equipe):
   - Tipo **Usuário da organização** (padrão): combo de usuários ativos da org (mesmo padrão da aba Leads da Flora). Nome/WhatsApp/e-mail exibidos do cadastro, papel = etiquetas dos perfis. Grava só `user_id` — sempre lê o valor atual. Usuário sem WhatsApp aparece com aviso e não pode ser salvo até completar.
   - Tipo **Contato externo**: nome + WhatsApp digitados, etiqueta "externo".
   - Eventos e Ativo como hoje.
4. **Sem duplicidade**: índice único parcial (org, user_id) e (org, whatsapp) para externos; checagem também contra o WhatsApp atual dos usuários vinculados (validação na tela + gatilho no banco).
5. **Migração dos 3 atuais**: compara WhatsApp com `profiles.phone` dos usuários da mesma org. Como hoje nenhum usuário tem WhatsApp, os 3 viram **contato externo** (dados preservados). Depois que o PH preencher o WhatsApp dele, dá para trocar para "Usuário" pela tela.
6. **mcp (única alteração)**: em dispatchTeamNotification, se a linha tiver `user_id`, usa o `phone` atual do perfil (e só se o usuário estiver ativo); sem `user_id`, usa o `whatsapp` da linha como hoje. Sem número válido → pula e registra em notification_logs. Resto da Flora intocado.

## Frente 2 — Fim do menu "Ekkoa"

### Destino de cada aba

| Aba Ekkoa | Vai para | Dados |
|---|---|---|
| Instalações + Contratos | **Comodatos** (parque de qualquer fabricante) | 2 instalações migradas para `comodatos`; contratos = 0 |
| Operações | **Manutenções** como ordens de serviço (instalação, teste, manutenção, retirada com motivo) | 2 operações migradas para `maintenance_schedule` |
| Agendamentos | **Agenda** (já existe) | nada a migrar (já usa schedules) |
| Faturamento | **Financeiro** (gestor/financeiro/admin) | 0 linhas — tela passa a ler a tabela no Financeiro |
| Fragrâncias | atributo/variante em **Produtos** | 0 linhas |
| Dashboard Ekkoa | cartões no Dashboard do gestor (testes vencendo, parque instalado, manutenções pendentes; receita só para quem tem financeiro) | — |

Fabricante vira campo `fabricante` (texto) em comodatos e manutenções, com filtro.

### Tabelas ekkoa_*

| Tabela | Ação |
|---|---|
| ekkoa_coverage_areas (15) | **Mantida com o mesmo nome** — usada pela Flora; só a tela "Áreas de Cobertura" (já genérica). Não renomear evita qualquer risco em consultar_rota_consultor / verificar_cobertura_regiao. |
| ekkoa_installations (2), ekkoa_contracts (0) | Dados copiados para comodatos (com backup); tabelas marcadas DEPRECATED, não apagadas |
| ekkoa_installation_equipment, ekkoa_equipment (0) | DEPRECATED (inventory_items/Equipamentos cobrem) |
| ekkoa_billing (0) | Mantida, exibida no Financeiro (renomear depois, se quiserem) |
| ekkoa_fragrance_lines, ekkoa_product_fragrance_lines (0) | Mantidas, exibidas como variante em Produtos |
| ekkoa_technical_visits, ekkoa_leads (0) | DEPRECATED (Agenda e Leads cobrem) |
| ekkoa_clients (3) | DEPRECATED; antes, conferir se os 3 já existem em Clientes — se não, copiar (com backup) |

Nada é apagado; tabelas sem uso recebem comentário "DEPRECATED".

### has_ekkoa_access
Passa a significar "módulo de comodato/parque ativo" (sem renomear a coluna para não quebrar telas de admin). Esconde Comodatos/Manutenções quando falso. Rótulo em Organizações muda para "Comodato e parque instalado".

### Menu por perfil (soma de perfis, lote 2)
- Gestor: Dashboard, Agenda, Leads, Clientes, Propostas, Produtos, Comodatos, Manutenções, Inventário, Financeiro, Relatórios, Áreas de Cobertura, Configurações.
- Vendedor: Agenda, Leads, Clientes, Propostas, Produtos.
- Consultor técnico: Agenda, Comodatos, Manutenções, Inventário (consulta), Produtos (consulta). Sem faturamento/receita (valor mensal oculto em Comodatos para quem não tem financeiro).
- Admin/super admin: tudo. Financeiro/operacional mantêm o que têm hoje sem "/ekkoa".
- "Equipamentos" sai do menu e vira aba dentro de Inventário (é cadastro de modelos); rota mantém redirecionamento.

### Rotas antigas
`/ekkoa` → `/comodatos`; `/ekkoa?tab=operacoes` → `/manutencoes`; `agendamentos` → `/agenda`; `faturamento` → `/financeiro`; `fragancias` → `/produtos`; `dashboard` → `/dashboard`.

## Fora do escopo
Flora/mcp além do item 6, autenticação, secrets, mcp_request_log, max_users.

## Detalhes técnicos
- Migração 1: backups d_ (profiles, notification_recipients, comodatos, maintenance_schedule); `notification_recipients.user_id uuid null`, `tipo text check ('usuario','externo')`, whatsapp nullable quando user_id; índices únicos parciais; gatilho de validação (usuário da mesma org, sem número duplicado).
- Migração 2: `fabricante` em comodatos e maintenance_schedule; `tipo_os` + `motivo_retirada` em maintenance_schedule; cópia das 2 instalações e 2 operações (backfill na mesma migração); COMMENT DEPRECATED.
- create-user/manage-user: aceitar/validar `whatsapp` → profiles.phone; republicar. mcp: só a leitura do número; republicar.
- Remover Ekkoa.tsx do menu; reaproveitar componentes de dashboard/kanban nas novas telas.
- Testes novos: normalização/validação do WhatsApp; escolha do número (usuário vinculado vs externo); bloqueio de duplicidade; menu por perfil (gestor/vendedor/consultor e soma); consultor sem financeiro; redirecionamentos. Rodar todos os testes existentes (vitest + Deno).
