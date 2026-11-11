import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { addAbortSignal } from "node:stream";
import {
  PUBLIC_BRAIN_TOOLS,
  type BrainToolName,
} from "../../brain/src/integration/public-tools.ts";
import { CliError } from "./errors.ts";
import { definition as stepDefinition } from "../../brain/step/index.mjs";
import { BRAIN_EXPLICIT_STEP_INSTRUCTION } from "../../brain/src/integration/model-facing-text.ts";

interface Command {
  tool: BrainToolName;
  usage: string;
  description: string;
  positional: readonly string[];
  options: readonly string[];
}

export const COMMANDS: Record<string, Command> = {
  think: {
    tool: "brain_think",
    usage: "think",
    description:
      "Establish this turn's Brain entry (advances learning cycles and attempts a history checkpoint).",
    positional: [],
    options: ["session"],
  },
  step: {
    tool: "brain_step",
    usage: "step <start|submit-work|submit-review|confirm-review|update|read> [options] | step --schema",
    description: BRAIN_EXPLICIT_STEP_INSTRUCTION,
    positional: [],
    options: [
      "session", "input-file", "schema", "message", "message-file", "result", "result-file",
      "old-text", "new-text", "old-text-file", "new-text-file", "edits-file",
    ],
  },
  cat: {
    tool: "brain_cat",
    usage: "cat <path> [--offset N] [--limit N]",
    description: "Read a Core, archival cognition or @brain-virtual view; continue at next_offset.",
    positional: ["path"],
    options: ["offset", "limit"],
  },
  ls: {
    tool: "brain_ls",
    usage: "ls <memories-directory>",
    description: "List direct children of an archival directory.",
    positional: ["path"],
    options: [],
  },
  glob: {
    tool: "brain_glob",
    usage: "glob <pattern> [--path <directory>]",
    description:
      "Match complete public archival paths. Omitted --path includes available related projects.",
    positional: ["pattern"],
    options: ["path"],
  },
  grep: {
    tool: "brain_grep",
    usage:
      "grep <pattern> [--path <directory>] [--glob <pattern>] [--literal] [--ignore-case] [--context N]",
    description: "Search archival Markdown; regular expressions by default.",
    positional: ["pattern"],
    options: ["path", "glob", "literal", "ignore-case", "context"],
  },
  "ask-search": {
    tool: "brain_ask_search",
    usage: "ask-search <query>",
    description: "Search by meaning using the existing optional semantic runtime.",
    positional: ["query"],
    options: [],
  },
  write: {
    tool: "brain_write",
    usage: "write <path> --content-file <file|->",
    description:
      "Create archival cognition or deliberately replace its identity. Use edit for a revision.",
    positional: ["path"],
    options: ["content-file"],
  },
  edit: {
    tool: "brain_edit",
    usage: "edit <path> (--content-file <file|-> | --edits-file <file|->)",
    description: "Revise the same cognition. Nonempty Core requires exact edits.",
    positional: ["path"],
    options: ["content-file", "edits-file"],
  },
  mv: {
    tool: "brain_mv",
    usage: "mv <src> <dst>",
    description:
      "Move archival cognition with identity/state; an existing destination is replaced.",
    positional: ["src", "dst"],
    options: [],
  },
  rm: {
    tool: "brain_rm",
    usage: "rm <path>",
    description:
      "Remove one active archival cognition, not a Core, directory or supporting assets.",
    positional: ["path"],
    options: [],
  },
  feedback: {
    tool: "brain_feedback",
    usage: "feedback <path> <adopt|question|resolve> [--challenge-file <file|->]",
    description:
      "Record validated use or maintain a current challenge. question requires a challenge.",
    positional: ["path", "feedback"],
    options: ["challenge-file"],
  },
  "absolute-path": {
    tool: "brain_absolute_path",
    usage: "absolute-path <path>",
    description: "Map a public Brain location to a local path; does not read/create that target.",
    positional: ["path"],
    options: [],
  },
};

