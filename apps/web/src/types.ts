export type Professional = {
  id: string;
  name: string;
  phone?: string | null;
};

export type AvailabilityWindow = {
  id: string;
  weekday: number;
  label?: string | null;
  startTime: string;
  endTime: string;
};

export type SetupResponse = {
  professional: Professional | null;
  availability: AvailabilityWindow[];
};

export type Client = {
  id: string;
  name: string;
  phone: string;
  origin?: string | null;
  notes?: string | null;
};

export type CatalogItem = {
  id: string;
  pieceCode: number;
  serviceCode: number;
  pieceType: string;
  serviceType: string;
  pieceName: string;
  serviceName: string;
  estimatedPrice?: number | null;
  estimatedDurationMin: number;
};

export type CatalogResponse = {
  items: CatalogItem[];
  byPiece: Record<string, CatalogItem[]>;
};

export type CalendarEventItem = {
  id: string;
  clientId?: string | null;
  typeEvent: string;
  typeAttendance?: string | null;
  status: string;
  startAt: string;
  endAt: string;
  durationMin: number;
  pieceName?: string | null;
  serviceName?: string | null;
  description?: string | null;
  internalNotes?: string | null;
  client?: Client | null;
  boardState?: "awaiting_production" | "scheduled_production";
};

export type CalendarBlock = {
  id: string;
  startAt: string;
  endAt: string;
  reason?: string | null;
  blockType: string;
};

export type CalendarResponse = {
  date: string;
  events: CalendarEventItem[];
  blocks: CalendarBlock[];
};

export type AvailabilitySlot = {
  startAt: string;
  endAt: string;
  label: string;
  period: "manha" | "tarde";
  durationMin: number;
};

export type AvailabilityResponse = {
  date: string;
  durationMin: number;
  preferredPeriod: "manha" | "tarde" | "qualquer";
  slots: AvailabilitySlot[];
  periods: {
    manha: AvailabilitySlot[];
    tarde: AvailabilitySlot[];
  };
  horarios_manha: string[];
  horarios_tarde: string[];
  horarios_disponiveis: string[];
  options_map: Record<string, string>;
  occupiedCount: number;
};

export type ProductionItem = {
  id: string;
  appointmentOriginId?: string | null;
  productionStatus: string;
  promisedDate?: string | null;
  estimatedTimeMin: number;
  reservedTimeMin: number;
  notes?: string | null;
  pieceName?: string | null;
  serviceName?: string | null;
  client?: Client | null;
  calendarEvent?: CalendarEventItem | null;
  appointmentOrigin?: CalendarEventItem | null;
};

export type ProductionResponse = {
  items: ProductionItem[];
};
