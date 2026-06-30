
# Documentação completa do Sistema de Gestão (DOCX)

Vou gerar um arquivo **DOCX** baixável (`/mnt/documents/Documentacao_Sistema_Gestao.docx`) com a documentação consolidada do sistema, inferida a partir do código-fonte, das migrações do banco e das memórias do projeto.

## Estrutura do documento

1. **Capa e visão geral**
   - Nome do produto (Sistema de Gestão), proposta de valor, modelo multi-tenant SaaS, módulos principais (CRM, Comercial, Financeiro, Ekkoa, Suporte, Admin SaaS).
2. **Arquitetura técnica**
   - Stack: React 18 + Vite + TypeScript + Tailwind + shadcn/ui; Lovable Cloud (Supabase) para auth, banco, storage e edge functions.
   - Diagrama textual de camadas (UI → Hooks/React Query → Supabase Client → Postgres/RLS / Edge Functions / Storage).
   - Integrações externas: Google Maps, ViaCEP, Lovable AI Gateway.
3. **Arquitetura de banco de dados**
   - Lista das ~38 tabelas agrupadas por domínio (Core/Tenant, Auth/RBAC, CRM, Comercial, Financeiro, Ekkoa, Suporte, SaaS Admin, Auditoria).
   - Para cada tabela: propósito, colunas-chave de negócio (sem campos triviais), e relacionamentos.
   - Diagrama de relacionamentos (texto/ASCII) mostrando `organizations` como raiz multi-tenant e como `profiles`, `user_roles`, `clients`, `leads`, `proposals`, `orders`, `ekkoa_*`, `financial_transactions` etc. se conectam.
   - Funções e triggers existentes (`has_role`, `get_user_organization_id`, `handle_new_user`, `protect_profile_org_change`, helpers `is_*`).
4. **Segurança**
   - Modelo multi-tenant com isolamento via `organization_id` + RLS em todas as tabelas.
   - RBAC com 9 papéis (super_admin, admin, gestor, vendedor, consultor_tecnico, operacional, financeiro, user, visitante) e matriz resumida de permissões por rota/ação.
   - Tabela separada `user_roles` (anti-escalada de privilégio) + funções `SECURITY DEFINER`.
   - Proteções específicas: bloqueio de troca de `organization_id`, contas inativas/não verificadas deslogadas, `super_admin` com seletor de organização, bucket `visit-photos` privado com limites.
   - Boas práticas adotadas: GRANTs explícitos por tabela, validações centralizadas, uso de `exceljs` (evita Prototype Pollution/ReDoS), senhas com toggle de visibilidade, fluxo de reset por e-mail.
   - Pontos de atenção/recomendações (ex.: revisar policies de leitura `anon`, ativar HIBP password check se ainda não estiver ligado).
5. **Funcionalidades entregues** (por módulo, com base no código e nas memórias)
   - **Auth & Usuários**: signup/login, reset de senha, perfil, gestão de membros via edge function, ativação/verificação.
   - **CRM**: pipeline (Novo → Qualificação → Ganho/Perda) com criação restrita à etapa Novo, visitas de cliente, sistema unificado de leads, agendamento.
   - **Comercial**: propostas, conversão para pedidos, catálogo de produtos com importação em massa e deduplicação.
   - **Financeiro**: transações, despesas operacionais, métodos de pagamento, manutenção programada.
   - **Ekkoa** (módulo técnico opcional via `has_ekkoa_access`): leads, contratos, instalações, equipamentos com séries `RES-`, visitas técnicas com GPS/foto, áreas de cobertura por CEP, faturamento, fragrâncias, dashboard de MRR e expirações.
   - **Agenda**: calendário unificado.
   - **Relatórios**: exportação PDF/Excel, dashboards por papel.
   - **Suporte**: tickets com threads, prioridades, mensagens não lidas.
   - **Admin SaaS**: gestão de organizações, planos, módulos, impersonação por super admin, branding dinâmico (cores/logo).
   - **Auditoria**: `audit_logs` para LOGIN/CREATE/UPDATE com metadata.
6. **Pendências e roadmap inferido** (gaps observados no código vs. memórias/plano)
   - Itens marcados como módulo previsto mas sem implementação completa identificada (ex.: cobertura completa de relatórios avançados, automações de propostas, módulos SaaS adicionais em `saas_modules`).
   - Recomendações de hardening de segurança ainda não confirmadas (HIBP, rate limiting em edge functions, rotação de chaves).
   - Telemetria/observabilidade, testes automatizados ampliados, documentação de API das edge functions.
   - Observação: a lista de pendências será gerada a partir do diff entre o que está nas memórias/plano e o que existe no código — pode não cobrir 100% do plano original.
7. **Apêndices**
   - Glossário de papéis e termos.
   - Lista de edge functions (`create-user`, `manage-user`, `ekkoa-automations`).
   - Lista de buckets de storage e segredos configurados (apenas nomes).

## Plano técnico de execução

1. Investigar com `acp_subagent--explore` em paralelo: (a) esquema completo via `supabase--read_query` em `information_schema` para colunas/FKs/policies, (b) varredura de rotas/páginas/edge functions, (c) leitura das memórias do projeto referenciadas no índice.
2. Consolidar achados num rascunho Markdown interno.
3. Gerar o `.docx` com `docx-js` (Node) seguindo o skill de DOCX: fonte Arial, página US Letter, headings estilizados, listas com `LevelFormat.BULLET`, tabelas com `WidthType.DXA` e `columnWidths` somando à largura, sumário automático (TOC).
4. Validar o arquivo (`validate_document.py`) e converter para imagens para QA visual de cada página; corrigir e regerar se houver overflow/quebra.
5. Publicar o artefato com `<presentation-artifact>` para download.

## Entregável

- `Documentacao_Sistema_Gestao.docx` em `/mnt/documents/`, pronto para download e compartilhamento.
