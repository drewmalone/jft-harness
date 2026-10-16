import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { z } from 'zod';

export const entrySchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(value);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }, 'Invalid calendar date'),
  text: z.string().trim().min(1),
}).strict();
export const fixtureSchema = z.array(entrySchema).min(1).superRefine((entries, ctx) => {
  const ids = new Set<string>();
  entries.forEach((entry, index) => {
    if (ids.has(entry.id)) ctx.addIssue({ code: 'custom', path: [index, 'id'], message: 'Duplicate entry ID' });
    ids.add(entry.id);
  });
});
export type Entry = z.infer<typeof entrySchema>;
export async function loadFixture(path: string) {
  const content = await readFile(path, 'utf8');
  return { path, hash: createHash('sha256').update(content).digest('hex'), entries: fixtureSchema.parse(JSON.parse(content)) };
}
