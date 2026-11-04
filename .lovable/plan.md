# Lotes 13 e 14 — Plano (sem implementar)

Princípio: nada duplicado. Agendamento = `schedules`; material = `inventory_items` + pendência "Separar equipamento" do Lote 11; tarefas de faturamento estendem `maintenance_schedule`? Não — ver decisão D1. Histórico = `lead_timeline`; avisos = `notification_recipients` + `notification_logs`.

## LOTE 13

### 1. Prontidão do agendamento
- `schedules` ganha: `exige_nota` (bool), `exige_material` (bool), `nota_status` (nao_exigida/pendente/anexada), `material_status` (nao_exigido/pendente/separado), `prontidao` calculada por trigger (pronto / falta_nota / falta_material / falta_ambos).
- Regra de quando exige: instalação de teste, instalação definitiva, entrega, substituição → nota + material; manutenção → material só se tiver itens de reposição marcados.
- Telas: selo de prontidão na Agenda (lista/cards), no Hoje e no detalhe da visita ("Pendente: falta nota / falta separar material").
- Gestor: card "Prontidão pendente D-1" no painel de campo, clicável; alerta único no agendador de 15 min (`confirmar-visitas`) ao chegar D-1 pendente.
- Recomendação check-in: permitir com alerta ao consultor e aviso ao gestor (bloquear deixaria o cliente esperando quando a nota está em trânsito). Configurável por organização ("bloquear check-in sem prontidão").

### 2. Tarefas do Faturamento
- Nova tabela `tarefas_faturamento` (justificativa: nenhuma estrutura existente guarda pedido de emissão de nota com anexo; `maintenance_schedule` é ordem de serviço de campo). Campos: schedule_id, client_id/lead_id, tipo_nota, itens (snapshot jsonb), razão social/CNPJ/endereço/contato (snapshot), prazo (D-1), status (aberta/concluida/cancelada), numero_nota, pdf_path, concluida_por/em.
- Nasce automaticamente quando um agendamento com `exige_nota` é criado; atualiza itens/data se o agendamento muda; cancela se o agendamento é cancelado.
- Tipos de nota propostos: Remessa em comodato, Remessa para teste/demonstração, Venda, Retorno de comodato/teste (confirmar — D2).
- Bucket privado novo `notas-fiscais` (PDF, 10 MB), URLs assinadas curtas só na exibição.
- Tela "Tarefas" (cards) para papel financeiro (e gestor/admin): botão clipe para anexar PDF, número da nota, "Concluir". Concluir exige PDF + número e muda `nota_status` = anexada.
- Nota visível no detalhe da visita para consultor (da visita) e gestor; timeline registra "Nota X anexada".
- Avisos: eventos novos `tarefa_nota_criada` e `tarefa_nota_d1`, marcados por padrão para usuários com papel financeiro ativos.
- RLS: financeiro/gestor/admin da organização leem/editam; consultor só lê as das próprias visitas.

### 3. Separação de material
- Ao criar o agendamento, itens da operação viram pendências "Separar para <data>" (mesma estrutura do Lote 11, agora ligada ao schedule_id e com data).
- Inventário → "Separar equipamento" e Hoje do técnico mostram "Separar para <data>"; botão "Material separado" marca todos e muda `material_status`.
- Reserva de serial opcional quando houver item físico disponível.

### 4. CNPJ obrigatório
- Validação de dígitos no app e no servidor (helper compartilhado).
- Agendamento que exige nota sem CNPJ válido: o formulário pede o CNPJ antes de salvar.
- Consulta BrasilAPI via função do servidor (cache 24h): preenche razão social, endereço, situação. Baixada/inapta/suspensa bloqueia com aviso; consulta indisponível → permite salvar com alerta e tarefa de faturamento marcada "CNPJ não verificado".
- Gravado em `leads.cnpj` / `clients.document` (+ `razao_social`, `cnpj_situacao`, `cnpj_verificado_em` se não existirem).

