import type { ServiceCatalog } from "@prisma/client";
import { Router } from "express";

import { asyncHandler } from "../lib/errors";
import { prisma } from "../lib/prisma";

const router = Router();

router.get(
  "/catalog",
  asyncHandler(async (req, res) => {
    const pieceCode =
      typeof req.query.pieceCode === "string" ? Number(req.query.pieceCode) : undefined;
    const pieceType =
      typeof req.query.pieceType === "string" ? req.query.pieceType : undefined;

    const services: ServiceCatalog[] = await prisma.serviceCatalog.findMany({
      where: {
        active: true,
        pieceCode: Number.isFinite(pieceCode) ? pieceCode : undefined,
        pieceType: pieceType
          ? {
              equals: pieceType,
              mode: "insensitive",
            }
          : undefined,
      },
      orderBy: [{ pieceCode: "asc" }, { serviceCode: "asc" }],
    });

    const grouped = services.reduce<Record<string, ServiceCatalog[]>>((accumulator, item) => {
      if (!accumulator[item.pieceName]) {
        accumulator[item.pieceName] = [];
      }

      accumulator[item.pieceName].push(item);
      return accumulator;
    }, {});

    res.json({
      items: services,
      byPiece: grouped,
    });
  }),
);

router.get(
  "/catalog/n8n",
  asyncHandler(async (_req, res) => {
    const services = await prisma.serviceCatalog.findMany({
      where: { active: true },
      orderBy: [{ pieceCode: "asc" }, { serviceCode: "asc" }],
      select: {
        pieceCode: true,
        serviceCode: true,
        pieceType: true,
        serviceType: true,
        estimatedPrice: true,
        estimatedDurationMin: true,
      },
    });

    res.json({
      items: services.map((item: {
        pieceCode: number;
        pieceType: string;
        serviceCode: number;
        serviceType: string;
        estimatedPrice: number | null;
        estimatedDurationMin: number;
      }) => ({
        id_produto: item.pieceCode,
        piece_type: item.pieceType,
        id_servico: item.serviceCode,
        service_type: item.serviceType,
        preco: item.estimatedPrice,
        duracao_estimada_min: item.estimatedDurationMin,
      })),
    });
  }),
);

export { router as catalogRouter };
