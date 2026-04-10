import { useEffect, useState } from "react";

import type { CalendarBlock, CalendarEventItem, CatalogItem, ProductionItem } from "../types";

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
