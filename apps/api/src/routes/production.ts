import type { Prisma } from "@prisma/client";
import { addMinutes } from "date-fns";
import { Router } from "express";
import { z } from "zod";

import {
  attendanceTypes,
  eventStatuses,
  productionStatuses,
  MIN_APPOINTMENT_DURATION_MINUTES,
} from "../constants/calendar";
import { asyncHandler, AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import {
  assertNoConflicts,
  ensureWithinAvailability,
  getDefaultProfessional,
} from "../services/calendar-service";
import { isValidClientPhone, upsertClient } from "../services/client-service";

const router = Router();
const zonedDateTimeSchema = z.string().datetime({ offset: true });

const ensureProductionHappensBeforeDelivery = (productionEndAt: Date, promisedDate?: Date | null) => {
  if (!promisedDate) {
    return;
  }

  if (productionEndAt >= promisedDate) {
    throw new AppError(
      400,
      "A producao precisa terminar antes da data e hora prometidas para entrega.",
    );
  }
};

const clientSchema = z.object({
  name: z.string().min(2),
  phone: z.string().refine(isValidClientPhone, {
    message: "Informe um telefone valido ou um identificador do WhatsApp como @lid.",
  }),
  origin: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const createProductionSchema = z.object({
  appointmentOriginId: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
  client: clientSchema.optional(),
  professionalId: z.string().optional().nullable(),
  serviceCatalogId: z.string().optional().nullable(),
  startAt: zonedDateTimeSchema,
  durationMin: z.coerce.number().int().min(MIN_APPOINTMENT_DURATION_MINUTES).max(600),
  pieceName: z.string().optional().nullable(),
  serviceName: z.string().optional().nullable(),
  promisedDate: zonedDateTimeSchema.optional().nullable(),
  productionStatus: z.enum(productionStatuses).optional(),
  eventStatus: z.enum(eventStatuses).optional(),
  description: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  typeAttendance: z.enum(attendanceTypes).optional().nullable(),
});

const patchProductionSchema = z.object({
  promisedDate: zonedDateTimeSchema.optional().nullable(),
  productionStatus: z.enum(productionStatuses).optional(),
  notes: z.string().optional().nullable(),
});

router.get(
  "/production",
  asyncHandler(async (_req, res) => {
    const items = await prisma.productionTask.findMany({
      orderBy: [{ productionStatus: "asc" }, { promisedDate: "asc" }],
      include: {
        client: true,
        appointmentOrigin: true,
        calendarEvent: true,
        serviceCatalog: true,
      },
    });

    res.json({ items });
  }),
);

router.post(
  "/production",
  asyncHandler(async (req, res) => {
    const payload = createProductionSchema.parse(req.body);
    const startAt = new Date(payload.startAt);
    const endAt = addMinutes(startAt, payload.durationMin);
    const promisedDate = payload.promisedDate ? new Date(payload.promisedDate) : null;

    let clientId = payload.clientId ?? undefined;
    if (!clientId && payload.client) {
      const client = await upsertClient(payload.client);
      clientId = client.id;
    }

    const professional = payload.professionalId
      ? await prisma.professional.findUnique({ where: { id: payload.professionalId } })
      : await getDefaultProfessional();

    if (!professional) {
      throw new AppError(400, "A profissional informada nao existe.");
    }

    if (payload.appointmentOriginId) {
      const existingProduction = await prisma.productionTask.findFirst({
        where: {
          appointmentOriginId: payload.appointmentOriginId,
        },
      });

      if (existingProduction) {
        throw new AppError(409, "Esta visita ja possui uma producao vinculada.");
      }
    }

    ensureProductionHappensBeforeDelivery(endAt, promisedDate);
    await ensureWithinAvailability(startAt, endAt);
    await assertNoConflicts({ startAt, endAt });

    const created = await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const event = await transaction.calendarEvent.create({
        data: {
          clientId,
          professionalId: professional.id,
          serviceCatalogId: payload.serviceCatalogId ?? undefined,
          typeEvent: "producao",
          typeAttendance: payload.typeAttendance ?? "interno",
          status: payload.eventStatus ?? "agendado",
          startAt,
          endAt,
          durationMin: payload.durationMin,
          pieceName: payload.pieceName ?? undefined,
          serviceName: payload.serviceName ?? undefined,
          description: payload.description ?? "Bloco de producao reservado",
          internalNotes: payload.notes ?? undefined,
          origin: "painel",
        },
      });

      const production = await transaction.productionTask.create({
        data: {
          appointmentOriginId: payload.appointmentOriginId ?? undefined,
          calendarEventId: event.id,
          clientId,
          serviceCatalogId: payload.serviceCatalogId ?? undefined,
          pieceName: payload.pieceName ?? undefined,
          serviceName: payload.serviceName ?? undefined,
          promisedDate: promisedDate ?? undefined,
          estimatedTimeMin: payload.durationMin,
          reservedTimeMin: payload.durationMin,
          productionStatus: payload.productionStatus ?? "pendente",
          notes: payload.notes ?? undefined,
        },
        include: {
          client: true,
          calendarEvent: true,
          appointmentOrigin: true,
        },
      });

      return production;
    });

    res.status(201).json(created);
  }),
);

router.patch(
  "/production/:id",
  asyncHandler(async (req, res) => {
    const productionId = String(req.params.id);
    const payload = patchProductionSchema.parse(req.body);
    const current = await prisma.productionTask.findUnique({
      where: { id: productionId },
      include: { calendarEvent: true },
    });

    if (!current) {
      throw new AppError(404, "Reserva de producao nao encontrada.");
    }

    const promisedDate = payload.promisedDate ? new Date(payload.promisedDate) : null;

    ensureProductionHappensBeforeDelivery(current.calendarEvent?.endAt ?? new Date(0), promisedDate ?? null);

    const production = await prisma.productionTask.update({
      where: { id: current.id },
      data: {
        promisedDate,
        productionStatus: payload.productionStatus ?? undefined,
        notes: payload.notes ?? undefined,
      },
      include: {
        client: true,
        calendarEvent: true,
        appointmentOrigin: true,
      },
    });

    if (payload.productionStatus === "finalizado" && current.calendarEventId) {
      await prisma.calendarEvent.update({
        where: { id: current.calendarEventId },
        data: { status: "concluido" },
      });
    }

    res.json(production);
  }),
);

router.delete(
  "/production/:id",
  asyncHandler(async (req, res) => {
    const productionId = String(req.params.id);
    const current = await prisma.productionTask.findUnique({
      where: { id: productionId },
      include: { calendarEvent: true },
    });

    if (!current) {
      throw new AppError(404, "Reserva de producao nao encontrada.");
    }

    await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      await transaction.productionTask.delete({
        where: { id: current.id },
      });

      if (current.calendarEventId) {
        await transaction.calendarEvent.delete({
          where: { id: current.calendarEventId },
        });
      }
    });

    res.json({
      ok: true,
      deletedId: current.id,
      deletedType: "producao",
    });
  }),
);

export { router as productionRouter };
