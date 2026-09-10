import { FileSystem } from "./filesystem";
import { replaceMacro, sanitizeFileFormat, toError } from "./util";

/**
 * How many suffixed names to step over when looking for a file with room.
 *
 * The search normally stops at the first name that does not exist yet, because
 * a missing file reads as size zero. The bound only matters if every candidate
 * exists and is full, and stopping early is harmless: the next write checks
 * the size again.
 */
const MAX_SUFFIX_PROBES = 1000;

/** Which banner to render. */
export type BannerKind = "start" | "end";

export interface RotatingFileTargetOptions {
  /** Filesystem to write through. */
  fs: FileSystem;
  /** Directory holding the log files. */
  dir: string;
  /** File name format; %DATE% is substituted. */
  fileFormat: string;
  /** Bytes before a size rollover. Zero or less disables it. */
  maxFileSize: number;
  /** Renders the banner written when a file opens or closes. */
  banner: (kind: BannerKind) => string;
  /** Reports a failure that must not propagate. */
  onError: (error: Error, context: string) => void;
}

/**
 * The file the logger is currently writing to, and when to switch.
 *
 * Owns everything about *which* file: naming, the directory, date rollover,
 * size rollover, and the banners that open and close each file. The logger
 * keeps what it means to log - levels, formatting, buffering, lifecycle.
 *
 * Failures are reported rather than thrown, except for write(): the buffer has
 * to know an entry write failed so it can put the entries back. Rotation
 * failures advance the state anyway, because leaving it behind is what wedged
 * the logger on a file it could no longer close.
 */
export class RotatingFileTarget {
  private readonly fs: FileSystem;
  private readonly banner: (kind: BannerKind) => string;
  private readonly onError: (error: Error, context: string) => void;
  private readonly maxFileSize: number;

  private dir: string;
  private fileFormat: string;
  private currentFile = "";
  /**
   * The date currentFile was named with.
   *
   * Not the same as today. With date rollover disabled the two diverge at
   * midnight: the calendar moves on while the file keeps its original name,
   * and naming a size rollover from today produced a file stamped with a day
   * no other file in the sequence shared.
   */
  private currentFileDate = "";
  private previousFile = "";
  private fileSuffix = 0;

  constructor(options: RotatingFileTargetOptions) {
    this.fs = options.fs;
    this.dir = options.dir;
    this.fileFormat = sanitizeFileFormat(options.fileFormat);
    this.maxFileSize = options.maxFileSize;
    this.banner = options.banner;
    this.onError = options.onError;
  }

  /**
   * @returns The path being written to, or "" when no file is open.
   */
  path(): string {
    return this.currentFile ? `${this.dir}/${this.currentFile}` : "";
  }

  /**
   * @returns The path written to before the last rotation, or "".
   */
  previousPath(): string {
    return this.previousFile ? `${this.dir}/${this.previousFile}` : "";
  }

  /** @returns The directory in use. */
  getDir(): string {
    return this.dir;
  }

  /** @returns The file name format in use. */
  getFormat(): string {
    return this.fileFormat;
  }

  /** @returns The date the open file is named for. */
  getFileDate(): string {
    return this.currentFileDate;
  }

  /** @returns True when a file is open. */
  isOpen(): boolean {
    return this.currentFile !== "";
  }

  /**
   * Creates the directory if it is missing.
   *
   * @returns True if the directory exists afterwards
   */
  ensureDir(): boolean {
    if (this.fs.existsSync(this.dir)) {
      return true;
    }

    try {
      this.fs.mkdirSync(this.dir, { recursive: true });
      return true;
    } catch (error) {
      this.onError(toError(error), "Failed to create log directory:");
      return false;
    }
  }

  /**
   * Opens the file for a date, writing a start banner.
   *
   * @param date - The date to name the file for
   */
  open(date: string): void {
    this.ensureDir();
    this.fileSuffix = 0;
    this.currentFileDate = date;
    this.currentFile = this.nameFor(date, 0);
    this.openCurrent("Failed to open the log file:");
  }

  /**
   * Writes an end banner and forgets the file.
   *
   * A later open() starts the logger again rather than writing with nothing
   * set up.
   */
  close(): boolean {
    if (!this.currentFile) {
      return true;
    }

    let closed = true;
    try {
      this.fs.appendFileSync(this.path(), this.banner("end"));
    } catch (error) {
      this.onError(toError(error), "Failed to close the log file:");
      closed = false;
    }

    this.currentFile = "";
    this.currentFileDate = "";
    return closed;
  }

  /**
   * Forgets the open file without writing anything.
   *
   * For shutdown when the file has gone from under us: close() would append a
   * banner, and appendFileSync would recreate a file that something else
   * deliberately removed. Idempotent, so it is safe after close().
   */
  release(): void {
    this.currentFile = "";
    this.currentFileDate = "";
  }

  /**
   * Whether the open file is present on disk.
   *
   * It can vanish underneath a running logger, to logrotate or to a hand.
   *
   * @returns True when a file is open and exists
   */
  exists(): boolean {
    return this.currentFile !== "" && this.fs.existsSync(this.path());
  }

