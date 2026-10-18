import OpenAI from 'openai';
import type { ResponseInputItem } from 'openai/resources/responses/responses';
import { searchTool } from '../tools/search-entries.js';
import type { ModelAdapter, ModelRequest, Turn } from '../harness/types.js';

/**
 * Maps one harness run to OpenAI Responses requests and continuation items.
 *
 * Create one instance per run and call it sequentially. Local history retains
 * complete reasoning, message, and function-call items; the harness's plain
 * logical transcript is not sufficient for provider continuation.
 * Requests disable SDK retries and server-side response storage.
 */
export class OpenAIAdapter implements ModelAdapter {
  readonly provider = 'openai';
  private readonly client: OpenAI;
  private history: ResponseInputItem[] = [];

  constructor(readonly model: string, apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      maxRetries: 0
    });
  }

  /**
   * Appends correlated tool outputs and requests the next model turn.
   *
   * The question is appended only on the first request; instructions are sent
   * every time. Encrypted reasoning content permits stateless continuation.
   * Returned raw responses contain provider evidence for tracing, not headers.
   *
   * @throws On API/transport failures, cancellation, or unsupported output items.
   * Discard this adapter after failure; mutated history is not rolled back.
   */
  async request(input: ModelRequest, signal: AbortSignal): Promise<Turn> {
    if (!this.history.length) {
      this.history.push({
        role: 'user',
        content: input.question
      });
    }

    for (const result of input.results) {
      this.history.push({
        type: 'function_call_output',
        call_id: result.callId,
        output: JSON.stringify(result.output)
      });
    }

    const response = await this.client.responses.create({
      model: this.model,
      instructions: input.instructions,
      input: this.history,
      tools: [searchTool],
      store: false,
      include: ['reasoning.encrypted_content'],
    }, { signal });

    for (const item of response.output) {
      if (item.type === 'message' || item.type === 'reasoning' || item.type === 'function_call') {
        this.history.push(item);
      } else {
        throw new Error(`Unsupported provider output item: ${item.type}`);
      }
    }

    const calls = response.output
      .filter(item => item.type === 'function_call')
      .map(item => ({
        id: item.call_id,
        name: item.name,
        arguments: item.arguments,
      }));

    return {
      text: response.output_text,
      calls,
      status: response.status,
      usage: response.usage,
      raw: response,
    };
  }
}
