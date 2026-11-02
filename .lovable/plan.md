# Lote 8 (revisado) — Horário de atendimento humano, com feriados vindos do Google Calendar

## Situação atual (verificada)
- **Não há integração com Google Calendar no Fera hoje.** Nenhuma função ou tela do projeto chama o Google Calendar, e não existe conexão Google Calendar disponível neste workspace. O primeiro passo é conectar a conta flora.nitsclean@gmail.com (ver "O que você precisa fazer").
- A tabela `holidays` tem 28 feriados (nacionais + RJ, 2026–2027) e é usada por `consultar_rota` e `agendar_visita_tecnica` para pular dias.
- Transferência e Matriz avisam a equipe na hora; não há horário de atendimento nem fila.

## 1. Fonte dos feriados: Google Calendar (só leitura)
- **(a) Agenda pública "Feriados no Brasil"** (`pt.brazilian#holiday@group.v.calendar.google.com`), eventos de dia inteiro.
  - O Google marca cada evento na descrição: "Feriado público", "Observância" ou similar. **Feriado público** = sem atendimento. **Observância/data comemorativa** (Dia das Mães, Dia do Professor...) = ignorada.
  - **Ponto facultativo** (Carnaval, Quarta de Cinzas, Corpus Christi...): chave configurável. **Recomendação: padrão = dia útil (atende).** O ponto facultativo vale para o serviço público, não para empresa privada. Quando a NitsClean não for atender (ex.: Carnaval), o Arilson bloqueia o dia na agenda própria (b), e fica explícito.
  - Feriados estaduais do RJ: a agenda pública nem sempre traz todos os estaduais (ex.: São Jorge 23/04, Consciência Negra varia). Eles ficam garantidos pela agenda (b). Na implantação, comparo com os 28 atuais e listo o que faltar para o Arilson cadastrar.
- **(b) Agenda "Feriados e recessos NitsClean"** na mesma conta: feriados municipais, recessos e dias sem atendimento. Todo evento dessa agenda = dia sem atendimento.
  - Municipal: o título ou a descrição leva a cidade no formato `[Cidade: Cabo Frio]`. Sem cidade = vale para todas (recesso geral). Assim a regra de "exclusão municipal só na cidade certa" das rotas continua valendo.
  - Evento com horário (não dia inteiro), como "fechado a partir das 12h", bloqueia só aquele intervalo do atendimento humano.
  - **Se a agenda não existir, o Fera não cria.** A tela mostra "Agenda NitsClean não encontrada" e o passo a passo abaixo.

**Como criar a agenda (b)** — Arilson, no Google Agenda logado como flora.nitsclean@gmail.com: "Outras agendas" → "+" → "Criar nova agenda" → nome exato "Feriados e recessos NitsClean" → Criar. Cadastrar eventos de dia inteiro; municipais com `[Cidade: Nome]`.

## 2. Cache (somente leitura)
- Nova tabela `calendar_holidays_cache` por organização: data, fim, nome, origem (`google_brasil` | `nitsclean`), tipo (`feriado` | `ponto_facultativo` | `recesso`), cidade, intervalo de horário opcional, `google_event_id`, `synced_at`. Usuários só leem; escrita só pelo servidor.
- Tabela `calendar_sync_status` por org: último sucesso, último erro (código, sem dados pessoais), agenda NitsClean encontrada ou não.
- **Sincronia:** nova função `sync-holidays`, 1x por dia (madrugada) e sob demanda quando o cache tiver mais de 26h. Janela: hoje até +400 dias. Troca o conteúdo da org só depois de buscar as duas agendas com sucesso (nunca deixa o cache meio vazio).
- **Falhas:** Google falhou → usa o último cache válido, mesmo vencido. Sem cache nenhum → só fins de semana contam como não úteis, e o painel mostra um aviso.

## 3. Uma só verdade para rotas e agendamentos
- O helper único de calendário (o mesmo da regra do AGENTS.md) passa a ler `calendar_holidays_cache` em `consultar_rota`, `agendar_visita_tecnica` e no horário humano.
- Para rotas e visitas, ponto facultativo segue a mesma chave.
- A tabela `holidays` fica intacta como backup e marcada DEPRECATED. Ela só é usada se o cache estiver totalmente vazio, para não piorar o que funciona hoje enquanto a primeira sincronia não roda.

