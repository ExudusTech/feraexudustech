# Dispensers, consumíveis e o elo com Inventário e Comodatos

## Levantamento feito no catálogo (368 produtos)

### Dispensers que JÁ existem como produto (categoria "Dispensers", "Suportes" e afins — 17 itens)
| Código | Produto | Família de dispenser |
|---|---|---|
| 3820 | APARELHO EKKOAIR 550 | Aromatização (500ml) |
| 3682 | APARELHO EKKOAIR 80 | Aromatização (80ml) |
| 3799 | DOSADOR AEROSOL HAROMA SPRAY LED L | Aromatização aerossol |
| 3732 | DISP P/ ODORIZADOR DE AMB KIMCARE | Aromatização aerossol |
| 3706 | DISP BONZER PRETO P/ REFIL 4L | Sabonete/álcool 4L |
| 3350 / 3349 | STOKO VARIO ULTRA BLACK / WHITE | Sabonete cartucho |
| 3913 / 3935 | DISP FIO DENTAL BRANCO / PRETO | Fio dental |
| 3911 / 3934 | DISPENSER PILHA PREMIUM 3 EM 1 (branco/preto) | Higiene bucal 3 em 1 |
| 1047 | DISPENSER HIG INTERF AMAZON BR PREMISSE | Papel higiênico interfolha |
| 1042 / 1030 / 2307 | DISPENSER COPO ÁGUA / CAFÉ / POUPA COPOS | Copos |
| 1415 / 1416 | SUPORTE P/ 2 e 3 PRODUTOS QUÍMICOS C/ TRAVA | Diluição química |
| 3324 | SUPORTE WET SYSTEM LIGHT CINZA | Mop / limpeza |

### Dispensers que NÃO estão no catálogo e serão cadastrados como equipamento
Identificados pela lógica que você descreveu (o consumível é vendido, o dispenser é cedido em comodato):
- Papel higiênico **rolão/jumbo** (Scott 250/300/500m, Neve, Max Pure) → dispenser jumbo
- Papel higiênico **rolinho 30m** (Mimmo, Neve) → dispenser de rolinho comum
- Toalha **rolo** (Scott, Kleenex, Max Pure) → dispenser de toalha em rolo
- Toalha **interfolha** (Scott Essent, Max Pure) → dispenser de toalha interfolha
- **Sabonete espuma** (Kleenex Dermo, Mimmo, Scott Foam) → dispenser de espuma 800ml
- **Sabonete spray** (Scott, Mimmo, Pure) → dispenser spray 400/800ml
- **Sabonete/álcool 5L** (granel) → dispenser reservatório 5L
- **Álcool gel** → dispenser de álcool em gel (parede/pedestal)
- **Absorvente higiênico** → dispenser de absorvente (não há consumível cadastrado ainda; a família fica criada para uso futuro)
- **Aromatizante EKKOA 80ml e 500ml / Neutra 7 / Aroma 4** → já atendidos pelos aparelhos EKKOAIR 80 e 550 (existentes)

### Consumíveis que passam a apontar para uma família de dispenser
- 13 Toalhas, 9 Papéis Higiênicos, 10 Sabonetes, 26 Aromatizantes, 39 Neutralizadores (refis 80/500ml), 5 Odorizadores, 5 Higiene Bucal, 2 Copos → **≈109 produtos** ganham vínculo com dispenser.
- Os demais (~240: químicos, mops, sacos, panos, lixeiras, EPIs) ficam sem dispenser.

## O que será construído

### 1. Famílias de dispenser (referência única do sistema)
Lista fixa e nomeada de famílias: Papel Higiênico Jumbo, Papel Higiênico Rolinho, Papel Higiênico Interfolha, Toalha em Rolo, Toalha Interfolha, Sabonete Espuma, Sabonete Spray, Sabonete/Álcool 5L, Álcool Gel, Absorvente, Aromatizante 80ml, Aromatizante 500ml, Aromatizante Aerossol, Fio Dental, Higiene Bucal 3 em 1, Copos, Diluição Química.

### 2. No cadastro de Produtos
- Novo campo **"Funciona com dispenser"** (seleção múltipla de famílias) no formulário de produto, mais um marcador **"Este produto É um dispenser"** com sua família.
- Filtro e coluna na listagem para ver rapidamente quais produtos exigem dispenser.
- Carga inicial automática das ≈109 associações do levantamento acima (por categoria e palavras-chave do nome), revisável na tela.

### 3. No Inventário / Equipamentos
- Dispensers passam a ser itens de inventário do tipo EQUIPAMENTO com a família preenchida — tanto os que vêm do catálogo (17 itens) quanto as famílias novas.
- Cada unidade física continua com número de série, localização, cliente e próxima manutenção.

### 4. Em Comodatos
- No formulário de comodato, ao escolher o dispenser o sistema mostra automaticamente **quais consumíveis do catálogo abastecem aquele dispenser**, e a seleção de consumível fica restrita a eles.
- Ao escolher primeiro o consumível, o sistema sugere as famílias de dispenser compatíveis.

## Detalhes técnicos
- Migration: tabela `dispenser_families` (nome, descrição, organization_id, RLS + GRANTs) com carga das 17 famílias; colunas em `products`: `is_dispenser boolean default false`, `dispenser_family_id uuid`, `compatible_dispenser_families uuid[]`; coluna `dispenser_family_id` em `inventory_items` e `comodatos`.
- Script de classificação inicial (via insert tool) usando categoria + regex de nome (`JUMBO|ROLO|INTERF|ESPUMA|SPRAY|80ML|500ML|FIO DENTAL`) para popular as associações.
- Frontend: `src/lib/dispenser-families.ts`, hook `use-dispenser-families.ts`; ajustes em `ProductFormDialog.tsx`, `Produtos.tsx`, `InventoryFormDialog.tsx`, `Inventario.tsx`/`Equipamentos.tsx` e `ComodatoFormDialog.tsx` (filtro cruzado dispenser ↔ consumível).
