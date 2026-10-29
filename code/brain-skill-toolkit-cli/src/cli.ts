#!/usr/bin/env node
import { main } from "./main.ts";

// unbuild's stub imports this entry; execution must not depend on argv[1]
// being the source filename.
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
