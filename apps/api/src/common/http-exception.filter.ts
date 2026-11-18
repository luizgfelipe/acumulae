import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { ZodError } from 'zod';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body && 'code' in body) {
        return res.status(status).json(body);
      }
      const message =
        typeof body === 'string' ? body : ((body as { message?: string | string[] }).message ?? exception.message);
      return res.status(status).json({
        statusCode: status,
        code: status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR',
        message: Array.isArray(message) ? message.join('; ') : message,
      });
    }

    if (exception instanceof ZodError) {
      return res.status(400).json({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: exception.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '),
        details: exception.issues,
      });
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2002') {
      return res.status(409).json({ statusCode: 409, code: 'CONFLICT', message: 'Registro duplicado.' });
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    return res.status(500).json({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Erro interno.' });
  }
}
