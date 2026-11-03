# Lote 11 — Revisão "nada duplicado"

Situação: o Lote 11 já foi implementado. Esta revisão aplica a regra a ele. Ela mantém o que já reaproveita estruturas existentes e consolida o que foi criado em paralelo. Todas as tabelas envolvidas estão vazias, então a consolidação não mexe em dados reais.

## Mapa: necessidade → estrutura usada

| Necessidade | Estrutura | Situação |
|---|---|---|
| Cliente ativo | `clients` (+ latitude/longitude, origem da localização, place_id, área de cobertura) e tela Clientes | Mantido. Já é a tabela existente, estendida |
| Ponto de instalação | `comodatos` (localizacao_interna, product_id, dispenser_family_id, ultima/proxima_manutencao) + refil, quantidade, foto, estado atual e origem | Mantido. É a tabela existente, estendida |
| Aparelho (serial/estoque) | `inventory_items`, opcional via `comodatos.inventory_item_id`. A foto de referência vem do produto ou de `inventory_items.photo_url` | Mantido |
| Visita de manutenção | `schedules` (`schedule_type` = manutenção, client_id), com o check-in e as evidências do Lote 10 | Mantido. Um único modelo de visita |
| Checklist por ponto | Hoje é a tabela nova `ponto_avaliacoes` | **Consolidar** em `schedule_evidencias` (já tem schedule_id, comodato_id, foto_path, observações e itens), com as colunas novas `estado` e `precisa_substituir` e uma regra de uma avaliação por ponto e visita. `ponto_avaliacoes` fica marcada como legado |
| Pendência de substituição | Hoje é a tabela nova `ocorrencias_ponto` | **Consolidar** em `maintenance_schedule`, que já é a ordem de serviço (comodato_id, client_id, inventory_item_id, tipo_os, status, assigned_to), com `tipo_os` = "substituição" e as colunas novas `item_product_id`, `quantidade`, `urgente`, `origem_evidencia_id` e `resolvida_schedule_id`. Aparece na tela Manutenções. `ocorrencias_ponto` fica como legado |
| Visita emergencial | Hoje é a tabela nova `pedidos_visita_emergencial` | **Consolidar** na própria ordem de serviço (`maintenance_schedule`): `urgente`, `aprovacao_status` (pendente, aprovado, recusado), `decidido_por`/`decidido_em`/`motivo_recusa`, e o agendamento criado em `schedules` com ligação de volta. A tabela fica como legado |
| Plano de manutenção | Hoje é a tabela nova `planos_manutencao` | **Mantida, com justificativa:** nenhuma estrutura existente guarda frequência, dia preferido e consultor por cliente. `comodatos.periodicidade_manut` é por ponto e `maintenance_schedule.recurrence` é por ordem de serviço. A periodicidade do ponto passa a ser preenchida a partir do plano, e o plano continua gerando os agendamentos |
| Mapa do inventário | A própria tela Inventário (aba Base instalada), lendo `clients` + `comodatos` | Mantido |

## Visitas: client_visits e maintenance_schedule
- **`client_visits`** (vazia, só a aba Visitas da tela Clientes) duplica `schedules`. A aba passa a listar os agendamentos do cliente, novas visitas são criadas pela Agenda e a tabela fica marcada como legado, sem ser apagada.
- **`maintenance_schedule`** deixa de ser um modelo de visita e passa a ser só a ordem de serviço ou pendência. Ela continua na tela Manutenções. A execução sempre acontece em um agendamento (`schedules`), com check-in e evidências.

## Legado Ekkoa
`ekkoa_clients`, `ekkoa_equipment`, `ekkoa_installation_equipment` e `ekkoa_installations` estão vazias e já correspondem a `clients`/`comodatos`/`inventory_items`. Vou marcá-las como legado (comentário no banco), sem apagar e sem migrar nada, porque estão vazias. `ekkoa_coverage_areas` continua em uso pela Flora.

## Telas
- **Comodatos:** passa a mostrar local interno, refil, quantidade, estado (verde/amarelo/vermelho) e foto. É a mesma tabela que o checklist grava.
- **Manutenções:** passa a mostrar as pendências de substituição e os pedidos emergenciais. Os pedidos são aprovados aqui e também no painel Campo, que lê a mesma fonte.
- **Inventário:** sem mudança, além da aba Base instalada que já existe.
- **Clientes:** a aba Visitas passa a ler os agendamentos.
- **Hoje / checklist:** o funcionamento é o mesmo; só muda onde os dados são gravados.

## Técnico
- Uma migration de mudanças só aditivas: colunas novas em `schedule_evidencias` e `maintenance_schedule`, o índice único (comodato + agendamento) em evidências, e `COMMENT ... DEPRECATED` em `ponto_avaliacoes`, `ocorrencias_ponto`, `pedidos_visita_emergencial`, `client_visits` e `ekkoa_*`.
- Ajustar as funções de visita, de base instalada e o agendador para gravar e ler nas tabelas consolidadas. A retenção de fotos passa a cobrir só `schedule_evidencias`.
- Atualizar os testes e incluir um que confira que o checklist grava em `schedule_evidencias` e que a substituição cria uma ordem de serviço.
- Registrar a regra "sem estruturas paralelas" no AGENTS.md e substituir a regra do Lote 11.