  /** @returns True when the log directory exists. */
  dirExists(): boolean {
    return this.fs.existsSync(this.dir);
  }

  /**
   * Appends data to the open file.
   *
   * Unlike the rest of this class, a failure propagates: the caller holds the
   * entries and has to know they were not written.
   *
   * @param data - The text to append
   */
  write(data: string): void {
    this.fs.appendFileSync(this.path(), data);
  }

  /**
   * Switches to the file for a new date.
   *
   * @param date - The date to roll to
   */
  rollToDate(date: string): void {
    this.fileSuffix = 0; // a new day starts at the unsuffixed name again
    this.rotateTo(this.nameFor(date, 0), date, "Failed to roll over the log file:");
  }

  /**
   * Switches to the next suffixed file if the open one has reached the limit.
   */
  rollIfOversized(): void {
    if (this.maxFileSize <= 0 || !this.currentFile) {
      return;
    }

    if (this.sizeOf(this.path()) < this.maxFileSize) {
      return;
    }

    this.fileSuffix++;

    // Named from the date the outgoing file belongs to, not from today.
    this.rotateTo(
      this.nameFor(this.currentFileDate, this.fileSuffix),
      this.currentFileDate,
      "Failed to roll the log file over on size:"
    );
  }

  /**
   * Changes the directory. The open file keeps its name.
   *
   * @param dir - The new directory
   */
  setDir(dir: string): void {
    this.dir = dir;
  }

  /**
   * Changes the file name format, switching files if one is open.
   *
   * @param fileFormat - The new format, sanitized here
   * @param date - The date to name the new file for
   */
  setFormat(fileFormat: string, date: string): void {
    const sanitized = sanitizeFileFormat(fileFormat);
    if (sanitized === this.fileFormat) {
      return;
    }

    this.fileFormat = sanitized;
    if (!this.currentFile) {
      return;
    }

    this.fileSuffix = 0;
    this.rotateTo(this.nameFor(date, 0), date, "Failed to change the log file format:");
  }

  /**
   * Builds a log file name for a date and rollover suffix.
   *
   * @param date - The date, substituted for %DATE%
   * @param suffix - The size-rollover suffix; zero means the unsuffixed name
   * @returns The file name, without a directory
   */
  private nameFor(date: string, suffix: number): string {
    const base = replaceMacro(this.fileFormat, "%DATE%", date);
    if (suffix <= 0) {
      return base;
    }

    const extIndex = base.lastIndexOf(".");
    return extIndex > 0
      ? `${base.substring(0, extIndex)}-${suffix}${base.substring(extIndex)}`
      : `${base}-${suffix}`;
  }

  /**
   * The size of a file, or zero when it cannot be read.
   *
   * A missing file is the normal case for a name about to be created, and it
   * reads as empty. One statSync in a try/catch rather than existsSync then
   * statSync: two syscalls where one answers the question, and the file can
   * still be removed between them.
   *
   * @param path - The file to measure
   * @returns The size in bytes, or 0 if it does not exist or cannot be read
   */
  private sizeOf(path: string): number {
    try {
      return this.fs.statSync(path).size;
    } catch {
      return 0;
    }
  }

  /** Steps the suffix past any file already at the size limit. */
  private skipOversized(): void {
    if (this.maxFileSize <= 0) {
      return;
    }

    for (let probe = 0; probe < MAX_SUFFIX_PROBES; probe++) {
      if (this.sizeOf(this.path()) < this.maxFileSize) {
        return;
      }

      this.fileSuffix++;
      this.currentFile = this.nameFor(this.currentFileDate, this.fileSuffix);
    }
  }

  /**
   * Opens whatever currentFile points at, skipping full files first.
   *
   * Appends rather than truncating: a rollover can land on an existing file
   * when the format has no %DATE%, or when a suffixed name is left from an
   * earlier run. appendFileSync creates the file when missing, so there is no
   * check-then-write window for another writer to lose data in.
   *
   * @param context - Prefix used when reporting a failure
   */
  private openCurrent(context: string): void {
    this.skipOversized();

    try {
      this.fs.appendFileSync(this.path(), this.banner("start"));
    } catch (error) {
      this.onError(toError(error), context);
    }
  }

  /**
   * Closes the current file and opens another in its place.
   *
   * State advances even when a step fails. Leaving it behind was how a failed
   * end banner wedged the logger: the file stayed over the size limit, so
   * every later flush retried the identical failing append and never moved on.
   *
   * Buffered entries are not flushed here. Callers that need them in the
   * outgoing file flush first, while it is still current.
   *
   * @param nextFile - The file name to switch to
   * @param nextFileDate - The date that name was built from
   * @param context - Prefix used when reporting a failure
   */
  private rotateTo(nextFile: string, nextFileDate: string, context: string): void {
    try {
      this.fs.appendFileSync(this.path(), this.banner("end"));
    } catch (error) {
      this.onError(toError(error), context);
    }

    this.previousFile = this.currentFile;
    this.currentFile = nextFile;
    this.currentFileDate = nextFileDate;

    this.openCurrent(context);
  }
}
