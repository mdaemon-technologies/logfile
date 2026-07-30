import { appendFileSync, existsSync, mkdirSync, statSync } from "fs";
import { getDate, getTime, getDateTime, endWithNewLine, stringifyArgs, replaceMacro, sanitizeFileFormat, UNSAFE_CHARS } from "./util";

enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARNING = 2,
  ERROR = 3,
  CRITICAL = 4
}

type LogMacro = "%DATETIME%" | "%DATE%" | "%TIME%" | "%LEVEL%" | "%MESSAGE%";
type LogFormat = `${string}${LogMacro}${string}` | string | `${LogMacro}`;

const levelMap: Record<number, string> = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO", 
  [LogLevel.WARNING]: "WARNING",
  [LogLevel.ERROR]: "ERROR",
  [LogLevel.CRITICAL]: "CRITICAL"
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
 */
interface LogFileOptions {
  logLevel?: LogLevel;
  dir?: string;
  fileFormat?: string;
  rollover?: boolean;
  maxFileSize?: number;
  maxBufferEntries?: number;
  logToConsole?: boolean;
  startLog?: LogFormat;
  endLog?: LogFormat;
  logStr?: LogFormat;
  registerProcessHandlers?: boolean;
  keepProcessAlive?: boolean;
  suppressPathWarnings?: boolean;
  onError?: (error: Error) => void;
}

/**
 * LogFile class to handle writing log messages to file.
 *
 * @param options - Options for configuring the log file.
 * @param options.logLevel - Minimum log level to record. Default LogLevel.INFO (1).
 * @param options.dir - Directory to write log files. Default ./logs.
 * @param options.fileFormat - Log file name format. Default log-%DATE%.log.
 * @param options.rollover - Whether to rollover to a new log file when the date changes. Default true.
 * @param options.maxFileSize - Maximum file size in bytes before triggering size-based rollover. Default 104857600 (100 MB). When exceeded, a new file is created with an incremental numeric suffix (e.g., log-2024-01-01-1.log, log-2024-01-01-2.log). Set to 0 (or any value <= 0) to disable size-based rollover.
 * @param options.maxBufferEntries - Maximum number of entries retained after a failed write. Default 10000.
 * @param options.logToConsole - Whether to also log to console. Default false.
 * @param options.startLog - Message logged on start.
 * @param options.endLog - Message logged on end.
 * @param options.logStr - Format for log messages.
 * @param options.registerProcessHandlers - Whether to register process termination handlers that flush logs. Default false.
 * @param options.keepProcessAlive - Whether the timers keep the Node process alive. Default true.
 * @param options.onError - Callback invoked when a file I/O error occurs.
 *
 * @returns LogFile instance.
 */
class LogFile {
  private date: string = "";
  private currentFile: string = "";
  private previousFile: string = "";
  private logs: string[] = [];
  private dir: string;
  private fileFormat: string;
  private logStr: LogFormat;
  private startLog: LogFormat;
  private endLog: LogFormat;
  private rolloverEnabled: boolean;
  private logToConsole: boolean = false;
  private logLevel: LogLevel = LogLevel.INFO;
  private useServerTime: boolean = true;
  private registerProcessHandlers: boolean = false;
  private handlersRegistered: boolean = false;
  private keepProcessAlive: boolean = true;
  private suppressPathWarnings: boolean = false;
  private warnedAboutPath: boolean = false;
  private onError?: (error: Error) => void;
  private readonly BUFFER_SIZE = 1000;
  private readonly BUFFER_TIMEOUT = 1000;
  private readonly FLUSH_RETRY_INTERVAL = 1000;
  private readonly ROLLOVER_INTERVAL = 5000;
  private lastFlushTime = Date.now();
  private lastFlushError = 0;
  private bufferSize = 0;
  private maxBufferSize = 16384; // 16 KB
  private maxBufferEntries: number;
  private droppedLogs = 0;
  private reportingError = false;
  private maxFileSize: number;
  private fileSuffix: number = 0;