const STEP_ACTIONS: Record<string, string> = {
  start: "start",
  "submit-work": "submit_work",
  "submit-review": "submit_review",
  "confirm-review": "confirm_review",
  update: "update",
  read: "read",
};
const STEP_INPUT_OPTIONS = [
  "message", "message-file", "result", "result-file",
  "old-text", "new-text", "old-text-file", "new-text-file", "edits-file",
] as const;
const COMMON = ["project", "brain-root", "json", "help", "version"];
const BOOLEAN = new Set(["json", "help", "version", "literal", "ignore-case", "schema"]);
const OPTIONS = Object.fromEntries(
  [...new Set([...COMMON, ...Object.values(COMMANDS).flatMap((command) => command.options)])].map(
    (name) => [name, { type: BOOLEAN.has(name) ? "boolean" : "string", ...(["old-text", "new-text"].includes(name) ? { multiple: true } : {}) }],
  ),
) as Record<string, { type: "boolean" | "string" }>;

export interface Invocation {
  command: string;
  tool: BrainToolName;
  args: Record<string, unknown>;
  project: string;
  brainRoot?: string;
  sessionId?: string;
  json: boolean;
}

export function help(command?: string): string {
  const spec = command === undefined ? undefined : COMMANDS[command];
  if (command !== undefined && spec === undefined)
    throw new CliError("usage", `Unknown command: ${command}`, 2);
  return [
    "brain-skill — Brain CLI for explicitly selected AI skills",
    "",
    ...(spec === undefined
      ? [
          "Usage: brain-skill [options] <command> [arguments]",
          "",
          ...Object.entries(COMMANDS).map(
            ([name, item]) => `  ${name.padEnd(15)} ${item.description}`,
          ),
        ]
      : [
          `Usage: brain-skill ${spec.usage}`,
          "",
          spec.description,
          ...(command === "step"
            ? [
                "",
                "按每次返回的当前 Markdown 任务继续；首次成果用 submit-work --result，已由 update 保存的修正成果用 submit-work。",
                "完整检视无实质问题用 submit-review，最后简短确认无问题用 confirm-review；有实际问题才传 --result。",
                "update 修改已保存 State 中的唯一匹配文本；read 只读取 State，不推进任务。",
                "Step actions: start, submit-work, submit-review, confirm-review, update, read.",
                "  step start --message <text>                   Start this user turn",
                "  step submit-work --result <markdown>          Submit a new work result",
                "  step submit-review [--result <markdown>]      Empty result means no issues",
                "  step confirm-review [--result <markdown>]     Empty result means no issues",
                "  step update --old-text <text> --new-text <text>  Edit the saved State",
                "  step read                                     Read the saved State",
                "Use --message-file - or --result-file - for long UTF-8 text via stdin; other filenames work too.",
                "For multiple replacements, repeat --old-text and --new-text in the same order.",
                "For a single long edit pair, use --old-text-file and --new-text-file.",
                "Use step --schema only when the underlying JSON protocol is needed.",
              ]
            : []),
          ...(["think", "step"].includes(command ?? "")
            ? [
                "",
                "--session <id>: real host conversation ID; otherwise BRAIN_SESSION_ID, CODEX_THREAD_ID or CLAUDE_CODE_SESSION_ID.",
                "Successful think creates a CLI turn. Keep session/project/brain-root unchanged for subsequent step calls.",
              ]
            : []),
        ]),
    "",
    "Common options (before or after the command):",
    "  --project <directory>     Project source root (default: current directory)",
    "  --brain-root <directory>  Brain data root (default: ~/.brain-data)",
    "  --json                    One JSON result on stdout, including errors",
    "  --help                    Show help; use <command> --help for syntax",
    "  --version                 Show version",
    "",
    "Public paths: @global, @project, configured #alias; quote paths and glob patterns.",
    "Content/edits/challenge/input files are UTF-8; '-' reads stdin. Commands never prompt.",
    "Examples: brain-skill think | brain-skill cat '@project/core.md'",
  ].join("\n");
}

async function inputFile(filename: string, signal?: AbortSignal): Promise<string> {
  if (filename !== "-")
    return (await readFile(filename, { encoding: "utf8", signal })).replace(/^\uFEFF/, "");
  if (process.stdin.isTTY)
    throw new CliError("usage", "Pipe input when using '-', or provide a UTF-8 file.", 2);
  if (signal !== undefined) addAbortSignal(signal, process.stdin);
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks)
    .toString("utf8")
    .replace(/^\uFEFF/, "");
}

