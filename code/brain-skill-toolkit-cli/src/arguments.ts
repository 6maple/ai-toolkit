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
    usage: "step --input-file <file|-> [--session <host-conversation-id>] | step --schema",
    description: BRAIN_EXPLICIT_STEP_INSTRUCTION,
    positional: [],
    options: ["session", "input-file", "schema"],
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

const COMMON = ["project", "brain-root", "json", "help", "version"];
const BOOLEAN = new Set(["json", "help", "version", "literal", "ignore-case", "schema"]);
const OPTIONS = Object.fromEntries(
  [...new Set([...COMMON, ...Object.values(COMMANDS).flatMap((command) => command.options)])].map(
    (name) => [name, { type: BOOLEAN.has(name) ? "boolean" : "string" }],
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
                stepDefinition.description,
                "Use step --schema to read the current Brain input schema before preparing JSON.",
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
  if (positionals.length !== spec.positional.length + 1)
    throw new CliError("usage", `Usage: brain-skill ${spec.usage}`, 2);
  for (const name of Object.keys(values)) {
    if (!COMMON.includes(name) && !spec.options.includes(name))
      throw new CliError("usage", `--${name} is not valid for ${command}.`, 2);
  }
  if (values.schema) {
    if (values["input-file"] !== undefined)
      throw new CliError("usage", "Use step --schema separately from --input-file.", 2);
    return { help: JSON.stringify(stepDefinition.inputSchema, null, 2) };
  }
  if (command === "step" && values["input-file"] === undefined)
    throw new CliError(
      "usage",
      "step requires --input-file <file|->. Read step --schema for the current input contract.",
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

  let args: Record<string, unknown> = Object.fromEntries(
    spec.positional.map((name, index) => [name, positionals[index + 1]]),
  );
  for (const name of spec.options) {
    const value = values[name];
    if (value === undefined) continue;
    if (name === "session") continue;
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
