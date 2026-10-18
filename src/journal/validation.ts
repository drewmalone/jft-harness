import validator from 'validator';
import { z } from 'zod';

/**
 * Fixture IDs start with an ASCII letter/digit and may then contain _ or -.
 * Delegate character validation to validator rather than maintaining a parser.
 */
const stableIdSchema = z
  .string()
  .min(1)
  .refine((value) => {
    const startsWithLetterOrDigit = validator.isAlphanumeric(
      value.charAt(0),
      'en-US'
    );
    const hasAllowedCharacters = validator.isAlphanumeric(value, 'en-US', {
      ignore: '_-'
    });
    return startsWithLetterOrDigit && hasAllowedCharacters;
  }, 'Expected a stable alphanumeric ID with optional hyphens or underscores');

/**
 * One journal entry with a stable ID and an ISO 8601 calendar date (YYYY-MM-DD).
 * Zod's date validator checks the format, leap years, and calendar day ranges;
 * datetimes and timezone-bearing timestamps are deliberately not accepted.
 */
export const entrySchema = z
  .object({
    id: stableIdSchema,
    date: z.iso.date(),
    text: z.string().trim().min(1)
  })
  .strict();

/** Nonempty journal array; rejects duplicate IDs and unknown entry properties. */
export const fixtureSchema = z
  .array(entrySchema)
  .min(1)
  .superRefine((entries, context) => {
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

/** Validated fictional journal data. Its text remains untrusted model input. */
export type Entry = z.infer<typeof entrySchema>;
