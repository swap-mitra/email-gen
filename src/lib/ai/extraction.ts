import { z } from "zod";
import { chatJSON } from "@/lib/ai/openai-client";
import type { FetchedContent } from "@/lib/ingestion/fetch-content";

export const EXTRACTION_MODEL = "gpt-4o-mini";

// Text is truncated before being sent to the model — keeps token usage bounded
// and predictable regardless of source page size.
const MAX_INPUT_CHARS = 8_000;

// ---------------------------------------------------------------------------
// Schema-constrained extraction output
// ---------------------------------------------------------------------------

export const aiExtractedFieldsSchema = z.object({
  title: z.string().nullable(),
  company: z.string().nullable(),
  location: z.string().nullable(),
  employmentType: z.string().nullable(),
  summary: z.string().nullable(),
  keyRequirements: z.array(z.string()),
  contactEmail: z.string().nullable(),
});

export type AiExtractedFields = z.infer<typeof aiExtractedFieldsSchema>;

// Plain JSON Schema mirror of `aiExtractedFieldsSchema` for OpenAI's
// structured-output `response_format`. Kept hand-written and in sync since
// this repo has no zod-to-json-schema dependency.
const AI_EXTRACTED_FIELDS_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: ["string", "null"] },
    company: { type: ["string", "null"] },
    location: { type: ["string", "null"] },
    employmentType: { type: ["string", "null"] },
    summary: { type: ["string", "null"] },
    keyRequirements: { type: "array", items: { type: "string" } },
    contactEmail: { type: ["string", "null"] },
  },
  required: [
    "title",
    "company",
    "location",
    "employmentType",
    "summary",
    "keyRequirements",
    "contactEmail",
  ],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You extract structured opportunity data from a job posting or company career page.
Only use information present in the provided text — never invent details.
Use null for any field that is not present in the text.`;

/**
 * Schema-constrained extraction of normalized opportunity fields via gpt-4o-mini.
 * Throws if OPENAI_API_KEY is not configured or the model output fails validation —
 * callers should fall back to the rule-based extractor from fetch-content.ts.
 */
export async function extractFieldsWithAI(
  content: FetchedContent,
  sourceUrl: string,
): Promise<AiExtractedFields> {
  const userPrompt = [
    `Source URL: ${sourceUrl}`,
    `Page title: ${content.title ?? "(none)"}`,
    `Page description: ${content.description ?? "(none)"}`,
    "",
    "Page text:",
    content.text.slice(0, MAX_INPUT_CHARS),
  ].join("\n");

  const raw = await chatJSON({
    model: EXTRACTION_MODEL,
    system: SYSTEM_PROMPT,
    user: userPrompt,
    schemaName: "extracted_opportunity_fields",
    schema: AI_EXTRACTED_FIELDS_JSON_SCHEMA,
    temperature: 0,
  });

  return aiExtractedFieldsSchema.parse(raw);
}

/**
 * Merges AI-extracted fields into the same normalized-fields shape produced
 * by the rule-based extractor, so downstream consumers (draft generation,
 * UI) see a consistent object regardless of extraction path.
 */
export function toNormalizedFields(
  fields: AiExtractedFields,
  content: FetchedContent,
  sourceUrl: string,
): Record<string, unknown> {
  return {
    title: fields.title ?? content.title,
    description: fields.summary ?? content.description,
    company: fields.company,
    location: fields.location,
    employmentType: fields.employmentType,
    keyRequirements: fields.keyRequirements,
    contactEmail: fields.contactEmail,
    sourceUrl,
    extractedTextLength: content.text.length,
    extractedAt: new Date().toISOString(),
    excerpt: content.text.slice(0, 800) || null,
    aiExtracted: true,
  };
}
