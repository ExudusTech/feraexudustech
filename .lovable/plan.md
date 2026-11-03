# Lote 11 — Base instalada viva

Fila: só começa depois de finalizar o Lote 10 e as etapas no kanban. Nada é implementado antes da sua aprovação.

## Recomendação: comodatos x inventory_items

- **O ponto de instalação passa a ser o `comodato`.** A tabela já guarda cliente, produto, família de dispenser, local interno, fabricante, endereço/cidade, última e próxima manutenção e periodicidade. As evidências da visita (`schedule_evidencias.comodato_id`) e as ordens de serviço (`maintenance_schedule.comodato_id`) já apontam para ela.
- Em **comodatos** entram os campos novos: refil/produto usado, quantidade, foto de cadastro, estado atual (verde/amarelo/vermelho) e origem ("campo" ou "importação").
- **`inventory_items` fica só como estoque físico ou número de série**, e é opcional: o ponto pode existir sem aparelho serializado (`inventory_item_id` vazio). Assim, ninguém precisa cadastrar número de série em campo, e ele pode ser vinculado depois.
- **Não crio uma tabela de pontos nova.** Ela duplicaria o que comodatos já tem, e as telas Comodatos, Manutenções e Equipamentos continuariam em uso.

## Banco
1. **`clients`:** novos campos de latitude/longitude, origem da localização (check-in, Google ou manual), confirmação da localização, `place_id` e região/rota (área de cobertura).
2. **`comodatos`:** colunas novas `refil_product_id`, `quantidade` (texto, pela regra de precisão), `foto_path`, `estado_atual`, `ultima_avaliacao_em` e `origem`. A localização interna passa a ser obrigatória para pontos criados em campo.
3. **Nova `planos_manutencao`** (um ativo por cliente): frequência (semanal, quinzenal, mensal, personalizada em dias), dia da semana preferido, janela de horário, consultor, data inicial, ativo e horizonte de geração.
4. **Nova `ponto_avaliacoes`:** uma por ponto e visita. Guarda o estado, as manutenções feitas (refil, limpeza, ajuste), se precisa substituir, a foto (obrigatória em amarelo/vermelho), a observação e o autor.
5. **Nova `ocorrencias_ponto`:** guarda cliente, ponto, avaliação de origem, item a levar (produto), quantidade, urgente sim/não, status (aberta, separada, resolvida, cancelada) e a visita em que foi resolvida.
6. **Nova `pedidos_visita_emergencial`:** guarda ocorrência, cliente, motivo, status (pendente, aprovado, recusado), quem aprovou e a visita criada.
7. **`schedules`:** referência opcional a `plano_manutencao_id`, com um índice único (plano + data) para o agendador nunca criar visitas duplicadas.
8. **Fotos:** bucket privado, como as imagens de produto (só o caminho é salvo, com link assinado curto). Retenção de 24 meses, igual ao Lote 10.
9. **Segurança:** as regras de acesso por organização e as permissões de acesso ficam no mesmo padrão das tabelas que já existem. As gravações em campo passam pela função de visita, depois de conferir o acesso de quem está gravando.

## Telas
- **Hoje (celular):**
  - Botão "Nova visita de manutenção": busca o estabelecimento no Google (como a Flora) ou aceita só o nome digitado.
  - Cria o cliente com status ativo, ou usa um existente (inclusive cliente sem pontos), e abre a visita já com o check-in.
  - Depois do check-in, pergunta "Usar esta localização como endereço do cliente?". Se o cliente já tiver localização, só substitui com confirmação.
  - Nova lista "Levar na próxima visita", com as ocorrências abertas do consultor agrupadas por cliente.
- **Checklist da visita** (na janela de execução do Lote 10, quando o tipo for manutenção):
  - Cada ponto aparece como "Local — Dispenser + Refil", com a foto de referência do produto.
  - Três botões de estado (verde, amarelo, vermelho), as manutenções feitas e "precisa substituir?" (com item, quantidade e urgente). A foto é exigida em amarelo ou vermelho.
  - As ocorrências abertas do ponto aparecem para dar baixa.
  - "Adicionar ponto": local, dispenser (catálogo de produtos marcados como dispenser, com foto), refil (catálogo), quantidade, foto obrigatória e observação.
  - Só é possível encerrar com todos os pontos ativos avaliados. As regras de check-out do Lote 10 continuam valendo.
