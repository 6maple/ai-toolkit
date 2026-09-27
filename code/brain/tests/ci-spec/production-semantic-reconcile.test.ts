import { describe, expect, test } from "vite-plus/test";

import {
  decideSemanticCatalogRow,
  type SemanticCatalogMetadata,
  type SemanticFileMetadata,
} from "../../src/runtime/semantic-index.ts";

const indexed: SemanticCatalogMetadata = {
  contentMtimeMs: 100,
  contentSize: 200,
  stateMtimeMs: 300,
  stateSize: 400,
  embeddingPresent: true,
};

const content: SemanticFileMetadata = {
  exists: true,
  symbolicLink: false,
  mtimeMs: 100,
  size: 200,
};

const state: SemanticFileMetadata = {
  exists: true,
  symbolicLink: false,
  mtimeMs: 300,
  size: 400,
};

describe("Brain semantic reconcile catalog decisions", () => {
  test("skips a known cognition when indexed metadata still matches", () => {
    expect(decideSemanticCatalogRow(indexed, content, state)).toBe("unchanged");
  });

  test("refreshes only when known cognition metadata or embedding state is stale", () => {
    expect(
      decideSemanticCatalogRow(indexed, { ...content, mtimeMs: content.mtimeMs + 1 }, state),
    ).toBe("refresh");
    expect(decideSemanticCatalogRow(indexed, content, { ...state, size: state.size + 1 })).toBe(
      "refresh",
    );
    expect(decideSemanticCatalogRow({ ...indexed, embeddingPresent: false }, content, state)).toBe(
      "refresh",
    );
    expect(decideSemanticCatalogRow(indexed, { ...content, symbolicLink: true }, state)).toBe(
      "refresh",
    );
  });

  test("removes a catalog row when its Markdown source no longer exists", () => {
    expect(
      decideSemanticCatalogRow(
        indexed,
        { exists: false, symbolicLink: false, mtimeMs: 0, size: 0 },
        state,
      ),
    ).toBe("remove");
  });
});
