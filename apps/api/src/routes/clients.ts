import { Router } from "express";
import { z } from "zod";

import { asyncHandler } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { isValidClientPhone, upsertClient } from "../services/client-service";

const router = Router();

const clientSchema = z.object({
  name: z.string().min(2),
  phone: z.string().refine(isValidClientPhone, {
    message: "Informe um telefone valido ou um identificador do WhatsApp como @lid.",
  }),
  origin: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

router.get(
  "/clients",
  asyncHandler(async (req, res) => {
    const query = typeof req.query.query === "string" ? req.query.query : "";

    const clients = await prisma.client.findMany({
      where: query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { phone: { contains: query } },
            ],
          }
        : undefined,
      orderBy: { updatedAt: "desc" },
      take: 20,
    });

    res.json({ items: clients });
  }),
);

router.post(
  "/clients",
  asyncHandler(async (req, res) => {
    const payload = clientSchema.parse(req.body);
    const client = await upsertClient(payload);

    res.status(201).json(client);
  }),
);

export { router as clientsRouter };
