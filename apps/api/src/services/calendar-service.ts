import { addDays, addMinutes, differenceInMinutes, isAfter, isBefore, isEqual } from "date-fns";

import {
  DEFAULT_SLOT_DURATION_MINUTES,
  MIN_CANCEL_RESCHEDULE_NOTICE_MINUTES,
  MIN_LEAD_TIME_MINUTES,
  nonBlockingStatuses,
} from "../constants/calendar";
import { AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import {
  combineBusinessDateTime,
  getBusinessDateString,
  getBusinessDateTimeString,
  getBusinessDayRange,
  getBusinessTimeString,
  getBusinessWeekday,
} from "../lib/time";

type ConflictInput = {
  startAt: Date;
  endAt: Date;
  ignoreEventId?: string;
  ignoreBlockId?: string;
};

type AvailabilityInput = {
  date: string;
  durationMin?: number;
  preferredPeriod?: "manha" | "tarde" | "qualquer";
};

type NextAvailableInput = {
  date?: string;
  durationMin?: number;
  preferredPeriod?: "manha" | "tarde" | "qualquer";
  searchLimitDays?: number;
};

type AvailabilityWindowSource = {
  startTime: string;
  endTime: string;
  label?: string | null;
  active: boolean;
  intervalMin: number;
  slotDurationMin: number;
  capacityPerSlot: number;
};

const activeEventWhere = {
  status: {
    notIn: [...nonBlockingStatuses],
  },
};

const normalizeOverrideWindows = (value: unknown): AvailabilityWindowSource[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const candidate = item as Partial<AvailabilityWindowSource>;

    if (typeof candidate.startTime !== "string" || typeof candidate.endTime !== "string") {
      return [];
    }

    return [
      {
        startTime: candidate.startTime,
        endTime: candidate.endTime,
        label: candidate.label ?? null,
        active: candidate.active ?? true,
        intervalMin: candidate.intervalMin ?? 10,
        slotDurationMin: candidate.slotDurationMin ?? 30,
        capacityPerSlot: candidate.capacityPerSlot ?? 1,
      },
    ];
  });
};

const getDateWindows = async (date: string) => {
  const override = await prisma.availabilityOverride.findUnique({
    where: { date },
  });

  if (override?.mode === "off") {
    return {
      windows: [] as AvailabilityWindowSource[],
      override,
    };
  }

  if (override?.mode === "work") {
    return {
      windows: normalizeOverrideWindows(override.windows),
      override,
    };
  }

  const weekday = getBusinessWeekday(date);
  const windows = await prisma.availabilityWindow.findMany({
    where: { weekday, active: true },
    orderBy: { startTime: "asc" },
  });

  return { windows, override };
};

export const getDefaultProfessional = async () => {
  const professional = await prisma.professional.findFirst({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });

  if (!professional) {
    throw new AppError(400, "Nenhuma profissional ativa foi encontrada.");
  }

  return professional;
};

export const ensureWithinAvailability = async (startAt: Date, endAt: Date) => {
  const startDate = getBusinessDateString(startAt);
  const endDate = getBusinessDateString(endAt);

  if (startDate !== endDate) {
    throw new AppError(400, "O evento deve comecar e terminar no mesmo dia.");
  }

  const { windows } = await getDateWindows(startDate);

  const isInsideWindow = windows.some((window) => {
    const windowStart = combineBusinessDateTime(startDate, window.startTime);
    const windowEnd = combineBusinessDateTime(startDate, window.endTime);

    return (
      (isAfter(startAt, windowStart) || isEqual(startAt, windowStart)) &&
      (isBefore(endAt, windowEnd) || isEqual(endAt, windowEnd))
    );
  });

  if (!isInsideWindow) {
    throw new AppError(
      400,
      "O horario informado esta fora das faixas de trabalho configuradas para a agenda.",
    );
  }
};

