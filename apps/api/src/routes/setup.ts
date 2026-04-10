import { Router } from "express";

import { asyncHandler } from "../lib/errors";
import { prisma } from "../lib/prisma";

const router = Router();

router.get(
  "/setup",
  asyncHandler(async (_req, res) => {
    const [professional, availability] = await Promise.all([
      prisma.professional.findFirst({
        where: { isActive: true },
        orderBy: { name: "asc" },
      }),
      prisma.availabilityWindow.findMany({
        where: { active: true },
        orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
      }),
    ]);

    res.json({
      professional,
      availability,
    });
  }),
);

export { router as setupRouter };
