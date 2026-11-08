# coleta-ocorrencia rules
- Follow-up visits are booked only through _shared/agenda-slot.ts (route day, region band, Fera + Google busy, holidays); no free slot means an "Agendar …" item in coleta_pendencias, never a blind time.
- Collection points need a device only when the product's compatible_dispenser_families is non-empty and sem_aparelho is off (pure rules in _shared/coleta.ts, catalog passed to pendenciasColeta everywhere), so gallon products never block confirmation.
