import { PipeTransform } from '@nestjs/common';
import { ZodType, ZodTypeDef } from 'zod';

/** Uso: @Body(new ZodPipe(schema)) body: z.infer<typeof schema> */
export class ZodPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(value: unknown): T {
    return this.schema.parse(value ?? {});
  }
}
