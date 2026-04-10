import type { AvailabilityWindow, CalendarBlock } from "@prisma/client";
import { addMinutes, differenceInMinutes, isAfter, isBefore, isEqual } from "date-fns";

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

const activeEventWhere = {
  status: {
    notIn: [...nonBlockingStatuses],
  },
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

  const weekday = getBusinessWeekday(startDate);
  const windows = await prisma.availabilityWindow.findMany({
    where: { weekday, active: true },
    orderBy: { startTime: "asc" },
  });

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
  const weekday = getBusinessWeekday(date);
  const { start, end } = getBusinessDayRange(date);

  const [windows, events, blocks] = await Promise.all([
      prisma.availabilityWindow.findMany({
        where: { weekday, active: true },
        orderBy: { startTime: "asc" },
      }),
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
    let cursor = combineBusinessDateTime(date, window.startTime);
    const windowEnd = combineBusinessDateTime(date, window.endTime);
    const slotStep = window.slotDurationMin || DEFAULT_SLOT_DURATION_MINUTES;

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
        overlappingEvents.length < window.capacityPerSlot &&
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
