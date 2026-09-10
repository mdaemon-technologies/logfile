import { appendFileSync, existsSync, mkdirSync, statSync } from "fs";

/**
 * The file operations the logger performs.
 *
 * A seam, so the logger's behaviour can be driven without touching a real
 * disk. Everything went straight to `fs` before, and the only way to exercise
 * a failing write was to arrange one on the real filesystem or to mock the
 * module globally. Tests can now hand in a fake.
 *
 * Deliberately narrow: four synchronous calls, matching the node:fs
 * signatures the logger actually uses.
 */
export interface FileSystem {
  /** Appends to a file, creating it when missing. */
  appendFileSync(path: string, data: string): void;
  /** Whether a path exists. */
  existsSync(path: string): boolean;
  /** Creates a directory, and its parents when recursive. */
  mkdirSync(path: string, options: { recursive: boolean }): void;
  /** Stats a path; throws when it does not exist. */
  statSync(path: string): { size: number };
}

/**
 * The real filesystem.
 *
 * Wrapped rather than passed as the `fs` module itself, so the port stays the
 * four calls above and cannot quietly grow to depend on the rest of `fs`.
 */
export const nodeFileSystem: FileSystem = {
  appendFileSync: (path, data) => appendFileSync(path, data),
  existsSync: (path) => existsSync(path),
  mkdirSync: (path, options) => { mkdirSync(path, options); },
  statSync: (path) => statSync(path)
};
