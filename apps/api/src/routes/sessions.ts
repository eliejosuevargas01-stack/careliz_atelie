import { Router } from "express";
import { z } from "zod";

import { asyncHandler } from "../lib/errors";
import { prisma } from "../lib/prisma";

const router = Router();

const jsonValueSchema: z.ZodTypeAny = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
);

const sessionPayloadSchema = z.object({
  sessionId: z.string().min(1),
  stage: z.string().default("start"),
  lead: jsonValueSchema.optional(),
  business: jsonValueSchema.optional(),
  context: jsonValueSchema.optional(),
  messages: jsonValueSchema.optional(),
  lastAction: z.string().optional().nullable(),
  nextAction: z.string().optional().nullable(),
  pieceCode: z.coerce.number().int().optional().nullable(),
  pieceType: z.string().optional().nullable(),
  serviceCode: z.coerce.number().int().optional().nullable(),
  serviceType: z.string().optional().nullable(),
  preferredDate: z.string().optional().nullable(),
  preferredPeriod: z.string().optional().nullable(),
  scheduleTime: z.string().optional().nullable(),
  customerLabel: z.string().optional().nullable(),
});

type SessionRecord = Awaited<ReturnType<typeof prisma.agentSession.findUnique>>;

const mapSessionForN8n = (session: NonNullable<SessionRecord>) => ({
  session_id: session.sessionId,
  created_at: session.createdAt.toISOString(),
  updated_at: session.updatedAt.toISOString(),
  stage: session.stage,
  lead: session.lead ?? {},
  business: session.business ?? {},
  context: session.context ?? {},
  messages: session.messages ?? [],
  last_action: session.lastAction,
  next_action: session.nextAction,
  peca: session.pieceType,
  servico: session.serviceType,
  preferencia_data: session.preferredDate,
  preferencia_periodo: session.preferredPeriod,
  horario: session.scheduleTime,
  cliente: session.customerLabel,
  piece_code: session.pieceCode,
  service_code: session.serviceCode,
});

router.get(
  "/sessions/:sessionId",
  asyncHandler(async (req, res) => {
    const sessionId = String(req.params.sessionId);
    const session = await prisma.agentSession.findUnique({
      where: { sessionId },
    });

    if (!session) {
      return res.status(404).json({
        message: "Sessao nao encontrada.",
      });
    }

    res.json({
      raw: session,
      n8n: mapSessionForN8n(session),
    });
  }),
);

router.post(
  "/sessions/upsert",
  asyncHandler(async (req, res) => {
    const payload = sessionPayloadSchema.parse(req.body);

    const session = await prisma.agentSession.upsert({
      where: { sessionId: payload.sessionId },
      update: {
        stage: payload.stage,
        lead: payload.lead,
        business: payload.business,
        context: payload.context,
        messages: payload.messages,
        lastAction: payload.lastAction ?? undefined,
        nextAction: payload.nextAction ?? undefined,
        pieceCode: payload.pieceCode ?? undefined,
        pieceType: payload.pieceType ?? undefined,
        serviceCode: payload.serviceCode ?? undefined,
        serviceType: payload.serviceType ?? undefined,
        preferredDate: payload.preferredDate ?? undefined,
        preferredPeriod: payload.preferredPeriod ?? undefined,
        scheduleTime: payload.scheduleTime ?? undefined,
        customerLabel: payload.customerLabel ?? undefined,
      },
      create: {
        sessionId: payload.sessionId,
        stage: payload.stage,
        lead: payload.lead ?? {},
        business: payload.business ?? {},
        context: payload.context ?? {},
        messages: payload.messages ?? [],
        lastAction: payload.lastAction ?? undefined,
        nextAction: payload.nextAction ?? undefined,
        pieceCode: payload.pieceCode ?? undefined,
        pieceType: payload.pieceType ?? undefined,
        serviceCode: payload.serviceCode ?? undefined,
        serviceType: payload.serviceType ?? undefined,
        preferredDate: payload.preferredDate ?? undefined,
        preferredPeriod: payload.preferredPeriod ?? undefined,
        scheduleTime: payload.scheduleTime ?? undefined,
        customerLabel: payload.customerLabel ?? undefined,
      },
    });

    res.status(201).json({
      raw: session,
      n8n: mapSessionForN8n(session),
    });
  }),
);

export { router as sessionsRouter };
