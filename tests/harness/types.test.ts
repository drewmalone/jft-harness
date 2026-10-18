import { it, expectTypeOf } from 'vitest';
import type { ModelRequest } from '../../src/providers/model.js';
import type { Entry } from '../../src/journal/validation.js';
import type { RunOutcome } from '../../src/harness/run.js';
import type { ToolOutput } from '../../src/tools/search-entries.js';

// npm run typecheck verifies these contracts; Vitest discovers the assertions
// alongside the behavioral suite without adding runtime validation machinery.
it('requires an answer for success and an error for failure', () => {
  expectTypeOf<{ termination: 'completed' }>().not.toMatchTypeOf<RunOutcome>();
  expectTypeOf<{
    termination: 'provider_error';
  }>().not.toMatchTypeOf<RunOutcome>();
  expectTypeOf<{
    termination: 'completed';
    answer: string;
    error: string;
  }>().not.toMatchTypeOf<RunOutcome>();

  expectTypeOf<
    Extract<RunOutcome, { termination: 'completed' }>['answer']
  >().toEqualTypeOf<string>();
  expectTypeOf<
    Exclude<RunOutcome, { termination: 'completed' }>['error']
  >().toEqualTypeOf<string>();
});

it('prevents tool outputs from containing both entries and an error', () => {
  expectTypeOf<{
    entries: Entry[];
    error: { code: 'tool_error'; message: string };
  }>().not.toMatchTypeOf<ToolOutput>();
  expectTypeOf<Record<string, never>>().not.toMatchTypeOf<ToolOutput>();
});

it('requires journal data only for full-context requests and an explicit mode', () => {
  type Base = {
    instructions: string;
    question: string;
    results: [];
  };

  expectTypeOf<Base>().not.toMatchTypeOf<ModelRequest>();
  expectTypeOf<
    Base & { contextMode: 'full' }
  >().not.toMatchTypeOf<ModelRequest>();
  expectTypeOf<
    Base & { contextMode: 'retrieval'; journal: Entry[] }
  >().not.toMatchTypeOf<ModelRequest>();
  expectTypeOf<
    Base & { contextMode: 'full'; journal: Entry[] }
  >().toMatchTypeOf<ModelRequest>();
  expectTypeOf<
    Base & { contextMode: 'retrieval' }
  >().toMatchTypeOf<ModelRequest>();
});
