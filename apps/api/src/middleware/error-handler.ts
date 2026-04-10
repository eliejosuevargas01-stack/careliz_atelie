import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import { AppError } from "../lib/errors";

export const errorHandler = (
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (error instanceof ZodError) {
    return res.status(400).json({
      message: "Dados invalidos para a operacao.",
      issues: error.flatten(),
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      message: error.message,
      details: error.details,
    });
  }

  const prismaError = error as Error & { code?: string; meta?: unknown };

  if (error.name === "PrismaClientKnownRequestError" || Boolean(prismaError.code)) {
    return res.status(400).json({
      message: "Erro de banco de dados.",
      code: prismaError.code,
      meta: prismaError.meta,
    });
  }

  console.error(error);

  return res.status(500).json({
    message: "Erro interno do servidor.",
  });
};
