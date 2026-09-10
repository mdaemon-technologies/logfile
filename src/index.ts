import { getDate, endWithNewLine, stringifyArgs, replaceMacro, formatTimestamps, toError } from "./util";
import { FileSystem, nodeFileSystem } from "./filesystem";
import { LogEntryFormatter, MACRO_DOCS } from "./formatter";
import { DEFAULT_MAX_ENTRIES, LogBuffer } from "./buffer";
import { BannerKind, RotatingFileTarget } from "./target";

enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARNING = 2,
  ERROR = 3,
  CRITICAL = 4
}

/**
 * Every log level, in order, with the name written into log entries.
 *
 * The single source for the level map, the help text and the level names in
 * entries. The static constants on LogFile alias the enum directly, so they
 * cannot drift from it either.
 */
const LEVELS: ReadonlyArray<{ level: LogLevel, name: string }> = [
  { level: LogLevel.DEBUG, name: "DEBUG" },
  { level: LogLevel.INFO, name: "INFO" },
  { level: LogLevel.WARNING, name: "WARNING" },
  { level: LogLevel.ERROR, name: "ERROR" },
  { level: LogLevel.CRITICAL, name: "CRITICAL" }
];

const levelMap: Record<number, string> = Object.fromEntries(
  LEVELS.map(({ level, name }) => [level, name])
);

/** Directory used when none is configured, or when one is cleared at runtime. */
const DEFAULT_LOG_DIR = "./logs";

/** Size at which a log file rolls over, when none is configured. */
const DEFAULT_MAX_FILE_SIZE = 104857600; // 100 MB

/**
 * Every constructor option, with the default shown in the help text.
 *
 * Rendered by getHelp() rather than restated there. The README's Constructor
 * Options list and the @property docs on LogFileOptions are checked against
 * this table by contract.test.ts, so the three cannot drift apart.
 */
const OPTION_DOCS: ReadonlyArray<{ name: string, default: string, summary: string }> = [
  { name: "logLevel", default: "1/INFO", summary: "minimum level recorded" },
  { name: "dir", default: `"${DEFAULT_LOG_DIR}"`, summary: "directory for log files" },
  { name: "fileFormat", default: '"log-%DATE%.log"', summary: "log file name format" },
  { name: "logStr", default: '"%DATE% %TIME% | %LEVEL% | %MESSAGE%"', summary: "log entry format" },
  { name: "startLog", default: "banner", summary: "written when a log file opens" },
  { name: "endLog", default: "banner", summary: "written when a log file closes" },
  { name: "rollover", default: "true", summary: "new file when the date changes" },
  { name: "maxFileSize", default: `${DEFAULT_MAX_FILE_SIZE}`, summary: "size rollover in bytes; 0 disables it" },
  { name: "maxBufferEntries", default: `${DEFAULT_MAX_ENTRIES}`, summary: "entries retained after a failed write" },
  { name: "logToConsole", default: "false", summary: "also write entries to the console" },
  { name: "registerProcessHandlers", default: "false", summary: "flush on exit/SIGINT/SIGTERM/uncaught" },
  { name: "keepProcessAlive", default: "true", summary: "timers hold the process open" },
  { name: "suppressPathWarnings", default: "false", summary: "silence the \"..\" log directory notice" },
  { name: "onError", default: "undefined", summary: "callback invoked on I/O failures" },
  { name: "fileSystem", default: "node:fs", summary: "filesystem to write through; a seam for tests" }
];

/**
 * Loggers that opted into process handlers, and the handlers themselves.
 *
 * One handler per signal for the whole process, not one per logger. Each
 * logger used to install its own, and every one of them called process.exit,
 * so the first to run ended the process and every other logger lost whatever
 * it still had buffered.
 */
const activeLoggers = new Set<LogFile>();
let processHandlers: {
  exit: () => void;
  SIGINT: () => void;
  SIGTERM: () => void;
  uncaughtException: (error: Error) => void;
} | null = null;

/** Flushes every registered logger, then stops them and ends the process. */
const shutdownAllLoggers = (code: number): void => {
  // Snapshot: stop() removes the logger from the set it is iterating.
  for (const logger of [...activeLoggers]) {
    logger.flushSync();
    logger.stop();
  }
  process.exit(code);
};

