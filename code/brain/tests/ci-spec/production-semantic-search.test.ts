import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { loadBrainGlobalConfig } from "../../src/runtime/global-config.ts";

describe("Brain semantic search global feature config", () => {
  test("defaults to disabled when the global config does not exist", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "brain-semantic-config-"));
    try {
      expect(loadBrainGlobalConfig(root)).toEqual({
        features: { semanticSearch: false },
        diagnostics: [],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("enables semantic search only from the Brain global config", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "brain-semantic-config-"));
    try {
      await writeFile(
        path.join(root, "config.json"),
        JSON.stringify({ semanticSearch: { enabled: true } }),
        "utf8",
      );
      expect(loadBrainGlobalConfig(root)).toEqual({
        features: { semanticSearch: true },
        diagnostics: [],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("invalid global config degrades only the optional capability", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "brain-semantic-config-"));
    try {
      await writeFile(path.join(root, "config.json"), "{broken", "utf8");
      const result = loadBrainGlobalConfig(root);
      expect(result.features.semanticSearch).toBe(false);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]?.code).toBe("global-config-invalid");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
