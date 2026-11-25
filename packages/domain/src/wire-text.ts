import { z } from 'zod';

/** Existing wire formats measure text limits in JavaScript UTF-16 code units. */
export function utf16String(maximum: number) {
  return z
    .string()
    .superRefine((value, context) => {
      if (value.length > maximum) {
        context.addIssue({ code: 'too_big', origin: 'string', maximum, inclusive: true });
      }
    })
    .meta({ maxLength: maximum });
}