## 4. Horário de atendimento humano (mantido do plano anterior)
- `organizations`: `human_hours` (padrão seg–sex 08:00–18:00), fuso America/Sao_Paulo, `human_urgent_bypass` (padrão desligado = urgência alta também espera), `ponto_facultativo_util` (padrão ligado).
- Utilitário `_shared/business-hours.ts`: `estaEmHorario(agora)` e `proximoHorarioUtil(agora)` → "terça-feira, 03/11, a partir das 8h". Considera fins de semana, feriados, recessos e bloqueios parciais do cache.

## 5. mcp (mantido)
- `solicitar_atendimento_humano`, Matriz e cobrança de retorno devolvem `em_horario` e `retorno_previsto`.
- **Dentro do horário:** aviso na hora + "Já passei sua solicitação para nossa equipe, que vai te responder por aqui em breve."
- **Fora do horário:** o aviso vai para a fila (`notification_logs` com `queued`/`release_at`), com "Recebido fora do horário em <data/hora>". O cliente recebe "Nossa equipe de atendimento retoma na <próximo período útil real>, a partir das 8h. Já deixei sua solicitação registrada e ela será a primeira a ser encaminhada nesse horário. 😊"
- **Repetição fora do horário:** só entra na linha do tempo; o cliente recebe a mesma informação de retorno.
- **Linha do tempo:** "Transferência recebida fora do horário"; ao liberar, "encaminhada em <data/hora>".
- **Agendamentos continuam avisando na hora** (recomendação mantida: é informativo e a visita já tem data). As demais ferramentas não mudam.

## 6. Agendador
- `release-notification-queue` a cada 5 min: envia os avisos da fila com `release_at` vencido, uma vez cada, e grava a linha do tempo.
- `sync-holidays` 1x por dia. Os dois rodam por agendamento no servidor, protegidos por um segredo interno gerado automaticamente.

## 7. Tela (Configurações → Horário de atendimento)
- Editável pelo admin: dias, horários, chave de urgência alta, chave de ponto facultativo, prévia "Se alguém pedir atendimento agora: ...".
- **Próximos feriados (vindos do Google):** lista só leitura com data, nome, origem, cidade, além de "Última sincronia em ...", botão "Sincronizar agora" e aviso se a agenda NitsClean não existir ou se o Google falhar.
- Nenhum cadastro de feriados no Fera.

## 8. Testes
- **Leitura dos eventos:** feriado público entra; observância é ignorada; ponto facultativo segue a chave; `[Cidade: X]` vale só em X; bloqueio parcial funciona.
- **Cache:** Google falhou → último cache; sem cache → só fins de semana; a troca do cache é atômica.
- **Horário:** domingo à tarde → segunda 8h; 02/11/2026 → terça 03/11 8h; sexta 19h → segunda; antes das 8h → hoje 8h.
- **mcp:** dentro → aviso na hora; fora → fila + retorno correto; repetição → só linha do tempo; urgência alta com a chave ligada e desligada; Matriz segue a mesma regra; agendamento avisa na hora; rotas usam o cache.
- **Fila:** libera uma vez, depois do `release_at`.

## Permissões do Google
- **Necessário:** só leitura. Escopo `https://www.googleapis.com/auth/calendar.readonly`, que cobre a lista de agendas assinadas (incluindo "Feriados no Brasil") e os eventos da agenda própria. Alternativa mínima: `calendar.calendarlist.readonly` + `calendar.events.readonly`. Nenhum escopo de escrita: o Fera nunca cria nem edita eventos.
- **Sobre "o token atual já cobre?":** não encontrei token nem conexão do Google Calendar neste projeto ou workspace, então ainda não há o que conferir. Depois que a conexão for criada, eu verifico os escopos concedidos antes de implementar.

## O que você precisa fazer
1. Conectar o Google Calendar como flora.nitsclean@gmail.com, com permissão de leitura: https://lovable.dev/connectors/google_calendar/connect?workspace=DyRIWqbAituV33j9ol8o
2. Pedir ao Arilson que crie a agenda "Feriados e recessos NitsClean" (passo a passo acima), ou me autorizar a seguir sem ela por enquanto.
3. Confirmar a recomendação: ponto facultativo = dia útil por padrão.
