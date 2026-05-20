import { Router } from "express";
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

const parseWeekday = (value: string) => {
  const weekday = Number(value);

  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw new AppError(400, "Informe um dia da semana valido entre 1 e 7.");
  }

  return weekday;
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

export { router as availabilityRouter };
