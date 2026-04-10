import { useEffect, useState } from "react";

import type { CalendarEventItem, CatalogItem } from "../types";

type EventPanelProps = {
  catalog: CatalogItem[];
  defaultDate: string;
  professionalId?: string | null;
  selectedEvent?: CalendarEventItem | null;
  onCreate: (payload: Record<string, unknown>) => Promise<void>;
  onUpdate: (eventId: string, payload: Record<string, unknown>) => Promise<void>;
  onDelete: (eventId: string) => Promise<void>;
  onCancelSelection: () => void;
};

const eventTypeOptions = [
  { value: "visita_presencial", label: "Visita presencial" },
  { value: "atendimento_whatsapp", label: "Atendimento WhatsApp" },
  { value: "encaixe", label: "Encaixe" },
];

const statusOptions = [
  { value: "agendado", label: "Agendado" },
  { value: "confirmado", label: "Confirmado" },
  { value: "em_atendimento", label: "Em atendimento" },
  { value: "concluido", label: "Concluído" },
  { value: "cancelado", label: "Cancelado" },
  { value: "remarcado", label: "Remarcado" },
  { value: "faltou", label: "Faltou" },
];

const timeFromIso = (value: string) =>
  new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

const toIso = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString();

const getCatalogMatch = (catalog: CatalogItem[], selectedEvent?: CalendarEventItem | null) =>
  catalog.find(
    (item) =>
      item.pieceName === selectedEvent?.pieceName || item.serviceName === selectedEvent?.serviceName,
  );