- **Ficha do cliente:** abas Pontos, Plano de manutenção e Histórico de avaliações.
- **Inventário:**
  - Mapa (o mesmo do Lote 10) com os clientes ativos, cada um com a quantidade de pontos e a cor do pior estado.
  - Filtros por região, tipo de equipamento, estado e manutenção atrasada.
  - Cards clicáveis (clientes, pontos, amarelos/vermelhos, atrasados, ocorrências abertas) e lista exportável em Excel.
- **Gestor:** fila "Pedidos emergenciais" no painel Campo, para aprovar escolhendo data e horário (com sugestão de horários sem conflito) ou recusar com motivo.
- **Importação inicial:** planilha com cliente, cidade, frequência, dia e consultor. Mostra uma prévia, aponta duplicados por nome e cidade e cria os clientes e os planos, sem pontos.

## Agendador
- Uma etapa diária dentro do agendador de 15 minutos que já existe, sem criar outro.
- Gera as visitas de manutenção dos próximos 30 dias a partir dos planos ativos, no dia preferido.
- Se o dia cair em feriado ou bloqueio, usa o próximo dia útil dentro da janela da região. Se houver conflito, procura o próximo horário livre.
- A criação é idempotente, por plano e data.
- Mudar ou desativar o plano cancela as visitas futuras que ainda não foram executadas.
- Visitas de manutenção recorrente não recebem a confirmação D-1 para o cliente. O aviso vai para o consultor.
- A manutenção fica marcada como atrasada quando o ponto ou o cliente passa da próxima manutenção sem avaliação.

## Notificações
- **Novos eventos para os destinatários:** `manutencao_do_dia` (consultor, às 7h, com a lista do dia e os itens a levar), `ocorrencia_urgente` e `pedido_emergencial` (consultor e gestor, na hora, mesmo fora do horário, como o check-in fora do local) e `pedido_emergencial_decidido` (consultor).
- Os links abrem o registro, respeitando as regras de acesso que já existem.

## Permissões
- **Consultor/operacional:** vê e executa só os clientes e visitas atribuídos a ele. Pode criar cliente e pontos em campo e abrir ocorrências e pedidos emergenciais.
- **Gestor, admin e super_admin:** veem tudo da organização, aprovam pedidos emergenciais, editam planos e importam a planilha.
- **Vendedor:** apenas leitura dos pontos dos próprios clientes.

## Flora Equipe (futuro, só registro)
- "Hoje vou no Restaurante X em Búzios fazer manutenção" cria a visita do consultor que mandou a mensagem.
- Foto e localização continuam sendo feitas só pelo Fera. Não entra neste lote.

## Testes
- **Plano de manutenção:** cálculo das próximas datas (semanal, quinzenal na terça, mensal, personalizada), adiando em feriados ou bloqueios e sem gerar duplicadas.
- **Checklist:** não encerra com ponto sem avaliação, e exige foto em amarelo/vermelho e ao cadastrar um ponto.
- **Ocorrências:** "precisa substituir" cria a ocorrência e ela aparece na visita seguinte. Marcada como urgente, cria o pedido emergencial e o aviso.
- **Localização do check-in:** só passa a ser a do cliente com confirmação, e não substitui uma localização existente sem confirmação.
- **Acesso:** consultor não vê pontos de clientes de outro consultor, e o isolamento entre empresas é testado no banco, com o teste desfeito em seguida.
- **Importação:** linhas inválidas e duplicadas.
- Rodar todos os testes atuais, que precisam continuar passando, e verificar o build.

## Riscos e LGPD
- **Fotos:** podem mostrar pessoas nos banheiros. A orientação na tela será fotografar só o aparelho. As fotos ficam no bucket privado, com retenção de 24 meses.
- **Localização:** a do cliente é um endereço comercial (sem prazo de retenção). A exata do consultor segue os 180 dias do Lote 10.
- **Clientes duplicados criados em campo:** a busca no Google e a comparação por nome e cidade avisam antes de criar outro.

## Pergunta antes de implementar
- O horizonte de geração das visitas fica em 30 dias, e o aviso ao consultor às 7h. Quer outros valores?
