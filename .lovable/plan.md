# Lote 12 — Lead × Cliente e contatos da empresa (plano)

## Situação atual (conferida)
- `leads` já tem `client_id`, `pessoa_id`, `client_contact_id`, `place_id`, `latitude/longitude`, `empresa_nome`, `contact_name/phone/email`, `cargo_contato`.
- `clients` já tem `document` (CNPJ), `place_id`, coordenadas, `localizacao_origem`, `assigned_user_id`, `created_by`.
- Dois modelos de pessoa coexistem: `pessoas` (Flora, por organização, telefone/WhatsApp/chat_ids) e `client_contacts` (preso a um único cliente, usado pela Flora em busca de contato por telefone).
- Dados hoje: 0 pessoas, 0 client_contacts, 0 leads, 3 clients (os testes "Clínica Pró Vida").

## Modelo recomendado (sem duplicar)
- **Pessoa** = `pessoas` (única tabela de pessoa, por organização; dedupe por telefone/WhatsApp/e-mail como a Flora já faz).
- **Vínculo pessoa × empresa** = nova tabela `empresa_contatos` (única tabela nova, justificada: nenhuma existente liga uma pessoa a várias empresas com cargo/principal):
  `organization_id, pessoa_id, lead_id (nulo), client_id (nulo), cargo, is_primary, ativo, created_by` — exatamente um de lead_id/client_id preenchido; um principal por empresa (índice único parcial); sem duplicar mesma pessoa na mesma empresa.
- `leads.pessoa_id` continua = contato principal (mantido por trigger a partir de `empresa_contatos`), então `buscar_contato`, `contato_conhecido` e `criar_lead` seguem funcionando.
- `client_contacts` passa a DEPRECATED (0 linhas, não apagar); a busca da Flora que hoje lê `client_contacts` passa a ler `pessoas` + `empresa_contatos`. `leads.client_contact_id` e `contact_*` ficam como legado espelhado do principal.

## Banco (migrations)
1. `empresa_contatos` + GRANTs + RLS: ver/editar se o usuário pode ver o lead (`can_see` atual dos leads) ou o cliente (`can_see_client`); service-role livre (mcp).
2. `clients`: `origem` texto (`base_existente` | `importacao` | `conversao`, default `base_existente`), `lead_origem_id`, `cidade_normalizada` para dedupe.
3. `leads`: `converted_at`, `converted_by` (`client_id` já existe e vira o elo).
4. Função security-definer `converter_lead_em_cliente(_lead uuid, _forcar_cliente uuid default null)`: checa acesso do chamador; procura duplicado por CNPJ → place_id → nome+cidade; se achar, devolve candidatos (a tela pede confirmação para ligar ao existente); senão cria cliente (endereço, coordenadas, place_id, responsável, origem=conversao), copia vínculos de `empresa_contatos` para o cliente (mesma pessoa, sem duplicar), grava `leads.client_id`, timeline do lead "Convertido em cliente". Idempotente: lead já convertido devolve o cliente atual.
5. Índices de dedupe (CNPJ normalizado por organização único quando preenchido; place_id por organização).
6. Política de INSERT em `clients` restrita a gestor/admin/super_admin, ou consultor com `origem='base_existente'` (fluxo de campo); importação via gestor.

## Telas
- **Leads → Novo lead** (todos os papéis): Empresa (obrigatório), CNPJ opcional, endereço/cidade por busca Google (mesma busca usada no agendamento), seção Contatos com ≥1 contato (nome + telefone/WhatsApp obrigatórios; cargo, e-mail, principal). Ao digitar telefone, sugere pessoa já existente na organização (reaproveita, não duplica).
- **Ficha/edição do lead**: seção Contatos (adicionar, remover, marcar principal); botão "Converter em cliente"; se já convertido, mostra link "Cliente: X".
- **Kanban**: mover para etapa tipo Ganho/Cliente ativo abre confirmação "Converter em cliente agora?" (Sim converte; Não só move).
- **Clientes**: botão "Novo cliente" vira "Cadastrar cliente já atendido (base existente)", visível só para gestor/admin/super_admin; mesma seção Contatos; coluna/selo de origem e link para o lead de origem. Importação por planilha mantida (origem=importacao).
- **Hoje / manutenção em campo (Lote 11)**: cadastro rápido de cliente já atendido continua para o consultor, gravando origem=base_existente e contato opcional.
- **Novo Agendamento "Para quem?"**: visita comercial mostra "+ Novo lead" (abre o formulário de lead e já vincula); manutenção/entrega/técnica exigem cliente existente; "+ Cliente já atendido" só aparece no fluxo de campo/gestor.

## MCP / Flora
- `buscar_contato` e `contato_conhecido`: trocar leitura de `client_contacts` por `pessoas` + `empresa_contatos` (mesmo retorno, só nome revelado).
- `criar_lead`: além de `pessoa_id`, grava o vínculo em `empresa_contatos` como principal (regra existente: reutiliza lead só para mesma pessoa + mesmo estabelecimento + aberto).
- Parâmetro `client_contact_id`/`contato_id` aceito como legado (resolvido para pessoa quando possível); nomes das ferramentas não mudam.
- Lead da Flora para empresa que já é cliente (mesmo place_id/CNPJ): continua criando oportunidade, mas já ligada a `client_id` (sem novo cliente).

## Dados de teste
- Os 3 "Clínica Pró Vida" ficam como estão, recebem `origem='base_existente'` pelo default, sem contatos. O dedupe por nome+cidade vai apontá-los como possíveis duplicados — útil para testar; você limpa depois. Não crio backfill para eles.

## Testes
- Regras: lead exige ≥1 contato com nome e telefone; um único principal; conversão idempotente; dedupe CNPJ > place_id > nome+cidade; conversão copia contatos sem duplicar pessoa; mesma pessoa em duas empresas; consultor não cria cliente fora de base_existente; agendamento comercial aceita lead e manutenção exige cliente.
- MCP: buscar_contato/contato_conhecido/criar_lead com o novo vínculo (testes existentes da Flora continuam passando).
- Suíte completa + build; ao final, Publish necessário (telas) e publicação da `mcp`.

## Riscos
- Mudança na busca de contato da Flora: mitigada mantendo o mesmo formato de retorno e testes.
- Restringir criação de cliente pode bloquear algum fluxo atual de consultor — conferir telas que inserem em `clients` antes de aplicar a política.

## Pergunta
- Na conversão automática ao mover para Ganho/Cliente ativo, o vendedor também pode converter, ou só gestor? (Proposta: quem pode ver o lead pode converter.)
