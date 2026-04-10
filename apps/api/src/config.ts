export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  businessTimezone: process.env.BUSINESS_TIMEZONE ?? "America/Sao_Paulo",
};
