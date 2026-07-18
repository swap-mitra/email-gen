const OPENAI_API_URL = "https://api.openai.com/v1";
const REQUEST_TIMEOUT_MS = 30_000;

function requireApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY must be set to use AI extraction, retrieval, or generation.");
  }
  return apiKey;
}

/**
 * Calls the OpenAI Chat Completions API and returns the parsed JSON content
 * of the first choice. Uses `response_format: json_schema` for schema-constrained
 * generation — the model is forced to emit an object matching `schema`.
 */
export async function chatJSON(args: {
  model: string;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  temperature?: number;
}): Promise<unknown> {
  const apiKey = requireApiKey();

  const res = await fetch(`${OPENAI_API_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: args.model,
      temperature: args.temperature ?? 0.4,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: args.schemaName,
          strict: true,
          schema: args.schema,
        },
      },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI chat completion failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = json.choices.at(0)?.message.content;
  if (!content) {
    throw new Error("OpenAI chat completion returned no content.");
  }

  return JSON.parse(content);
}

/**
 * Calls the OpenAI Embeddings API for a batch of input strings.
 * Returns vectors in the same order as `inputs`.
 */
export async function embedBatch(inputs: string[], model: string): Promise<number[][]> {
  const apiKey = requireApiKey();

  if (inputs.length === 0) return [];

  const res = await fetch(`${OPENAI_API_URL}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: inputs }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI embeddings request failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as {
    data: Array<{ index: number; embedding: number[] }>;
  };

  return json.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

export function isOpenAiConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
