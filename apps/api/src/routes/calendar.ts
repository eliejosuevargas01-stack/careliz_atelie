import { Router } from "express";
import { z } from "zod";

import { asyncHandler } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { getAvailabilityForDate } from "../services/calendar-service";
import { getBusinessDayRange } from "../lib/time";

const router = Router();

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const isRealCalendarDate = (value: string) => {
  const match = isoDatePattern.exec(value);

  if (!match) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
};

const dateSchema = z.object({
  date: z
    .string()
    .regex(isoDatePattern, "Use uma data no formato YYYY-MM-DD.")
    .refine(isRealCalendarDate, "Data invalida para consulta da agenda."),
});

const availabilitySchema = dateSchema.extend({
  durationMin: z.coerce.number().int().min(20).max(240).optional(),
  preferredPeriod: z.enum(["manha", "tarde", "qualquer"]).optional(),
});

const normalizeText = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const normalizePeriodInput = (value: unknown) => {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const normalized = normalizeText(value);

  if (normalized === "manha" || normalized === "tarde" || normalized === "qualquer") {
    return normalized;
  }

  return value;
};

const normalizeDateInput = (value: unknown) => {
  if (typeof value !== "string" || value.trim() === "") {
    return value;
  }

  const normalized = value.trim();

  if (isoDatePattern.test(normalized)) {
    return normalized;
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(normalized)) {
    return normalized.slice(0, 10);
  }

  const brDateMatch = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (brDateMatch) {
    const [, day, month, year] = brDateMatch;
    return `${year}-${month}-${day}`;
  }

  const dashedBrDateMatch = normalized.match(/^(\d{2})-(\d{2})-(\d{4})$/);

  if (dashedBrDateMatch) {
    const [, day, month, year] = dashedBrDateMatch;
    return `${year}-${month}-${day}`;
  }

  return normalized;
};

const normalizeAvailabilityQuery = (query: Record<string, unknown>) => {
  const preferredPeriod =
    typeof query.preferredPeriod === "string"
      ? query.preferredPeriod
      : typeof query.periodo === "string"
        ? query.periodo
        : typeof query.preferencia_periodo === "string"
          ? query.preferencia_periodo
          : undefined;

  const date =
    typeof query.date === "string"
      ? query.date
      : typeof query.data === "string"
        ? query.data
        : typeof query.data_desejada === "string"
          ? query.data_desejada
          : query.date;

  return availabilitySchema.parse({
    date: normalizeDateInput(date),
    durationMin:
      query.durationMin ?? query.duracaoMin ?? query.duracao_min ?? query.duracao,
    preferredPeriod: normalizePeriodInput(preferredPeriod),
  });
};

const normalizeDateQuery = (query: Record<string, unknown>) =>
  dateSchema.parse({
    date: normalizeDateInput(
      typeof query.date === "string"
        ? query.date
        : typeof query.data === "string"
          ? query.data
          : typeof query.data_desejada === "string"
            ? query.data_desejada
            : query.date,
    ),
  });

router.get(
  "/calendar",
  asyncHandler(async (req, res) => {
    const { date } = normalizeDateQuery(req.query as Record<string, unknown>);
    const { start, end } = getBusinessDayRange(date);

    const [events, blocks] = await Promise.all([
      prisma.calendarEvent.findMany({
        where: {
          startAt: { lt: end },
          endAt: { gt: start },
        },
        include: {
          client: true,
          professional: true,
          serviceCatalog: true,
        },
        orderBy: { startAt: "asc" },
      }),
      prisma.calendarBlock.findMany({
        where: {
          startAt: { lt: end },
          endAt: { gt: start },
        },
        orderBy: { startAt: "asc" },
      }),
    ]);

    res.json({
      date,
      events,
      blocks,
    });
  }),
);

router.get(
  "/calendar/availability",
  asyncHandler(async (req, res) => {
    const query = normalizeAvailabilityQuery(req.query as Record<string, unknown>);
    const availability = await getAvailabilityForDate(query);

    res.json(availability);
  }),
);

router.get(
  "/calendar/free-slots",
  asyncHandler(async (req, res) => {
    const query = normalizeAvailabilityQuery(req.query as Record<string, unknown>);
    const availability = await getAvailabilityForDate(query);

    res.json({
      date: availability.date,
      durationMin: availability.durationMin,
      preferredPeriod: availability.preferredPeriod,
      slots: availability.horarios_disponiveis,
    });
  }),
);

export { router as calendarRouter };
