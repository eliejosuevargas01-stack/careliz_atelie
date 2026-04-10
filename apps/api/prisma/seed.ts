import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prisma = new PrismaClient();

type FlowService = {
  id_produto: number;
  piece_type: string;
  id_servico: string | number;
  service_type: string;
  preco: number;
};

const availabilityWindows = [
  { weekday: 1, label: "Segunda - Manha", startTime: "07:00", endTime: "11:00" },
  { weekday: 1, label: "Segunda - Tarde", startTime: "13:00", endTime: "18:00" },
  { weekday: 2, label: "Terca - Manha", startTime: "07:00", endTime: "11:00" },
  { weekday: 2, label: "Terca - Tarde", startTime: "13:00", endTime: "18:00" },
  { weekday: 3, label: "Quarta - Manha", startTime: "07:00", endTime: "11:00" },
  { weekday: 3, label: "Quarta - Tarde", startTime: "13:00", endTime: "18:00" },
  { weekday: 4, label: "Quinta - Manha", startTime: "07:00", endTime: "11:00" },
  { weekday: 4, label: "Quinta - Tarde", startTime: "13:00", endTime: "18:00" },
  { weekday: 5, label: "Sexta - Manha", startTime: "07:00", endTime: "11:00" },
  { weekday: 5, label: "Sexta - Tarde", startTime: "13:00", endTime: "18:00" },
  { weekday: 6, label: "Sabado - Manha", startTime: "07:00", endTime: "11:00" },
  { weekday: 6, label: "Sabado - Tarde", startTime: "13:00", endTime: "18:00" },
];

const prettify = (value: string) =>
  value
    .split("_")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");

const extractServicesFromFlow = async (): Promise<FlowService[]> => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const flowPath = path.resolve(currentDir, "../../..", "careliz agente.json");
  const file = await readFile(flowPath, "utf8");
  const parsed = JSON.parse(file);

  const node = parsed.nodes.find((item: { name: string }) => item.name === "Edit Fields");
  const assignment = node.parameters.assignments.assignments.find(
    (item: { name: string }) => item.name === "base_servicos",
  );

  const expression = String(assignment.value)
    .replace(/^=\{\{\s*/, "")
    .replace(/\s*\}\}$/, "");

  return Function(`"use strict"; return (${expression});`)();
};

const main = async () => {
  const services = await extractServicesFromFlow();

  await prisma.professional.upsert({
    where: { slug: "careliz" },
    update: {
      name: "Careliz",
      isActive: true,
    },
    create: {
      slug: "careliz",
      name: "Careliz",
      isActive: true,
    },
  });

  for (const window of availabilityWindows) {
    await prisma.availabilityWindow.upsert({
      where: {
        weekday_startTime_endTime: {
          weekday: window.weekday,
          startTime: window.startTime,
          endTime: window.endTime,
        },
      },
      update: {
        label: window.label,
        active: true,
        intervalMin: 10,
        slotDurationMin: 30,
        capacityPerSlot: 1,
      },
      create: {
        ...window,
        active: true,
        intervalMin: 10,
        slotDurationMin: 30,
        capacityPerSlot: 1,
      },
    });
  }

  for (const service of services) {
    const pieceCode = Number(service.id_produto);
    const serviceCode = Number(service.id_servico);

    await prisma.serviceCatalog.upsert({
      where: {
        pieceCode_serviceCode: {
          pieceCode,
          serviceCode,
        },
      },
      update: {
        pieceType: service.piece_type,
        serviceType: service.service_type,
        pieceName: service.piece_type,
        serviceName: prettify(service.service_type),
        estimatedPrice: Number(service.preco),
        estimatedDurationMin: 30,
        active: true,
      },
      create: {
        pieceCode,
        serviceCode,
        pieceType: service.piece_type,
        serviceType: service.service_type,
        pieceName: service.piece_type,
        serviceName: prettify(service.service_type),
        estimatedPrice: Number(service.preco),
        estimatedDurationMin: 30,
        active: true,
      },
    });
  }

  console.log(`Seed concluido com ${services.length} servicos do fluxo n8n.`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
