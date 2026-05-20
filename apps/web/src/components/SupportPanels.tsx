import { useEffect, useMemo, useState } from "react";

import type {
  AvailabilityWindow,
  AvailabilityOverride,
  AvailabilityOverrideWindow,
  CalendarBlock,
  CalendarEventItem,
  CatalogItem,
  ProductionItem,
} from "../types";

export type AgendaViewMode = "producao" | "visitas" | "a_entregar" | "entregues";

type BlockPanelProps = {
  defaultDate: string;
  blocks: CalendarBlock[];
  onCreate: (payload: Record<string, unknown>) => Promise<void>;
  onDelete: (blockId: string) => Promise<void>;
};

type ProductionPanelProps = {
  catalog: CatalogItem[];
  selectedEvent?: CalendarEventItem | null;
  items: ProductionItem[];
  linkedAppointmentIds?: string[];
  eligibleVisitCount?: number;
  professionalId?: string | null;
  onCreate: (payload: Record<string, unknown>) => Promise<void>;
  onStatusChange: (id: string, status: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

type DayQueuesPanelProps = {
  activeMode: AgendaViewMode;
  attendanceEvents: CalendarEventItem[];
  productionCount: number;
  deliveryItems: ProductionItem[];
  deliveredItems: ProductionItem[];
  onModeChange: (mode: AgendaViewMode) => void;
  selectedDateLabel: string;
};

type AvailabilityWindowDraft = {
  startTime: string;
  endTime: string;
  label: string;
  active: boolean;
  intervalMin: number;
  slotDurationMin: number;
  capacityPerSlot: number;
};

type AvailabilityManagerPanelProps = {
  windows: AvailabilityWindow[];
  overrides: AvailabilityOverride[];
  onSaveStandard: (weekdays: number[], windows: AvailabilityWindowDraft[]) => Promise<void>;
  onDeleteStandardDay: (weekday: number) => Promise<void>;
  onSaveOverride: (
    date: string,
    payload: {
      mode: "work" | "off";
      label?: string;
      reason?: string;
      windows?: AvailabilityOverrideWindow[];
    },
  ) => Promise<void>;
  onDeleteOverride: (date: string) => Promise<void>;
};

const toIso = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString();

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return "Sem horário";
  }

  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
};

const weekdayLabels = [
  { value: 1, short: "Seg", long: "Segunda" },
  { value: 2, short: "Ter", long: "Terça" },
  { value: 3, short: "Qua", long: "Quarta" },
  { value: 4, short: "Qui", long: "Quinta" },
  { value: 5, short: "Sex", long: "Sexta" },
  { value: 6, short: "Sáb", long: "Sábado" },
  { value: 7, short: "Dom", long: "Domingo" },
];

const createWindowDraft = (window?: Partial<AvailabilityWindow>): AvailabilityWindowDraft => ({
  startTime: window?.startTime ?? "07:00",
  endTime: window?.endTime ?? "11:00",
  label: window?.label ?? "",
  active: window?.active ?? true,
  intervalMin: window?.intervalMin ?? 10,
  slotDurationMin: window?.slotDurationMin ?? 30,
  capacityPerSlot: window?.capacityPerSlot ?? 1,
});