/** Installs the shared handlers, once per process. */
const installProcessHandlers = (): void => {
  if (processHandlers) {
    return;
  }

  processHandlers = {
    exit: () => {
      for (const logger of activeLoggers) logger.flushSync();
    },
    SIGINT: () => shutdownAllLoggers(0),
    SIGTERM: () => shutdownAllLoggers(0),
    uncaughtException: (error: Error) => {
      for (const logger of activeLoggers) logger.critical("Uncaught Exception:", error);
      shutdownAllLoggers(1);
    }
  };

  process.on("exit", processHandlers.exit);
  process.on("SIGINT", processHandlers.SIGINT);
  process.on("SIGTERM", processHandlers.SIGTERM);
  process.on("uncaughtException", processHandlers.uncaughtException);
};

/** Removes the shared handlers once the last logger using them has stopped. */
const removeProcessHandlers = (): void => {
  if (!processHandlers || activeLoggers.size > 0) {
    return;
  }

  process.removeListener("exit", processHandlers.exit);
  process.removeListener("SIGINT", processHandlers.SIGINT);
  process.removeListener("SIGTERM", processHandlers.SIGTERM);
  process.removeListener("uncaughtException", processHandlers.uncaughtException);
  processHandlers = null;
};

/**
 * Interface for log file options.
 *
 * @property logLevel - Minimum log level to record. Default LogLevel.INFO (1).
 * @property dir - Optional directory to write log files to. Default "./logs".
 * @property fileFormat - Log file name format. Default "log-%DATE%.log".
 * @property rollover - Whether to rollover to a new log file when the date changes. Default true.
 * @property maxFileSize - Maximum file size in bytes before triggering a size-based rollover. Default 104857600 (100 MB). When exceeded, creates a new file with a numeric suffix (e.g., log-2024-01-01-1.log, log-2024-01-01-2.log). Set to 0 (or any value <= 0) to disable size-based rollover.
 * @property maxBufferEntries - Maximum number of entries retained after a failed write. Default 10000. Once reached, the oldest entries are discarded so a failing disk cannot exhaust memory. This bounds the retry backlog only; during normal operation the buffer is flushed well before it grows this large.
 * @property logToConsole - Whether to also log to the console. Default false.
 * @property startLog - Message to log on application start.
 * @property endLog - Message to log on application end.
 * @property logStr - Format string for log messages. Default "%DATE% %TIME% | %LEVEL% | %MESSAGE%".
 * @property registerProcessHandlers - Whether to register exit/SIGINT/SIGTERM/uncaughtException handlers that flush logs. Default false.
 * @property keepProcessAlive - Whether the flush and rollover timers keep the Node process alive. Default true, matching long-standing behavior. Set false for short-lived scripts that should exit once their work is done: the timers are unref'd so they cannot hold the event loop open, and buffered entries are flushed on process exit.
 * @property suppressPathWarnings - Silences the one-time console warning issued when the log directory contains a ".." segment. Default false. Set true when the path is deliberately relative and hard-coded.
 * @property onError - Callback invoked when a file I/O error occurs.
 * @property fileSystem - Filesystem to write through. Defaults to node:fs. A seam for tests, so behaviour that depends on I/O failing can be driven without a real disk in an awkward state; production code should leave it unset.
 */
interface LogFileOptions {
  logLevel?: LogLevel;
  dir?: string;
  fileFormat?: string;
  rollover?: boolean;
  maxFileSize?: number;
  maxBufferEntries?: number;
  logToConsole?: boolean;
  startLog?: string;
  endLog?: string;
  logStr?: string;
  registerProcessHandlers?: boolean;
  keepProcessAlive?: boolean;
  suppressPathWarnings?: boolean;
  onError?: (error: Error) => void;
  /**
   * Filesystem to write through. Defaults to node:fs.
   *
   * A seam for tests; production code should leave it unset.
   */
  fileSystem?: FileSystem;
}

/**
 * LogFile class to handle writing log messages to file.
 *
 * @param options - Options for configuring the log file. See LogFileOptions
 *                  for each option and its default.
 *
 * @returns LogFile instance.
 */
class LogFile {
  private date: string = "";
  private buffer: LogBuffer;
  private formatter: LogEntryFormatter;
  private startLog: string;
  private endLog: string;
  private rolloverEnabled: boolean;
  private logToConsole: boolean = false;
  private logLevel: LogLevel = LogLevel.INFO;
  private useServerTime: boolean = true;
  private registerProcessHandlers: boolean = false;
  private keepProcessAlive: boolean = true;
  private suppressPathWarnings: boolean = false;
  private warnedAboutPath: boolean = false;
  private onError?: (error: Error) => void;
  private readonly fs: FileSystem;
  private readonly target: RotatingFileTarget;
  /**
   * Flush once this many entries are buffered.
   *
   * One of three independent flush triggers, named apart because they were
   * previously BUFFER_SIZE (entries), maxBufferSize (bytes) and
   * maxBufferEntries (the retry cap), which read as variations of one thing.
   */
  private readonly FLUSH_AT_ENTRIES = 1000;

