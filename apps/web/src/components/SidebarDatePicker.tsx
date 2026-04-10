import { useEffect, useMemo, useRef, useState } from "react";

type SidebarDatePickerProps = {
  value: string;
  onChange: (value: string) => void;
};

type CalendarCell = {
  key: string;
  value: string;
  dayLabel: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
};

const weekDays = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

const parseBusinessDate = (value: string) => new Date(`${value}T12:00:00`);

const formatBusinessDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const monthFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

const fieldFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

const helperFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  timeZone: "America/Sao_Paulo",
});

const createCalendarCells = (viewMonth: Date, selectedValue: string): CalendarCell[] => {
  const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1, 12);
  const startOffset = (monthStart.getDay() + 6) % 7;
  const gridStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1 - startOffset, 12);
  const today = formatBusinessDate(new Date());

  return Array.from({ length: 42 }, (_, index) => {
    const cellDate = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + index,
      12,
    );
    const cellValue = formatBusinessDate(cellDate);

    return {
      key: `${cellValue}-${index}`,
      value: cellValue,
      dayLabel: String(cellDate.getDate()),
      isCurrentMonth: cellDate.getMonth() === viewMonth.getMonth(),
      isToday: cellValue === today,
      isSelected: cellValue === selectedValue,
    };
  });
};

export const SidebarDatePicker = ({ value, onChange }: SidebarDatePickerProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => parseBusinessDate(value));

  useEffect(() => {
    setViewMonth(parseBusinessDate(value));
  }, [value]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const cells = useMemo(() => createCalendarCells(viewMonth, value), [value, viewMonth]);

  const goToMonth = (direction: -1 | 1) => {
    setViewMonth((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1, 12));
  };

  const selectedDate = parseBusinessDate(value);

  return (
    <div className="date-panel date-picker-panel" ref={containerRef}>
      <span>Data da operação</span>
      <button
        aria-expanded={isOpen}
        className={`date-picker-trigger ${isOpen ? "is-open" : ""}`}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <div className="date-picker-trigger-copy">
          <strong>{fieldFormatter.format(selectedDate)}</strong>
          <small>{helperFormatter.format(selectedDate)}</small>
        </div>
        <span className="date-picker-trigger-icon">{isOpen ? "−" : "+"}</span>
      </button>

      {isOpen ? (
        <div className="date-picker-popover" role="dialog" aria-label="Selecionar data">
          <div className="date-picker-header">
            <button
              aria-label="Mês anterior"
              className="date-picker-nav"
              onClick={() => goToMonth(-1)}
              type="button"
            >
              ‹
            </button>
            <strong>{monthFormatter.format(viewMonth)}</strong>
            <button
              aria-label="Próximo mês"
              className="date-picker-nav"
              onClick={() => goToMonth(1)}
              type="button"
            >
              ›
            </button>
          </div>

          <div className="date-picker-weekdays">
            {weekDays.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>

          <div className="date-picker-grid">
            {cells.map((cell) => (
              <button
                className={`date-picker-day ${cell.isCurrentMonth ? "" : "is-outside"} ${cell.isToday ? "is-today" : ""} ${cell.isSelected ? "is-selected" : ""}`}
                key={cell.key}
                onClick={() => {
                  onChange(cell.value);
                  setIsOpen(false);
                }}
                type="button"
              >
                {cell.dayLabel}
              </button>
            ))}
          </div>

          <div className="date-picker-footer">
            <button
              className="ghost-button"
              onClick={() => {
                const todayValue = formatBusinessDate(new Date());
                onChange(todayValue);
                setViewMonth(parseBusinessDate(todayValue));
                setIsOpen(false);
              }}
              type="button"
            >
              Hoje
            </button>
            <small>{helperFormatter.format(selectedDate)}</small>
          </div>
        </div>
      ) : null}
    </div>
  );
};
