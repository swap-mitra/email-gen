import { z } from "zod";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1";
const REQUEST_TIMEOUT_MS = 30_000;

export function isOpenRouterConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

function requireApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY must be set to use AI extraction or generation.");
  }
  return apiKey;
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

async function callChatCompletions(
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
  apiKey: string,
): Promise<string> {
  const res = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter chat/completions failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenRouter chat/completions response did not include message content.");
  }
  return content;
}

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

/** Returns `undefined` on parse failure instead of throwing, so a malformed
 * first response still flows into the repair-retry path below rather than
 * failing outright. */
function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(stripCodeFences(raw));
  } catch {
    return undefined;
  }
}

/**
 * Schema-constrained chat completion via OpenRouter's OpenAI-compatible API.
 * Free models have unreliable support for strict `json_schema` structured
 * outputs, so this uses looser `response_format: json_object` mode instead.
 * Since that mode only guarantees *valid JSON*, not any particular shape,
 * the schema is rendered to a JSON Schema description and appended to the
 * system prompt so the model actually knows the expected field names —
 * without this, free models reliably invent their own field names and fail
 * validation on the first try.
 *
 * Client-side Zod validation with exactly one repair retry follows: a
 * network/empty-response failure is retried verbatim, while a
 * validation failure is retried with the model's own bad output and the
 * Zod error shown back to it.
 */
export async function chatJson<S extends z.ZodTypeAny>(args: {
  model: string;
  system: string;
  user: string;
  schema: S;
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const apiKey = requireApiKey();
  const maxTokens = args.maxTokens ?? 4096;
  const schemaDescription = JSON.stringify(z.toJSONSchema(args.schema));
  const system = `${args.system}\n\nRespond with ONLY a single JSON object matching this JSON Schema — no prose, no markdown code fences:\n${schemaDescription}`;
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: args.user },
  ];

  let firstRaw: string | undefined;
  try {
    firstRaw = await callChatCompletions(messages, args.model, maxTokens, apiKey);
  } catch {
    // Network hiccup or an empty/malformed response body — retry the same
    // request verbatim once before giving up.
    firstRaw = await callChatCompletions(messages, args.model, maxTokens, apiKey);
  }

  const firstResult = args.schema.safeParse(tryParseJson(firstRaw));
  if (firstResult.success) return firstResult.data;

  const repairMessages: ChatMessage[] = [
    ...messages,
    { role: "assistant", content: firstRaw },
    {
      role: "user",
      content: [
        "That response was invalid for the required schema.",
        `Validation errors: ${firstResult.error.message}`,
        "Reply with ONLY corrected JSON matching the schema — no prose, no markdown code fences.",
      ].join("\n"),
    },
  ];
  const secondRaw = await callChatCompletions(repairMessages, args.model, maxTokens, apiKey);
  const secondResult = args.schema.safeParse(tryParseJson(secondRaw));
  if (secondResult.success) return secondResult.data;

  throw new Error(
    `OpenRouter response failed schema validation after repair retry: ${secondResult.error.message}`,
  );
}
