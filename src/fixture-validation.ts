import { z } from 'zod';

function isAsciiLetterOrDigit(character: string): boolean {
  return (character >= 'a' && character <= 'z')
    || (character >= 'A' && character <= 'Z')
    || (character >= '0' && character <= '9');
}

function isStableId(value: string): boolean {
  const characters = [...value];
  const first = characters.shift();
  return first !== undefined
    && isAsciiLetterOrDigit(first)
    && characters.every(character =>
      isAsciiLetterOrDigit(character) || character === '_' || character === '-');
}

function isCalendarDate(value: string): boolean {
  const parts = value.split('-');
  if (parts.length !== 3) {
    return false;
  }

  const [year, month, day] = parts;
  if (year?.length !== 4 || month?.length !== 2 || day?.length !== 2) {
    return false;
  }
  const digits = [...year, ...month, ...day];
  if (!digits.every(character => character >= '0' && character <= '9')) {
    return false;
  }

  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export const entrySchema = z.object({
  id: z.string().refine(isStableId, 'Expected a stable alphanumeric ID with optional hyphens or underscores'),
  date: z.string().refine(isCalendarDate, 'Invalid calendar date (expected YYYY-MM-DD)'),
  text: z.string().trim().min(1),
}).strict();

export const fixtureSchema = z.array(entrySchema).min(1).superRefine((entries, context) => {
  const ids = new Set<string>();
  entries.forEach((entry, index) => {
    if (ids.has(entry.id)) {
      context.addIssue({
        code: 'custom',
        path: [index, 'id'],
        message: 'Duplicate entry ID'
      });
    }
    ids.add(entry.id);
  });
});


export type Entry = z.infer<typeof entrySchema>;