  /** Flush once this many bytes are buffered. */
  private readonly FLUSH_AT_BYTES = 16384; // 16 KB

  /** Flush an entry outright if nothing has been flushed for this long. */
  private readonly BUFFER_TIMEOUT = 1000;
  private readonly FLUSH_RETRY_INTERVAL = 1000;
  private readonly ROLLOVER_INTERVAL = 5000;
  private lastFlushTime = Date.now();
  private lastFlushError = 0;
  /**
   * Bytes currently buffered, as they will be encoded on disk.
   *
   * Counted in UTF-8 bytes, not string length: a log line of non-ASCII text
   * occupies up to four bytes per character, so measuring length let the
   * buffer grow well past the limit it was being compared against.
   */
  private reportingError = false;

  /** Runtime state, kept with the rest rather than buried among the methods. */
  private pushInterval: NodeJS.Timeout | null = null;
  private rolloverInterval: NodeJS.Timeout | null = null;
  private isStarted: boolean = false;
  private onExitFlush: (() => void) | null = null;

  static readonly DEBUG = LogLevel.DEBUG;
  static readonly INFO = LogLevel.INFO;
  static readonly WARNING = LogLevel.WARNING;
  static readonly ERROR = LogLevel.ERROR;
  static readonly CRITICAL = LogLevel.CRITICAL;

  constructor(options: LogFileOptions) {
    this.logLevel = options.logLevel ?? LogLevel.INFO
    this.logToConsole = options.logToConsole || false;
    this.rolloverEnabled = typeof options.rollover !== "undefined" ? options.rollover : true;
    this.buffer = new LogBuffer(options.maxBufferEntries ?? 0);
    this.registerProcessHandlers = options.registerProcessHandlers ?? false;
    this.keepProcessAlive = options.keepProcessAlive ?? true;
    this.suppressPathWarnings = options.suppressPathWarnings ?? false;
    this.onError = options.onError;
    this.fs = options.fileSystem ?? nodeFileSystem;

    this.formatter = new LogEntryFormatter(options.logStr || "%DATE% %TIME% | %LEVEL% | %MESSAGE%");

    // The banner callback reads startLog/endLog, which are assigned below.
    // Nothing renders a banner during construction, so the lazy read is fine
    // and keeps the target from needing the templates up front.
    this.target = new RotatingFileTarget({
      fs: this.fs,
      dir: options.dir || DEFAULT_LOG_DIR,
      fileFormat: options.fileFormat || "log-%DATE%.log",
      maxFileSize: options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE,
      banner: (kind: BannerKind) => this.renderBanner(kind === "start" ? this.startLog : this.endLog),
      onError: (error: Error, context: string) => this.reportError(error, context)
    });

    // After onError is assigned: anything that reports a problem during
    // construction must not run while the callback is still undefined.
    this.warnOnTraversalPath(this.target.getDir());
    this.startLog = options.startLog || "-----------------------------------------\n" +
      "------- Log Started: %DATETIME%\n" +
      "-----------------------------------------\n" as string;

    this.endLog = options.endLog || "-----------------------------------------\n" +
      "------- Log Ended: %DATETIME%\n" +
      "-----------------------------------------\n" as string;
  }

  /**
 * Warns once when the log directory contains a ".." segment.
 *
 * A relative path that climbs out of its starting directory is a legitimate
 * configuration and is not blocked. The risk is not the path itself, it is
 * where the path came from: if any part of it is derived from user input,
 * request data, or anything else an attacker can influence, the attacker
 * chooses where this process writes files. Consumers are expected to keep the
 * directory hard-coded; this notice exists so that an accidental ".." is
 * visible during development instead of shipping unnoticed.
 *
 * Only "." and ".." path segments count. A directory named "..data" or
 * "archive..old" is an ordinary name and is not reported.
 *
 * @param dir - The directory about to be used
 */
  private warnOnTraversalPath(dir: string): void {
    if (this.suppressPathWarnings || this.warnedAboutPath) {
      return;
    }

    if (!dir.split(/[\\/]/).some(segment => segment === "..")) {
      return;
    }

    this.warnedAboutPath = true;
    console.warn(
      `[logfile] Log directory "${dir}" contains a ".." segment, so it resolves outside the directory it starts from. ` +
      `That is supported and is safe when the value is hard-coded. If any part of it comes from user input, request ` +
      `data, or other untrusted configuration, this is a path traversal risk: an attacker could direct log writes to ` +
      `any location this process can write to. Pass suppressPathWarnings: true to silence this notice.`
    );
  }

