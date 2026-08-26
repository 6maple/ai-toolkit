export interface EpistemicState {
  readonly challenge?: string;
}

export type EpistemicStatus = "active" | "questioned";
export type EpistemicStateErrorCode = "empty-challenge" | "no-current-challenge";

export class EpistemicStateError extends Error {
  readonly code: EpistemicStateErrorCode;

  constructor(code: EpistemicStateErrorCode) {
    super(`brain epistemic state failed: ${code}`);
    this.name = "EpistemicStateError";
    this.code = code;
  }
}

export function activeEpistemicState(): EpistemicState {
  return {};
}

export function setChallenge(_current: EpistemicState, rawChallenge: string): EpistemicState {
  const challenge = rawChallenge.trim();
  if (challenge.length === 0) throw new EpistemicStateError("empty-challenge");
  return { challenge };
}

export function clearChallenge(current: EpistemicState): EpistemicState {
  if (current.challenge === undefined) throw new EpistemicStateError("no-current-challenge");
  return {};
}

export function deriveEpistemicStatus(state: EpistemicState): EpistemicStatus {
  return state.challenge === undefined ? "active" : "questioned";
}
