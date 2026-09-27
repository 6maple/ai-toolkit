import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const FASTEMBED_VERSION = "0.8.0";
const MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2";
const DIMENSION = 384;
const SCHEMA_VERSION = 1;
const FINGERPRINT =
  "fastembed=0.8.0;model=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2;dimension=384";

const BRAIN_ROOT = path.join(homedir(), ".brain-data");
const RUNTIME = path.join(BRAIN_ROOT, ".runtime", "semantic-search");
const VENV = path.join(RUNTIME, "venv");
const MODELS = path.join(RUNTIME, "models");
const WORKER = path.join(RUNTIME, "worker.py");
const MANIFEST = path.join(RUNTIME, "manifest.json");
const VENV_PYTHON =
  process.platform === "win32"
    ? path.join(VENV, "Scripts", "python.exe")
    : path.join(VENV, "bin", "python");

const WORKER_SOURCE = "from __future__ import annotations\n\nimport argparse\nimport json\nimport sys\nfrom pathlib import Path\n\nimport numpy as np\nfrom fastembed import TextEmbedding\n\nFASTEMBED_VERSION = \"0.8.0\"\nMODEL = \"sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2\"\nDIMENSION = 384\nFINGERPRINT = \"fastembed=0.8.0;model=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2;dimension=384\"\nROOT = Path(__file__).resolve().parent\nMODEL_CACHE = ROOT / \"models\"\n\n\ndef load_model(local_only: bool) -> TextEmbedding:\n    return TextEmbedding(\n        model_name=MODEL,\n        cache_dir=str(MODEL_CACHE),\n        local_files_only=local_only,\n    )\n\n\ndef normalize(value: object) -> list[float]:\n    vector = np.asarray(value, dtype=np.float32)\n    if vector.ndim != 1 or len(vector) != DIMENSION:\n        raise RuntimeError(f\"unexpected embedding dimension: {vector.shape}\")\n    norm = float(np.linalg.norm(vector))\n    if not np.isfinite(norm) or norm <= 0:\n        raise RuntimeError(\"embedding vector has invalid norm\")\n    vector = vector / norm\n    return vector.tolist()\n\n\ndef embed(model: TextEmbedding, texts: list[str]) -> list[list[float]]:\n    return [normalize(vector) for vector in model.embed(texts)]\n\n\ndef health(local_only: bool) -> None:\n    model = load_model(local_only)\n    vectors = embed(model, [\"Brain semantic search installation health check\"])\n    if len(vectors) != 1 or len(vectors[0]) != DIMENSION:\n        raise RuntimeError(\"embedding health check failed\")\n    print(\n        json.dumps(\n            {\n                \"type\": \"health\",\n                \"dimension\": DIMENSION,\n                \"fingerprint\": FINGERPRINT,\n                \"localFilesOnly\": local_only,\n            },\n            ensure_ascii=False,\n        ),\n        flush=True,\n    )\n\n\ndef serve() -> None:\n    model = load_model(True)\n    print(\n        json.dumps(\n            {\n                \"type\": \"ready\",\n                \"dimension\": DIMENSION,\n                \"fingerprint\": FINGERPRINT,\n            }\n        ),\n        flush=True,\n    )\n    for line in sys.stdin:\n        request = None\n        try:\n            request = json.loads(line)\n            request_id = request.get(\"id\")\n            texts = request.get(\"texts\")\n            if not isinstance(request_id, int):\n                raise ValueError(\"id must be an integer\")\n            if not isinstance(texts, list) or not all(isinstance(text, str) for text in texts):\n                raise ValueError(\"texts must be an array of strings\")\n            print(\n                json.dumps({\"id\": request_id, \"vectors\": embed(model, texts)}),\n                flush=True,\n            )\n        except Exception as error:\n            request_id = request.get(\"id\") if isinstance(locals().get(\"request\"), dict) else None\n            if isinstance(request_id, int):\n                print(json.dumps({\"id\": request_id, \"error\": str(error)}), flush=True)\n            else:\n                print(json.dumps({\"type\": \"error\", \"error\": str(error)}), flush=True)\n\n\ndef main() -> None:\n    parser = argparse.ArgumentParser()\n    parser.add_argument(\"--serve\", action=\"store_true\")\n    parser.add_argument(\"--health\", action=\"store_true\")\n    parser.add_argument(\"--install-health\", action=\"store_true\")\n    args = parser.parse_args()\n    selected = sum((args.serve, args.health, args.install_health))\n    if selected != 1:\n        parser.error(\"choose exactly one mode\")\n    if args.serve:\n        serve()\n    elif args.health:\n        health(True)\n    else:\n        health(False)\n\n\nif __name__ == \"__main__\":\n    main()\n";