  /**
 * Releases a timer's hold on the event loop when keepProcessAlive is false.
 *
 * An unref'd interval still fires for as long as the process is running; it
 * simply stops being a reason for the process to stay running.
 *
 * @param interval - The interval to release, if any
 */
  /**
 * Runs a timer callback, reporting anything it throws instead of letting it
 * escape.
 *
 * Interval callbacks have no try/catch above them, so an exception from one
 * surfaces as an uncaught exception in the host application. The callbacks
 * below handle their own failures; this is the structural guarantee that they
 * cannot take the process down if one ever stops doing so.
 *
 * @param action - The callback to run
 * @param context - Prefix used when reporting a failure
 */
  private safely(action: () => void, context: string): void {
    try {
      action();
    } catch (error) {
      this.reportError(toError(error), context);
    }
  }

  /**
 * Releases a timer's hold on the event loop when keepProcessAlive is false.
 *
 * An unref'd interval still fires for as long as the process is running; it
 * simply stops being a reason for the process to stay running.
 *
 * @param interval - The interval to release, if any
 */
  private releaseInterval(interval: NodeJS.Timeout | null): void {
    if (!this.keepProcessAlive && interval && typeof interval.unref === "function") {
      interval.unref();
    }
  }

  /**
 * Reports a failure through the onError callback, or to the console when no
 * callback is configured.
 *
 * The callback is application code, so it is isolated in two ways:
 * - Reentrancy is blocked. A callback that logs (a very natural thing to
 *   write) would otherwise re-enter the logger, and if that nested call also
 *   fails or drops an entry it reports again, amplifying without bound.
 * - Throwing is contained. The callback is invoked from timer-driven flushes
 *   with no try/catch above them, so an exception would surface as an
 *   uncaught exception rather than as a logging failure.
 *
 * @param error - The failure to report
 * @param fallback - Console prefix used when no callback is configured
 */
  private reportError(error: Error, fallback: string): void {
    if (this.reportingError) {
      return;
    }

    this.reportingError = true;
    try {
      if (this.onError) this.onError(error);
      else console.error(fallback, error);
    } catch {
      // a failing error handler must not take down the caller
    } finally {
      this.reportingError = false;
    }
  }

  /**
 * The current timestamp, honouring the useServerTime setting.
 */
  private timestamp(): string {
    return this.useServerTime ? new Date().toString() : new Date().toUTCString();
  }

  /**
 * The current date string used for file naming and rollover comparisons.
 *
 * start() and rollOver() must agree on this, otherwise a logger configured
 * with useServerTime false triggers a spurious rollover on the first timer
 * tick whenever the local and UTC dates differ.
 */
  private today(): string {
    return getDate(this.useServerTime);
  }

  /**
 * Renders a start or end banner, expanding %DATETIME% and guaranteeing a trailing newline.
 */
  private renderBanner(template: string): string {
    return endWithNewLine(replaceMacro(template, "%DATETIME%", this.timestamp()));
  }

  /**
 * Rollover to a new log file if the date has changed.
 * 
 * Check if the current date is different than the stored date.
 * If so, update the stored date.
 * 
 * If rollover is enabled:
 * - Append the end log message to the current log file.
 * - Generate the new log file name with the updated date.
 * - Write the start log message to the new file.
 * - Push any buffered logs to the new file.
 */
  private rollOver(next: string = this.today()): void {
    if (next === this.date) {
      return;
    }

    if (!this.rolloverEnabled) {
      this.date = next;
      return;
    }

    // Flush what is already buffered before switching files, so entries
    // logged before midnight are written to the day they belong to. This runs
    // while the old file is still current, so a size rollover triggered by the
    // flush still names its file after the day that file belongs to.
    this.flushSync();

    this.date = next;

    // The target reports rather than throws, and advances to the new day even
    // if a step fails. Retrying on every call would repeat the failure, and
    // later writes recreate the file once the directory is writable again.
    this.target.rollToDate(next);
  }

  /**
 * Trims the buffer to its cap and reports anything discarded.
 *
 * The discard policy lives in LogBuffer; reporting has to reach the
 * application, so that part stays with the logger.
 */
  private enforceBufferLimit(): void {
    const discarded = this.buffer.enforceLimit();
    if (discarded === 0) {
      return;
    }

    this.reportError(
      new Error(`Log buffer limit of ${this.buffer.getLimit()} entries reached; discarded ${discarded} buffered ${discarded === 1 ? "entry" : "entries"} (${this.buffer.getDropped()} total).`),
      "Log buffer limit reached:"
    );
  }

