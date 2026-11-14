import { readFileSync } from "node:fs";

const prompt = (number) => readFileSync(new URL(`./prompts/step${number}.md`, import.meta.url), "utf8");

export const initialPrompt = prompt(1);
const responses = {
  start: prompt(2),
  ready: prompt(3),
  review: prompt(4),
};

export function taskView(action) {
  return responses[action];
}
