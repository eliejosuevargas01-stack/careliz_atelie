import { useEffect, useState } from "react";

import { api } from "./lib/api";
import { AgendaBoard } from "./components/AgendaBoard";
import { EventPanel } from "./components/EventPanel";
import { SidebarDatePicker } from "./components/SidebarDatePicker";
import {
  BlockPanel,
  DayQueuesPanel,
  ProductionPanel,
  type AgendaViewMode,
} from "./components/SupportPanels";
import logo from "./assets/logo_Careliz_atelie.jpeg";
import type {
  AvailabilityResponse,
  CalendarEventItem,
  CalendarResponse,
  CatalogResponse,
  ProductionResponse,
  SetupResponse,
} from "./types";

const today = new Date().toISOString().slice(0, 10);

const formatDateLabel = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "America/Sao_Paulo",
  });

const formatHour = (value: string) =>
  new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

const toBusinessDateKey = (value?: string | null) => {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
};

const blockedAttendanceStatuses = new Set(["cancelado", "remarcado", "faltou"]);

const sortByStartAt = (left: { startAt: string }, right: { startAt: string }) =>
  new Date(left.startAt).getTime() - new Date(right.startAt).getTime();

export default function App() {
  const [selectedDate, setSelectedDate] = useState(today);
  const [activeAgendaMode, setActiveAgendaMode] = useState<AgendaViewMode>("visitas");
  const [isVisitComposerOpen, setIsVisitComposerOpen] = useState(false);
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [production, setProduction] = useState<ProductionResponse | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventItem | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );

  const loadStatic = async () => {
    const [setupResponse, catalogResponse] = await Promise.all([
      api.get<SetupResponse>("/api/setup"),
      api.get<CatalogResponse>("/api/catalog"),
    ]);

    setSetup(setupResponse);
    setCatalog(catalogResponse);
  };

  const loadDynamic = async (date: string) => {
    const [calendarResponse, availabilityResponse, productionResponse] = await Promise.all([
      api.get<CalendarResponse>(`/api/calendar?date=${date}`),
      api.get<AvailabilityResponse>(`/api/calendar/availability?date=${date}`),
      api.get<ProductionResponse>("/api/production"),
    ]);

    setCalendar(calendarResponse);
    setAvailability(availabilityResponse);
    setProduction(productionResponse);
  };

  useEffect(() => {
    loadStatic().catch((error: Error) => {
      setFeedback({ type: "error", text: error.message });
    });
  }, []);

  useEffect(() => {
    loadDynamic(selectedDate).catch((error: Error) => {
      setFeedback({ type: "error", text: error.message });
    });
  }, [selectedDate]);

  const refreshDay = async () => {
    await loadDynamic(selectedDate);
    setSelectedEvent(null);
  };

  useEffect(() => {
    if (activeAgendaMode === "a_entregar" || activeAgendaMode === "entregues") {
      setSelectedEvent(null);
    }
  }, [activeAgendaMode]);

  const pendingProduction =
    production?.items.filter((item) => item.productionStatus !== "finalizado").length ?? 0;
  const nextEvent = calendar?.events[0] ?? null;
  const attendanceEvents =
    calendar?.events.filter((item) => item.typeEvent !== "producao") ?? [];
  const productionEvents = calendar?.events.filter((item) => item.typeEvent === "producao") ?? [];
  const linkedAppointmentIds = new Set(
    (production?.items ?? [])
      .map((item) => item.appointmentOriginId ?? item.appointmentOrigin?.id ?? null)
      .filter((item): item is string => Boolean(item)),
  );
  const visitsReadyForProduction = attendanceEvents
    .filter(
      (item) =>
        !blockedAttendanceStatuses.has(item.status) &&
        !linkedAppointmentIds.has(item.id) &&
        new Date(item.endAt).getTime() <= Date.now(),
    )
    .map((item) => ({ ...item, boardState: "awaiting_production" as const }))
    .sort(sortByStartAt);
  const productionBoardEvents = [
    ...productionEvents.map((item) => ({ ...item, boardState: "scheduled_production" as const })),
    ...visitsReadyForProduction,
  ].sort(sortByStartAt);
  const productionForDay =
    production?.items.filter((item) => toBusinessDateKey(item.calendarEvent?.startAt) === selectedDate) ??
    [];
  const deliveriesForDay =
    production?.items.filter(
      (item) =>
        toBusinessDateKey(item.promisedDate) === selectedDate &&
        item.productionStatus !== "entregue",
    ) ?? [];
  const deliveredForDay =
    production?.items.filter(
      (item) =>
        toBusinessDateKey(item.promisedDate) === selectedDate &&
        item.productionStatus === "entregue",
    ) ?? [];
  const firstFreeSlot = availability?.horarios_disponiveis[0] ?? null;
  const selectedVisit =
    selectedEvent && selectedEvent.typeEvent !== "producao" ? selectedEvent : null;
  const selectedEventSummary = selectedEvent
    ? `${selectedEvent.client?.name ?? "Evento interno"} • ${selectedEvent.pieceName ?? "Sem peça"}`
    : "Nenhum item selecionado";

  const createVisit = async (payload: Record<string, unknown>) => {
    await api.post("/api/events", payload);
    setFeedback({ type: "success", text: "Atendimento criado e reservado na agenda." });
    setIsVisitComposerOpen(false);
    await refreshDay();
  };

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="workspace-toolbar">
          <div className="workspace-branding">
            <img alt="Logo Careliz Atelie" className="workspace-logo" src={logo} />
            <div className="workspace-branding-copy">
              <p className="eyebrow">Central do Ateliê</p>
              <h1>Agenda viva de atendimento e produção</h1>
              <p>
                Atendimento, produção e entrega compartilham a mesma carga de trabalho da
                costureira.
              </p>
              <small>{selectedEventSummary}</small>
            </div>
          </div>

          <div className="workspace-toolbar-actions">
            <SidebarDatePicker onChange={setSelectedDate} value={selectedDate} />
            <button
              className="primary-button workspace-guide-button"
              onClick={() => setIsGuideOpen(true)}
              type="button"
            >
              Abrir guia rápido
            </button>
          </div>
        </header>

        {feedback ? (
          <div className={`feedback ${feedback.type}`}>
            <span>{feedback.text}</span>
            <button className="ghost-button" onClick={() => setFeedback(null)} type="button">
              Fechar aviso
            </button>
          </div>
        ) : null}

        <DayQueuesPanel
          activeMode={activeAgendaMode}
          attendanceEvents={attendanceEvents}
          deliveryItems={deliveriesForDay}
          deliveredItems={deliveredForDay}
          onModeChange={setActiveAgendaMode}
          productionCount={productionForDay.length + visitsReadyForProduction.length}
          selectedDateLabel={formatDateLabel(selectedDate)}
        />

        <header className="workspace-hero">
          <div>
            <p className="eyebrow">Operação do Dia</p>
            <h2>Visão completa da carga da costureira</h2>
            <p className="hero-copy">
              Escolha a data, veja os conflitos reais de tempo e complemente os atendimentos com
              produção e entrega sem correr risco de sobreposição.
            </p>
          </div>
          <div className="hero-metrics">
            <article className="hero-card">
              <span>Slots livres</span>
              <strong>{availability?.horarios_disponiveis.length ?? 0}</strong>
            </article>
            <article className="hero-card">
              <span>Próximo horário livre</span>
              <strong>{firstFreeSlot ?? "Sem janela útil"}</strong>
            </article>
            <article className="hero-card">
              <span>Produção pendente</span>
              <strong>{pendingProduction}</strong>
            </article>
            <article className="hero-card">
              <span>Próximo compromisso</span>
              <strong>{nextEvent ? formatHour(nextEvent.startAt) : "Sem agenda"}</strong>
            </article>
          </div>
        </header>

        {activeAgendaMode === "visitas" ? (
          <div className="workspace-grid">
            <div className="main-stack">
              <AgendaBoard
                availability={availability}
                blocks={calendar?.blocks ?? []}
                events={attendanceEvents}
                onSelectEvent={setSelectedEvent}
                selectedEventId={selectedVisit?.id}
              />
            </div>

            <div className="sidebar-stack">
              {selectedVisit ? (
                <>
                  <EventPanel
                    catalog={catalog?.items ?? []}
                    defaultDate={selectedDate}
                    onCancelSelection={() => setSelectedEvent(null)}
                    onCreate={createVisit}
                    onUpdate={async (eventId, payload) => {
                      await api.patch(`/api/events/${eventId}`, payload);
                      setFeedback({ type: "success", text: "Atendimento atualizado com sucesso." });
                      await refreshDay();
                    }}
                    onDelete={async (eventId) => {
                      await api.delete(`/api/events/${eventId}`);
                      setFeedback({ type: "success", text: "Horário removido da agenda." });
                      await refreshDay();
                    }}
                    professionalId={setup?.professional?.id}
                    selectedEvent={selectedVisit}
                  />

                  <ProductionPanel
                    catalog={catalog?.items ?? []}
                    eligibleVisitCount={visitsReadyForProduction.length}
                    items={productionForDay}
                    linkedAppointmentIds={Array.from(linkedAppointmentIds)}
                    onCreate={async (payload) => {
                      await api.post("/api/production", payload);
                      setFeedback({
                        type: "success",
                        text: "Produção reservada com entrega vinculada.",
                      });
                      await refreshDay();
                    }}
                    onStatusChange={async (id, status) => {
                      await api.patch(`/api/production/${id}`, {
                        productionStatus: status,
                      });
                      setFeedback({ type: "success", text: "Status da produção atualizado." });
                      await refreshDay();
                    }}
                    onDelete={async (id) => {
                      await api.delete(`/api/production/${id}`);
                      setFeedback({ type: "success", text: "Produção removida da agenda." });
                      await refreshDay();
                    }}
                    professionalId={setup?.professional?.id}
                    selectedEvent={selectedVisit}
                  />
                </>
              ) : (
                <section className="panel helper-panel">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">Agenda de Visitas</p>
                      <h2>Nenhuma visita selecionada</h2>
                      <p className="panel-copy">
                        Clique em uma visita na agenda para editar o atendimento. A produção e a
                        entrega só liberam depois que o horário da visita terminar.
                      </p>
                    </div>
                  </div>

                  <div className="helper-actions">
                    <button
                      className="primary-button"
                      onClick={() => setIsVisitComposerOpen(true)}
                      type="button"
                    >
                      Nova visita
                    </button>
                    <p className="muted-copy">
                      O cadastro rápido abre em popup e deixa a agenda mais limpa no uso diário.
                    </p>
                  </div>
                </section>
              )}

              <BlockPanel
                blocks={calendar?.blocks ?? []}
                defaultDate={selectedDate}
                onCreate={async (payload) => {
                  await api.post("/api/blocks", payload);
                  setFeedback({ type: "success", text: "Indisponibilidade registrada na agenda." });
                  await refreshDay();
                }}
                onDelete={async (blockId) => {
                  await api.delete(`/api/blocks/${blockId}`);
                  setFeedback({ type: "success", text: "Bloqueio removido e horário liberado." });
                  await refreshDay();
                }}
              />
            </div>
          </div>
        ) : activeAgendaMode === "producao" ? (
          <div className="workspace-grid">
            <div className="main-stack">
              <AgendaBoard
                availability={availability}
                blocks={calendar?.blocks ?? []}
                events={productionBoardEvents}
                onSelectEvent={setSelectedEvent}
                selectedEventId={selectedEvent?.id}
              />
            </div>

            <div className="sidebar-stack">
              <ProductionPanel
                catalog={catalog?.items ?? []}
                eligibleVisitCount={visitsReadyForProduction.length}
                items={productionForDay}
                linkedAppointmentIds={Array.from(linkedAppointmentIds)}
                onCreate={async (payload) => {
                  await api.post("/api/production", payload);
                  setFeedback({
                    type: "success",
                    text: "Produção reservada com entrega vinculada.",
                  });
                  await refreshDay();
                }}
                onStatusChange={async (id, status) => {
                  await api.patch(`/api/production/${id}`, {
                    productionStatus: status,
                  });
                  setFeedback({ type: "success", text: "Status da produção atualizado." });
                  await refreshDay();
                }}
                onDelete={async (id) => {
                  await api.delete(`/api/production/${id}`);
                  setFeedback({ type: "success", text: "Produção removida da agenda." });
                  await refreshDay();
                }}
                professionalId={setup?.professional?.id}
                selectedEvent={selectedEvent}
              />
            </div>
          </div>
        ) : null}

        {activeAgendaMode === "visitas" ? (
          <button
            aria-label="Criar nova visita"
            className="floating-composer-button"
            onClick={() => setIsVisitComposerOpen(true)}
            type="button"
          >
            <span>+</span>
          </button>
        ) : null}

        {isVisitComposerOpen ? (
          <div
            className="modal-shell composer-shell"
            onClick={() => setIsVisitComposerOpen(false)}
            role="presentation"
          >
            <section
              aria-modal="true"
              className="modal-card composer-modal-card"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="modal-header">
                <div>
                  <p className="eyebrow">Nova visita</p>
                  <h3>Cadastro rápido de atendimento</h3>
                </div>
                <button
                  className="ghost-button"
                  onClick={() => setIsVisitComposerOpen(false)}
                  type="button"
                >
                  Fechar
                </button>
              </div>

              <EventPanel
                catalog={catalog?.items ?? []}
                defaultDate={selectedDate}
                onCancelSelection={() => setIsVisitComposerOpen(false)}
                onCreate={createVisit}
                onUpdate={async () => undefined}
                onDelete={async () => undefined}
                professionalId={setup?.professional?.id}
              />
            </section>
          </div>
        ) : null}

        {isGuideOpen ? (
          <div className="modal-shell" onClick={() => setIsGuideOpen(false)} role="presentation">
            <section
              aria-modal="true"
              className="modal-card"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="modal-header">
                <div>
                  <p className="eyebrow">Guia Rápido</p>
                  <h3>Como operar sem conflito de horário</h3>
                </div>
                <button className="ghost-button" onClick={() => setIsGuideOpen(false)} type="button">
                  Fechar
                </button>
              </div>

              <div className="modal-grid">
                <article>
                  <strong>1. Atendimento primeiro</strong>
                  <p>
                    Use o bloco de atendimento para visitas presenciais, encaixes e conversas mais
                    longas por WhatsApp.
                  </p>
                </article>
                <article>
                  <strong>2. Produção depois da prova</strong>
                  <p>
                    Se a cliente aprovou o serviço, selecione o atendimento e reserve a produção com
                    data de entrega posterior.
                  </p>
                </article>
                <article>
                  <strong>3. Um tempo só</strong>
                  <p>
                    Produção, visita e bloqueio usam a mesma agenda. Se um entrou, o outro não pode
                    ocupar aquele espaço.
                  </p>
                </article>
                <article>
                  <strong>4. O que o agente enxerga</strong>
                  <p>
                    Apenas os slots livres válidos aparecem para o cliente. O que estiver ocupado sai
                    automaticamente da lista.
                  </p>
                </article>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}
