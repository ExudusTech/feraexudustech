# Plano: Importação flexível de produtos + campo Fornecedor

## Análise da planilha enviada (Catálogo_de_Produtos_NitsClean_030826.xlsx)

- Aba única "Catálogo", 368 linhas de produtos, 6 colunas usadas: **Fornecedor, Categoria, MARCA, Codigo, Produto, Descrição**.
- Nenhuma linha sem código e nenhuma sem nome de produto.
- Nenhum SKU duplicado dentro da planilha.
- 37 fornecedores distintos, 65 categorias, 23 produtos com descrição preenchida.

Cruzamento com a base atual (NitsClean, 222 produtos cadastrados):

- **222 SKUs coincidem** — serão atualizados.
- **146 SKUs são novos** — serão inseridos.
- **0 produtos da base ficam fora da planilha** — nenhum produto some ou fica órfão.

Ou seja: a importação desta planilha não corrompe nada. Ela cobre 100% do catálogo atual e o expande.

Ponto de atenção: a planilha não traz Preço, Custo, Estoque nem Unidade. Como só as colunas presentes serão consideradas, os preços e estoques já cadastrados nos 222 produtos existentes serão **preservados** — não serão zerados.

## O que será implementado

### 1. Banco de dados
- Adicionar coluna `fornecedor` (texto, opcional) em `public.products`.
- Adicionar índice único parcial em `products(organization_id, sku)` para SKU não nulo, garantindo atualização segura por SKU e evitando duplicidade.
- Criar tabela `public.product_imports` para o histórico: `id`, `organization_id`, `file_name`, `imported_by`, `total_rows`, `inserted_count`, `updated_count`, `error_count`, `status`, `error_log`, `created_at`, `updated_at`, com GRANT para `authenticated`/`service_role` e RLS por organização.

### 2. Leitura flexível da planilha
- Reconhecer apenas as colunas presentes no arquivo; nenhuma coluna ausente é inventada nem sobrescrita com zero.
- Colunas mínimas obrigatórias: **Produto/Nome** e **Código/SKU**. Se faltar uma delas, o arquivo é rejeitado com mensagem clara.
- Ampliar o mapa de sinônimos de cabeçalho para aceitar: `fornecedor`, `marca`/`MARCA`, `codigo`/`Codigo`/`código`, `produto`, `categoria`, `descrição`, além dos já suportados.
- Normalizar código numérico do Excel para texto (a planilha mistura `'3714'` texto e `3894` número).
- Marcar cada linha na prévia como **Novo** ou **Atualizar**, comparando o SKU com a base.

### 3. Gravação
- Para SKU já existente na organização: atualizar somente os campos vindos da planilha.
- Para SKU novo: inserir produto com `unit = 'un'`, `price`/`cost`/`stock` em zero e `is_active = true`.
- Registrar a importação em `product_imports` com contagens de inseridos, atualizados e erros.

### 4. Interface (tela Produtos)
- No diálogo de importação: descrição atualizada explicando que apenas Nome e Código são obrigatórios e que as demais colunas são opcionais; prévia com coluna Fornecedor e o status Novo/Atualizar; resumo "X novos · Y atualizações".
- Exibir a data da última importação registrada.
- Incluir Fornecedor no formulário de produto e na listagem/filtro de produtos.

## Validações antes de concluir
- Importar a planilha e confirmar 146 inserções e 222 atualizações.
- Conferir que preços e estoques dos 222 produtos existentes permanecem intactos.
- Testar arquivo sem coluna de código para confirmar a rejeição com mensagem.

## Fora do escopo
- Exportação/download do catálogo atual.
- Importação de preços, custos e estoque (não há essas colunas na planilha).
- Exclusão automática de produtos ausentes da planilha.
