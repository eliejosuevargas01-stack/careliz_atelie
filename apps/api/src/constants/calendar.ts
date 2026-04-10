export const eventTypes = [
  "visita_presencial",
  "atendimento_whatsapp",
  "producao",
  "bloqueio",
  "encaixe",
] as const;

export const attendanceTypes = ["presencial", "whatsapp", "interno"] as const;

export const eventStatuses = [
  "aberto",
  "agendado",
  "confirmado",
  "em_atendimento",
  "concluido",
  "cancelado",
  "remarcado",
  "faltou",
] as const;

export const productionStatuses = [
  "pendente",
  "em_producao",
  "aguardando_cliente",
  "finalizado",
  "entregue",
] as const;

export const blockTypes = [
  "feriado",
  "folga",
  "pausa",
  "manutencao",
  "bloqueio_manual",
] as const;

export const MIN_APPOINTMENT_DURATION_MINUTES = 20;
export const DEFAULT_SLOT_DURATION_MINUTES = 30;
export const MIN_LEAD_TIME_MINUTES = 60;
export const MIN_CANCEL_RESCHEDULE_NOTICE_MINUTES = 60;
export const UPCOMING_NOTIFICATION_MINUTES = 15;

export const nonBlockingStatuses = ["cancelado", "remarcado"] as const;
