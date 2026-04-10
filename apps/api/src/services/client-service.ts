import { prisma } from "../lib/prisma";

type ClientPayload = {
  name?: string | null;
  phone: string;
  origin?: string | null;
  notes?: string | null;
};

const whatsappIdentifierPattern = /^[^@\s]+@(?:lid|s\.whatsapp\.net|c\.us)$/i;

export const normalizeClientPhone = (phone: string) => {
  const normalized = phone.trim();

  if (whatsappIdentifierPattern.test(normalized)) {
    return normalized.toLowerCase();
  }

  return normalized.replace(/[^\d+]/g, "");
};

export const isValidClientPhone = (phone: string) => {
  const normalized = phone.trim();

  if (whatsappIdentifierPattern.test(normalized)) {
    return true;
  }

  return normalized.replace(/\D/g, "").length >= 8;
};

const normalizeName = (name?: string | null) => {
  const normalized = name?.trim();

  return normalized && normalized.length > 0 ? normalized : "Cliente sem nome";
};

export const upsertClient = async (payload: ClientPayload) => {
  const phone = normalizeClientPhone(payload.phone);
  const name = normalizeName(payload.name);

  return prisma.client.upsert({
    where: { phone },
    update: {
      name,
      origin: payload.origin ?? undefined,
      notes: payload.notes ?? undefined,
    },
    create: {
      name,
      phone,
      origin: payload.origin ?? undefined,
      notes: payload.notes ?? undefined,
    },
  });
};
