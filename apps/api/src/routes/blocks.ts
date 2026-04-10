import { addMinutes } from "date-fns";
import { Router } from "express";
import { z } from "zod";

import { blockTypes, MIN_APPOINTMENT_DURATION_MINUTES } from "../constants/calendar";
import { asyncHandler, AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { assertNoConflicts } from "../services/calendar-service";

const router = Router();
const zonedDateTimeSchema = z.string().datetime({ offset: true });

const blockSchema = z.object({
  startAt: zonedDateTimeSchema,
  durationMin: z.coerce.number().int().min(MIN_APPOINTMENT_DURATION_MINUTES).max(600),
  reason: z.string().min(2),
  blockType: z.enum(blockTypes),
});

const patchBlockSchema = z.object({
  startAt: zonedDateTimeSchema.optional(),
  durationMin: z.coerce.number().int().min(MIN_APPOINTMENT_DURATION_MINUTES).max(600).optional(),
  reason: z.string().min(2).optional(),
  blockType: z.enum(blockTypes).optional(),
});

router.post(
  "/blocks",
  asyncHandler(async (req, res) => {
    const payload = blockSchema.parse(req.body);
    const startAt = new Date(payload.startAt);
    const endAt = addMinutes(startAt, payload.durationMin);

    await assertNoConflicts({ startAt, endAt });

    const block = await prisma.calendarBlock.create({
      data: {
        startAt,
        endAt,
        reason: payload.reason,
        blockType: payload.blockType,
      },
    });

    res.status(201).json(block);
  }),
);

router.patch(
  "/blocks/:id",
  asyncHandler(async (req, res) => {
    const blockId = String(req.params.id);
    const payload = patchBlockSchema.parse(req.body);
    const current = await prisma.calendarBlock.findUnique({
      where: { id: blockId },
    });

    if (!current) {
      throw new AppError(404, "Bloqueio nao encontrado.");
    }

    const startAt = payload.startAt ? new Date(payload.startAt) : current.startAt;
    const durationMin = payload.durationMin ?? Math.round((current.endAt.getTime() - current.startAt.getTime()) / 60000);
    const endAt = addMinutes(startAt, durationMin);

    if (payload.startAt || payload.durationMin) {
      await assertNoConflicts({
        startAt,
        endAt,
        ignoreBlockId: current.id,
      });
    }

    const block = await prisma.calendarBlock.update({
      where: { id: current.id },
      data: {
        startAt,
        endAt,
        reason: payload.reason ?? undefined,
        blockType: payload.blockType ?? undefined,
      },
    });

    res.json(block);
  }),
);

router.delete(
  "/blocks/:id",
  asyncHandler(async (req, res) => {
    const blockId = String(req.params.id);
    const current = await prisma.calendarBlock.findUnique({
      where: { id: blockId },
    });

    if (!current) {
      throw new AppError(404, "Bloqueio nao encontrado.");
    }

    await prisma.calendarBlock.delete({
      where: { id: current.id },
    });

    res.json({
      ok: true,
      deletedId: current.id,
      deletedType: current.blockType,
    });
  }),
);

export { router as blocksRouter };
