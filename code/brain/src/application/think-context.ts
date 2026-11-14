// Legacy virtual Brain entry paths share the canonical initial prompt.
// The model's concrete next action is always described by the user's Step 1.
import { initialPrompt } from "brain/step";

export const BRAIN_VIRTUAL_PATHS = [
  "@brain-virtual/normal.md",
  "@brain-virtual/deep.md",
  "@brain-virtual/normal-memory.md",
  "@brain-virtual/deep-memory.md",
] as const;

export type BrainVirtualPath = (typeof BRAIN_VIRTUAL_PATHS)[number];

export function isBrainVirtualPath(path: string): path is BrainVirtualPath {
  return BRAIN_VIRTUAL_PATHS.some((entry) => entry === path);
}

export const BRAIN_PROCESSING_ENTRY = initialPrompt;
export const BRAIN_NORMAL_FLOW = initialPrompt;
