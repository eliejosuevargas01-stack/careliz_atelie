import { Router } from "express";
import { z } from "zod";

import { asyncHandler, AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";

const router = Router();

const notificationPayloadSchema = z.object({
  title: z.string().trim().min(2).max(120).optional().nullable(),
  message: z.string().trim().min(2).max(500),
  audioUrl: z.string().trim().url().optional().nullable(),
  audioBase64: z.string().trim().min(8).optional().nullable(),
  audioMimeType: z.string().trim().min(3).max(80).optional().nullable(),
  source: z.string().trim().min(1).max(80).optional().nullable(),
  repeatIntervalSeconds: z.coerce.number().int().min(3).max(120).optional(),
  metadata: z.unknown().optional(),
}).refine(
  (payload) => Boolean(payload.audioUrl) || Boolean(payload.audioBase64) || !payload.audioMimeType,
  {
    message: "Informe audioUrl ou audioBase64 quando usar audioMimeType.",
    path: ["audioMimeType"],
  },
);

const normalizeAudioBase64 = (value: string) => {
  const raw = value.trim();
  if (!raw) {
    return { audioBase64: null as string | null, audioMimeType: null as string | null };
  }

  if (raw.startsWith("data:")) {
    const match = raw.match(/^data:([^;]+);base64,(.*)$/s);
    if (!match) {
      return { audioBase64: raw, audioMimeType: null };
    }

    return {
      audioBase64: match[2].trim(),
      audioMimeType: match[1].trim(),
    };
  }

  return { audioBase64: raw, audioMimeType: null };
};

const notificationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const getCurrentNotification = async () =>
  prisma.notificationAlert.findFirst({
    where: {
      status: "pending",
      acknowledgedAt: null,
    },
    orderBy: [{ createdAt: "desc" }],
  });

router.get(
  "/notifications",
  asyncHandler(async (req, res) => {
    const query = notificationListQuerySchema.parse(req.query);
    const items = await prisma.notificationAlert.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: query.limit ?? 10,
    });

    res.json({ items });
  }),
);

router.get(
  "/notifications/current",
  asyncHandler(async (_req, res) => {
    const current = await getCurrentNotification();

    res.json({ current });
  }),
);

router.get(
  "/notifications/active",
  asyncHandler(async (_req, res) => {
    const current = await getCurrentNotification();

    res.json({ current });
  }),
);

router.post(
  "/notifications",
  asyncHandler(async (req, res) => {
    const payload = notificationPayloadSchema.parse(req.body);

    const notification = await prisma.notificationAlert.create({
      data: {
        title: payload.title ?? null,
        message: payload.message,
        audioUrl: payload.audioUrl ?? null,
        ...(() => {
          if (!payload.audioBase64) {
            return { audioBase64: null, audioMimeType: payload.audioMimeType ?? null };
          }

          const normalized = normalizeAudioBase64(payload.audioBase64);
          return {
            audioBase64: normalized.audioBase64,
            audioMimeType: payload.audioMimeType ?? normalized.audioMimeType,
          };
        })(),
        source: payload.source ?? null,
        repeatIntervalSeconds: payload.repeatIntervalSeconds ?? 6,
        metadata: payload.metadata ?? undefined,
      },
    });

    res.status(201).json({ ok: true, notification });
  }),
);

router.patch(
  "/notifications/:id/acknowledge",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id).trim();
    if (!id) {
      throw new AppError(400, "Informe um identificador valido.");
    }

    const notification = await prisma.notificationAlert.update({
      where: { id },
      data: {
        status: "acknowledged",
        acknowledgedAt: new Date(),
      },
    });

    res.json({ ok: true, notification });
  }),
);

router.post(
  "/notifications/:id/acknowledge",
  asyncHandler(async (req, res) => {
    const id = String(req.params.id).trim();
    if (!id) {
      throw new AppError(400, "Informe um identificador valido.");
    }

    const notification = await prisma.notificationAlert.update({
      where: { id },
      data: {
        status: "acknowledged",
        acknowledgedAt: new Date(),
      },
    });

    res.json({ ok: true, notification });
  }),
);

export { router as notificationsRouter };
