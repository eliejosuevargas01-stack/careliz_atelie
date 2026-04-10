import { addMinutes } from "date-fns";
import { Router } from "express";
import { z } from "zod";

import {
  attendanceTypes,
  eventStatuses,
  eventTypes,
  MIN_APPOINTMENT_DURATION_MINUTES,
} from "../constants/calendar";
import { asyncHandler, AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { combineBusinessDateTime, getBusinessDateTimeString } from "../lib/time";
import {
  assertNoConflicts,
  ensureCanCancelOrReschedule,
  ensureWithinAvailability,
  getDefaultProfessional,
} from "../services/calendar-service";
import { isValidClientPhone, upsertClient } from "../services/client-service";

const router = Router();
const zonedDateTimeSchema = z.string().datetime({ offset: true });
const localIsoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const brSlashDatePattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const brDashedDatePattern = /^(\d{2})-(\d{2})-(\d{4})$/;
const hourMinutePattern = /^\d{2}:\d{2}(?::\d{2})?$/;

const clientInputSchema = z.object({
  name: z.string().trim().optional().nullable(),
  phone: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((value) => value == null || value === "" || isValidClientPhone(value), {
      message: "Informe um telefone valido ou um identificador do WhatsApp como @lid.",
    }),
  origin: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const createEventSchema = z.object({
  clientId: z.string().optional(),
  client: clientInputSchema.optional(),
  professionalId: z.string().optional().nullable(),
  serviceCatalogId: z.string().optional().nullable(),
  typeEvent: z.enum(eventTypes),
  typeAttendance: z.enum(attendanceTypes).optional().nullable(),
  status: z.enum(eventStatuses).optional(),
  startAt: zonedDateTimeSchema,
  durationMin: z.coerce.number().int().min(MIN_APPOINTMENT_DURATION_MINUTES).max(600),
  pieceName: z.string().optional().nullable(),
  serviceName: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
  origin: z.string().optional().nullable(),
});

const patchEventSchema = z.object({
  clientId: z.string().optional().nullable(),
  professionalId: z.string().optional().nullable(),
  serviceCatalogId: z.string().optional().nullable(),
  typeEvent: z.enum(eventTypes).optional(),
  typeAttendance: z.enum(attendanceTypes).optional().nullable(),
  status: z.enum(eventStatuses).optional(),
  startAt: zonedDateTimeSchema.optional(),
  durationMin: z.coerce.number().int().min(MIN_APPOINTMENT_DURATION_MINUTES).max(600).optional(),
  pieceName: z.string().optional().nullable(),
  serviceName: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
  origin: z.string().optional().nullable(),
});

const normalizeDatePart = (value: unknown) => {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const normalized = value.trim();

  if (localIsoDatePattern.test(normalized)) {
    return normalized;
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(normalized)) {
    return normalized.slice(0, 10);
  }

  const brSlashMatch = normalized.match(brSlashDatePattern);

  if (brSlashMatch) {
    const [, day, month, year] = brSlashMatch;
    return `${year}-${month}-${day}`;
  }

  const brDashedMatch = normalized.match(brDashedDatePattern);

  if (brDashedMatch) {
    const [, day, month, year] = brDashedMatch;
    return `${year}-${month}-${day}`;
  }

  return undefined;
};

const normalizeTimePart = (value: unknown) => {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const normalized = value.trim();

  if (!hourMinutePattern.test(normalized)) {
    return undefined;
  }

  return normalized.slice(0, 5);
};

const buildBusinessDateTime = (date: string, time: string) =>
  getBusinessDateTimeString(combineBusinessDateTime(date, time));

const normalizeStartAtInput = (
  startAtValue: unknown,
  dateValue?: unknown,
  timeValue?: unknown,
) => {
  if (typeof startAtValue === "string" && startAtValue.trim() !== "") {
    const normalized = startAtValue.trim();

    if (zonedDateTimeSchema.safeParse(normalized).success) {
      return normalized;
    }

    const isoLocalMatch = normalized.match(
      /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})(?::\d{2})?$/,
    );

    if (isoLocalMatch) {
      const [, date, time] = isoLocalMatch;
      return buildBusinessDateTime(date, time);
    }

    const brDateTimeMatch = normalized.match(
      /^(\d{2}\/\d{2}\/\d{4})[T\s](\d{2}:\d{2})(?::\d{2})?$/,
    );

    if (brDateTimeMatch) {
      const [, date, time] = brDateTimeMatch;
      const normalizedDate = normalizeDatePart(date);

      if (normalizedDate) {
        return buildBusinessDateTime(normalizedDate, time);
      }
    }
  }

  const normalizedDate = normalizeDatePart(dateValue);
  const normalizedTime = normalizeTimePart(timeValue);

  if (normalizedDate && normalizedTime) {
    return buildBusinessDateTime(normalizedDate, normalizedTime);
  }

  return startAtValue;
};

const normalizeClientInput = (body: Record<string, unknown>) => {
  const nestedClient =
    typeof body.client === "object" && body.client !== null
      ? (body.client as Record<string, unknown>)
      : undefined;

  const name =
    nestedClient?.name ??
    (typeof body.client === "string" ? body.client : undefined) ??
    body.clientName ??
    body.client_name ??
    body.nomeCliente ??
    body.nome_cliente ??
    body.nome;

  const phone =
    nestedClient?.phone ??
    body.clientPhone ??
    body.client_phone ??
    body.whatsapp ??
    body.telefone ??
    body.phone;

  const origin =
    nestedClient?.origin ?? body.clientOrigin ?? body.client_origin ?? body.origem_cliente;

  const notes =
    nestedClient?.notes ??
    body.clientNotes ??
    body.client_notes ??
    body.observacoes_cliente;

  if ([name, phone, origin, notes].every((value) => value === undefined || value === null || `${value}`.trim() === "")) {
    return body.client;
  }

  return {
    name,
    phone,
    origin,
    notes,
  };
};

const normalizeEventPayload = (body: Record<string, unknown>) => ({
  ...body,
  clientId: body.clientId ?? body.clienteId ?? body.cliente_id,
  client: normalizeClientInput(body),
  professionalId: body.professionalId ?? body.profissionalId ?? body.profissional_id,
  serviceCatalogId: body.serviceCatalogId ?? body.catalogoServicoId ?? body.service_catalog_id,
  typeEvent: body.typeEvent ?? body.tipoEvento ?? body.tipo_evento,
  typeAttendance: body.typeAttendance ?? body.tipoAtendimento ?? body.tipo_atendimento,
  status: body.status,
  startAt: normalizeStartAtInput(
    body.startAt,
    body.date ?? body.data ?? body.data_desejada,
    body.time ?? body.hora ?? body.horario,
  ),
  durationMin: body.durationMin ?? body.duracaoMin ?? body.duracao_min ?? body.duracao,
  pieceName: body.pieceName ?? body.nomePeca ?? body.nome_peca ?? body.peca,
  serviceName: body.serviceName ?? body.nomeServico ?? body.nome_servico ?? body.servico,
  description: body.description ?? body.descricao,
  internalNotes: body.internalNotes ?? body.observacoesInternas ?? body.observacoes_internas,
  origin: body.origin ?? body.origem,
});

router.post(
  "/events",
  asyncHandler(async (req, res) => {
    const payload = createEventSchema.parse(normalizeEventPayload(req.body as Record<string, unknown>));
    const startAt = new Date(payload.startAt);
    const endAt = addMinutes(startAt, payload.durationMin);

    let clientId = payload.clientId;
    const clientPhone = payload.client?.phone?.trim();

    if (!clientId && payload.client && clientPhone) {
      const client = await upsertClient({
        ...payload.client,
        phone: clientPhone,
      });
      clientId = client.id;
    }

    const professional = payload.professionalId
      ? await prisma.professional.findUnique({ where: { id: payload.professionalId } })
      : await getDefaultProfessional();

    if (!professional) {
      throw new AppError(400, "A profissional informada nao existe.");
    }

    await ensureWithinAvailability(startAt, endAt);
    await assertNoConflicts({ startAt, endAt });

    const event = await prisma.calendarEvent.create({
      data: {
        clientId,
        professionalId: professional.id,
        serviceCatalogId: payload.serviceCatalogId ?? undefined,
        typeEvent: payload.typeEvent,
        typeAttendance: payload.typeAttendance ?? undefined,
        status: payload.status ?? "agendado",
        startAt,
        endAt,
        durationMin: payload.durationMin,
        pieceName: payload.pieceName ?? undefined,
        serviceName: payload.serviceName ?? undefined,
        description: payload.description ?? undefined,
        internalNotes: payload.internalNotes ?? undefined,
        origin: payload.origin ?? undefined,
      },
      include: {
        client: true,
        professional: true,
        serviceCatalog: true,
      },
    });

    res.status(201).json(event);
  }),
);

router.patch(
  "/events/:id",
  asyncHandler(async (req, res) => {
    const eventId = String(req.params.id);
    const payload = patchEventSchema.parse(normalizeEventPayload(req.body as Record<string, unknown>));
    const current = await prisma.calendarEvent.findUnique({
      where: { id: eventId },
    });

    if (!current) {
      throw new AppError(404, "Evento nao encontrado.");
    }

    const startAt = payload.startAt ? new Date(payload.startAt) : current.startAt;
    const durationMin = payload.durationMin ?? current.durationMin;
    const endAt = addMinutes(startAt, durationMin);
    const isRescheduling = payload.startAt && payload.startAt !== current.startAt.toISOString();
    const isCancellingOrMarkingRemarcado =
      payload.status === "cancelado" || payload.status === "remarcado";

    if (isRescheduling || isCancellingOrMarkingRemarcado) {
      ensureCanCancelOrReschedule(current.startAt);
    }

    if (payload.startAt || payload.durationMin) {
      await ensureWithinAvailability(startAt, endAt);
      await assertNoConflicts({ startAt, endAt, ignoreEventId: current.id });
    }

    const event = await prisma.calendarEvent.update({
      where: { id: current.id },
      data: {
        clientId: payload.clientId ?? undefined,
        professionalId: payload.professionalId ?? undefined,
        serviceCatalogId: payload.serviceCatalogId ?? undefined,
        typeEvent: payload.typeEvent ?? undefined,
        typeAttendance: payload.typeAttendance ?? undefined,
        status: payload.status ?? undefined,
        startAt,
        endAt,
        durationMin,
        pieceName: payload.pieceName ?? undefined,
        serviceName: payload.serviceName ?? undefined,
        description: payload.description ?? undefined,
        internalNotes: payload.internalNotes ?? undefined,
        origin: payload.origin ?? undefined,
      },
      include: {
        client: true,
        professional: true,
        serviceCatalog: true,
      },
    });

    res.json(event);
  }),
);

router.delete(
  "/events/:id",
  asyncHandler(async (req, res) => {
    const eventId = String(req.params.id);
    const current = await prisma.calendarEvent.findUnique({
      where: { id: eventId },
      include: {
        productionRecord: true,
      },
    });

    if (!current) {
      throw new AppError(404, "Evento nao encontrado.");
    }

    await prisma.$transaction(async (transaction) => {
      if (current.productionRecord) {
        await transaction.productionTask.delete({
          where: { id: current.productionRecord.id },
        });
      }

      await transaction.calendarEvent.delete({
        where: { id: current.id },
      });
    });

    res.json({
      ok: true,
      deletedId: current.id,
      deletedType: current.typeEvent,
    });
  }),
);

export { router as eventsRouter };