  /**
 * Writes anything buffered in memory to the current log file, immediately.
 *
 * Synchronous, so it blocks the event loop: call it sparingly. The logger
 * flushes on its own as the buffer fills and on a timer, so an explicit call
 * is only needed to guarantee an entry is on disk before something else
 * happens - shutting down, or crashing on purpose.
 *
 * When the write fails the entries are put back so a transient failure does
 * not lose them, but the buffer is capped at maxBufferEntries so a persistent
 * failure (full disk, revoked permissions, deleted directory) cannot grow
 * without bound.
 */
  flushSync(): void {
    if (this.buffer.isEmpty() || !this.target.isOpen()) {
      return;
    }

    const pending = this.buffer.flush();
    const logsToWrite = `${pending.join("\n")}\n`;

    let written = false;
    try {
      this.target.write(logsToWrite);
      written = true;
      this.lastFlushTime = Date.now();
      this.lastFlushError = 0;
    } catch (error) {
      this.lastFlushTime = Date.now();
      this.lastFlushError = this.lastFlushTime;
      this.buffer.restore(pending);
      this.enforceBufferLimit();

      this.reportError(toError(error), "Failed to flush logs:");
    }

    // Outside the catch above, deliberately. These entries are on disk now, so
    // anything that went wrong afterwards must not put them back on the buffer:
    // the catch would re-queue entries that were already written and duplicate
    // every one of them on the next flush.
    if (written) {
      this.target.rollIfOversized();
    }
  }

  /**
 * Converts a numeric log level to a string representation.
 * 
 * @param level The numeric log level to convert.
 * @returns The string representation of the log level.
 */
  private logLevelToString(level: number): string {
    return Object.prototype.hasOwnProperty.call(levelMap, level) ? levelMap[level] : "UNKNOWN";
  }

  /**
 * Sets the log level.
 *
 * @param level - The numeric log level to set.
 */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
 * Gets the current log level.
 * 
 * @returns The current numeric log level.
 */
  getLogLevel(): LogLevel {
    return this.logLevel;
  }

  /**
 * Sets the log directory.
 *
 * When the logger is already running the directory is created immediately,
 * otherwise every subsequent write would fail against a path that does not
 * exist yet.
 *
 * Note: the directory is used as given, so any path the process can write to
 * is allowed. Applications that build it from external input are responsible
 * for validating it first; a ".." segment triggers a one-time console warning
 * to make an accidental one visible.
 *
 * @param dir - The path to the log directory.
 */
  setLogDir(dir: string): void {
    // Flush first: entries already buffered were logged against the old
    // directory and belong there, not in the new one.
    if (this.isStarted) {
      this.flushSync();
    }

    // Same guard as the constructor. Without it an empty string left the
    // logger writing to the filesystem root, and mkdirSync failed on "".
    this.target.setDir(dir || DEFAULT_LOG_DIR);
    this.warnOnTraversalPath(this.target.getDir());

    // The destination changed, so any backoff from the previous location no
    // longer applies; allow the next entry to attempt a write immediately.
    this.lastFlushError = 0;

    if (this.isStarted) {
      this.target.ensureDir();
    }
  }

  /**
 * Gets the current log directory.
 * 
 * @returns The path to the current log directory.
 */
  getLogDir(): string {
    return this.target.getDir();
  }

  /**
 * Sets the file name format to use for log files.
 *
 * A running logger switches to the new name immediately, closing the old file
 * with an end banner first. Without that the format changed but the open file
 * did not, so getFileFormat() reported the new value while file() kept
 * returning the old one until the date next changed.
 *
 * @param fileFormat - The file name format
 */
  setFileFormat(fileFormat: string): void {
    // Flush first: entries already buffered were logged against the old file
    // name and belong there. Harmless when the format is unchanged, which the
    // target detects and ignores.
    if (this.isStarted) {
      this.flushSync();
    }

    this.target.setFormat(fileFormat, this.date);
  }

  /**
 * Gets the current file name format for log files.
 * 
 * @returns The current file name format
 */
  getFileFormat(): string {
    return this.target.getFormat();
  }

  /**
 * Sets whether to log to the console.
 *
 * @param logToConsole - Whether logging should be enabled on the console.
 */
  setLogToConsole(logToConsole: boolean): void {
    this.logToConsole = logToConsole;
  }

  /**
 * Gets whether logging to console is enabled.
 * 
 * @returns True if logging to console is enabled, false otherwise.
 */
  getLogToConsole(): boolean {
    return this.logToConsole;
  }