export const BlockPanel = ({ defaultDate, blocks, onCreate, onDelete }: BlockPanelProps) => {
  const [reason, setReason] = useState("");
  const [time, setTime] = useState("13:00");
  const [durationMin, setDurationMin] = useState("30");
  const [blockType, setBlockType] = useState("bloqueio_manual");
  const [removingId, setRemovingId] = useState<string | null>(null);

  return (
    <section className="panel compact-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Exceções</p>
          <h2>Reserva de indisponibilidade</h2>
          <p className="panel-copy">
            Use para folgas, pausas, feriados ou qualquer janela que o agente não deve oferecer.
          </p>
        </div>
      </div>

      <form
        className="stack-form"
        onSubmit={async (event) => {
          event.preventDefault();
          await onCreate({
            reason,
            blockType,
            durationMin: Number(durationMin),
            startAt: toIso(defaultDate, time),
          });
          setReason("");
        }}
      >
        <label>
          <span>Motivo</span>
          <input onChange={(event) => setReason(event.target.value)} required value={reason} />
        </label>
        <div className="split">
          <label>
            <span>Horário</span>
            <input onChange={(event) => setTime(event.target.value)} type="time" value={time} />
          </label>
          <label>
            <span>Duração</span>
            <select onChange={(event) => setDurationMin(event.target.value)} value={durationMin}>
              <option value="30">30 minutos</option>
              <option value="60">60 minutos</option>
              <option value="120">120 minutos</option>
            </select>
          </label>
        </div>
        <label>
          <span>Tipo</span>
          <select onChange={(event) => setBlockType(event.target.value)} value={blockType}>
            <option value="bloqueio_manual">Bloqueio manual</option>
            <option value="folga">Folga</option>
            <option value="pausa">Pausa</option>
            <option value="feriado">Feriado</option>
          </select>
        </label>
        <button className="secondary-button" type="submit">
          Salvar bloqueio
        </button>
      </form>

      <div className="queue-list">
        {blocks.length === 0 ? (
          <p className="muted-copy">Nenhum bloqueio lançado para esta data.</p>
        ) : (
          blocks.map((block) => (
            <article className="queue-card" key={block.id}>
              <div>
                <strong>{block.reason ?? "Bloqueio sem motivo"}</strong>
                <p>
                  {formatDateTime(block.startAt)} até {formatDateTime(block.endAt)} •{" "}
                  {block.blockType.replaceAll("_", " ")}
                </p>
              </div>
              <div className="queue-actions">
                <button
                  className="danger-button subtle"
                  disabled={removingId === block.id}
                  onClick={async () => {
                    const confirmed = window.confirm(
                      "Remover este bloqueio e liberar o horário novamente?",
                    );

                    if (!confirmed) {
                      return;
                    }

                    setRemovingId(block.id);

                    try {
                      await onDelete(block.id);
                    } finally {
                      setRemovingId(null);
                    }
                  }}
                  type="button"
                >
                  {removingId === block.id ? "Removendo..." : "Remover"}
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
};

export const AvailabilityManagerPanel = ({
  windows,
  overrides,
  onSaveStandard,
  onDeleteStandardDay,
  onSaveOverride,
  onDeleteOverride,
}: AvailabilityManagerPanelProps) => {
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [drafts, setDrafts] = useState<AvailabilityWindowDraft[]>([createWindowDraft()]);
  const [overrideDate, setOverrideDate] = useState(new Date().toISOString().slice(0, 10));
  const [overrideMode, setOverrideMode] = useState<"work" | "off">("off");
  const [overrideLabel, setOverrideLabel] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideStartTime, setOverrideStartTime] = useState("07:00");
  const [overrideEndTime, setOverrideEndTime] = useState("17:00");
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const referenceWeekday =
      selectedWeekdays.find((weekday) => windows.some((window) => window.weekday === weekday)) ??
      selectedWeekdays[0];
    const weekdayWindows = windows
      .filter((window) => window.weekday === referenceWeekday)
      .sort((left, right) => left.startTime.localeCompare(right.startTime));

    setDrafts(
      weekdayWindows.length > 0 ? weekdayWindows.map((window) => createWindowDraft(window)) : [createWindowDraft()],
    );
  }, [selectedWeekdays, windows]);

  const countsByDay = useMemo(
    () =>
      weekdayLabels.reduce<Record<number, number>>((accumulator, day) => {
        accumulator[day.value] = windows.filter((window) => window.weekday === day.value).length;
        return accumulator;
      }, {}),
    [windows],
  );

  const standardSummary =
    selectedWeekdays.length === 7
      ? "Todos os dias"
      : weekdayLabels
          .filter((day) => selectedWeekdays.includes(day.value))
          .map((day) => day.short)
          .join(", ");

  return (
    <section className="panel compact-panel availability-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Expediente</p>
          <h2>Expediente padrão e exceções</h2>
          <p className="panel-copy">
            Configure o horário padrão uma vez e depois use exceções para feriados ou dias extras de
            trabalho.
          </p>
        </div>
      </div>

      <div className="availability-meta">
        <strong>Aplica-se a</strong>
        <span>{standardSummary || "Nenhum dia selecionado"}</span>
      </div>

      <div className="weekday-strip" role="tablist" aria-label="Dias do expediente">
        {weekdayLabels.map((day) => (
          <button
            key={day.value}
            type="button"
            className={`weekday-pill ${selectedWeekdays.includes(day.value) ? "is-active" : ""}`}
            onClick={() =>
              setSelectedWeekdays((current) =>
                current.includes(day.value)
                  ? current.filter((weekday) => weekday !== day.value)
                  : [...current, day.value].sort((a, b) => a - b),
              )
            }
          >
            <span>{day.short}</span>
            <strong>{countsByDay[day.value] ?? 0}</strong>
          </button>
        ))}
      </div>

      <div className="availability-editor">
        {drafts.map((draft, index) => (
          <article className="availability-row" key={`${selectedWeekdays.join("-")}-${index}`}>
            <div className="split">
              <label>
                <span>Início</span>
                <input
                  type="time"
                  value={draft.startTime}
                  onChange={(event) =>
                    setDrafts((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, startTime: event.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
              <label>
                <span>Fim</span>
                <input
                  type="time"
                  value={draft.endTime}
                  onChange={(event) =>
                    setDrafts((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, endTime: event.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
            </div>

            <div className="split">
              <label>
                <span>Rótulo</span>
                <input
                  placeholder="Manha / Tarde"
                  value={draft.label}
                  onChange={(event) =>
                    setDrafts((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, label: event.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
              <label>
                <span>Capacidade</span>
                <select
                  value={String(draft.capacityPerSlot)}
                  onChange={(event) =>
                    setDrafts((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, capacityPerSlot: Number(event.target.value) }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="1">1 cliente</option>
                  <option value="2">2 clientes</option>
                  <option value="3">3 clientes</option>
                </select>
              </label>
            </div>

            <div className="split">
              <label>
                <span>Intervalo</span>
                <select
                  value={String(draft.intervalMin)}
                  onChange={(event) =>
                    setDrafts((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, intervalMin: Number(event.target.value) } : item,
                      ),
                    )
                  }
                >
                  <option value="5">5 min</option>
                  <option value="10">10 min</option>
                  <option value="15">15 min</option>
                  <option value="20">20 min</option>
                </select>
              </label>
              <label>
                <span>Slot</span>
                <select
                  value={String(draft.slotDurationMin)}
                  onChange={(event) =>
                    setDrafts((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, slotDurationMin: Number(event.target.value) }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="20">20 min</option>
                  <option value="30">30 min</option>
                  <option value="40">40 min</option>
                  <option value="60">60 min</option>
                </select>
              </label>
            </div>

            <button
              className="ghost-button subtle-link"
              type="button"
              onClick={() =>
                setDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index))
              }
            >
              Remover faixa
            </button>
          </article>
        ))}
      </div>

      <div className="queue-action-group availability-actions">
        <button
          className="secondary-button"
          disabled={saving}
          type="button"
          onClick={() => setDrafts((current) => [...current, createWindowDraft()])}
        >
          Adicionar faixa
        </button>
        <button
          className="ghost-button"
          disabled={saving}
          type="button"
          onClick={async () => {
            setSaving(true);
            try {
              await Promise.all(selectedWeekdays.map((weekday) => onDeleteStandardDay(weekday)));
            } finally {
              setSaving(false);
            }
          }}
        >
          Limpar dias
        </button>
        <button
          className="primary-button"
          disabled={saving}
          type="button"
          onClick={async () => {
            setSaving(true);
            try {
              await onSaveStandard(selectedWeekdays, drafts);
            } finally {
              setSaving(false);
            }
          }}
        >
          Salvar expediente
        </button>
      </div>

      <div className="panel-divider" />

      <div className="panel-header compact-header">
        <div>
          <p className="eyebrow">Exceções por data</p>
          <h3>Bloquear folga ou liberar trabalho extra</h3>
          <p className="panel-copy">
            Use isso para feriados, sábados extras ou folgas fora do padrão semanal.
          </p>
        </div>
      </div>

      <form
        className="stack-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setOverrideSaving(true);

          try {
            await onSaveOverride(overrideDate, {
              mode: overrideMode,
              label: overrideLabel || undefined,
              reason: overrideReason || undefined,
              windows:
                overrideMode === "work"
                  ? [
                      {
                        startTime: overrideStartTime,
                        endTime: overrideEndTime,
                        label: overrideLabel || undefined,
                        slotDurationMin: 30,
                        intervalMin: 10,
                        capacityPerSlot: 1,
                      },
                    ]
                  : undefined,
            });
            setOverrideReason("");
            setOverrideLabel("");
          } finally {
            setOverrideSaving(false);
          }
        }}
      >
        <div className="split">
          <label>
            <span>Data</span>
            <input onChange={(event) => setOverrideDate(event.target.value)} type="date" value={overrideDate} />
          </label>
          <label>
            <span>Tipo</span>
            <select onChange={(event) => setOverrideMode(event.target.value as "work" | "off")} value={overrideMode}>
              <option value="off">Bloquear dia</option>
              <option value="work">Liberar trabalho extra</option>
            </select>
          </label>
        </div>

        <label>
          <span>Rótulo</span>
          <input
            placeholder={overrideMode === "work" ? "Ex.: sábado extra" : "Ex.: feriado"}
            value={overrideLabel}
            onChange={(event) => setOverrideLabel(event.target.value)}
          />
        </label>

        {overrideMode === "work" ? (
          <div className="split">
            <label>
              <span>Início</span>
              <input type="time" value={overrideStartTime} onChange={(event) => setOverrideStartTime(event.target.value)} />
            </label>
            <label>
              <span>Fim</span>
              <input type="time" value={overrideEndTime} onChange={(event) => setOverrideEndTime(event.target.value)} />
            </label>
          </div>
        ) : null}

        <label>
          <span>Motivo</span>
          <input
            placeholder="Feriado, folga, mutirão, sábado extra..."
            value={overrideReason}
            onChange={(event) => setOverrideReason(event.target.value)}
          />
        </label>

        <button className="primary-button" disabled={overrideSaving} type="submit">
          {overrideSaving ? "Salvando..." : "Salvar exceção"}
        </button>
      </form>

      <div className="queue-list">
        {overrides.length === 0 ? (
          <p className="muted-copy">Nenhuma exceção lançada.</p>
        ) : (
          overrides.map((override) => (
            <article className="queue-card" key={override.id}>
              <div>
                <strong>{override.label ?? override.reason ?? override.date}</strong>
                <p>
                  {override.date} • {override.mode === "work" ? "liberar trabalho extra" : "bloqueio do dia"}
                </p>
              </div>
              <div className="queue-actions">
                <button
                  className="danger-button subtle"
                  onClick={async () => {
                    const confirmed = window.confirm("Remover esta exceção da agenda?");

                    if (!confirmed) {
                      return;
                    }

                    await onDeleteOverride(override.date);
                  }}
                  type="button"
                >
                  Remover
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
};

export const ProductionPanel = ({
  catalog,
  selectedEvent,
  items,
  linkedAppointmentIds = [],
  eligibleVisitCount = 0,
  professionalId,
  onCreate,
  onStatusChange,
  onDelete,
}: ProductionPanelProps) => {
  const linkedAppointment =
    selectedEvent && selectedEvent.typeEvent !== "producao" ? selectedEvent : null;
  const hasAppointmentEnded = linkedAppointment
    ? new Date(linkedAppointment.endAt).getTime() <= Date.now()
    : false;
  const hasLinkedProduction = linkedAppointment
    ? linkedAppointmentIds.includes(linkedAppointment.id)
    : false;
  const [pieceCode, setPieceCode] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [productionDate, setProductionDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("13:00");
  const [durationMin, setDurationMin] = useState("60");
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [deliveryTime, setDeliveryTime] = useState("17:00");
  const [notes, setNotes] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (!linkedAppointment) {
      return;
    }

    const matched = catalog.find(
      (item) =>
        item.pieceName === linkedAppointment.pieceName ||
        item.serviceName === linkedAppointment.serviceName,
    );

    setPieceCode(matched ? String(matched.pieceCode) : "");
    setServiceId(matched ? matched.id : "");
    setNotes(linkedAppointment.description ?? "");
    setProductionDate(linkedAppointment.startAt.slice(0, 10));
    setDeliveryDate(linkedAppointment.startAt.slice(0, 10));
  }, [catalog, linkedAppointment]);

  const pieces = Array.from(
    new Map(catalog.map((item) => [item.pieceCode, item])).values(),
  );
  const services = catalog.filter((item) => String(item.pieceCode) === pieceCode);
  const selectedCatalog = catalog.find((item) => item.id === serviceId) ?? null;

  return (
    <section className="panel production-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Produção</p>
          <h2>{linkedAppointment ? "Planejar produção e entrega" : "Agenda de produção"}</h2>
          <p className="panel-copy">
            {linkedAppointment
              ? "Depois da visita, complemente o serviço com a janela de costura e a promessa de entrega."
              : "A produção nasce a partir de uma visita selecionada. Aqui você acompanha os blocos já reservados."}
          </p>
        </div>
      </div>

      {linkedAppointment && hasLinkedProduction ? (
        <div className="detail-chip detail-chip-muted">
          <strong>Produção já vinculada</strong>
          <span>
            Esta visita já gerou uma produção. Se precisar ajustar o prazo, edite o item na fila
            abaixo.
          </span>
        </div>
      ) : linkedAppointment && !hasAppointmentEnded ? (
        <div className="detail-chip detail-chip-muted">
          <strong>Produção libera após o atendimento</strong>
          <span>
            Esse atendimento ainda não terminou. Assim que o horário passar, ele fica disponível
            para reservar produção e entrega.
          </span>
        </div>
      ) : linkedAppointment ? (
        <form
          className="stack-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setLocalError(null);

            const productionStartAt = toIso(productionDate, time);
            const deliveryAt = toIso(deliveryDate, deliveryTime);
            const productionEndAt =
              new Date(productionStartAt).getTime() + Number(durationMin) * 60 * 1000;

            if (productionEndAt >= new Date(deliveryAt).getTime()) {
              setLocalError("A produção precisa terminar antes da entrega prometida.");
              return;
            }

            await onCreate({
              appointmentOriginId: linkedAppointment.id,
              professionalId: professionalId ?? undefined,
              startAt: productionStartAt,
              durationMin: Number(durationMin),
              promisedDate: deliveryAt,
              serviceCatalogId: selectedCatalog?.id,
              pieceName: selectedCatalog?.pieceName ?? linkedAppointment.pieceName ?? null,
              serviceName: selectedCatalog?.serviceName ?? linkedAppointment.serviceName ?? null,
              notes: notes || null,
              client:
                linkedAppointment.client?.name && linkedAppointment.client?.phone
                  ? {
                      name: linkedAppointment.client.name,
                      phone: linkedAppointment.client.phone,
                      origin: "painel",
                    }
                  : undefined,
            });
          }}
        >
          <div className="detail-chip">
            <strong>{linkedAppointment.client?.name ?? "Atendimento selecionado"}</strong>
            <span>Complementando atendimento de {formatDateTime(linkedAppointment.startAt)}</span>
          </div>

          <div className="split">
            <label>
              <span>Peça</span>
              <select onChange={(event) => setPieceCode(event.target.value)} value={pieceCode}>
                <option value="">Selecione</option>
                {pieces.map((item) => (
                  <option key={item.pieceCode} value={item.pieceCode}>
                    {item.pieceName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Serviço</span>
              <select onChange={(event) => setServiceId(event.target.value)} value={serviceId}>
                <option value="">Selecione</option>
                {services.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.serviceName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="split">
            <label>
              <span>Data de produção</span>
              <input
                onChange={(event) => setProductionDate(event.target.value)}
                required
                type="date"
                value={productionDate}
              />
            </label>
            <label>
              <span>Hora de produção</span>
              <input onChange={(event) => setTime(event.target.value)} required type="time" value={time} />
            </label>
          </div>

          <div className="split">
            <label>
              <span>Tempo reservado</span>
              <select onChange={(event) => setDurationMin(event.target.value)} value={durationMin}>
                <option value="30">30 minutos</option>
                <option value="60">60 minutos</option>
                <option value="90">90 minutos</option>
                <option value="120">120 minutos</option>
              </select>
            </label>
            <label>
              <span>Data de entrega</span>
              <input
                onChange={(event) => setDeliveryDate(event.target.value)}
                required
                type="date"
                value={deliveryDate}
              />
            </label>
          </div>

          <label>
            <span>Hora de entrega</span>
            <input
              onChange={(event) => setDeliveryTime(event.target.value)}
              required
              type="time"
              value={deliveryTime}
            />
          </label>

          <label>
            <span>Observações</span>
            <textarea
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Combine o que precisa ficar pronto, material ou ponto de atenção."
              rows={3}
              value={notes}
            />
          </label>

          {localError ? <p className="inline-error">{localError}</p> : null}

          <button className="secondary-button" type="submit">
            Reservar produção
          </button>
        </form>
      ) : (
        <div className="detail-chip detail-chip-muted">
          <strong>Selecione uma visita liberada</strong>
          <span>
            {eligibleVisitCount > 0
              ? `Existem ${eligibleVisitCount} visita${eligibleVisitCount > 1 ? "s" : ""} pronta${eligibleVisitCount > 1 ? "s" : ""} para virar produção. Clique em uma delas no calendário.`
              : "A produção não nasce sozinha. Assim que uma visita terminar, ela aparece aqui pronta para receber produção, entrega e os detalhes coletados."}
          </span>
        </div>
      )}

      <div className="queue-list">
        {items.slice(0, 6).map((item) => (
          <article className="queue-card" key={item.id}>
            <div>
              <strong>
                {item.client?.name ?? "Sem cliente"} {item.pieceName ? `• ${item.pieceName}` : ""}
              </strong>
              <p>
                {item.serviceName ?? "Serviço interno"} • entrega {formatDateTime(item.promisedDate)}
              </p>
            </div>
            <div className="queue-actions">
              <span className="pill">{item.productionStatus.replaceAll("_", " ")}</span>
              <div className="queue-action-group">
                {item.productionStatus !== "finalizado" ? (
                  <button
                    className="ghost-button"
                    onClick={() => onStatusChange(item.id, "finalizado")}
                    type="button"
                  >
                    Finalizar
                  </button>
                ) : null}
                <button
                  className="danger-button subtle"
                  disabled={removingId === item.id}
                  onClick={async () => {
                    const confirmed = window.confirm(
                      "Remover esta produção e liberar esse tempo da agenda?",
                    );

                    if (!confirmed) {
                      return;
                    }

                    setRemovingId(item.id);

                    try {
                      await onDelete(item.id);
                    } finally {
                      setRemovingId(null);
                    }
                  }}
                  type="button"
                >
                  {removingId === item.id ? "Removendo..." : "Remover"}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};

export const DayQueuesPanel = ({
  activeMode,
  attendanceEvents,
  productionCount,
  deliveryItems,
  deliveredItems,
  onModeChange,
  selectedDateLabel,
}: DayQueuesPanelProps) => {
  const modeTabs: Array<{
    mode: AgendaViewMode;
    label: string;
    count: number;
  }> = [
    {
      mode: "producao",
      label: "produção",
      count: productionCount,
    },
    {
      mode: "visitas",
      label: "visitas",
      count: attendanceEvents.length,
    },
    {
      mode: "a_entregar",
      label: "entregas",
      count: deliveryItems.length,
    },
    {
      mode: "entregues",
      label: "histórico",
      count: deliveredItems.length,
    },
  ];
  const activeCount = modeTabs.find((item) => item.mode === activeMode)?.count ?? 0;

  return (
    <section className="panel queues-panel toolbar-shell">
      <div className="toolbar-head">
        <div className="toolbar-tabs" aria-label="Modos da operação" role="tablist">
          {modeTabs.map((item) => (
            <button
              aria-selected={activeMode === item.mode}
              className={`toolbar-tab ${activeMode === item.mode ? "is-active" : ""}`}
              key={item.mode}
              onClick={() => onModeChange(item.mode)}
              role="tab"
              type="button"
            >
              <span>{item.label}</span>
              <strong>{item.count}</strong>
            </button>
          ))}
        </div>
        <span className="toolbar-date">{selectedDateLabel}</span>
      </div>
      <div className="toolbar-meta">
        <span className="pill soft">{activeCount} itens na aba atual</span>
      </div>
    </section>
  );
};
