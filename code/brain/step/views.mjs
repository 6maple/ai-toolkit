import { readFileSync, statSync } from "node:fs";

const promptFile = (number) => new URL(`./prompts/step${number}.md`, import.meta.url);

export const initialPrompt = readFileSync(promptFile(1), "utf8");

const files = {
  start: promptFile(2),
  ready: promptFile(3),
  review: promptFile(4),
};

const cache = new Map();

export function taskView(action) {
  const file = files[action];
  const { mtimeNs, ctimeNs, size } = statSync(file, { bigint: true });
  const previous = cache.get(action);

  if (
    previous &&
    previous.mtimeNs === mtimeNs &&
    previous.ctimeNs === ctimeNs &&
    previous.size === size
  ) {
    return previous.text;
  }

  const text = readFileSync(file, "utf8");
  cache.set(action, { mtimeNs, ctimeNs, size, text });
  return text;
}
