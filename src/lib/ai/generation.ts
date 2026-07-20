import { z } from "zod";
import { chatJson } from "@/lib/ai/openrouter-client";
import type { KnowledgeItem, Opportunity } from "@/db/schema";

export const GENERATION_MODEL =
  process.env.OPENROUTER_GENERATION_MODEL ?? "nvidia/nemotron-3-super-120b-a12b:free";

export const generatedDraftSchema = z.object({
  subject: z.string(),
  body: z.string(),
});

export type GeneratedDraft = z.infer<typeof generatedDraftSchema>;

const SYSTEM_PROMPT = `You write concise, grounded outbound emails for sales/business development outreach.
Only reference facts present in the opportunity data or the provided knowledge evidence — never invent claims about the company or product.
If no knowledge evidence is provided, write a shorter, more general email and do not fabricate specifics.
Keep the tone professional, warm, and specific to the opportunity. Avoid generic filler.`;

/**
 * Grounded generation: combines normalized opportunity data with retrieved
 * knowledge items to produce a subject + body via an OpenRouter chat model.
 * Throws if OPENROUTER_API_KEY is not configured — draft generation requires AI.
 */
export async function generateDraftEmail(args: {
  opportunity: Pick<Opportunity, "sourceUrl" | "normalizedFields">;
  knowledgeItems: Pick<KnowledgeItem, "id" | "title" | "content">[];
}): Promise<GeneratedDraft> {
  const { opportunity, knowledgeItems } = args;

  const fields = opportunity.normalizedFields ?? {};
  const opportunitySection = [
    `Source URL: ${opportunity.sourceUrl}`,
    ...Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
  ].join("\n");

  const evidenceSection =
    knowledgeItems.length > 0
      ? knowledgeItems.map((item, idx) => `[${idx + 1}] ${item.title}\n${item.content}`).join("\n\n")
      : "(no knowledge evidence retrieved)";

  const userPrompt = [
    "Opportunity data:",
    opportunitySection,
    "",
    "Knowledge evidence for grounding:",
    evidenceSection,
    "",
    "Write a subject line and email body for this outreach.",
  ].join("\n");

  return chatJson({
    model: GENERATION_MODEL,
    system: SYSTEM_PROMPT,
    user: userPrompt,
    schema: generatedDraftSchema,
    maxTokens: 4096,
  });
}
