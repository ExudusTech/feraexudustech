# Plano: Histórico de Importações de Produtos + Upsert por SKU

## Objetivo
Permitir ao usuário visualizar a data da última importação de produtos, consultar o histórico de importações e enviar novas planilhas que atualizem produtos existentes (pelo SKU) e insiram novos, tudo dentro da organização atual.

## Contexto atual
- A importação de produtos insere registros diretamente em `public.products` sem guardar log.
- Hoje existem 222 produtos; o `created_at` mais recente aponta 2026-03-02 01:24 UTC como proxy da última importação.
- A tabela `products` tem índice comum em `sku`, mas não é único por organização.

## O que será entregue

### 1. Banco de dados
- Criar tabela `public.product_imports` com os campos:
  - `id`, `organization_id`, `file_name`, `imported_by`, `total_rows`, `success_count`, `error_count`, `status`, `error_log`, `created_at`, `updated_at`.
- Adicionar `GRANT` para `authenticated` e `service_role`.
- Habilitar RLS com políticas por `organization_id`.
- Adicionar índice único parcial em `products(organization_id, sku)` onde `sku IS NOT NULL`, para garantir upsert seguro por SKU.

### 2. Backend (hooks)
- Criar hook `useProductImports` para listar histórico de importações da organização.
- Criar hook `useCreateProductImport` para registrar cada importação.
- Alterar `useCreateProductsBatch` para:
  - Receber flag `upsertBySku`.
  - Quando ativa, para cada linha com SKU preenchido, tentar atualizar o produto existente da mesma organização; SKU vazio continua inserindo novo.
  - Incrementar contadores de sucesso/erro e atualizar o registro de importação.

### 3. Frontend
- Atualizar `ImportProductsDialog`:
  - Mostrar histórico de importações recentes (data, arquivo, status, quantidade).
  - Adicionar checkbox "Atualizar produtos existentes pelo SKU".
  - Ao importar, criar registro em `product_imports`, executar upsert/inserção e atualizar o registro com sucesso/erro.
- Atualizar `Produtos.tsx`:
  - Exibir a data da última importação registrada em `product_imports` (ou inferida dos produtos enquanto não houver registro).

### 4. Validações
- Testar importação com SKU repetido dentro da mesma planilha.
- Testar atualização de produto existente.
- Verificar se RLS permite apenas usuários da organização visualizar/importar.

## Fora do escopo deste plano
- Exportação/download da planilha atual de produtos.
- Notificações automáticas de importação.
- Importação agendada.
