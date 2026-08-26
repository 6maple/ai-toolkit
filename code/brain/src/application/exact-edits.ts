export interface ExactEdit {
  readonly oldText: string;
  readonly newText: string;
}

export type ExactEditErrorCode =
  | "empty-edits"
  | "empty-old-text"
  | "old-text-not-found"
  | "old-text-not-unique"
  | "overlapping-edits";

export class ExactEditError extends Error {
  readonly code: ExactEditErrorCode;

  constructor(code: ExactEditErrorCode) {
    super(`brain exact edit failed: ${code}`);
    this.name = "ExactEditError";
    this.code = code;
  }
}

interface LocatedEdit {
  readonly start: number;
  readonly end: number;
  readonly newText: string;
}

export function applyExactEdits(current: string, edits: readonly ExactEdit[]): string {
  if (edits.length === 0) throw new ExactEditError("empty-edits");

  const located: LocatedEdit[] = edits.map((edit) => {
    if (edit.oldText.length === 0) throw new ExactEditError("empty-old-text");
    const start = current.indexOf(edit.oldText);
    if (start < 0) throw new ExactEditError("old-text-not-found");
    if (current.lastIndexOf(edit.oldText) !== start)
      throw new ExactEditError("old-text-not-unique");
    return { start, end: start + edit.oldText.length, newText: edit.newText };
  });

  const ascending = [...located].sort((a, b) => a.start - b.start || a.end - b.end);
  for (let index = 1; index < ascending.length; index += 1) {
    if (ascending[index]!.start < ascending[index - 1]!.end) {
      throw new ExactEditError("overlapping-edits");
    }
  }

  let result = current;
  for (const edit of [...located].sort((a, b) => b.start - a.start || b.end - a.end)) {
    result = `${result.slice(0, edit.start)}${edit.newText}${result.slice(edit.end)}`;
  }
  return result;
}
