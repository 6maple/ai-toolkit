/**
 * Text helpers, the reviewer-verdict parser, and the ONE production mapping from a verdict
 * to an approval outcome. Kept together because the mapping's correctness is the plugin's
 * core safety property, and the parser is what feeds it.
 */

export type VerdictOutcome = "allow" | "deny" | "unsure";

export interface Verdict {
  outcome: VerdictOutcome;
  risk: string;
  authorization: string;
  rationale: string;
  /** Workspace paths the reviewer wants inspected before it will decide. */
  need: string[];
}

/** What the plugin does with one request. `defer` means "hand it to the human". */
export type ApprovalAction = "allowed-once" | "rejected" | "defer";

/** Join the text blocks of a message's content array; anything else is ignored. */
export function blockText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (let i = 0; i < content.length; i++) {
    const block: unknown = content[i];
    if (
      block !== null &&
      typeof block === "object" &&
      (block as { type?: unknown }).type === "text"
    ) {
      const text = (block as { text?: unknown }).text;
      if (typeof text === "string") parts.push(text);
    }
  }
  return parts.join("\n");
}

export function clipText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.length > max ? value.slice(0, max) + "\n...[truncated]" : value;
}

export function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error === "number" || typeof error === "boolean") return String(error);
  if (error === null || error === undefined) return error === null ? "null" : "undefined";
  if (typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
    try {
      const json = JSON.stringify(error);
      if (json !== undefined) return json;
    } catch {
      // Circular or otherwise unserializable: fall through to the generic text below.
    }
  }
  return "[unprintable error]";
}

/**
 * Parse the reviewer's reply. The model is asked for bare JSON, but a fenced or chatty reply
 * is common enough that the first `{` to the last `}` is the real contract; anything that does
 * not yield one of the three outcomes is `undefined`, which the caller treats as "hand to the
 * human".
 */
export function parseDecision(raw: unknown): Verdict | undefined {
  if (typeof raw !== "string") return undefined;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== "object") return undefined;
  const record = parsed as Record<string, unknown>;
  const outcome = typeof record.outcome === "string" ? record.outcome.trim().toLowerCase() : "";
  if (outcome !== "allow" && outcome !== "deny" && outcome !== "unsure") return undefined;
  const need: string[] = [];
  if (Array.isArray(record.need)) {
    for (let i = 0; i < record.need.length && need.length < 3; i++) {
      const entry: unknown = record.need[i];
      if (typeof entry === "string" && entry.trim() !== "") need.push(clipText(entry.trim(), 400));
    }
  }
  return {
    outcome,
    risk:
      typeof record.risk_level === "string" ? record.risk_level.trim().toLowerCase() : "unknown",
    authorization:
      typeof record.user_authorization === "string"
        ? record.user_authorization.trim().toLowerCase()
        : "unknown",
    rationale: clipText(typeof record.rationale === "string" ? record.rationale.trim() : "", 400),
    need,
  };
}

/**
 * The ONE production mapping from a reviewer verdict to an approval outcome.
 * dryRun never claims a request, whatever the verdict says.
 */
export function decide(
  verdict: { readonly outcome: string },
  autoDeny: boolean,
  dryRun: boolean,
): ApprovalAction {
  if (dryRun === true) return "defer";
  if (verdict.outcome === "allow") return "allowed-once";
  if (verdict.outcome === "deny" && autoDeny === true) return "rejected";
  return "defer";
}
