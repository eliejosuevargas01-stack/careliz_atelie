import type { NotificationAlert } from "../types";

type NotificationCenterProps = {
  currentNotification: NotificationAlert | null;
  recentNotifications: NotificationAlert[];
  soundEnabled: boolean;
  onEnableSound: () => void;
  onAcknowledge: (id: string) => Promise<void>;
};

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return "Agora";
  }

  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
};

export const NotificationCenter = ({
  currentNotification,
  recentNotifications,
  soundEnabled,
  onEnableSound,
  onAcknowledge,
}: NotificationCenterProps) => {
  const hasActiveNotification = Boolean(currentNotification);

  return (
    <section className="notification-center">
      <header className="notification-hero">
        <div>
          <p className="eyebrow">Central de chamadas</p>
          <h2>Alerta de novo atendimento</h2>
          <p className="panel-copy">
            Quando o n8n disparar uma notificação, esta tela mantém a mensagem em destaque e
            repete o alerta até a costureira confirmar.
          </p>
        </div>

        <div className="notification-hero-actions">
          <button className={`audio-toggle ${soundEnabled ? "is-on" : ""}`} onClick={onEnableSound} type="button">
            {soundEnabled ? "Som ativado" : "Ativar som"}
          </button>
          <span className={`status-pill ${hasActiveNotification ? "is-live" : "is-idle"}`}>
            {hasActiveNotification ? "Chamado ativo" : "Sem chamado pendente"}
          </span>
        </div>
      </header>

      <div className="notification-stage">
        {currentNotification ? (
          <article className="notification-card is-active">
            <div className="notification-card-top">
              <div>
                <p className="eyebrow">Novo atendimento</p>
                <h3>{currentNotification.title ?? "Mensagem do atendimento"}</h3>
              </div>
              <span className="pulse-dot" />
            </div>

            <p className="notification-message">{currentNotification.message}</p>

            <div className="notification-meta">
              <span>Origem: {currentNotification.source ?? "n8n"}</span>
              <span>Recebido: {formatDateTime(currentNotification.createdAt)}</span>
              <span>Repetição: {currentNotification.repeatIntervalSeconds ?? 6}s</span>
            </div>

            <div className="notification-actions">
              <button className="primary-button" onClick={() => onAcknowledge(currentNotification.id)} type="button">
                Confirmar atendimento
              </button>
            </div>
          </article>
        ) : (
          <article className="notification-card notification-empty">
            <p className="eyebrow">Aguardando</p>
            <h3>Sem novo atendimento no momento</h3>
            <p>
              Assim que o n8n enviar uma nova mensagem, o alerta aparece aqui e o som volta a
              tocar até a confirmação.
            </p>
          </article>
        )}
      </div>

      <div className="notification-history">
        <div className="notification-history-head">
          <div>
            <p className="eyebrow">Últimos alertas</p>
            <h3>Fila recente</h3>
          </div>
        </div>

        <div className="notification-list">
          {recentNotifications.length === 0 ? (
            <p className="muted-copy">Nenhuma notificação registrada ainda.</p>
          ) : (
            recentNotifications.map((item) => (
              <article className="notification-list-item" key={item.id}>
                <div>
                  <strong>{item.title ?? "Atendimento"}</strong>
                  <p>{item.message}</p>
                </div>
                <div className="notification-list-meta">
                  <span>{item.status === "acknowledged" ? "Lida" : "Pendente"}</span>
                  <small>{formatDateTime(item.createdAt)}</small>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
};