export const assertNoConflicts = async ({
  startAt,
  endAt,
  ignoreEventId,
  ignoreBlockId,
}: ConflictInput) => {
  const [eventConflicts, blockConflicts] = await Promise.all([
    prisma.calendarEvent.count({
      where: {
        id: ignoreEventId ? { not: ignoreEventId } : undefined,
        ...activeEventWhere,
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
    }),
    prisma.calendarBlock.count({
      where: {
        id: ignoreBlockId ? { not: ignoreBlockId } : undefined,
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
    }),
  ]);

  if (eventConflicts > 0 || blockConflicts > 0) {
    throw new AppError(
      409,
      "Esse horario ja esta ocupado por outro evento ou bloqueio na agenda.",
    );
  }
};

export const ensureCanCancelOrReschedule = (startAt: Date) => {
  const difference = differenceInMinutes(startAt, new Date());

  if (difference < MIN_CANCEL_RESCHEDULE_NOTICE_MINUTES) {
    throw new AppError(
      400,
      "Cancelamentos e remarcacoes exigem no minimo 1 hora de antecedencia.",
    );
  }
};

export const getAvailabilityForDate = async ({
  date,
  durationMin = 30,
  preferredPeriod,
}: AvailabilityInput) => {
  const { start, end } = getBusinessDayRange(date);

  const [{ windows }, events, blocks] = await Promise.all([
      getDateWindows(date),
      prisma.calendarEvent.findMany({
        where: {
          ...activeEventWhere,
          startAt: { lt: end },
          endAt: { gt: start },
        },
        orderBy: { startAt: "asc" },
        include: {
          client: true,
        },
      }),
      prisma.calendarBlock.findMany({
        where: {
          startAt: { lt: end },
          endAt: { gt: start },
        },
        orderBy: { startAt: "asc" },
      }),
  ]);

  const minStart = addMinutes(new Date(), MIN_LEAD_TIME_MINUTES);
  const slots: Array<{
    startAt: string;
    endAt: string;
    label: string;
    period: "manha" | "tarde";
    durationMin: number;
  }> = [];

  for (const window of windows) {
    if (window.active === false) {
      continue;
    }

    let cursor = combineBusinessDateTime(date, window.startTime);
    const windowEnd = combineBusinessDateTime(date, window.endTime);
    const slotStep = window.slotDurationMin || DEFAULT_SLOT_DURATION_MINUTES;
    const slotCapacity = window.capacityPerSlot || 1;

    while (isBefore(addMinutes(cursor, durationMin), addMinutes(windowEnd, 1))) {
      const candidateEnd = addMinutes(cursor, durationMin);

      if (isBefore(cursor, minStart)) {
        cursor = addMinutes(cursor, slotStep);
        continue;
      }

      const overlappingEvents = events.filter(
        (event) => isBefore(event.startAt, candidateEnd) && isAfter(event.endAt, cursor),
      );

      const overlappingBlocks = blocks.filter(
        (block) => isBefore(block.startAt, candidateEnd) && isAfter(block.endAt, cursor),
      );

      if (
        overlappingEvents.length < slotCapacity &&
        overlappingBlocks.length === 0
      ) {
        const label = getBusinessTimeString(cursor);
        slots.push({
          startAt: getBusinessDateTimeString(cursor),
          endAt: getBusinessDateTimeString(candidateEnd),
          label,
          period: Number(label.slice(0, 2)) < 12 ? "manha" : "tarde",
          durationMin,
        });
      }

      cursor = addMinutes(cursor, slotStep);
    }
  }

  const filteredSlots =
    preferredPeriod && preferredPeriod !== "qualquer"
      ? slots.filter((slot) => slot.period === preferredPeriod)
      : slots;

  const optionsMap = filteredSlots.reduce<Record<string, string>>((accumulator, slot, index) => {
    accumulator[String(index + 1)] = slot.label;
    return accumulator;
  }, {});

  return {
    date,
    durationMin,
    preferredPeriod: preferredPeriod ?? "qualquer",
    slots: filteredSlots,
    periods: {
      manha: slots.filter((slot) => slot.period === "manha"),
      tarde: slots.filter((slot) => slot.period === "tarde"),
    },
    horarios_manha: slots.filter((slot) => slot.period === "manha").map((slot) => slot.label),
    horarios_tarde: slots.filter((slot) => slot.period === "tarde").map((slot) => slot.label),
    horarios_disponiveis: filteredSlots.map((slot) => slot.label),
    options_map: optionsMap,
    occupiedCount: events.length + blocks.length,
  };
};

export const getNextAvailableSlot = async ({
  date,
  durationMin = 30,
  preferredPeriod = "qualquer",
  searchLimitDays = 60,
}: NextAvailableInput) => {
  const startDate = date ?? getBusinessDateString(new Date());
  const today = getBusinessDateString(new Date());
  const searchFromDate = startDate < today ? today : startDate;

  for (let offset = 0; offset <= searchLimitDays; offset += 1) {
    const candidateDate = getBusinessDateString(
      addDays(combineBusinessDateTime(searchFromDate, "00:00"), offset),
    );

    const availability = await getAvailabilityForDate({
      date: candidateDate,
      durationMin,
      preferredPeriod,
    });

    if (availability.slots.length > 0) {
      return {
        requestedDate: searchFromDate,
        nextDate: candidateDate,
        nextSlot: availability.slots[0],
        searchedDays: offset + 1,
        durationMin,
        preferredPeriod,
        availability,
      };
    }
  }

  throw new AppError(
    404,
    "Nenhum horario disponivel foi encontrado no periodo pesquisado.",
  );
};