async function stepRequest(
  action: string,
  values: Record<string, string | boolean | (string | boolean)[] | undefined>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const allowed = action === "start"
    ? ["message", "message-file"]
    : ["submit_work", "submit_review", "confirm_review"].includes(action)
      ? ["result", "result-file"]
      : action === "update"
        ? ["old-text", "new-text", "old-text-file", "new-text-file", "edits-file"]
        : [];
  for (const name of STEP_INPUT_OPTIONS) {
    if (values[name] !== undefined && !allowed.includes(name))
      throw new CliError("usage", `--${name} is not valid for step ${action.replaceAll("_", "-")}.`, 2);
  }
  async function textArg(name: "message" | "result" | "old-text" | "new-text") {
    const inline = values[name];
    const file = values[`${name}-file`];
    if (inline !== undefined && file !== undefined)
      throw new CliError("usage", `Use only one of --${name} and --${name}-file.`, 2);
    if (file !== undefined) return inputFile(String(file), signal);
    return inline === undefined ? undefined : String(inline);
  }
  if (action === "start") {
    const message = await textArg("message");
    if (!message) throw new CliError("usage", "step start requires --message or --message-file.", 2);
    return { action, message };
  }
  if (["submit_work", "submit_review", "confirm_review"].includes(action)) {
    const result = await textArg("result");
    return { action, ...(result === undefined ? {} : { result }) };
  }
  if (action === "update") {
    if (values["edits-file"] !== undefined) {
      if (["old-text", "new-text", "old-text-file", "new-text-file"].some((name) => values[name] !== undefined))
        throw new CliError("usage", "Use --edits-file separately from text replacement options.", 2);
      try {
        return { action, edits: JSON.parse(await inputFile(String(values["edits-file"]), signal)) };
      } catch (error) {
        if (error instanceof CliError) throw error;
        throw new CliError("usage", "--edits-file must contain a JSON array of {old_text,new_text} replacements.", 2);
      }
    }
    const oldValues = values["old-text"] as string[] | undefined;
    const newValues = values["new-text"] as string[] | undefined;
    const oldFile = values["old-text-file"];
    const newFile = values["new-text-file"];
    if (oldFile !== undefined || newFile !== undefined) {
      if (oldFile === "-" && newFile === "-")
        throw new CliError("usage", "Use stdin for only one replacement side per call.", 2);
      if ((oldFile !== undefined && oldValues !== undefined) ||
          (newFile !== undefined && newValues !== undefined))
        throw new CliError("usage", "Use only one inline or file input for each replacement side.", 2);
      if ((oldValues?.length ?? 0) > 1 || (newValues?.length ?? 0) > 1)
        throw new CliError("usage", "File-based replacement accepts one text pair.", 2);
      const oldText = oldFile === undefined ? oldValues?.[0] : await inputFile(String(oldFile), signal);
      const newText = newFile === undefined ? newValues?.[0] : await inputFile(String(newFile), signal);
      if (!oldText || newText === undefined)
        throw new CliError("usage", "step update requires an old and new text pair.", 2);
      return { action, edits: [{ old_text: oldText, new_text: newText }] };
    }
    if (!oldValues?.length || oldValues.length !== newValues?.length ||
        oldValues.some((item) => !item))
      throw new CliError("usage", "step update requires matching --old-text and --new-text pairs.", 2);
    return { action, edits: oldValues.map((old_text, i) => ({
      old_text, new_text: newValues[i],
    })) };
  }
  return { action };
}

