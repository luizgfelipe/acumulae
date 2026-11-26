import { HttpException } from '@nestjs/common';

/** Erro de negócio com código estável, consumido pelo frontend. */
export class AppError extends HttpException {
  constructor(status: number, code: string, message: string, details?: unknown) {
    super({ statusCode: status, code, message, details }, status);
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(400, code, message, details);
export const unauthorized = (message = 'Não autenticado.', code = 'UNAUTHORIZED') =>
  new AppError(401, code, message);
export const forbidden = (message = 'Acesso negado.', code = 'FORBIDDEN') => new AppError(403, code, message);
export const notFound = (message = 'Não encontrado.', code = 'NOT_FOUND') => new AppError(404, code, message);
export const conflict = (code: string, message: string, details?: unknown) =>
  new AppError(409, code, message, details);
export const gone = (code: string, message: string) => new AppError(410, code, message);
export const tooMany = (message: string, retryAfterSeconds?: number) =>
  new AppError(429, 'TOO_MANY_ATTEMPTS', message, retryAfterSeconds ? { retryAfterSeconds } : undefined);