  /**
 * Sets the log string template to use for logging.
 * 
 * @param logStr The log string template.
 */
  setLogStr(logStr: string): void {
    this.formatter.setTemplate(logStr);
  }

  /**
 * Gets the log string template used for logging.
 * 
 * @returns The log string template.
 */
  getLogStr(): string {
    return this.formatter.getTemplate();
  }

  /**
 * Sets the start log message to use when logging starts.
 * 
 * @param startLog The start log message. 
 */
  setStartLog(startLog: string): void {
    this.startLog = startLog;
  }

  /**
 * Gets the start log message used when logging starts.
 * 
 * @returns The start log message.
 */
  getStartLog(): string {
    return this.startLog;
  }

  /**
 * Sets the end log message to use when logging ends.
 * 
 * @param endLog The end log message.
 */
  setEndLog(endLog: string): void {
    this.endLog = endLog;
  }

  /**
 * Gets the end log message used when logging ends.
 *
 * @returns The end log message.
 */
  getEndLog(): string {
    return this.endLog;
  }

  /**
 * Sets whether to roll over to a new log file when the date changes.
 *
 * Starts or stops the rollover timer to match. Without this, enabling rollover
 * on a running logger left it unarmed, so an idle process would not roll over
 * until something was logged; disabling it left the timer running.
 *
 * @param rollover Whether to enable log rollover.
 */
  setRollover(rollover: boolean): void {
    this.rolloverEnabled = rollover;

    if (!this.isStarted) {
      return;
    }

    if (rollover && !this.rolloverInterval) {
      this.rolloverInterval = setInterval(() => this.safely(() => this.rollOver(), "Failed to roll over the log file:"), this.ROLLOVER_INTERVAL);
      this.releaseInterval(this.rolloverInterval);
    } else if (!rollover && this.rolloverInterval) {
      clearInterval(this.rolloverInterval);
      this.rolloverInterval = null;
    }
  }

  /**
 * Gets whether log rollover is enabled when the maximum log size is reached.
 * 
 * @returns True if log rollover is enabled, false otherwise.
 */
  getRollover(): boolean {
    return this.rolloverEnabled;
  }

/**
 * Sets whether timestamps use server local time or UTC.
 *
 * Applies to every timestamp the logger produces: the %DATE%, %TIME% and
 * %DATETIME% macros in log entries, the %DATETIME% in start and end banners,
 * and the date used for file naming and rollover.
 *
 * @param useServerTime True for server local time (default), false for UTC.
 */
  setUseServerTime(useServerTime: boolean): void {
    this.useServerTime = useServerTime;
  }

  /**
 * Gets whether timestamps use server local time or UTC.
 *
 * @returns True when using server local time (the default), false for UTC.
 */
  getUseServerTime(): boolean {
    return this.useServerTime;
  }

  /**
 * Logs help information to the console: log levels, the macros available in
 * the entry format and the file name format, and the constructor options with
 * their defaults.
 */
  getHelp(): string {
    const levels = LEVELS
      .map(({ level, name }) => `      ${level}: ${name.charAt(0)}${name.slice(1).toLowerCase()}`)
      .join("\n");

    // Width is derived, not hand-aligned, so a longer option name cannot
    // quietly break the column.
    const macroWidth = Math.max(...MACRO_DOCS.map(m => m.macro.length));
    const macros = MACRO_DOCS
      .map(m => `      ${`${m.macro}:`.padEnd(macroWidth + 1)} ${m.summary}`)
      .join("\n");

    const width = Math.max(...OPTION_DOCS.map(o => `${o.name} (${o.default})`.length));
    const options = OPTION_DOCS
      .map(o => `      ${`${o.name} (${o.default})`.padEnd(width)}  ${o.summary}`)
      .join("\n");

    const help = `
      Log Levels:
${levels}
      Messages below the configured logLevel are not written.

      Log String Macros (logStr, startLog, endLog):
${macros}
      %MESSAGE% is substituted last, so macros inside a message are not expanded.
      startLog and endLog support %DATETIME% only.

      File Name Format Macro (fileFormat):
      %DATE%:     Date
      Path separators are stripped: the format names a file, never a path.

      Options, with defaults:
${options}

      Timestamps use server local time unless setUseServerTime(false) is called.`;

    console.log(help);
    return help;
  }

  /**
 * Gets the path to the current log file.
 * 
 * @returns The path to the current log file.
 */
  file(): string {
    // Empty rather than "<dir>/" when no file is open, which is the case
    // before start() and after stop(). The directory path answered true to
    // existsSync, so callers checking for their log file were told it existed.
    return this.target.path();
  }