export async function parseInvocation(
  argv: string[],
  signal?: AbortSignal,
): Promise<Invocation | { help: string } | { version: true }> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      options: OPTIONS,
      allowPositionals: true,
      strict: true,
      allowNegative: false,
    });
  } catch (error) {
    throw new CliError("usage", error instanceof Error ? error.message : String(error), 2);
  }
  const { values, positionals } = parsed;
  if (values.version) return { version: true };
  const command = positionals[0];
  if (values.help || command === "help" || command === undefined)
    return { help: help(command === "help" ? positionals[1] : command) };
  const spec = COMMANDS[command];
  if (spec === undefined)
    throw new CliError("usage", `Unknown command '${command}'. Run brain-skill --help.`, 2);
  const stepActionName = command === "step" && positionals.length === 2
    ? positionals[1]
    : undefined;
  const stepAction = stepActionName === undefined ? undefined : STEP_ACTIONS[stepActionName];
  if (
    (command === "step" && (positionals.length > 2 || (stepActionName && !stepAction))) ||
    (command !== "step" && positionals.length !== spec.positional.length + 1)
  )
    throw new CliError("usage", `Usage: brain-skill ${spec.usage}`, 2);
  for (const name of Object.keys(values)) {
    if (!COMMON.includes(name) && !spec.options.includes(name))
      throw new CliError("usage", `--${name} is not valid for ${command}.`, 2);
  }
  if (values.schema) {
    if (command !== "step" || positionals.length !== 1 ||
        values["input-file"] !== undefined ||
        STEP_INPUT_OPTIONS.some((name) => values[name] !== undefined))
      throw new CliError("usage", "Use step --schema without an action or input options.", 2);
    return { help: JSON.stringify(stepDefinition.inputSchema, null, 2) };
  }
  if (command === "step" &&
      ((stepAction === undefined && values["input-file"] === undefined) ||
        (stepAction !== undefined && values["input-file"] !== undefined)))
    throw new CliError(
      "usage",
      "Use step <action> with direct options. Legacy --input-file cannot be combined with an action.",
      2,
    );
  if (values.session !== undefined && !String(values.session).trim())
    throw new CliError("usage", "--session must be a nonempty real host conversation ID.", 2);
  // Check missing/ambiguous input before reading stdin or creating a Brain project.
  if (command === "write" && values["content-file"] === undefined)
    throw new CliError("usage", "write requires --content-file <file|->.", 2);
  if (
    command === "edit" &&
    (values["content-file"] === undefined) === (values["edits-file"] === undefined)
  )
    throw new CliError("usage", "edit requires exactly one of --content-file or --edits-file.", 2);
  if (
    command === "feedback" &&
    positionals[2] === "question" &&
    values["challenge-file"] === undefined
  )
    throw new CliError("usage", "question requires --challenge-file <file|->.", 2);
  if (
    command === "feedback" &&
    positionals[2] !== "question" &&
    values["challenge-file"] !== undefined
  )
    throw new CliError("usage", "--challenge-file is only valid with question.", 2);

  if (command === "step" && stepAction === undefined &&
      STEP_INPUT_OPTIONS.some((name) => values[name] !== undefined))
    throw new CliError("usage", "Use step <action> for direct text options.", 2);
  let args: Record<string, unknown> = stepAction === undefined
    ? Object.fromEntries(spec.positional.map((name, index) => [name, positionals[index + 1]]))
    : await stepRequest(stepAction, values, signal);
  for (const name of spec.options) {
    const value = values[name];
    if (value === undefined) continue;
    if (name === "session" || (stepAction !== undefined && command === "step")) continue;
    if (name.endsWith("-file")) {
      const text = await inputFile(String(value), signal);
      if (name === "input-file") {
        try {
          args = JSON.parse(text);
        } catch {
          throw new CliError(
            "usage",
            "--input-file must contain one brain_step JSON request. Read step --schema.",
            2,
          );
        }
      } else if (name === "edits-file") {
        try {
          args.edits = JSON.parse(text);
        } catch {
          throw new CliError(
            "usage",
            "--edits-file must contain a JSON array of {oldText,newText} replacements.",
            2,
          );
        }
      } else args[name === "content-file" ? "content" : "challenge"] = text;
    } else if (["offset", "limit", "context"].includes(name)) {
      if (!/^\d+$/.test(String(value)))
        throw new CliError("usage", `--${name} must be an integer.`, 2);
      args[name] = Number(value);
    } else args[name === "ignore-case" ? "ignoreCase" : name] = value;
  }
  const definition = PUBLIC_BRAIN_TOOLS.find((item) => item.name === spec.tool)!;
  const validated = definition.inputSchema.safeParse(args);
  if (!validated.success)
    throw new CliError(
      "usage",
      validated.error.issues
        .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
        .join("\n"),
      2,
    );
  return {
    command,
    tool: spec.tool,
    args: validated.data as Record<string, unknown>,
    project: resolve(String(values.project ?? process.cwd())),
    ...(values.session === undefined ? {} : { sessionId: String(values.session) }),
    ...(values["brain-root"] === undefined
      ? {}
      : { brainRoot: resolve(String(values["brain-root"])) }),
    json: values.json === true,
  };
}
