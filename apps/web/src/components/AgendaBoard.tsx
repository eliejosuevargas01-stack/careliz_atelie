import type { AvailabilityResponse, CalendarBlock, CalendarEventItem } from "../types";

type AgendaBoardProps = {
  availability: AvailabilityResponse | null;
  events: CalendarEventItem[];
  blocks: CalendarBlock[];
  selectedEventId?: string | null;
  onSelectEvent: (event: CalendarEventItem) => void;
};

const BUSINESS_TIMEZONE = "America/Sao_Paulo";
const SLOT_DURATION_MINUTES = 30;

type SlotPeriod = "manha" | "tarde";

type SlotDefinition = {
  label: string;
  minutes: number;
  period: SlotPeriod;
};

type CalendarEntry = {
  id: string;
  startLabel: string;
  startMinutes: number;
  endMinutes: number;
  rowSpan: number;
};

const periodCopy: Record<SlotPeriod, { label: string; range: string }> = {
  manha: { label: "Manhã", range: "07:00 às 11:00" },
  tarde: { label: "Tarde", range: "13:00 às 18:00" },
};

const buildSlots = () => {
  const groups: Array<{ startHour: number; endHour: number; period: SlotPeriod }> = [
    { startHour: 7, endHour: 11, period: "manha" },
    { startHour: 13, endHour: 18, period: "tarde" },
  ];

  const slots: SlotDefinition[] = [];

  for (const group of groups) {
    for (let hour = group.startHour; hour < group.endHour; hour += 1) {
      slots.push({
        label: `${String(hour).padStart(2, "0")}:00`,
        minutes: hour * 60,
        period: group.period,
      });
      slots.push({
        label: `${String(hour).padStart(2, "0")}:30`,
        minutes: hour * 60 + 30,
        period: group.period,
      });
    }
  }

  return slots;
};

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BUSINESS_TIMEZONE,
  });

const toMinutes = (label: string) => {
  const [hours, minutes] = label.split(":").map(Number);
  return hours * 60 + minutes;
};

const toRowSpan = (startAt: string, endAt: string, fallbackDuration: number) => {
  const measuredDuration = Math.max(
    fallbackDuration,
    Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000),
  );

  return Math.max(1, Math.ceil(measuredDuration / SLOT_DURATION_MINUTES));
};

const buildEventEntry = (event: CalendarEventItem): CalendarEntry => {
  const startLabel = formatTime(event.startAt);

  return {
    id: event.id,
    startLabel,
    startMinutes: toMinutes(startLabel),
    endMinutes: toMinutes(formatTime(event.endAt)),
    rowSpan: toRowSpan(event.startAt, event.endAt, event.durationMin),
  };
};

