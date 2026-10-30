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

---

# Lote 6 — Imagens de produtos (depois do lote 5)

## Atenção: bucket público
Este workspace bloqueia buckets públicos (por isso org-logos é privado). Duas opções:
- **A (recomendada):** um admin do workspace libera "buckets públicos" em Settings → Privacy & Security; criamos `product-images` público, com URL fixa e permanente.
- **B:** bucket privado + URL assinada de longa duração (como os logos). Funciona no WhatsApp, mas a URL expira e precisa ser renovada.
Preciso da sua escolha antes de aplicar.

## Banco / Storage
- Bucket `product-images` (limite 5 MB, só JPG/PNG/WebP). Caminho: `<organization_id>/<SKU>.jpg`.
- Políticas em storage: leitura pública (opção A); gravar/trocar/apagar só super_admin ou admin/gestor da própria organização (pasta = organização).
- `products.image_url` (já existe) recebe a URL. Nenhuma coluna nova em products.
- Nova tabela `product_image_sends` (organization_id, chat_id, product_id, image_url, status enviado/erro, error_code, sent_at), só service-role, índice (chat_id, product_id, sent_at) para o bloqueio de 24h.

## Telas (Produtos)
- Cadastro/edição: miniatura + Enviar / Trocar / Remover imagem (remove o arquivo e limpa image_url).
- Listagem: miniatura em cada linha/cartão (ícone neutro quando não há imagem).
- "Importar imagens em lote" (só admin/super_admin): escolhe vários arquivos; nome sem extensão comparado com o SKU (sem diferença de maiúsculas/espaços), só da organização ativa. Antes de gravar, mostra prévia: associadas novas, que substituiriam imagem existente (caixa para confirmar troca, desmarcada por padrão) e arquivos sem SKU. Envio em sequência com barra de progresso. Resumo final: X associadas, Y substituídas, lista sem SKU, falhas. Repetível para novos catálogos.

## mcp — só consultar_produto
- Cada produto devolve `image_url` (null se não houver), além de `disponibilidade` (lote 5).
- Novo campo opcional `chat_id` (normalizado como os demais).
- Envia imagem só quando: encontrado=true, correspondência total de UM único produto, com image_url, chat_id presente. Marca, segmento, parcial ou vários resultados nunca enviam.
- Antes de enviar consulta `product_image_sends`: mesmo chat + mesmo produto com envio "enviado" nas últimas 24h → não reenvia.
- POST `https://api.gptmaker.ai/v2/chat/{chat_id}/send-message` com `{"image": url, "message": nome do produto}`, Bearer `GPTMAKER_API_TOKEN`, tempo limite curto. Falha nunca quebra a resposta; registra só status/código (sem corpo da resposta do provedor).
- Retorna `imagem_enviada: true/false`. O envio espera o resultado (com tempo limite ~5s) para responder o valor correto.
- Testes: envio em produto único; sem envio em busca genérica/marca; bloqueio de 24h; falha da API → imagem_enviada false e resposta normal; sem chat_id → false.

## O que você precisa configurar
- `GPTMAKER_API_TOKEN` **já existe** — nada a pedir.
- Só decidir opção A ou B do bucket (A exige um admin do workspace liberar buckets públicos).

## Futuro (não fazer agora)
Catálogo em PDF por segmento gerado pelo Fera: foto, nome e descrição dos produtos ativos (exclui descontinuados).
