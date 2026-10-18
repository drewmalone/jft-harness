import { it, expectTypeOf } from 'vitest';
import type { Entry } from '../../src/journal/entries.js';
import type { RunOutcome, ToolOutput } from '../../src/harness/types.js';

// npm run typecheck verifies these contracts; Vitest discovers the assertions
// alongside the behavioral suite without adding runtime validation machinery.
it('requires an answer for success and an error for failure', () => {
  expectTypeOf<{ termination: 'completed' }>().not.toMatchTypeOf<RunOutcome>();
  expectTypeOf<{ termination: 'provider_error' }>().not.toMatchTypeOf<RunOutcome>();
  expectTypeOf<{
    termination: 'completed';
    answer: string;
    error: string;
  }>().not.toMatchTypeOf<RunOutcome>();

  expectTypeOf<Extract<RunOutcome, { termination: 'completed' }>['answer']>()
    .toEqualTypeOf<string>();
  expectTypeOf<Exclude<RunOutcome, { termination: 'completed' }>['error']>()
    .toEqualTypeOf<string>();
});

it('prevents tool outputs from containing both entries and an error', () => {
  expectTypeOf<{
    entries: Entry[];
    error: { code: 'tool_error'; message: string };
  }>().not.toMatchTypeOf<ToolOutput>();
  expectTypeOf<{}>().not.toMatchTypeOf<ToolOutput>();
});
