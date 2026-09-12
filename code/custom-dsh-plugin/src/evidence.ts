/**
 * Evidence resolution: which session a request belongs to, the exact pending tool call read
 * out of the session log, the trust bucketing of recent messages, and the bounded read-only
 * inspection the reviewer may request.
 *
 * The trust bucketing is the security-relevant part: only the human's own words and injected
 * project instruction files may establish user authorization. Everything else is context.
 */
import { blockText, clipText, errorText } from "./text.js";
import type { ReviewerConfig } from "./config.js";
import type {
  ApprovalRequest,
  FsService,
  FsTarget,
  ReviewerSession,
  SessionEvent,
  SessionsService,
} from "./types.js";

/** A live session resolved from an approval request, with the two header fields read out. */
export interface FoundSession {
  session: ReviewerSession;
  id: string;
  cwd: string;
}

export interface SourceInfo {
  kind: string;
  form: string;
  baseline: boolean;
}

export interface ContextItem {
  label: string;
  text: string;
}

/** Everything the prompt builder needs about the pending action and its surroundings. */
export interface Evidence {
  toolName: string;
  arguments: string;
  cwd: string;
  sessionId: string;
  humanTexts: string[];
  instructionTexts: string[];
  contextTexts: ContextItem[];
}

export interface Finding {
  path: string;
  result: string;
}

const UNKNOWN_SOURCE: SourceInfo = { kind: "unknown", form: "", baseline: false };

/** Resolve the live session behind an approval request without doing the full evidence sweep. */
export function sessionOf(
  sessions: SessionsService,
  req: ApprovalRequest,
): FoundSession | undefined {
  const agentId = req.agent !== undefined && typeof req.agent.id === "string" ? req.agent.id : "";
  const session = sessions.get(agentId);
  if (session === undefined) return undefined;
  const header = session.header;
  return {
    session,
    id: header !== undefined && typeof header.id === "string" ? header.id : "",
    cwd: header !== undefined && typeof header.cwd === "string" ? header.cwd : "",
  };
}

/** Classify one `user/message` event by where it came from. */
export function sourceInfo(event: SessionEvent): SourceInfo {
  const data = event.data;
  if (data === null || typeof data !== "object") return UNKNOWN_SOURCE;
  const source: unknown = data.source;
  if (source === null || typeof source !== "object") return UNKNOWN_SOURCE;
  const record = source as Record<string, unknown>;
  return {
    kind: typeof record.kind === "string" ? record.kind : "unknown",
    form: typeof record.form === "string" ? record.form : "",
    baseline: record.baseline === true,
  };
}

/** The most recent baseline instruction plus the most recent instruction change, deduped. */
export function instructionList(baseline: string, latest: string): string[] {
  if (baseline === "" && latest === "") return [];
  if (baseline === "") return [latest];
  if (latest === "" || latest === baseline) return [baseline];
  return [baseline, latest];
}

export function gatherEvidence(
  found: FoundSession | undefined,
  req: ApprovalRequest,
  config: ReviewerConfig,
): Evidence | undefined {
  if (found === undefined) return undefined;
  let actionName = "";
  let actionArgs = "";
  const humanTexts: string[] = [];
  const contextTexts: ContextItem[] = [];
  let lastInstruction = "";
  let lastBaselineInstruction = "";
  const events = found.session.snapshotEvents();
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.type === "tool/call") {
      const data = event.data;
      if (data === undefined) continue;
      if (req.callId !== undefined && data.callId === req.callId) {
        actionName = typeof data.name === "string" ? data.name : "";
        actionArgs = clipText(data.arguments, config.maxToolArgChars);
      }
    } else if (event.type === "user/message") {
      const data = event.data;
      if (data === undefined) continue;
      const text = blockText(data.content).trim();
      if (text === "") continue;
      const source = sourceInfo(event);
      if (source.kind === "user") {
        humanTexts.push(clipText(text, config.maxUserChars));
      } else if (source.form === "instructions") {
        const clipped = clipText(text, config.maxInstructionChars);
        lastInstruction = clipped;
        if (source.baseline === true) lastBaselineInstruction = clipped;
      } else {
        const label = source.form === "" ? source.kind : source.kind + "/" + source.form;
        contextTexts.push({ label, text: clipText(text, config.maxContextChars) });
      }
    }
  }
  return {
    toolName: actionName,
    arguments: actionArgs,
    cwd: found.cwd,
    sessionId: found.id,
    humanTexts: humanTexts.slice(-config.recentUserMessages),
    instructionTexts: instructionList(lastBaselineInstruction, lastInstruction),
    contextTexts: contextTexts.slice(-config.recentContextMessages),
  };
}

/** Bounded read-only inspection, gated to the workspace root. */
export async function inspectPaths(
  fs: FsService,
  cwd: string,
  paths: readonly string[],
  config: ReviewerConfig,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  let rootTarget: FsTarget;
  try {
    rootTarget = await fs.resolve(cwd);
  } catch {
    rootTarget = undefined;
  }
  const limit = Math.min(paths.length, config.maxInspectPaths);
  for (let i = 0; i < limit; i++) {
    const raw = paths[i];
    try {
      const target = await fs.resolve(raw, { cwd });
      if (rootTarget !== undefined && fs.contains(rootTarget, target) !== true) {
        findings.push({ path: raw, result: "refused - outside the workspace root" });
        continue;
      }
      const info = await fs.stat(target);
      if (info === undefined) {
        findings.push({ path: raw, result: "does not exist" });
        continue;
      }
      if (info.type === "directory") {
        const entries = await fs.listDir(target);
        const names: string[] = [];
        for (let j = 0; j < entries.length && j < 40; j++) {
          const entry = entries[j];
          if (entry !== null && typeof entry === "object" && typeof entry.name === "string") {
            names.push(entry.type === "directory" ? entry.name + "/" : entry.name);
          }
        }
        findings.push({
          path: raw,
          result: "directory with " + String(entries.length) + " entries: " + names.join(", "),
        });
        continue;
      }
      if (info.type !== "file") {
        findings.push({ path: raw, result: "not a regular file (" + String(info.type) + ")" });
        continue;
      }
      const bytes = await fs.readByteRange(target, { offset: 0, length: config.maxInspectBytes });
      let text = "";
      if (bytes !== null && bytes !== undefined && typeof bytes.length === "number") {
        text = new TextDecoder().decode(bytes);
      }
      const size = typeof info.size === "number" ? " (" + String(info.size) + " bytes)" : "";
      findings.push({ path: raw, result: "file" + size + ":\n" + clipText(text, 4000) });
    } catch (error) {
      findings.push({ path: raw, result: "unavailable: " + clipText(errorText(error), 200) });
    }
  }
  return findings;
}