function run(command, args, options = {}) {
  console.log("+", command, ...args);
  const result = spawnSync(command, args, {
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    windowsHide: true,
    env: { ...process.env },
    encoding: options.capture ? "utf8" : undefined,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture
      ? String(result.stderr || result.stdout || "").trim()
      : "";
    throw new Error(
      command + " exited with code " + String(result.status) + (detail ? ": " + detail : ""),
    );
  }
  return options.capture ? String(result.stdout || "").trim() : "";
}

function pythonVersion(candidate) {
  try {
    const output = run(
      candidate.command,
      [...candidate.prefix, "-c", "import sys,json; print(json.dumps(list(sys.version_info[:3])))"],
      { capture: true },
    );
    const version = JSON.parse(output);
    if (
      Array.isArray(version) &&
      version.length === 3 &&
      version.every((part) => Number.isInteger(part)) &&
      (version[0] > 3 || (version[0] === 3 && version[1] >= 10))
    ) {
      return version;
    }
  } catch {
    // Try the next candidate.
  }
  return undefined;
}

function findPython() {
  const candidates = [];
  if (process.env.BRAIN_PYTHON) {
    candidates.push({ command: process.env.BRAIN_PYTHON, prefix: [] });
  }
  if (process.platform === "win32") {
    candidates.push({ command: "py", prefix: ["-3"] });
  }
  candidates.push({ command: "python3", prefix: [] }, { command: "python", prefix: [] });
  for (const candidate of candidates) {
    const version = pythonVersion(candidate);
    if (version) return { ...candidate, version };
  }
  throw new Error("Python >= 3.10 was not found (set BRAIN_PYTHON to an explicit interpreter if needed)");
}

function manifestMatches() {
  try {
    const value = JSON.parse(readFileSync(MANIFEST, "utf8"));
    return (
      value?.schemaVersion === SCHEMA_VERSION &&
      value?.fastembedVersion === FASTEMBED_VERSION &&
      value?.model === MODEL &&
      value?.dimension === DIMENSION &&
      value?.fingerprint === FINGERPRINT
    );
  } catch {
    return false;
  }
}

function localHealth() {
  if (!existsSync(VENV_PYTHON) || !existsSync(WORKER)) return false;
  try {
    const output = run(VENV_PYTHON, [WORKER, "--health"], { capture: true });
    const value = JSON.parse(output.split(/\r?\n/).at(-1));
    return value?.dimension === DIMENSION && value?.fingerprint === FINGERPRINT;
  } catch {
    return false;
  }
}

function writeManifest(pythonVersion) {
  const value = {
    schemaVersion: SCHEMA_VERSION,
    fastembedVersion: FASTEMBED_VERSION,
    model: MODEL,
    dimension: DIMENSION,
    fingerprint: FINGERPRINT,
    pythonVersion: pythonVersion.join("."),
    installedAt: new Date().toISOString(),
  };
  const temporary = MANIFEST + ".tmp-" + randomUUID();
  writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", "utf8");
  renameSync(temporary, MANIFEST);
}

export async function installSemanticSearch(mode) {
  if (mode !== "install" && mode !== "update") throw new Error("semantic-search mode must be install or update");
  try {
    await import("node:sqlite");
  } catch (error) {
    throw new Error(
      "this Node runtime does not provide node:sqlite; use a supported Node version before installing semantic search",
      { cause: error },
    );
  }

  mkdirSync(MODELS, { recursive: true });
  writeFileSync(WORKER, WORKER_SOURCE, "utf8");

  if (mode === "install" && manifestMatches() && localHealth()) {
    console.log("Brain semantic search runtime is already ready.");
    console.log("runtime=" + RUNTIME);
    return;
  }

  const python = findPython();
  console.log("Using Python " + python.version.join("."));

  if (!existsSync(VENV_PYTHON)) {
    run(python.command, [...python.prefix, "-m", "venv", VENV]);
  }

  run(VENV_PYTHON, [
    "-m",
    "pip",
    "install",
    "--disable-pip-version-check",
    "fastembed==" + FASTEMBED_VERSION,
  ]);

  const healthOutput = run(VENV_PYTHON, [WORKER, "--install-health"], { capture: true });
  const health = JSON.parse(healthOutput.split(/\r?\n/).at(-1));
  if (health?.dimension !== DIMENSION || health?.fingerprint !== FINGERPRINT) {
    throw new Error("embedding health check returned an unexpected model identity");
  }

  const localOutput = run(VENV_PYTHON, [WORKER, "--health"], { capture: true });
  const local = JSON.parse(localOutput.split(/\r?\n/).at(-1));
  if (
    local?.dimension !== DIMENSION ||
    local?.fingerprint !== FINGERPRINT ||
    local?.localFilesOnly !== true
  ) {
    throw new Error("local-only embedding health check failed");
  }

  writeManifest(python.version);
  console.log("Brain semantic search runtime installed successfully.");
  console.log("runtime=" + RUNTIME);
  console.log("model=" + MODEL);
  console.log("Semantic search remains disabled until ~/.brain-data/config.json enables it.");
}
