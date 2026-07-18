import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

export function isAnthropicConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

function requireClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY must be set to use AI extraction or generation.");
  }
  return new Anthropic();
}

/**
 * Schema-constrained generation via Claude's structured outputs
 * (`output_config.format`), validated against a Zod schema.
 */
export async function messagesParse<S extends z.ZodTypeAny>(args: {
  model: string;
  system: string;
  user: string;
  schema: S;
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const client = requireClient();

  const response = await client.messages.parse({
    model: args.model,
    max_tokens: args.maxTokens ?? 4096,
    system: args.system,
    messages: [{ role: "user", content: args.user }],
    output_config: { format: zodOutputFormat(args.schema) },
  });

  if (!response.parsed_output) {
    throw new Error("Anthropic response did not include parsed output.");
  }

  return response.parsed_output;
}