  static readonly DEBUG = LogLevel.DEBUG;
  static readonly INFO = LogLevel.INFO;
  static readonly WARNING = LogLevel.WARNING;
  static readonly ERROR = LogLevel.ERROR;
  static readonly CRITICAL = LogLevel.CRITICAL;

  constructor(options: LogFileOptions) {
    this.logLevel = options.logLevel ?? LogLevel.INFO
    this.dir = options.dir || "./logs";
    this.fileFormat = sanitizeFileFormat(options.fileFormat || "log-%DATE%.log");
    this.logToConsole = options.logToConsole || false;
    this.rolloverEnabled = typeof options.rollover !== "undefined" ? options.rollover : true;
    this.maxFileSize = options.maxFileSize ?? 104857600; // 100 MB default
    this.maxBufferEntries = options.maxBufferEntries && options.maxBufferEntries > 0 ? options.maxBufferEntries : 10000;
    this.registerProcessHandlers = options.registerProcessHandlers ?? false;
    this.keepProcessAlive = options.keepProcessAlive ?? true;
    this.suppressPathWarnings = options.suppressPathWarnings ?? false;
    this.onError = options.onError;

    // After onError is assigned: anything that reports a problem during
    // construction must not run while the callback is still undefined.
    this.warnOnTraversalPath(this.dir);
    this.logStr = options.logStr || "%DATE% %TIME% | %LEVEL% | %MESSAGE%" as LogFormat;
    this.startLog = options.startLog || "-----------------------------------------\n" +
      "------- Log Started: %DATETIME%\n" +
      "-----------------------------------------\n" as LogFormat;

    this.endLog = options.endLog || "-----------------------------------------\n" +
      "------- Log Ended: %DATETIME%\n" +
      "-----------------------------------------\n" as LogFormat;
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
  private warnOnTraversalPath = (dir: string): void => {
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
  private releaseInterval = (interval: NodeJS.Timeout | null): void => {
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
  private reportError = (error: Error, fallback: string): void => {
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
  private timestamp = (): string => this.useServerTime ? new Date().toString() : new Date().toUTCString();

  /**
 * The current date string used for file naming and rollover comparisons.
 *
 * start() and rollOver() must agree on this, otherwise a logger configured
 * with useServerTime false triggers a spurious rollover on the first timer
 * tick whenever the local and UTC dates differ.
 */
  private today = (): string => getDate(this.useServerTime);

  /**
 * Renders a start or end banner, expanding %DATETIME% and guaranteeing a trailing newline.
 */
  private banner = (template: LogFormat): string => endWithNewLine(replaceMacro(template, "%DATETIME%", this.timestamp()));

  /**
 * Opens the current file with a start banner.
 *
 * Appends when the file already exists rather than truncating it. A rollover
 * can land on an existing file in two ways: a fileFormat without %DATE%
 * produces the same name every day, and a suffixed name may already be on
 * disk from an earlier run. Truncating would discard those logs.
 */
  private openCurrentFile = (): void => {
    // appendFileSync creates the file when it is missing, so there is no need
    // to check first and no branch that truncates. Checking and then writing
    // would also leave a window in which another writer creates the file
    // between the check and the write, and lose whatever it wrote.
    appendFileSync(this.file(), this.banner(this.startLog));
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
  private rollOver = (): void => {
    const next = this.today();
    if (next === this.date) {
      return;
    }

    if (!this.rolloverEnabled) {
      this.date = next;
      return;
    }

    try {
      // Flush what is already buffered before switching files, so entries
      // logged before midnight are written to the day they belong to. This runs
      // while the old date is still current, so a size rollover triggered by
      // the flush still names its file after the old date.
      this.pushLogs();

      appendFileSync(this.file(), this.banner(this.endLog));
      this.previousFile = this.currentFile;
      this.fileSuffix = 0; // Reset suffix for new day
      this.date = next;
      this.currentFile = replaceMacro(this.fileFormat, "%DATE%", this.date);
      this.openCurrentFile();
    } catch (error) {
      // This runs on a timer with no try/catch above it, so a failure here
      // would otherwise surface as an uncaught exception. Move to the new day
      // regardless: retrying on every subsequent call would repeat the failure,
      // and later writes recreate the file once the directory is writable.
      this.fileSuffix = 0;
      this.date = next;
      this.currentFile = replaceMacro(this.fileFormat, "%DATE%", next);
      this.reportError(error instanceof Error ? error : new Error(String(error)), "Failed to roll over the log file:");
    }
  }

  /**
 * Check if the current log file exceeds the maximum file size.
 * If so, rollover to a new file with an incremented suffix.
 */
  private checkFileSizeAndRollover = (): void => {
    if (this.maxFileSize <= 0 || !existsSync(this.file())) {
      return;
    }

    try {
      const stats = statSync(this.file());
      if (stats.size >= this.maxFileSize) {
        // Append end log to current file
        appendFileSync(this.file(), this.banner(this.endLog));
        
        // Increment suffix and generate new filename
        this.previousFile = this.currentFile;
        this.fileSuffix++;
        
        // Generate new filename with suffix
        const baseFilename = replaceMacro(this.fileFormat, "%DATE%", this.date);
        const extIndex = baseFilename.lastIndexOf('.');
        if (extIndex > 0) {
          this.currentFile = `${baseFilename.substring(0, extIndex)}-${this.fileSuffix}${baseFilename.substring(extIndex)}`;
        } else {
          this.currentFile = `${baseFilename}-${this.fileSuffix}`;
        }
        
        // Create new file with start log
        this.openCurrentFile();
      }
    } catch (error) {
      this.reportError(error instanceof Error ? error : new Error(String(error)), "Failed to check file size:");
    }
  }

  /**
 * Discards the oldest buffered entries once the buffer exceeds
 * maxBufferEntries, keeping memory bounded while writes are failing.
 * Every discarded entry is counted and reported.
 */
  private enforceBufferLimit = (): void => {
    if (this.logs.length <= this.maxBufferEntries) {
      return;
    }

    // Discard in batches rather than one entry at a time. Removing from the
    // front of the array shifts every remaining entry, so trimming on each
    // call would make every log O(buffer size) once the cap is reached.
    const overflow = this.logs.length - this.maxBufferEntries + Math.floor(this.maxBufferEntries / 10);

    // Subtract only what was removed; recomputing the total would be O(n) too.
    const discarded = this.logs.splice(0, Math.min(overflow, this.logs.length));
    for (const entry of discarded) {
      this.bufferSize -= entry.length;
    }
    this.droppedLogs += discarded.length;

    this.reportError(
      new Error(`Log buffer limit of ${this.maxBufferEntries} entries reached; discarded ${discarded.length} buffered ${discarded.length === 1 ? "entry" : "entries"} (${this.droppedLogs} total).`),
      "Log buffer limit reached:"
    );
  }

  /**
 * If there are logs buffered in memory, write them
 * to the current log file. Clear the buffer after
 * writing.
 *
 * When the write fails the entries are put back so a transient failure does
 * not lose them, but the buffer is capped at maxBufferEntries so a persistent
 * failure (full disk, revoked permissions, deleted directory) cannot grow
 * without bound.
 */
  private pushLogs = (): void => {
    if (this.logs.length < 1 || !this.currentFile) {
      return;
    }

    const pending = this.logs;
    const logsToWrite = `${pending.join("\n")}\n`;
    this.logs = [];
    this.bufferSize = 0;

    try {
      appendFileSync(this.file(), logsToWrite);
      this.lastFlushTime = Date.now();
      this.lastFlushError = 0;

      // Check if file size exceeded after writing
      this.checkFileSizeAndRollover();
    } catch (error) {
      this.lastFlushTime = Date.now();
      this.lastFlushError = this.lastFlushTime;
      this.logs = pending.concat(this.logs);
      this.bufferSize = pending.reduce((total, entry) => total + entry.length, this.bufferSize);
      this.enforceBufferLimit();

      this.reportError(error instanceof Error ? error : new Error(String(error)), "Failed to flush logs:");
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
      this.pushLogs();
    }

    this.dir = dir;
    this.warnOnTraversalPath(this.dir);

    // The target changed, so any backoff from the previous location no longer
    // applies; allow the next entry to attempt a write immediately.
    this.lastFlushError = 0;

    if (this.isStarted && !existsSync(this.dir)) {
      try {
        mkdirSync(this.dir, { recursive: true });
      } catch (error) {
        this.reportError(error instanceof Error ? error : new Error(String(error)), "Failed to create log directory:");
      }
    }
  }

  /**
 * Gets the current log directory.
 * 
 * @returns The path to the current log directory.
 */
  getLogDir(): string {
    return this.dir;
  }

  /**
 * Sets the file name format to use for log files.
 * 
 * @param fileFormat - The file name format
 */
  setFileFormat(fileFormat: string): void {
    this.fileFormat = sanitizeFileFormat(fileFormat);
  }

  /**
 * Gets the current file name format for log files.
 * 
 * @returns The current file name format
 */
  getFileFormat(): string {
    return this.fileFormat;
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
  setLogStr(logStr: LogFormat): void {
    this.logStr = logStr;
  }

  /**
 * Gets the log string template used for logging.
 * 
 * @returns The log string template.
 */
  getLogStr(): LogFormat {
    return this.logStr;
  }

  /**
 * Sets the start log message to use when logging starts.
 * 
 * @param startLog The start log message. 
 */
  setStartLog(startLog: LogFormat): void {
    this.startLog = startLog;
  }

  /**
 * Gets the start log message used when logging starts.
 * 
 * @returns The start log message.
 */
  getStartLog(): LogFormat {
    return this.startLog;
  }

  /**
 * Sets the end log message to use when logging ends.
 * 
 * @param endLog The end log message.
 */
  setEndLog(endLog: LogFormat): void {
    this.endLog = endLog;
  }

  /**
 * Gets the end log message used when logging ends.
 *
 * @returns The end log message.
 */
  getEndLog(): LogFormat {
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
      this.rolloverInterval = setInterval(this.rollOver, this.ROLLOVER_INTERVAL);
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
  getHelp(): void {
    console.log(`
      Log Levels:
      0: Debug
      1: Info
      2: Warning
      3: Error
      4: Critical
      Messages below the configured logLevel are not written.

      Log String Macros (logStr, startLog, endLog):
      %DATETIME%: Date and Time
      %DATE%:     Date
      %TIME%:     Time
      %LEVEL%:    Log Level
      %MESSAGE%:  Message
      %MESSAGE% is substituted last, so macros inside a message are not expanded.
      startLog and endLog support %DATETIME% only.

      File Name Format Macro (fileFormat):
      %DATE%:     Date
      Path separators are stripped: the format names a file, never a path.

      Options (default):
      logLevel (1/INFO)                minimum level recorded
      dir ("./logs")                   directory for log files
      fileFormat ("log-%DATE%.log")    log file name format
      logStr ("%DATE% %TIME% | %LEVEL% | %MESSAGE%")
      rollover (true)                  new file when the date changes
      maxFileSize (104857600)          size rollover in bytes; 0 disables it
      maxBufferEntries (10000)         entries retained after a failed write
      logToConsole (false)             also write entries to the console
      registerProcessHandlers (false)  flush on exit/SIGINT/SIGTERM/uncaught
      keepProcessAlive (true)          timers hold the process open
      suppressPathWarnings (false)     silence the ".." log directory notice
      onError (undefined)              callback invoked on I/O failures

      Timestamps use server local time unless setUseServerTime(false) is called.`);
  }

  /**
 * Gets the path to the current log file.
 * 
 * @returns The path to the current log file.
 */
  file(): string {
    return `${this.dir}/${this.currentFile}`;
  }

  /**
 * Gets the path to the log file from the previous date.
 *
 * @returns The path to the log file from the previous date.
 */
  lastFile(): string {
    return `${this.dir}/${this.previousFile}`;
  }

  private pushInterval: NodeJS.Timeout | null = null;
  private rolloverInterval: NodeJS.Timeout | null = null;
  private isStarted: boolean = false;
  private _onExit: (() => void) | null = null;
  private _onSIGINT: (() => void) | null = null;
  private _onSIGTERM: (() => void) | null = null;
  private _onUncaughtException: ((error: Error) => void) | null = null;
  private _onExitFlush: (() => void) | null = null;

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
      return existsSync(this.file());
    }

    try {
      if (!existsSync(this.dir)) {
        mkdirSync(this.dir, { recursive: true });
      }

      this.date = this.today();
      this.currentFile = replaceMacro(this.fileFormat, "%DATE%", this.date);

      this.openCurrentFile();
    } catch (error) {
      // Report and return false, as documented, rather than throwing at the
      // caller. Clearing currentFile lets a later call retry once whatever
      // blocked the directory or file is resolved.
      this.currentFile = "";
      this.reportError(error instanceof Error ? error : new Error(String(error)), "Failed to start the logger:");
      return false;
    }

    this.pushInterval = setInterval(this.pushLogs, this.BUFFER_TIMEOUT);
    this.releaseInterval(this.pushInterval);

    if (this.rolloverEnabled) {
      this.rolloverInterval = setInterval(this.rollOver, this.ROLLOVER_INTERVAL);
      this.releaseInterval(this.rolloverInterval);
    }

    // With the timers unref'd the process can end while entries are still
    // buffered, so flush on exit. Skipped when registerProcessHandlers is set,
    // because that already installs an exit handler that flushes.
    if (!this.keepProcessAlive && !this.registerProcessHandlers) {
      this._onExitFlush = () => this.pushLogs();
      process.on('exit', this._onExitFlush);
    }

    // Register handlers for process termination signals (opt-in)
    if (this.registerProcessHandlers && !this.handlersRegistered) {
      this._onExit = () => this.pushLogs();
      this._onSIGINT = () => {
        this.pushLogs();
        this.stop();
        process.exit(0);
      };
      this._onSIGTERM = () => {
        this.pushLogs();
        this.stop();
        process.exit(0);
      };
      this._onUncaughtException = (error: Error) => {
        this.critical('Uncaught Exception:', error);
        this.pushLogs();
        this.stop();
        process.exit(1);
      };

      process.on('exit', this._onExit);
      process.on('SIGINT', this._onSIGINT);
      process.on('SIGTERM', this._onSIGTERM);
      process.on('uncaughtException', this._onUncaughtException);
      this.handlersRegistered = true;
    }

    this.isStarted = true;
    return existsSync(this.file());
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

    if (this._onExitFlush) {
      process.removeListener('exit', this._onExitFlush);
      this._onExitFlush = null;
    }

    // Remove process handlers if registered
    if (this.handlersRegistered) {
      if (this._onExit) process.removeListener('exit', this._onExit);
      if (this._onSIGINT) process.removeListener('SIGINT', this._onSIGINT);
      if (this._onSIGTERM) process.removeListener('SIGTERM', this._onSIGTERM);
      if (this._onUncaughtException) process.removeListener('uncaughtException', this._onUncaughtException);
      this.handlersRegistered = false;
    }

    // Reset state before the early returns below. Leaving isStarted true when
    // the file or directory has been removed externally (by logrotate, say)
    // makes the next start() a no-op and silently kills the flush intervals.
    this.isStarted = false;

    // Flush before the existence checks below. appendFileSync recreates a file
    // that was removed externally, so buffered entries survive shutdown instead
    // of being discarded along with the missing file.
    this.pushLogs();

    let stopped = true;
    if (existsSync(this.dir) && existsSync(this.file())) {
      try {
        appendFileSync(this.file(), this.banner(this.endLog));
      } catch (ex) {
        this.reportError(ex instanceof Error ? ex : new Error(String(ex)), "Failed to stop the logger:");
        stopped = false;
      }
    }

    // Always clear the target so a later log() call starts the logger again,
    // rather than writing with no intervals running.
    this.currentFile = "";

    return stopped;
  }

  private addToLogs(log: string) {
    this.logs.push(log);
    this.bufferSize += log.length;

    // With no target file - start() failed, or the logger was stopped - nothing
    // can be flushed, so no write ever fails and the cap would never apply.
    if (!this.currentFile) {
      this.enforceBufferLimit();
      return;
    }

    // After a failed write, back off instead of attempting a synchronous
    // write for every subsequent entry. The interval keeps retrying.
    if (this.lastFlushError && Date.now() - this.lastFlushError < this.FLUSH_RETRY_INTERVAL) {
      this.enforceBufferLimit();
      return;
    }

    if (this.bufferSize >= this.maxBufferSize ||
        this.logs.length >= this.BUFFER_SIZE ||
        Date.now() - this.lastFlushTime >= this.BUFFER_TIMEOUT) {
      this.pushLogs();
    }

  }

  /**
   * Gets the number of buffered entries discarded because the buffer limit
   * was reached while writes were failing.
   *
   * @returns The total count of discarded log entries.
   */
  getDroppedLogs(): number {
    return this.droppedLogs;
  }

  /**
   * Synchronously flushes logs to disk immediately.
   * Use sparingly as this blocks the event loop.
   */
  flushSync(): void {
    this.pushLogs();
  }

  /**
 * Logs a message to the log file with the given log level. 
 * 
 * @param message - The message to log.
 * @param level - The log level, defaults to LogLevel.DEBUG (0).
 * @returns True if the log was successful, false otherwise.
 */
  log(message: string, level: LogLevel = LogLevel.DEBUG): boolean {
    try {
      if (!this.currentFile) {
        this.start();
      }

      // Roll over before the entry is buffered, not after. Buffering first can
      // flush it immediately (once the buffer timeout has elapsed), writing an
      // entry timestamped today into yesterday's file.
      this.rollOver();

      if (level < this.logLevel) {
        return true;
      }

      // %MESSAGE% is substituted last so macros inside the message are not expanded
      let logThis = replaceMacro(this.logStr, "%DATETIME%", getDateTime(this.useServerTime));
      logThis = replaceMacro(logThis, "%DATE%", getDate(this.useServerTime));
      logThis = replaceMacro(logThis, "%TIME%", getTime(this.useServerTime));
      logThis = replaceMacro(logThis, "%LEVEL%", this.logLevelToString(level));
      logThis = replaceMacro(logThis, "%MESSAGE%", String(message).replace(UNSAFE_CHARS, ""));

      this.addToLogs(logThis);

      if (this.logToConsole) {
        console.log(logThis);
      }

    } catch (ex) {
      this.reportError(ex instanceof Error ? ex : new Error(String(ex)), "Failed to log message:");
      return false;
    }

    return true;
  }

  /**
   * Logs a debug message.
   * @param {...any} args - The arguments to be logged.
   * @returns {boolean} True if the log was successful, false otherwise.
   */
  debug(...args: any[]): boolean {
    args = args.map(stringifyArgs);
    return this.log(args.join(" "), LogLevel.DEBUG);
  }

  /**
   * Logs an info message.
   * @param {...any} args - The arguments to be logged.
   * @returns {boolean} True if the log was successful, false otherwise.
   */
  info(...args: any[]): boolean {
    args = args.map(stringifyArgs);
    return this.log(args.join(" "), LogLevel.INFO);
  }

  /**
   * Logs a warning message.
   * @param {...any} args - The arguments to be logged.
   * @returns {boolean} True if the log was successful, false otherwise.
   */
  warning(...args: any[]): boolean {
    args = args.map(stringifyArgs);
    return this.log(args.join(" "), LogLevel.WARNING);
  }

  /**
   * Alias for warning method.
   * @param {...any} args - The arguments to be logged.
   * @returns {boolean} True if the log was successful, false otherwise.
   */
  warn(...args: any[]): boolean {
    return this.warning(...args);
  }

  /**
   * Logs an error message.
   * @param {...any} args - The arguments to be logged.
   * @returns {boolean} True if the log was successful, false otherwise.
   */
  error(...args: any[]): boolean {
    args = args.map(stringifyArgs);
    return this.log(args.join(" "), LogLevel.ERROR);
  }

  /**
   * Logs a critical message.
   * @param {...any} args - The arguments to be logged.
   * @returns {boolean} True if the log was successful, false otherwise.
   */
  critical(...args: any[]): boolean {
    args = args.map(stringifyArgs);
    const result = this.log(args.join(" "), LogLevel.CRITICAL);
    this.flushSync();
    return result;
  }
}

export default LogFile;