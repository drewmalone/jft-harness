import { it, expect, vi } from 'vitest';

const { create, constructor } = vi.hoisted(() => ({
  create: vi.fn(),
  constructor: vi.fn()
}));
vi.mock('openai', () => ({ default: class {
    responses = { create };
    constructor(options: unknown) {
      constructor(options);
    }
  } }));
import { OpenAIAdapter } from '../src/provider.js';

it('replays reasoning, messages and function calls with exact call IDs and disables retries/storage', async () => {
  const output = [
    {
      type: 'reasoning',
      id: 'rs1',
      summary: []
    },
    {
      type: 'function_call',
      id: 'fc1',
      call_id: 'call1',
      name: 'search_entries',
      arguments: '{"query":"walk"}'
    },
  ];
  create.mockResolvedValueOnce({
    output,
    output_text: '',
    status: 'completed',
    usage: { total_tokens: 10 }
  })
    .mockResolvedValueOnce({
    output: [{
        type: 'message',
        id: 'm1',
        role: 'assistant',
        status: 'completed',
        content: [{
            type: 'output_text',
            text: 'Answer',
            annotations: []
          }]
      }],
    output_text: 'Answer',
    status: 'completed'
  });
  const adapter = new OpenAIAdapter('test-model', 'test-key');
  const signal = new AbortController().signal;
  const first = await adapter.request({
    instructions: 'context',
    question: 'question',
    results: []
  }, signal);
  expect(first.calls[0]?.id).toBe('call1');
  const second = await adapter.request({
    instructions: 'context',
    question: 'question',
    results: [{
        callId: 'call1',
        output: { entries: [] }
      }]
  }, signal);
  expect(second.text).toBe('Answer');
  const request = create.mock.calls[1]?.[0];
  expect(request).toMatchObject({
    model: 'test-model',
    store: false,
    instructions: 'context'
  });
  expect(request.input.slice(0, 4)).toEqual([{
      role: 'user',
      content: 'question'
    }, ...output, {
      type: 'function_call_output',
      call_id: 'call1',
      output: '{"entries":[]}'
    }]);
  expect(constructor).toHaveBeenCalledWith({
    apiKey: 'test-key',
    maxRetries: 0
  });
  expect(create.mock.calls[1]?.[1]).toEqual({ signal });
});
