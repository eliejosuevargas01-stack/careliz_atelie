import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { asyncHandler, AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";

const router = Router();

const timePattern = /^\d{2}:\d{2}$/;

const windowSchema = z.object({
  startTime: z.string().regex(timePattern, "Use o formato HH:mm."),
  endTime: z.string().regex(timePattern, "Use o formato HH:mm."),
  label: z.string().optional().nullable(),
  active: z.boolean().optional(),
  intervalMin: z.coerce.number().int().min(5).max(240).optional(),
  slotDurationMin: z.coerce.number().int().min(20).max(240).optional(),
  capacityPerSlot: z.coerce.number().int().min(1).max(10).optional(),
});

const windowsPayloadSchema = z.object({
  windows: z.array(windowSchema).default([]),
});

const overrideWindowSchema = z.object({
  startTime: z.string().regex(timePattern, "Use o formato HH:mm."),
  endTime: z.string().regex(timePattern, "Use o formato HH:mm."),
  label: z.string().optional().nullable(),
  intervalMin: z.coerce.number().int().min(5).max(240).optional(),
  slotDurationMin: z.coerce.number().int().min(20).max(240).optional(),
  capacityPerSlot: z.coerce.number().int().min(1).max(10).optional(),
});

const overridePayloadSchema = z.object({
  mode: z.enum(["work", "off"]),
  label: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
  windows: z.array(overrideWindowSchema).optional(),
});

const mapOverrideWindows = (windows?: z.infer<typeof overridePayloadSchema>["windows"]) =>
  windows?.map((window) => ({
    startTime: window.startTime,
    endTime: window.endTime,
    label: window.label ?? null,
    intervalMin: window.intervalMin ?? 10,
    slotDurationMin: window.slotDurationMin ?? 30,
    capacityPerSlot: window.capacityPerSlot ?? 1,
  })) ?? [];

const parseWeekday = (value: string) => {
  const weekday = Number(value);

  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw new AppError(400, "Informe um dia da semana valido entre 1 e 7.");
  }

  return weekday;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const normalizeDateInput = (value: string) => {
  const normalized = value.trim();

  if (datePattern.test(normalized)) {
    return normalized;
  }

  const isoMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (isoMatch) {
    return isoMatch[1];
  }

  const brMatch = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return `${year}-${month}-${day}`;
  }

  const dashedMatch = normalized.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dashedMatch) {
    const [, day, month, year] = dashedMatch;
    return `${year}-${month}-${day}`;
  }

  return normalized;
};

router.get(
  "/availability/windows",
  asyncHandler(async (_req, res) => {
    const windows = await prisma.availabilityWindow.findMany({
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
    });

    res.json({ windows });
  }),
);

router.put(
  "/availability/windows/:weekday",
  asyncHandler(async (req, res) => {
    const weekday = parseWeekday(String(req.params.weekday));
    const payload = windowsPayloadSchema.parse(req.body);

    const created = await prisma.$transaction(async (tx) => {
      await tx.availabilityWindow.deleteMany({
        where: { weekday },
      });

      if (payload.windows.length === 0) {
        return [];
      }

      return tx.availabilityWindow.createMany({
        data: payload.windows.map((window) => ({
          weekday,
          label: window.label ?? null,
          startTime: window.startTime,
          endTime: window.endTime,
          active: window.active ?? true,
          intervalMin: window.intervalMin ?? 10,
          slotDurationMin: window.slotDurationMin ?? 30,
          capacityPerSlot: window.capacityPerSlot ?? 1,
        })),
      });
    });

    const windows = await prisma.availabilityWindow.findMany({
      where: { weekday },
      orderBy: { startTime: "asc" },
    });

    res.json({
      ok: true,
      weekday,
      count: windows.length,
      windows,
      result: created,
    });
  }),
);

router.delete(
  "/availability/windows/:weekday",
  asyncHandler(async (req, res) => {
    const weekday = parseWeekday(String(req.params.weekday));

    const result = await prisma.availabilityWindow.deleteMany({
      where: { weekday },
    });

    res.json({
      ok: true,
      weekday,
      deletedCount: result.count,
    });
  }),
);

router.get(
  "/availability/overrides",
  asyncHandler(async (_req, res) => {
    const overrides = await prisma.availabilityOverride.findMany({
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });

    res.json({ overrides });
  }),
);

router.put(
  "/availability/overrides/:date",
  asyncHandler(async (req, res) => {
    const date = normalizeDateInput(String(req.params.date));
    if (!datePattern.test(date)) {
      throw new AppError(400, "Informe uma data valida no formato YYYY-MM-DD.");
    }

    const payload = overridePayloadSchema.parse(req.body);

    const override = await prisma.availabilityOverride.upsert({
      where: { date },
      create: {
        date,
        mode: payload.mode,
        label: payload.label ?? null,
        reason: payload.reason ?? null,
        windows: payload.mode === "work" ? mapOverrideWindows(payload.windows) : Prisma.DbNull,
      },
      update: {
        mode: payload.mode,
        label: payload.label ?? null,
        reason: payload.reason ?? null,
        windows: payload.mode === "work" ? mapOverrideWindows(payload.windows) : Prisma.DbNull,
      },
    });

    res.json({ ok: true, override });
  }),
);

router.delete(
  "/availability/overrides/:date",
  asyncHandler(async (req, res) => {
    const date = normalizeDateInput(String(req.params.date));
    if (!datePattern.test(date)) {
      throw new AppError(400, "Informe uma data valida no formato YYYY-MM-DD.");
    }

    const result = await prisma.availabilityOverride.deleteMany({
      where: { date },
    });

    res.json({ ok: true, deletedCount: result.count, date });
  }),
);

export { router as availabilityRouter };
