// ---------------------------------------------------------------------------
// Human-readable labels and formatting shared across dashboard surfaces.
// ---------------------------------------------------------------------------

export const ACTIVITY_LABELS: Record<string, string> = {
  "workspace.provisioned": "Workspace provisioned",
  "opportunity.created": "Opportunity created",
  "opportunity.reingest_requested": "Ingestion retry requested",
  "opportunity.ingest_started": "Ingestion started",
  "opportunity.ingest_completed": "Ingestion completed",
  "opportunity.ingest_failed": "Ingestion failed",
  "opportunity.browser_fallback_used": "Browser fallback used",
  "opportunity.browser_fallback_failed": "Browser fallback failed",
  "opportunity.browser_fallback_skipped": "Browser fallback skipped",
  "opportunity.ai_extraction_skipped": "AI extraction skipped",
  "knowledge_item.created": "Knowledge item added",
  "knowledge_item.embedded": "Knowledge item embedded",
  "knowledge_item.embedding_failed": "Knowledge embedding failed",
  "knowledge_item.embedding_skipped": "Knowledge embedding skipped",
  "draft.created": "Draft created",
  "draft.generation_started": "Draft generation started",
  "draft.generation_completed": "Draft generated",
  "draft.generation_failed": "Draft generation failed",
  "draft.revised": "Draft revised",
  "draft.approved": "Draft approved",
};

export function formatActivityKind(kind: string): string {
  return ACTIVITY_LABELS[kind] ?? kind.replaceAll("_", " ").replace(".", " · ");
}

export const DRAFT_STATE_LABELS: Record<string, string> = {
  knowledge_matched: "Knowledge matched",
  draft_generated: "Generated",
  draft_reviewed: "Reviewed",
  approved_for_send: "Approved for send",
};

export function formatDraftState(state: string): string {
  return DRAFT_STATE_LABELS[state] ?? state.replaceAll("_", " ");
}

/** Badge modifier class for a draft workflow state. */
export function draftStateBadgeClass(state: string): string {
  return state === "approved_for_send" ? "opp-badge opp-badge-completed" : "opp-badge";
}

/** Human-readable label from a camelCase or snake_case field key. */
export function formatFieldKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Flatten extracted fields into displayable [label, value] pairs, skipping nested objects. */
export function displayableFields(
  fields: Record<string, unknown> | null | undefined,
  max = 10,
): [string, string][] {
  if (!fields) return [];
  const pairs: [string, string][] = [];
  for (const [key, value] of Object.entries(fields)) {
    let rendered: string | null = null;
    if (typeof value === "string") rendered = value;
    else if (typeof value === "number" || typeof value === "boolean") rendered = String(value);
    else if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
      rendered = (value as string[]).join(", ");
    }
    if (rendered && rendered.trim().length > 0) {
      pairs.push([formatFieldKey(key), rendered.trim()]);
    }
    if (pairs.length >= max) break;
  }
  return pairs;
}

/** Best-effort display title for an opportunity from its extracted fields. */
export function opportunityTitle(
  fields: Record<string, unknown> | null | undefined,
  fallback: string,
): string {
  if (!fields) return fallback;
  const pick = (keys: string[]) => {
    for (const key of keys) {
      const value = fields[key];
      if (typeof value === "string" && value.trim().length > 0) return value.trim();
    }
    return null;
  };
  const role = pick(["title", "jobTitle", "job_title", "role", "position"]);
  const company = pick(["company", "companyName", "company_name", "organization"]);
  if (role && company) return `${role} — ${company}`;
  return role ?? company ?? fallback;
}

/** Hostname of a URL for compact display; falls back to the raw string. */
export function urlHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}