export const EventPanel = ({
  catalog,
  defaultDate,
  professionalId,
  selectedEvent,
  onCreate,
  onUpdate,
  onDelete,
  onCancelSelection,
}: EventPanelProps) => {
  const [pieceCode, setPieceCode] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [time, setTime] = useState("07:00");
  const [durationMin, setDurationMin] = useState("30");
  const [status, setStatus] = useState("agendado");
  const [typeEvent, setTypeEvent] = useState("visita_presencial");
  const [description, setDescription] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!selectedEvent) {
      setPieceCode("");
      setServiceId("");
      setClientName("");
      setClientPhone("");
      setTime("07:00");
      setDurationMin("30");
      setStatus("agendado");
      setTypeEvent("visita_presencial");
      setDescription("");
      setInternalNotes("");
      return;
    }

    const matched = getCatalogMatch(catalog, selectedEvent);
    setPieceCode(matched ? String(matched.pieceCode) : "");
    setServiceId(matched ? matched.id : "");
    setClientName(selectedEvent.client?.name ?? "");
    setClientPhone(selectedEvent.client?.phone ?? "");
    setTime(timeFromIso(selectedEvent.startAt));
    setDurationMin(String(selectedEvent.durationMin));
    setStatus(selectedEvent.status);
    setTypeEvent(selectedEvent.typeEvent);
    setDescription(selectedEvent.description ?? "");
    setInternalNotes(selectedEvent.internalNotes ?? "");
  }, [catalog, selectedEvent]);

  const pieces = Array.from(
    new Map(catalog.map((item) => [item.pieceCode, item])).values(),
  );

  const services = catalog.filter((item) => String(item.pieceCode) === pieceCode);
  const selectedCatalog = catalog.find((item) => item.id === serviceId) ?? null;
  const isProductionSelection = selectedEvent?.typeEvent === "producao";

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const basePayload = {
        professionalId: professionalId ?? undefined,
        serviceCatalogId: selectedCatalog?.id,
        typeEvent,
        typeAttendance: typeEvent === "atendimento_whatsapp" ? "whatsapp" : "presencial",
        status,
        startAt: toIso(defaultDate, time),
        durationMin: Number(durationMin),
        pieceName: selectedCatalog?.pieceName ?? null,
        serviceName: selectedCatalog?.serviceName ?? null,
        description: description || null,
        internalNotes: internalNotes || null,
        origin: "painel",
      };

      if (selectedEvent) {
        await onUpdate(selectedEvent.id, basePayload);
      } else {
        await onCreate({
          ...basePayload,
          client: {
            name: clientName,
            phone: clientPhone,
            origin: "painel",
          },
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedEvent) {
      return;
    }

    const confirmed = window.confirm(
      isProductionSelection
        ? "Remover este bloco de produção da agenda?"
        : "Remover este horário de atendimento da agenda?",
    );

    if (!confirmed) {
      return;
    }

    setRemoving(true);

    try {
      await onDelete(selectedEvent.id);
    } finally {
      setRemoving(false);
    }
  };

  if (isProductionSelection && selectedEvent) {
    return (
      <section className="panel form-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Produção selecionada</p>
            <h2>Bloco interno reservado</h2>
            <p className="panel-copy">
              Esse horário pertence a uma produção já lançada na agenda compartilhada.
            </p>
          </div>
          <button className="ghost-button" onClick={onCancelSelection} type="button">
            Limpar seleção
          </button>
        </div>

        <div className="detail-chip">
          <strong>{selectedEvent.pieceName ?? "Produção interna"}</strong>
          <span>
            {selectedEvent.serviceName ?? "Sem serviço"} • {timeFromIso(selectedEvent.startAt)} •{" "}
            {selectedEvent.durationMin} min
          </span>
        </div>

        <p className="panel-copy">
          Se este bloco não deve mais ocupar tempo da costureira, remova o horário abaixo.
        </p>

        <div className="form-actions">
          <button className="ghost-button" onClick={onCancelSelection} type="button">
            Voltar para a agenda
          </button>
          <button
            className="danger-button"
            disabled={removing}
            onClick={handleDelete}
            type="button"
          >
            {removing ? "Removendo..." : "Remover horário"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel form-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Atendimento</p>
          <h2>{selectedEvent ? "Refinar atendimento" : "Novo atendimento"}</h2>
          <p className="panel-copy">
            Reserve visitas presenciais, encaixes e conversas que tomam tempo real da rotina.
          </p>
        </div>
        {selectedEvent ? (
          <button className="ghost-button" onClick={onCancelSelection} type="button">
            Limpar seleção
          </button>
        ) : null}
      </div>

      <form className="stack-form" onSubmit={handleSubmit}>
        {!selectedEvent ? (
          <>
            <label>
              <span>Cliente</span>
              <input
                onChange={(event) => setClientName(event.target.value)}
                placeholder="Nome da cliente"
                required
                value={clientName}
              />
            </label>
            <label>
              <span>WhatsApp</span>
              <input
                onChange={(event) => setClientPhone(event.target.value)}
                placeholder="DDD + número do WhatsApp"
                required
                value={clientPhone}
              />
            </label>
          </>
        ) : (
          <div className="detail-chip">
            <strong>{selectedEvent.client?.name ?? "Evento interno"}</strong>
            <span>{selectedEvent.client?.phone ?? selectedEvent.typeEvent}</span>
          </div>
        )}

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
            <span>Tipo</span>
            <select onChange={(event) => setTypeEvent(event.target.value)} value={typeEvent}>
              {eventTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select onChange={(event) => setStatus(event.target.value)} value={status}>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="split">
          <label>
            <span>Horário</span>
            <input onChange={(event) => setTime(event.target.value)} required type="time" value={time} />
          </label>
          <label>
            <span>Duração</span>
            <select onChange={(event) => setDurationMin(event.target.value)} value={durationMin}>
              <option value="30">30 minutos</option>
              <option value="60">60 minutos</option>
              <option value="90">90 minutos</option>
              <option value="120">120 minutos</option>
            </select>
          </label>
        </div>

        <label>
          <span>Descrição para a agenda</span>
          <textarea
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Ex.: prova de barra, confirmar cintura, revisar detalhes da peça."
            rows={3}
            value={description}
          />
        </label>
        <label>
          <span>Observações internas</span>
          <textarea
            onChange={(event) => setInternalNotes(event.target.value)}
            placeholder="Anote pontos de atenção para a próxima conversa ou produção."
            rows={3}
            value={internalNotes}
          />
        </label>

        <div className="form-actions">
          {selectedEvent ? (
            <button
              className="danger-button"
              disabled={removing || submitting}
              onClick={handleDelete}
              type="button"
            >
              {removing ? "Removendo..." : "Remover horário"}
            </button>
          ) : null}
          <button className="primary-button" disabled={submitting || removing} type="submit">
            {submitting ? "Salvando..." : selectedEvent ? "Salvar alterações" : "Criar atendimento"}
          </button>
        </div>
      </form>
    </section>
  );
};
