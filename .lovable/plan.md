# Lote 5 — Situação do produto e catálogo de parceiros

Situação atual conferida: 479 produtos. 111 DIVERSEY ativos com `specifications.disponibilidade = sob_encomenda`; 34 MULTQUIMICA inativos; demais (incluindo 4 sem marca) ativos, sem situação.

## 0. Backup
`backup_20261029b_products` (cópia completa de products, só service-role) antes de qualquer mudança.

## 1. Campo "situação" (disponibilidade)
- Nova coluna `products.disponibilidade` texto com CHECK `estoque | sob_encomenda | descontinuado`, default `estoque`.
- Migração: DIVERSEY (via specifications) → `sob_encomenda`; inativos (os 34 Multiquímica) → `descontinuado`; restantes → `estoque`.
- Coerência com `is_active` por gatilho: marcar `descontinuado` desliga `is_active`; reativar (`estoque`/`sob_encomenda`) liga `is_active`. Desativar `is_active` direto vira `descontinuado`.
- `specifications.disponibilidade` fica como está (histórico de importação); a coluna passa a ser a fonte da verdade.

## 2. Tela Produtos
- Filtros: Fornecedor/marca (lista das marcas existentes) e Situação (Em estoque / Sob encomenda / Descontinuado / Todas). Padrão esconde descontinuados.
- Selo de situação em cada linha/cartão.
- Seleção múltipla + ações em massa "Marcar como descontinuado" e "Reativar" (reativar volta para `sob_encomenda` se o produto tem origem de catálogo de parceiro, senão `estoque`), com diálogo de confirmação mostrando a quantidade. Visível só para gestor/admin/super_admin; o banco já restringe UPDATE por papel (sem mudança em RLS).
- Detalhe do produto: "Segmentos indicados" (chips de `specifications.segmentos`) e "Embalagem" (`specifications.embalagem`, quando existir).

## 3. `consultar_produto` (mcp) — só esta ferramenta
- Filtra sempre `disponibilidade <> 'descontinuado'` (e ativo).
- Cada produto devolve `disponibilidade`.
- Ordem de decisão:
  1. Termo igual (normalizado, sem acento/caixa) a uma marca/fornecedor cadastrado → `encontrado: true`, `correspondencia: "marca"`, até 5 exemplos variados (categorias diferentes primeiro), sem `mensagem_para_lead`.
  2. Busca por nome atual (TOTAL / PARCIAL / NENHUMA como hoje).
  3. Se não houver TOTAL e o termo casar com um segmento (`specifications.segmentos`, normalizado; aceita singular/plural, ex.: "hotel"/"hotelaria", "lavanderia") → `encontrado: true`, `correspondencia: "segmento"`, até 5 itens, sem mensagem.
- Continua sem preço e sem `next_action_hint`.

## 4. Testes (Deno, mcp)
- "Diversey" → encontrado true, correspondencia "marca", ≤5 itens, sem mensagem.
- "Suma Break Up" → correspondência total.
- Produto descontinuado nunca aparece (nem por nome, marca ou segmento).
- "lavanderia" → itens cujo segmento contém lavanderia.
- Testes vitest da tela: filtro por situação e ação em massa restrita a gestor/admin.

Depois: rodar todos os testes, publicar só `mcp`, reportar.

## Fora do escopo
Autenticação, secrets, outras ferramentas da Flora, preços.

## Detalhes técnicos
- Migração DDL + backfill no mesmo arquivo; gatilho `sync_product_disponibilidade` BEFORE INSERT/UPDATE.
- Ação em massa: um `update ... in (ids)` filtrado por organização ativa.
- Marcas para detecção: `select distinct brand` da organização (cache por requisição).