const buildBlockEntry = (block: CalendarBlock): CalendarEntry => {
  const startLabel = formatTime(block.startAt);
  const fallbackDuration = Math.max(
    SLOT_DURATION_MINUTES,
    Math.round((new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60000),
  );

  return {
    id: block.id,
    startLabel,
    startMinutes: toMinutes(startLabel),
    endMinutes: toMinutes(formatTime(block.endAt)),
    rowSpan: toRowSpan(block.startAt, block.endAt, fallbackDuration),
  };
};

const statusLabel: Record<string, string> = {
  aberto: "Aberto",
  agendado: "Agendado",
  confirmado: "Confirmado",
  em_atendimento: "Em atendimento",
  concluido: "Concluído",
  cancelado: "Cancelado",
  remarcado: "Remarcado",
  faltou: "Faltou",
};

const eventTypeLabel: Record<string, string> = {
  visita_presencial: "Atendimento",
  atendimento_whatsapp: "WhatsApp",
  producao: "Produção",
  encaixe: "Encaixe",
};

export const AgendaBoard = ({
  availability,
  events,
  blocks,
  selectedEventId,
  onSelectEvent,
}: AgendaBoardProps) => {
  const slots = buildSlots();
  const availableLabels = new Set(availability?.horarios_disponiveis ?? []);
  const eventEntries = events.map((event) => ({ event, entry: buildEventEntry(event) }));
  const blockEntries = blocks.map((block) => ({ block, entry: buildBlockEntry(block) }));
  const visibleOccupancyCount = eventEntries.length + blockEntries.length;

  return (
    <section className="panel board-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Agenda do Dia</p>
          <h2>Carga real da costureira</h2>
        </div>
        <span className="pill soft">{visibleOccupancyCount} ocupações</span>
      </div>

      <div className="calendar-layout">
        {(Object.keys(periodCopy) as SlotPeriod[]).map((period) => {
          const periodSlots = slots.filter((slot) => slot.period === period);

          return (
            <section className="calendar-period" key={period}>
              <div className="calendar-period-header">
                <strong>{periodCopy[period].label}</strong>
                <span>{periodCopy[period].range}</span>
              </div>

              <div className="calendar-period-grid">
                {periodSlots.map((slot, index) => (
                  <div
                    className="calendar-time"
                    key={`time-${period}-${slot.label}`}
                    style={{ gridColumn: 1, gridRow: index + 1 }}
                  >
                    {slot.label}
                  </div>
                ))}

                {periodSlots.map((slot, index) => {
                  const eventMatch = eventEntries.find((item) => item.entry.startLabel === slot.label);
                  const blockMatch = blockEntries.find((item) => item.entry.startLabel === slot.label);
                  const isCoveredByPreviousEvent = eventEntries.some(
                    (item) =>
                      item.entry.startMinutes < slot.minutes && item.entry.endMinutes > slot.minutes,
                  );
                  const isCoveredByPreviousBlock = blockEntries.some(
                    (item) =>
                      item.entry.startMinutes < slot.minutes && item.entry.endMinutes > slot.minutes,
                  );

                  if (eventMatch) {
                    const { event, entry } = eventMatch;
                    const isProduction = event.typeEvent === "producao";
                    const isAwaitingProduction = event.boardState === "awaiting_production";

                    return (
                      <button
                        className={`calendar-card calendar-event ${isProduction ? "is-production" : ""} ${isAwaitingProduction ? "is-awaiting" : ""} ${selectedEventId === event.id ? "is-selected" : ""}`}
                        key={`event-${event.id}`}
                        onClick={() => onSelectEvent(event)}
                        style={{
                          gridColumn: 2,
                          gridRow: `${index + 1} / span ${entry.rowSpan}`,
                        }}
                        type="button"
                      >
                        <div className="calendar-card-head">
                          <strong>
                            {event.client?.name ?? event.pieceName ?? event.typeEvent.replaceAll("_", " ")}
                          </strong>
                          <span>
                            {isAwaitingProduction
                              ? "Pronta para produção"
                              : statusLabel[event.status] ?? event.status}
                          </span>
                        </div>
                        <div className="calendar-card-body">
                          <span>
                            {event.pieceName ?? "Sem peça"}
                            {event.serviceName ? ` • ${event.serviceName}` : ""}
                          </span>
                          <span>
                            {formatTime(event.startAt)} - {formatTime(event.endAt)}
                          </span>
                        </div>
                        <div className="calendar-card-meta">
                          <em>
                            {isAwaitingProduction
                              ? "Clique para definir produção e entrega"
                              : eventTypeLabel[event.typeEvent] ?? `${event.durationMin} min`}
                          </em>
                        </div>
                      </button>
                    );
                  }

                  if (blockMatch) {
                    const { block, entry } = blockMatch;

                    return (
                      <div
                        className="calendar-card calendar-block"
                        key={`block-${block.id}`}
                        style={{
                          gridColumn: 2,
                          gridRow: `${index + 1} / span ${entry.rowSpan}`,
                        }}
                      >
                        <div className="calendar-card-head">
                          <strong>{block.reason ?? "Bloqueio"}</strong>
                          <span>{block.blockType.replaceAll("_", " ")}</span>
                        </div>
                        <div className="calendar-card-body">
                          <span>Janela indisponível</span>
                          <span>
                            {formatTime(block.startAt)} - {formatTime(block.endAt)}
                          </span>
                        </div>
                      </div>
                    );
                  }

                  if (isCoveredByPreviousEvent || isCoveredByPreviousBlock) {
                    return null;
                  }

                  const isAvailable = availableLabels.has(slot.label);

                  return (
                    <div
                      className={`calendar-card calendar-empty ${isAvailable ? "is-free" : "is-unavailable"}`}
                      key={`empty-${period}-${slot.label}`}
                      style={{ gridColumn: 2, gridRow: index + 1 }}
                    >
                      <strong>{isAvailable ? "Livre" : "Fechado ou indisponível"}</strong>
                      <span>
                        {isAvailable ? "Disponível para agendamento" : "Sem encaixe válido"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
};