  /**
 * Gets the path to the log file from the previous date.
 *
 * @returns The path to the previous log file, or "" if there has not been one.
 */
  lastFile(): string {
    return this.target.previousPath();
  }


  /**
 * Starts the logger by initializing the log directory and files.
 *
 * Configuration comes from the constructor options and the setters, not from
 * arguments. Calling this on an already-started logger is a no-op.
 *
 * @returns True if the log file was initialized successfully, false otherwise.
 *          Failures are reported through onError rather than thrown.
 */
  start(): boolean {
    if (this.isStarted) {
      return this.target.exists();
    }

    this.date = this.today();
    this.target.open(this.date);

    // The target reports its own failures, so a directory or file that could
    // not be created shows up as a missing file rather than as a throw. Report
    // false, as documented; a later call retries once whatever blocked it is
    // resolved.
    if (!this.target.exists()) {
      // release(), not close(): closing appends an end banner, and that append
      // would create the very file that could not be opened.
      this.target.release();
      return false;
    }

    this.pushInterval = setInterval(() => this.safely(() => this.flushSync(), "Failed to flush logs:"), this.BUFFER_TIMEOUT);
    this.releaseInterval(this.pushInterval);

    if (this.rolloverEnabled) {
      this.rolloverInterval = setInterval(() => this.safely(() => this.rollOver(), "Failed to roll over the log file:"), this.ROLLOVER_INTERVAL);
      this.releaseInterval(this.rolloverInterval);
    }

    // With the timers unref'd the process can end while entries are still
    // buffered, so flush on exit. Skipped when registerProcessHandlers is set,
    // because that already installs an exit handler that flushes.
    if (!this.keepProcessAlive && !this.registerProcessHandlers) {
      this.onExitFlush = () => this.flushSync();
      process.on('exit', this.onExitFlush);
    }

    // Register handlers for process termination signals (opt-in). The
    // handlers themselves are shared by every logger that opts in, so that a
    // signal flushes all of them before the process ends rather than only
    // whichever one happened to be first.
    if (this.registerProcessHandlers) {
      activeLoggers.add(this);
      installProcessHandlers();
    }

    this.isStarted = true;
    return true;
  }

  /**
 * Stops the logger by clearing intervals, closing the log file, and resetting state.
 * 
 * @returns True if the logger was stopped successfully, false otherwise.
 */
  stop(): boolean {
    if (!this.isStarted) {
      return true;
    }

    if (this.pushInterval) {
      clearInterval(this.pushInterval);
      this.pushInterval = null;
    }

    if (this.rolloverInterval) {
      clearInterval(this.rolloverInterval);
      this.rolloverInterval = null;
    }

    if (this.onExitFlush) {
      process.removeListener('exit', this.onExitFlush);
      this.onExitFlush = null;
    }

    // Leaving the shared handlers is what uninstalls them, but only once the
    // last logger using them has stopped.
    if (activeLoggers.delete(this)) {
      removeProcessHandlers();
    }

    // Reset state before the early returns below. Leaving isStarted true when
    // the file or directory has been removed externally (by logrotate, say)
    // makes the next start() a no-op and silently kills the flush intervals.
    this.isStarted = false;

    // Flush before the existence checks below. A write recreates a file that
    // was removed externally, so buffered entries survive shutdown instead of
    // being discarded along with the missing file.
    this.flushSync();

    // Only write an end banner to a file that is still there. A file removed
    // externally should stay removed rather than being recreated just to hold
    // a banner; the flush above already rescued anything still buffered.
    const present = this.target.dirExists() && this.target.exists();
    const stopped = present ? this.target.close() : true;

    // Always release the file so a later log() call starts the logger again,
    // rather than writing with no intervals running. close() already did this
    // when the file was present; release() covers the case where it was not,
    // without recreating it to hold a banner.
    this.target.release();

    return stopped;
  }

  private addToLogs(log: string) {
    this.buffer.add(log);

    // With no target file - start() failed, or the logger was stopped - nothing
    // can be flushed, so no write ever fails and the cap would never apply.
    if (!this.target.isOpen()) {
      this.enforceBufferLimit();
      return;
    }

    // After a failed write, back off instead of attempting a synchronous
    // write for every subsequent entry. The interval keeps retrying.
    if (this.lastFlushError && Date.now() - this.lastFlushError < this.FLUSH_RETRY_INTERVAL) {
      this.enforceBufferLimit();
      return;
    }

    if (this.buffer.bytes() >= this.FLUSH_AT_BYTES ||
        this.buffer.count() >= this.FLUSH_AT_ENTRIES ||
        Date.now() - this.lastFlushTime >= this.BUFFER_TIMEOUT) {
      this.flushSync();
    }

  }

