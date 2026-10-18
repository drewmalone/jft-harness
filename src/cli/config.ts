import { z } from 'zod';

/** Cost-conscious Responses tool-calling default; callers may override it. */
export const DEFAULT_MODEL = 'gpt-5.4-mini';

const configSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(
      1,
      'Set OPENAI_API_KEY in your environment or .env before a live run.'
    ),
  model: z.string().trim().min(1, 'OPENAI_MODEL must not be empty')
});

/**
 * Resolves model configuration and requires an API key before a live run.
 * Model precedence is explicit override, OPENAI_MODEL, then DEFAULT_MODEL.
 * @returns Runtime credentials and model; never include this object in traces.
 * @throws If the key or selected model is blank.
 */
export function readModelConfig(modelOverride?: string) {
  return configSchema.parse({
    apiKey: process.env.OPENAI_API_KEY ?? '',
    model: modelOverride ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL
  });
}
