import { z } from 'zod';

export const DEFAULT_MODEL = 'gpt-5.4-mini';

const configSchema = z.object({
  apiKey: z.string().trim().min(1, 'Set OPENAI_API_KEY in your environment or .env before a live run.'),
  model: z.string().trim().min(1, 'OPENAI_MODEL must not be empty'),
});

export function readModelConfig(modelOverride?: string) {
  return configSchema.parse({
    apiKey: process.env.OPENAI_API_KEY ?? '',
    model: modelOverride ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
  });
}
