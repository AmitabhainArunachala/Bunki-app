import { expect, it } from 'vitest';
import { z } from 'zod';

import { utf16String } from '../src/wire-text.ts';

it('preserves UTF-16 wire limits and publishes the same JSON Schema bound', () => {
  const schema = utf16String(2).min(1);
  expect(schema.parse('𠮷')).toBe('𠮷');
  expect(schema.parse('日本')).toBe('日本');
  const oversize = schema.safeParse('𠮷野');
  expect(oversize.error?.issues).toMatchObject([
    { code: 'too_big', maximum: 2, inclusive: true, origin: 'string' },
  ]);
  expect(z.toJSONSchema(schema)).toMatchObject({ type: 'string', minLength: 1, maxLength: 2 });
});
