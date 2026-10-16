import { z } from 'zod';
import type { Entry } from '../entries.js';

/** Untrusted tool argument schema; supplies limit 5 and rejects limits above 10. */
export const searchArguments = z.object({
  query: z.string().trim().min(1).max(1000),
  limit: z.number().int().min(1).max(10).default(5),
}).strict();

/** Parsed search input, including the resolved result limit. */
export type SearchArguments = z.infer<typeof searchArguments>;

/** Responses API tool declaration generated from the local validation schema. */
export const searchTool = {
  type: 'function' as const,
  name: 'search_entries',
  description: 'Search untrusted fictional journal text using exact case-insensitive keywords. Use short keywords; no semantic matching.',
  // Non-strict API schema permits the optional limit; Zod always validates locally.
  strict: false,
  parameters: z.toJSONSchema(searchArguments, { target: 'draft-7', io: 'input' }),
};

const wordSegmenter = new Intl.Segmenter('en', { granularity: 'word' });

function tokenize(text: string): Set<string> {
  const segments = wordSegmenter.segment(text.toLowerCase());
  const words = [...segments]
    .filter(segment => segment.isWordLike)
    .map(segment => segment.segment);
  return new Set(words);
}

/**
 * Searches text using distinct case-insensitive Intl.Segmenter word tokens.
 *
 * Ranking counts overlapping query tokens; ties preserve fixture order. There
 * is no stemming, synonym expansion, or date filtering. Entries are not mutated.
 *
 * @param args - Already validated arguments; callers must parse untrusted input.
 * @returns Up to the requested limit of copied entries, or an empty array.
 */
export function searchEntries(entries: readonly Entry[], args: SearchArguments): Entry[] {
  const queryTokens = tokenize(args.query);
  const scoredEntries = entries.map((entry, fixtureIndex) => {
    const entryTokens = tokenize(entry.text);
    const matchingTokens = [...queryTokens].filter(token => entryTokens.has(token));
    return { entry, fixtureIndex, score: matchingTokens.length };
  });

  const matches = scoredEntries.filter(match => match.score > 0);
  matches.sort((first, second) => {
    const scoreDifference = second.score - first.score;
    if (scoreDifference !== 0) {
      return scoreDifference;
    }
    return first.fixtureIndex - second.fixtureIndex;
  });

  return matches.slice(0, args.limit).map(match => ({ ...match.entry }));
}