### 5. Levantamento comercial
- Nova coluna `levantamento` (jsonb) em `leads` e `clients` (dados da empresa, reaproveitados na próxima visita) + cópia no schedule para histórico. Campos: segmento, porte (rótulo por segmento: funcionários/lugares/leitos/quartos), banheiros F/M/PNE, fluxo (baixo/médio/alto), problema principal, produtos atuais e fornecedor, decisor (pessoa de `empresa_contatos`).
- Formulário curto ao iniciar visita comercial, opcional mas lembrado no rodapé de encerramento.
- Sugestão de mix: regras simples num arquivo compartilhado (ex.: odor → Ekkoa; banheiro com público → papel toalha + sabonete; cozinha → Diversey), sugerindo produtos ativos do catálogo, sem preços.
- Encerrar visita comercial ganha 5º botão "Instalação de teste": itens (sugestão pré-marcada) + data → cria o agendamento com prontidão (itens 1–4, incluindo CNPJ).

## LOTE 14 — Flora Equipe
- Função própria `equipe` (recomendado) com secret novo `EQUIPE_BEARER_TOKEN`, separada da `mcp` dos clientes para que um vazamento de um token não abra o outro. Mesmo formato JSON-RPC, mesmo log `mcp_request_log` (campo origem = equipe).
- Identificação: telefone normalizado contra `profiles.phone` da organização, usuário ativo; desconhecido/inativo = recusa. Papéis lidos de `user_roles`; permissões reaproveitam as regras de visibilidade já existentes (consultor/vendedor: só o seu; gestor/admin: tudo; financeiro: tarefas).
- Ferramentas:
  - `identificar_usuario`, `minha_agenda`, `agenda_equipe` (só gestor), `listar_pendencias` (movida/compartilhada: atendimentos + visitas + tarefas de nota para financeiro), `consultar_cliente_ou_lead`, `criar_lead`, `agendar_visita` (mesmas validações do formulário: CNPJ, rota, conflito, Google), `registrar_localizacao_checkin` (grava na visita em andamento do próprio usuário com origem "whatsapp"), `registrar_nota_visita` em 2 passos (preview com token de confirmação válido 10 min → grava só no "sim"), `assumir_atendimento`/`resolver_atendimento`.
  - Respostas curtas com link para a tela exata.
- Sem service-role amplo nas consultas: cada ferramenta filtra explicitamente por organização + regra do papel; testes cobrem vendedor não vendo dados de outro.

## Testes
- Prontidão (combinações tipo × nota × material), trigger e alerta D-1 único.
- Ciclo da tarefa de nota (cria/atualiza/cancela/concluir exige PDF+número), RLS financeiro/consultor.
- CNPJ: dígitos, situação baixada bloqueia, BrasilAPI fora do ar.
- Regras de mix por segmento.
- Equipe: telefone desconhecido recusa, visibilidade por papel, confirmação em 2 passos, check-in por WhatsApp só na própria visita, log gravado.

## Riscos / LGPD
- PDFs de nota contêm dados fiscais: bucket privado, acesso por papel, retenção (sugiro 5 anos, prazo fiscal).
- Telefone como identidade: risco de chip clonado/troca de número → token separado, só usuários ativos, ações destrutivas fora (sem cancelar/apagar).
- Localização por WhatsApp é declarada pelo usuário: marcar origem e mostrar ao gestor.
- Transcrições de áudio: gravar só o texto confirmado, nunca o áudio.
- BrasilAPI é terceiro: só CNPJ enviado, sem dados pessoais.

## Perguntas para decisão
1. Check-in sem prontidão: permitir com alerta (recomendado) ou bloquear?
2. Tipos de nota: Remessa comodato, Remessa teste/demonstração, Venda, Retorno — está certo? Falta algum?
3. Manutenção exige nota quando há reposição de refil (venda) ou só material?
4. Prazo da tarefa: D-1 até qual hora (ex.: 12h)?
5. Flora Equipe: função separada com token próprio (recomendado) ou dentro da `mcp`?
6. Vendedor pode usar `agendar_visita` para manutenção/entrega ou só visita comercial?
7. Retenção dos PDFs de nota: 5 anos?
