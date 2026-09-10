/** Retained-entry cap used when none is configured, or a non-positive one is. */
export const DEFAULT_MAX_ENTRIES = 10000;

/**
 * Buffered log entries, with their encoded size and a cap on how many are kept.
 *
 * Owns three things that were previously tangled into the logger: the pending
 * entries, the running byte total, and the discard policy that keeps a failing
 * disk from exhausting memory.
 *
 * Sizes are UTF-8 bytes, not string length. A log line of non-ASCII text takes
 * up to four bytes per character, so measuring length let the buffer grow well
 * past the limit it was compared against.
 */
export class LogBuffer {
  private entries: string[] = [];
  private byteCount = 0;
  private dropped = 0;
  private readonly maxEntries: number;

  /**
   * @param maxEntries - Entries to retain before discarding the oldest. A
   *                     non-positive or missing value uses the default.
   */
  constructor(maxEntries: number) {
    this.maxEntries = maxEntries > 0 ? maxEntries : DEFAULT_MAX_ENTRIES;
  }

  /** @returns The retained-entry cap in force. */
  getLimit(): number {
    return this.maxEntries;
  }

  /** @returns The number of buffered entries. */
  count(): number {
    return this.entries.length;
  }

  /** @returns The encoded size of the buffered entries, in bytes. */
  bytes(): number {
    return this.byteCount;
  }

  /** @returns True when nothing is buffered. */
  isEmpty(): boolean {
    return this.entries.length === 0;
  }

  /** @returns Entries discarded so far because the cap was reached. */
  getDropped(): number {
    return this.dropped;
  }

  /**
   * Buffers one entry.
   *
   * @param entry - The rendered log entry
   */
  add(entry: string): void {
    this.entries.push(entry);
    this.byteCount += Buffer.byteLength(entry, "utf8");
  }

  /**
   * Empties the buffer, handing back everything it held.
   *
   * Named to match the logger's flush, which is the only operation that calls
   * it: LogFile.flush() empties the buffer and writes what it got.
   *
   * @returns The entries, oldest first
   */
  flush(): string[] {
    const taken = this.entries;
    this.entries = [];
    this.byteCount = 0;
    return taken;
  }

  /**
   * Puts flushed entries back after a failed write.
   *
   * They go in front of anything buffered since, because entries logged during
   * the write attempt happened later and must stay later.
   *
   * @param entries - The entries handed back by a previous flush
   */
  restore(entries: string[]): void {
    this.entries = entries.concat(this.entries);
    this.byteCount = entries.reduce(
      (total, entry) => total + Buffer.byteLength(entry, "utf8"),
      this.byteCount
    );
  }

  /**
   * Discards the oldest entries if the buffer is over its cap.
   *
   * Trims in batches rather than one entry at a time: removing from the front
   * of an array re-indexes everything after it, so a per-entry trim would make
   * every log O(buffer size) once the cap is reached. The count therefore dips
   * somewhat below the cap rather than sitting exactly on it.
   *
   * @returns How many entries were discarded by this call
   */
  enforceLimit(): number {
    if (this.entries.length <= this.maxEntries) {
      return 0;
    }

    const overflow = this.entries.length - this.maxEntries + Math.floor(this.maxEntries / 10);
    const discarded = this.entries.splice(0, Math.min(overflow, this.entries.length));

    // Subtract only what went; recomputing the total would be O(n) as well.
    for (const entry of discarded) {
      this.byteCount -= Buffer.byteLength(entry, "utf8");
    }
    this.dropped += discarded.length;

    return discarded.length;
  }
}
