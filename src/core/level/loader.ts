import { validateLevel, type LevelData } from './schema';

export class LevelValidationError extends Error {
  constructor(readonly errors: string[]) {
    super(`Invalid level:\n${errors.join('\n')}`);
  }
}

/** Validates raw level JSON and returns it typed; throws with all problems listed. */
export function loadLevel(raw: unknown): LevelData {
  const result = validateLevel(raw);
  if (!result.ok) throw new LevelValidationError(result.errors);
  return result.level;
}

/** Loads a chapter and checks that indices run 1..n in order. */
export function loadChapter(chapter: number, raws: readonly unknown[]): LevelData[] {
  const levels = raws.map(loadLevel);
  levels.forEach((level, i) => {
    if (level.chapter !== chapter || level.index !== i + 1) {
      throw new LevelValidationError([`${level.id}: expected chapter ${chapter} index ${i + 1}`]);
    }
  });
  return levels;
}
