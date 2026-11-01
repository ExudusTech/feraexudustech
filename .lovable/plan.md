# Lote 7 — Contexto de conversa no Fera (plano)

Objetivo: guardar um resumo curto por lead (não a transcrição) e devolver à Flora um contexto de até ~400 caracteres da mesma pessoa.

## Resposta à pergunta: quem escreve o resumo?

Recomendação: **híbrido, com o Fera garantindo o mínimo**.
- **Item estruturado gerado pelo Fera (sempre):** cada ferramenta de escrita grava um item montado dos próprios params/resultado (empresa, produto, data da visita, urgência, motivo). Custo zero, 100% confiável e não depende do prompt da Flora.
- **resumo_conversa da Flora (opcional):** quando vier, é saneado (lixo/"não informado" descartado, e-mail/telefone mascarados, cortado em 500) e anexado ao item. A Flora tende a mandar resumos irregulares (às vezes vazios, às vezes longos), por isso não pode ser a única fonte.
- **Gerar com IA no Fera: não agora.** Custaria uma chamada por ferramenta, aumentaria o tempo de resposta e pode inventar fatos; o Fera também não tem a transcrição. Fica como opção futura (resumo por IA só no encerramento, em background).

## Banco

Nova tabela `lead_timeline`:
- organization_id, lead_id, pessoa_id (nullable), canal (WHATSAPP/INSTAGRAM/MESSENGER/WIDGET/TELEGRAM/FERA), chat_id, tipo (`resumo|criar_lead|agendamento|transferencia|fora_perfil|encerramento`, CHECK), resumo (≤500, CHECK de tamanho), proximo_passo (≤200), origem (`flora|fera`), referencia_id (agendamento, opcional), created_at.
- Índices: (organization_id, pessoa_id, created_at desc) e (lead_id, created_at desc).
- RLS: SELECT para usuários da mesma organização seguindo a mesma visibilidade dos leads (vendedor só vê os leads que vê hoje); super_admin vê tudo. Sem INSERT/UPDATE/DELETE pelo app: escrita só pelo service role (mcp). GRANT de SELECT para authenticated e ALL para service_role.
- Nenhum backfill: `leads.description` fica como está.

## Função mcp

Campos opcionais novos `resumo_conversa` (texto) e `proximo_passo` em:

| Ferramenta | tipo gravado | Texto gerado pelo Fera |
|---|---|---|
| criar_lead | criar_lead | "Novo lead — <empresa>: <produto>" |
| atualizar_lead | resumo | campos alterados (etapa, produto) |
| registrar_interacao | resumo (ou `encerramento` se o params indicar) | tipo/descrição da interação |
| agendar_visita_tecnica | agendamento | "visita DD/MM HHh, <produto>" |
| solicitar_atendimento_humano | transferencia | "transferido p/ equipe (urgência X): <motivo>" |
| registrar_fora_cobertura | fora_perfil | "fora da área — <cidade>" |

- O item vai para o lead resolvido pelo isolamento por empresa já existente (nunca o lead de outra empresa).
- A transferência deixa de anexar nota em `leads.description` e passa à linha do tempo (description mantém o conteúdo atual).
- Gravação em background, igual à auditoria: falha nunca muda a resposta.
- Anti-repetição: mesmo lead + tipo + texto em 10 min não duplica.

### contexto_anterior

Devolvido junto com `contato_conhecido` em consultar_produto, localizar_estabelecimento e também em buscar_contato:
- Fonte: 3 itens mais recentes da pessoa identificada pelo chat_id, últimos 90 dias, só da organização.
- Formato: `"DD/MM Canal — Empresa: resumo[, próximo passo]."` concatenados, cortado em 400 caracteres no limite de frase.
  Ex.: "01/11 WhatsApp — Restaurante Brisa: papel toalha, transferido p/ equipe (urgência alta). 01/11 — Smart Fit São Pedro: visita 04/11 10h, dispenser MOD Interfoliado."
- `null` quando não há pessoa ou itens.
- Texto passa por máscara de e-mail/telefone/CPF/CNPJ antes de sair.

### Identificação por canal

- WhatsApp: telefone do chat_id (como hoje).
- Instagram/Messenger: o identificador do chat_id é comparado com `pessoas.instagram_user_id` / `messenger_id` (já gravados na criação). Sem match → contato_conhecido e contexto_anterior nulos.
- Nunca por nome ou e-mail (evita misturar pessoas).
- Unificação de canais: só quando a mesma pessoa já tiver os dois identificadores no cadastro; não unir automaticamente por nome.

## Tela

- Detalhe do lead (Leads): nova aba "Histórico" com cartões em ordem decrescente: data/hora, selo do canal, selo do tipo, resumo, próximo passo, "Flora" ou "Fera". Uma coluna no celular, sem rolagem lateral.
- Vazio: "Nenhuma conversa registrada ainda".

## Testes

- Cada ferramenta de escrita grava 1 item com o tipo certo no lead da empresa atual (A→B não grava em A).
- resumo_conversa vazio/"não informado" → só o texto gerado; longo → cortado em 500; e-mail/telefone mascarados.
- Falha ao gravar não altera a resposta.
- contexto_anterior: 3 itens mais recentes, ≤400 chars, ignora >90 dias, nunca de outra pessoa/organização, `null` para desconhecido.
- Instagram/Messenger por instagram_user_id/messenger_id.
- Transferência não altera mais description.
- Respostas existentes (encontrado, imagem_enviada, mensagem_para_lead) iguais.

## Riscos

- **LGPD:** resumo pode conter dados pessoais; mitigado por máscara, limite de tamanho, visibilidade por perfil e escopo por pessoa. Recomendo depois definir prazo de retenção (ex.: apagar itens com mais de 24 meses).
- **Tamanho:** ~500 chars por item; mesmo com milhares de conversas é pequeno. A consulta usa índice e limite 3.
- **Pessoa errada:** se dois contatos usam o mesmo telefone (ex.: recepção), o contexto mistura empresas; o texto sempre cita a empresa para a Flora confirmar.
- **Confiança no resumo da Flora:** tratado como dado, não instrução; nunca muda etapa nem dados do lead.

## Fora do escopo

Transcrição completa, resumo por IA, migração do histórico antigo em description, autenticação e secrets.
