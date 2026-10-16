import { z } from 'zod';
import type { Entry } from '../entries.js';
export const searchArguments = z.object({ query: z.string().trim().min(1).max(1000), limit: z.number().int().min(1).max(10).default(5) }).strict();
export const searchTool = {
  type: 'function' as const, name: 'search_entries',
  description: 'Search untrusted fictional journal text using exact case-insensitive keywords. Use short keywords; no semantic matching.',
  // Non-strict API schema permits the optional limit; Zod always validates locally.
  strict: false,
  parameters: z.toJSONSchema(searchArguments, { target: 'draft-7', io: 'input' }),
};
const words = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
export function searchEntries(entries: readonly Entry[], args: z.infer<typeof searchArguments>): Entry[] {
  const query = words(args.query);
  return entries.map((entry, index) => {
    const tokens = words(entry.text);
    return { entry, index, score: [...query].filter(word => tokens.has(word)).length };
  }).filter(hit => hit.score > 0).sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, args.limit).map(hit => ({ ...hit.entry }));
}