  /**
   * Gets the number of buffered entries discarded because the buffer limit
   * was reached while writes were failing.
   *
   * @returns The total count of discarded log entries.
   */
  getDroppedLogs(): number {
    return this.buffer.getDropped();
  }

  /**
 * Logs a message to the log file with the given log level.
 *
 * The return value reports whether the entry was accepted, NOT whether it
 * reached disk. Writes are buffered and flushed later, so a full disk or a
 * revoked permission is discovered after this has already returned true.
 * Use the onError callback to observe write failures.
 *
 * @param message - The message to log.
 * @param level - The log level, defaults to LogLevel.DEBUG (0).
 * @returns True if the entry was accepted or filtered out by the log level,
 *          false if it could not be formatted or buffered.
 */
  log(message: string, level: LogLevel = LogLevel.DEBUG): boolean {
    try {
      // One reading of the clock for the whole entry, including the rollover
      // decision. Reading it separately for each macro let an entry written
      // across a second or midnight boundary carry parts that disagreed, and
      // let the rollover file an entry under a date it did not carry.
      const stamps = formatTimestamps(this.useServerTime);

      if (!this.target.isOpen()) {
        this.start();
      }

      // Roll over before the entry is buffered, not after. Buffering first can
      // flush it immediately (once the buffer timeout has elapsed), writing an
      // entry timestamped today into yesterday's file.
      this.rollOver(stamps.date);

      if (level < this.logLevel) {
        return true;
      }

      const logThis = this.formatter.render({
        date: stamps.date,
        time: stamps.time,
        dateTime: stamps.dateTime,
        level: this.logLevelToString(level),
        message: String(message)
      });

      this.addToLogs(logThis);

      if (this.logToConsole) {
        console.log(logThis);
      }

    } catch (ex) {
      this.reportError(toError(ex), "Failed to log message:");
      return false;
    }

    return true;
  }

  /**
   * Serializes the arguments and logs them at the given level.
   *
   * The level is checked BEFORE the arguments are serialized. stringifyArgs
   * walks objects and runs their getters, so doing it first meant a logger at
   * ERROR still paid the full cost of every debug(bigObject) call and could
   * run application code for an entry it was about to discard.
   *
   * @param level - The level to log at
   * @param args - The arguments to be logged
   * @returns True if the message was accepted, false if it could not be logged.
   */
  private logAt(level: LogLevel, args: unknown[]): boolean {
    if (level < this.logLevel) {
      return true;
    }

    return this.log(args.map(stringifyArgs).join(" "), level);
  }

  /**
   * Logs a debug message.
   * @param {...any} args - The arguments to be logged.
   * @returns {boolean} True if the log was accepted, false otherwise.
   */
  debug(...args: any[]): boolean {
    return this.logAt(LogLevel.DEBUG, args);
  }

  /**
   * Logs an info message.
   * @param {...any} args - The arguments to be logged.
   * @returns {boolean} True if the log was accepted, false otherwise.
   */
  info(...args: any[]): boolean {
    return this.logAt(LogLevel.INFO, args);
  }

  /**
   * Logs a warning message.
   * @param {...any} args - The arguments to be logged.
   * @returns {boolean} True if the log was accepted, false otherwise.
   */
  warning(...args: any[]): boolean {
    return this.logAt(LogLevel.WARNING, args);
  }

  /**
   * Alias for warning method.
   * @param {...any} args - The arguments to be logged.
   * @returns {boolean} True if the log was accepted, false otherwise.
   */
  warn(...args: any[]): boolean {
    return this.warning(...args);
  }

  /**
   * Logs an error message.
   * @param {...any} args - The arguments to be logged.
   * @returns {boolean} True if the log was accepted, false otherwise.
   */
  error(...args: any[]): boolean {
    return this.logAt(LogLevel.ERROR, args);
  }

  /**
   * Logs a critical message and flushes it to disk immediately.
   * @param {...any} args - The arguments to be logged.
   * @returns {boolean} True if the log was accepted, false otherwise.
   */
  critical(...args: any[]): boolean {
    const result = this.logAt(LogLevel.CRITICAL, args);
    this.flushSync();
    return result;
  }
}

export default LogFile;

// Type-only, so the runtime bundle keeps its single default export while
// consumers can still name the options type. The generated declaration is
// what the package publishes; there is no hand-maintained copy to fall behind.
export type { LogFileOptions, LogLevel };
export type { LogMacro } from "./formatter";
export type { FileSystem } from "./filesystem";