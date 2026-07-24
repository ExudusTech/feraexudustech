
# Plano — Onda 2 Frontend: Desisolar Ekkoa e representar toda a NitsClean

## Objetivo
Refletir no frontend as mudanças da Onda 2 (novos campos em `inventory_items`, `products`, `schedules`, `maintenance_schedule` e nova tabela `comodatos`), tratando Ekkoa como um dos produtos dentro do sistema NitsClean.

## 1. Navegação (`src/components/layout/AppSidebar.tsx` + `src/App.tsx`)

Nova ordem no menu lateral:

```text
Dashboard
CRM
  ├─ Leads
  ├─ Clientes
  └─ Pipeline
Equipamentos          (NOVO)
Comodatos             (NOVO)
Inventário            (NOVO — global, não Ekkoa)
Agenda                (existente, ampliada)
Manutenções           (NOVO)
Ekkoa
  ├─ Dashboard Ekkoa
  ├─ Instalações
  ├─ Fragrâncias
  ├─ Faturamento Ekkoa
  └─ Leads Ekkoa
Comercial
  ├─ Propostas
  ├─ Contratos
  └─ Financeiro
Configurações
```

Implementação prática: como o sidebar atual é uma lista chata, adicionar suporte a **grupos expansíveis** usando `Collapsible` (shadcn). CRM, Ekkoa e Comercial viram grupos. Manter estado de collapse/dark theme atuais.

## 2. Novas páginas

### `src/pages/Equipamentos.tsx`
- Consulta `inventory_items` onde `item_type = 'EQUIPAMENTO'`.
- Colunas: Nome, Linha (badge colorido), Marca, Nº Série, Status, Cliente (via `client_id` se `em_comodato`), Localização Interna, Próxima Manutenção.
- Filtros: `linha_produto`, `status`, `em_comodato`.
- Reutiliza `InventoryFormDialog` (será estendido com os novos campos, ver §5).

### `src/pages/Comodatos.tsx`
- Nova hook `use-comodatos.ts` (CRUD + join com `clients`, `inventory_items`, `products`).
- Tabela com: Nº Contrato, Cliente, Equipamento, Linha (badge), Localização, Consumo Mínimo + Unidade, Status (badge colorido), Próxima Manutenção.
- Botão "Novo Comodato" abre `ComodatoFormDialog` (novo componente) com selects em cascata:
  cliente → equipamento disponível (inventory_items `item_type=EQUIPAMENTO` e livre) → produto consumível (products onde `disponivel_comodato=true`).

### `src/pages/Inventario.tsx`
- Lista `inventory_items` com filtros por `linha_produto` e `item_type`.
- Reutiliza `InventoryFormDialog`.

### `src/pages/Manutencoes.tsx`
- Lista `maintenance_schedule` com filtro por `linha_produto`.
- Se `inventory_item_id` preenchido → mostra nome do equipamento (join client-side com hook `useInventory`).
- Se `comodato_id` preenchido → link para `/comodatos?id=...`.

## 3. Atualizações em telas existentes

### `src/pages/Agenda.tsx`
- Adicionar coluna `schedule_subtype` com badge por subtipo (PROSPECCAO=azul, DIAGNOSTICO=cyan, INSTALACAO=roxo, MANUTENCAO=laranja, REPOSICAO=verde, COBRANCA=vermelho, OUTRO=cinza).
- Filtros: `schedule_type` e `schedule_subtype`.
- Quando `lead_id` preenchido → mostrar nome do lead (join com `useLeads`).

### `src/pages/Ekkoa.tsx`
- Remover abas "Equipamentos", "Inventário" e "Visitas Técnicas" (essas passam para os módulos genéricos; hooks/dialogs permanecem no código para não quebrar nada).
- Manter: Dashboard, Instalações, Fragrâncias, Faturamento Ekkoa, Leads Ekkoa, Contratos Ekkoa, Operações, Agendamentos-Ekkoa (opcional; ou remover).

## 4. Hooks novos e ajustes

- `src/hooks/use-comodatos.ts` — CRUD completo.
- `src/hooks/use-inventory.ts` — estender interface com `linha_produto`, `item_type`, `em_comodato`, `client_id`, `localizacao_interna`, `proxima_manutencao`; ajustar `insert`/`update`.
- `src/hooks/use-products.ts` — adicionar `linha_produto`, `disponivel_comodato`.
- `src/hooks/use-schedules.ts` — adicionar `lead_id`, `schedule_subtype`.
- `src/hooks/use-maintenance.ts` (se não existe, criar) — adicionar `inventory_item_id`, `comodato_id`, `linha_produto`.

## 5. Componentes de formulário

- `InventoryFormDialog` — novos campos: linha_produto (select), item_type (select), em_comodato (switch), client_id (autocomplete opcional), localização interna (input), próxima manutenção (date).
- `ComodatoFormDialog` — novo (ver §2).
- `ScheduleFormDialog` — adicionar select de `schedule_subtype` e opcional `lead_id`.

## 6. Utilitário compartilhado

Criar `src/lib/linha-produto.ts` com:
- enum `LINHA_PRODUTO` = EKKOA | HIGIENE_MAOS | PAPEL | GEL | QUIMICO | OUTRO
- mapa `LINHA_LABEL` e `LINHA_BADGE_CLASS` (cores tailwind semânticas — sem hex hardcoded, usando classes já definidas).

## 7. Permissões

Atualizar `use-permissions.ts` para incluir os novos paths (`/equipamentos`, `/comodatos`, `/inventario`, `/manutencoes`) — mesma regra do módulo Ekkoa/operacional.

## Fora do escopo
- Não deleta nenhuma tabela `ekkoa_*` nem seus hooks/dialogs (continuam funcionando).
- Sem mudanças de banco.
- Sem alteração de auth, RLS ou tipos gerados.

## Detalhes técnicos (referência rápida)
- Tipos de `inventory_items.item_type` e `linha_produto` já existem no banco; usar como texto (`string`) no client, pois tipos gerados são regenerados após migrations e provavelmente já refletem os enums.
- Badges de linha e subtipo: usar tailwind com `bg-*/10 text-* border-*/20` seguindo o design system existente (glassmorphism dark).
- Todas as consultas continuam com Supabase JS; RLS por `organization_id` já está no banco.
