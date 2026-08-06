# Inativar produtos fora da planilha

## Situação atual (verificada no banco)
A organização NitsClean tem **368 produtos, todos ativos, nenhum inativo**. Esse total é exatamente igual ao da planilha importada (368 linhas), e no cruzamento anterior todos os SKUs do banco constavam no arquivo. Ou seja, **hoje não existe produto fora de catálogo para inativar** — a importação já cobriu 100% da base.

Portanto o valor real está em transformar isso numa regra permanente do processo de importação, que passa a valer nas próximas planilhas (quando itens realmente saírem de catálogo).

## O que será construído

### 1. Opção no diálogo de importação
Novo interruptor no modal **Importar Produtos**:

> "Inativar produtos que não estão na planilha (fora de catálogo)"

- Desligado por padrão, para nunca inativar sem intenção explícita.
- Quando ligado, o resumo antes de importar passa a mostrar também: `X novos · Y atualizados · Z serão inativados`.
- Antes de executar, uma confirmação lista quantos e quais produtos serão inativados (primeiros itens + contagem total).

### 2. Comportamento da inativação
- Produtos da organização com SKU que **não aparece** na planilha recebem `is_active = false`.
- Nada é excluído: histórico, propostas, pedidos e comodatos que referenciam o produto continuam intactos.
- Produtos **sem SKU** cadastrado nunca são inativados automaticamente (não há como compará-los com a planilha).
- Produtos que voltam a aparecer numa planilha futura são reativados automaticamente (`is_active = true`) junto com a atualização dos demais campos.

### 3. Registro no histórico
O log de importação passa a guardar quantos produtos foram inativados, junto com os contadores de inseridos/atualizados já existentes, e a tela de Produtos mostra essa informação no resumo da última importação.

### 4. Visibilidade dos inativos na tela de Produtos
Filtro de status na listagem — **Ativos** (padrão), **Inativos**, **Todos** — com selo visual "Inativo" no card, para que os produtos fora de catálogo continuem acessíveis e possam ser reativados manualmente.

## Detalhes técnicos
- Migration: adicionar coluna `deactivated_count` (integer, default 0) em `public.product_imports`.
- `src/hooks/use-products.ts` (`useImportProducts`): aceitar `deactivateMissing: boolean`; após inserts/updates, executar um `update({ is_active: false })` filtrado por `organization_id`, `sku not in (skus da planilha)`, `is_active = true` e `sku not null`, em lotes; incluir `is_active: true` no patch dos SKUs presentes; gravar `deactivated_count` no log.
- `src/components/produtos/ImportProductsDialog.tsx`: `Switch` + cálculo dos SKUs ausentes (comparando com `useProducts`), aviso de confirmação e passagem da flag para a mutation.
- `src/pages/Produtos.tsx`: filtro de status, selo de inativo e exibição de `deactivated_count` no resumo da última importação.
