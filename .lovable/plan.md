# Lote 1 de correções de segurança

Antes de qualquer alteração de linhas: backup em `backup_20261028_<tabela>` (somente das linhas afetadas), sem RLS aberta (RLS ativa, zero políticas, como os backups atuais). Não mexer em: autenticação do `mcp`, secrets, `mcp_request_log`, demais fluxos da Flora.

## 1. Cadastro fechado (crítico)
- `Auth.tsx`: remover a aba "Cadastrar" e o fluxo `signUp`; fica só login e "esqueci a senha".
- Desligar cadastro público na configuração de autenticação (`disable_signup: true`). Criação de usuário pelo `create-user` continua funcionando (usa a API administrativa, que não é afetada).
- Reescrever `handle_new_user`: ignora `raw_user_meta_data` para organização e papel. Cria só o perfil com `organization_id = NULL` e papel `visitante`. Não cria mais organização automática.
- `create-user`: continua definindo organização e papel no servidor (já faz: atualiza perfil e `user_roles` após criar). Ajustes:
  - deixa de mandar `organization_id` nos metadados;
  - admin comum não pode criar `super_admin` nem escolher outra organização (só super_admin);
  - o gatilho `protect_profile_org_change` passa a aceitar a troca de organização quando feita pelo servidor (service role) — hoje ele bloquearia o novo fluxo.
- Teste: cadastro direto gera visitante sem organização; `create-user` gera usuário na organização com o papel escolhido.

## 2. Papéis (`user_roles`) (alto)
Substituir a política "Admins can manage roles in their org" por políticas separadas (INSERT/UPDATE/DELETE) com USING e WITH CHECK:
- usuário-alvo pertence à mesma organização do admin;
- o papel antigo e o novo nunca são `super_admin`;
- admin não altera os próprios papéis para `super_admin`.
Política de super_admin permanece. `manage-user` recebe a mesma regra no servidor.

## 3. Edição restrita (alto) — leads, clients, schedules
Nova política UPDATE:
- USING: mesma organização E (privilegiado OU `created_by = auth.uid()` OU `assigned_to`/`assigned_user_id = auth.uid()`).
- WITH CHECK: organização continua a do usuário.
- Gatilho BEFORE UPDATE que impede trocar `organization_id` e `created_by` (exceto service role), pois WITH CHECK não compara com o valor antigo.
- `mcp` usa service role, que ignora RLS e o gatilho — continua igual.

## 4. Responsável padrão dos leads da Flora
- Nova coluna `organizations.flora_default_lead_owner` (uuid, opcional) + validação por gatilho de que é usuário ativo da organização.
- Configurações → nova aba "Leads da Flora": seletor com usuários da organização (admin/gestor salvam).
- Ao salvar: backup em `backup_20261028_leads` dos leads `source` Flora (identificados por `gptmaker_chat_id`/origem Flora) sem `assigned_to`, e atribuí-los ao responsável escolhido.
- `criar_lead` e `solicitar_atendimento_humano` (quando criam lead) preenchem `assigned_to` com esse usuário; sem configuração, continua nulo.
- Vendedor: `/leads` já está liberado no menu dele e a RLS permite ver leads com `assigned_to = ele`; o link `/leads?lead=<id>` abre. Será coberto por teste.
- Consultor técnico: sem mudança neste lote (não tem `/leads`).

## 5. Dependências (alto)
`npm audit` aponta 1 crítica e 15 altas. Atualizar via `bun` os pacotes afetados para versões corrigidas, evitando mudanças de versão maior que quebrem o app (ex.: `zod` 4 só se compatível); listar o que não puder ser atualizado sem quebra. Rodar todos os testes e conferir o build.

## 6. Erros do `mcp` (médio)
Trocar retornos com `error.message` do banco por "Erro interno ao <ação>" e registrar no servidor só código/nome da etapa (sem dados pessoais). Lógica das ferramentas inalterada. Atualizar testes afetados.

## Verificação
- Todos os testes (`bunx vitest run`), deploy de `mcp`, `create-user`, `manage-user`.
- Consultas confirmando políticas e gatilhos novos; contagem de linhas em backup.
- Relatório final: o que mudou, backups criados, pacotes atualizados, resultado dos testes.

## Detalhes técnicos
- Migração única com: `handle_new_user`, `protect_profile_org_change` (liberar `auth.role() = 'service_role'`), políticas de `user_roles`, políticas UPDATE + gatilho de imutabilidade em leads/clients/schedules, coluna e gatilho em `organizations`.
- Atribuição em massa ao salvar a configuração: função `SECURITY DEFINER` `apply_flora_default_owner(org)` que verifica admin/gestor, grava backup e atualiza — evita depender da RLS do cliente.
- Ponto de atenção: a RLS de UPDATE de schedules hoje permite qualquer usuário da org mover agendamentos; após a mudança, técnicos só editam os seus ou os que criaram.
