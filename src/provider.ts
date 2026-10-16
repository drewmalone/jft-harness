import OpenAI from 'openai';
import type { ResponseInputItem } from 'openai/resources/responses/responses';
import { searchTool } from './tools/search-entries.js';
import type { ModelAdapter, ModelRequest, Turn } from './types.js';

// One adapter per run: history includes opaque reasoning/output items, not just text.
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
