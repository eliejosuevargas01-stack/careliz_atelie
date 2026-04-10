import { Router } from "express";
import { z } from "zod";

import { asyncHandler } from "../lib/errors";
import { prisma } from "../lib/prisma";

const router = Router();
const zonedDateTimeSchema = z.string().datetime({ offset: true });

const createInteractionSchema = z.object({
  clientId: z.string(),
  eventId: z.string().optional().nullable(),
  channel: z.string().min(2),
  message: z.string().min(1),
  author: z.string().min(2),
  eventAt: zonedDateTimeSchema.optional(),
  metadata: z.string().optional().nullable(),
});

router.get(
  "/interactions",
  asyncHandler(async (req, res) => {
    const clientId = typeof req.query.clientId === "string" ? req.query.clientId : undefined;
    const eventId = typeof req.query.eventId === "string" ? req.query.eventId : undefined;

    const items = await prisma.interactionHistory.findMany({
      where: {
        clientId,
        eventId,
      },
      orderBy: { eventAt: "desc" },
      take: 100,
    });

    res.json({ items });
  }),
);

router.post(
  "/interactions",
  asyncHandler(async (req, res) => {
    const payload = createInteractionSchema.parse(req.body);

    const interaction = await prisma.interactionHistory.create({
      data: {
        clientId: payload.clientId,
        eventId: payload.eventId ?? undefined,
        channel: payload.channel,
        message: payload.message,
        author: payload.author,
        eventAt: payload.eventAt ? new Date(payload.eventAt) : new Date(),
        metadata: payload.metadata ?? undefined,
      },
    });

    res.status(201).json(interaction);
  }),
);

export { router as interactionsRouter };
