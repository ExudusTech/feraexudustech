# Separar Pessoa de Lead no atendimento da Flora

## Objetivo
Tratar cada pessoa como um contato reutilizável entre várias oportunidades, enquanto cada lead continua representando uma empresa ou estabelecimento específico. Isso elimina o reaproveitamento incorreto de um hotel para outro quando a mesma pessoa conversa pelo mesmo canal.

## Banco de dados
- Criar `pessoas`, isolada por organização, com nome, e-mail, telefone, WhatsApp, Instagram, Messenger, histórico de `chat_ids` e datas de criação/atualização.
- Garantir unicidade por organização para WhatsApp e Instagram ID quando preenchidos, com acesso restrito à organização e escrita compatível com o padrão atual.
- Adicionar `leads.pessoa_id` opcional, com índice e vínculo à pessoa.
- Fazer backfill dos leads com `gptmaker_chat_id`: derivar o canal confiável do chat, agrupar pessoas pelo identificador de canal e vincular os leads existentes sem apagar os campos antigos.

## Atendimento MCP
- Resolver a pessoa por canal confiável e, como ponte entre canais, pelo e-mail informado; atualizar apenas campos vazios e acrescentar novos `chat_ids` sem sobrescrever dados existentes.
- Em `criar_lead`, manter primeiro a idempotência por `interaction_id`; depois reaproveitar somente lead aberto da mesma pessoa e do mesmo estabelecimento:
  - por `place_id`, quando existir;
  - sem `place_id`, por empresa normalizada e cidade normalizada.
- Criar um lead novo, com a mesma `pessoa_id`, quando o estabelecimento mudar ou o lead anterior estiver fechado.
- Em `buscar_contato`, priorizar `pessoas`, manter a resposta existente compatível e acrescentar `pessoa` e até cinco `leads_da_pessoa`.
- Em `agendar_visita_tecnica`, confirmar que o `lead_id` pertence à organização antes de qualquer gravação; manter as demais regras de agenda.
- Atualizar a descrição pública de `criar_lead`, sem mexer em autenticação, secrets, auditoria, normalizador, resolução de canal ou notificações.

## Tela de Leads
- Carregar a pessoa vinculada junto com cada lead.
- Mostrar no card e no detalhe o nome da pessoa e os canais disponíveis, com ícones de WhatsApp e Instagram e texto acessível.
- Manter os campos atuais do lead para compatibilidade e não criar uma tela separada de pessoas.

## Validação e implantação
- Cobrir nos testes: uma pessoa com dois estabelecimentos; mesmo `place_id` reaproveitado; WhatsApp e Instagram unidos por e-mail; retorno de `leads_da_pessoa`; lead inexistente recusado antes do agendamento.
- Rodar os testes MCP e os testes de interface relacionados, conferir a saúde da aplicação, implantar somente a função `mcp` e verificar os totais do backfill.

## Detalhes técnicos
- O backfill será aditivo e idempotente, preservando `gptmaker_chat_id` para compatibilidade.
- A comparação de empresa e cidade será local ao reaproveitamento de leads; o normalizador global não será alterado.
- Os índices únicos serão parciais (`WHERE ... IS NOT NULL`) e compostos com `organization_id`, evitando colisões entre organizações.
