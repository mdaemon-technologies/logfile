import { FileSystem } from "./filesystem";
declare enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARNING = 2,
    ERROR = 3,
    CRITICAL = 4
}
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
declare class LogFile {
    private date;
    private buffer;
    private formatter;
    private startLog;
    private endLog;
    private rolloverEnabled;
    private logToConsole;
    private logLevel;
    private useServerTime;
    private registerProcessHandlers;
    private keepProcessAlive;
    private suppressPathWarnings;
    private warnedAboutPath;
    private onError?;
    private readonly fs;
    private readonly target;
    /**
     * Flush once this many entries are buffered.
     *
     * One of three independent flush triggers, named apart because they were
     * previously BUFFER_SIZE (entries), maxBufferSize (bytes) and
     * maxBufferEntries (the retry cap), which read as variations of one thing.
     */
    private readonly FLUSH_AT_ENTRIES;
    /** Flush once this many bytes are buffered. */
    private readonly FLUSH_AT_BYTES;
    /** Flush an entry outright if nothing has been flushed for this long. */
    private readonly BUFFER_TIMEOUT;
    private readonly FLUSH_RETRY_INTERVAL;
    private readonly ROLLOVER_INTERVAL;
    private lastFlushTime;
    private lastFlushError;
    /**
     * Bytes currently buffered, as they will be encoded on disk.
     *
     * Counted in UTF-8 bytes, not string length: a log line of non-ASCII text
     * occupies up to four bytes per character, so measuring length let the
     * buffer grow well past the limit it was being compared against.
     */
    private reportingError;
    /** Runtime state, kept with the rest rather than buried among the methods. */
    private pushInterval;
    private rolloverInterval;
    private isStarted;
    private onExitFlush;
    static readonly DEBUG = LogLevel.DEBUG;
    static readonly INFO = LogLevel.INFO;
    static readonly WARNING = LogLevel.WARNING;
    static readonly ERROR = LogLevel.ERROR;
    static readonly CRITICAL = LogLevel.CRITICAL;
    constructor(options: LogFileOptions);
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
    private warnOnTraversalPath;
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
    private safely;
    /**
   * Releases a timer's hold on the event loop when keepProcessAlive is false.
   *
   * An unref'd interval still fires for as long as the process is running; it
   * simply stops being a reason for the process to stay running.
   *
   * @param interval - The interval to release, if any
   */
    private releaseInterval;
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
    private reportError;
    /**
   * The current timestamp, honouring the useServerTime setting.
   */
    private timestamp;
    /**
   * The current date string used for file naming and rollover comparisons.
   *
   * start() and rollOver() must agree on this, otherwise a logger configured
   * with useServerTime false triggers a spurious rollover on the first timer
   * tick whenever the local and UTC dates differ.
   */
    private today;
    /**
   * Renders a start or end banner, expanding %DATETIME% and guaranteeing a trailing newline.
   */
    private renderBanner;
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
    private rollOver;
    /**
   * Trims the buffer to its cap and reports anything discarded.
   *
   * The discard policy lives in LogBuffer; reporting has to reach the
   * application, so that part stays with the logger.
   */
    private enforceBufferLimit;
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
    flushSync(): void;
    /**
   * Converts a numeric log level to a string representation.
   *
   * @param level The numeric log level to convert.
   * @returns The string representation of the log level.
   */
    private logLevelToString;
    /**
   * Sets the log level.
   *
   * @param level - The numeric log level to set.
   */
    setLogLevel(level: LogLevel): void;
    /**
   * Gets the current log level.
   *
   * @returns The current numeric log level.
   */
    getLogLevel(): LogLevel;
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
    setLogDir(dir: string): void;
    /**
   * Gets the current log directory.
   *
   * @returns The path to the current log directory.
   */
    getLogDir(): string;
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
    setFileFormat(fileFormat: string): void;
    /**
   * Gets the current file name format for log files.
   *
   * @returns The current file name format
   */
    getFileFormat(): string;
    /**
   * Sets whether to log to the console.
   *
   * @param logToConsole - Whether logging should be enabled on the console.
   */
    setLogToConsole(logToConsole: boolean): void;
    /**
   * Gets whether logging to console is enabled.
   *
   * @returns True if logging to console is enabled, false otherwise.
   */
    getLogToConsole(): boolean;
    /**
   * Sets the log string template to use for logging.
   *
   * @param logStr The log string template.
   */
    setLogStr(logStr: string): void;
    /**
   * Gets the log string template used for logging.
   *
   * @returns The log string template.
   */
    getLogStr(): string;
    /**
   * Sets the start log message to use when logging starts.
   *
   * @param startLog The start log message.
   */
    setStartLog(startLog: string): void;
    /**
   * Gets the start log message used when logging starts.
   *
   * @returns The start log message.
   */
    getStartLog(): string;
    /**
   * Sets the end log message to use when logging ends.
   *
   * @param endLog The end log message.
   */
    setEndLog(endLog: string): void;
    /**
   * Gets the end log message used when logging ends.
   *
   * @returns The end log message.
   */
    getEndLog(): string;
    /**
   * Sets whether to roll over to a new log file when the date changes.
   *
   * Starts or stops the rollover timer to match. Without this, enabling rollover
   * on a running logger left it unarmed, so an idle process would not roll over
   * until something was logged; disabling it left the timer running.
   *
   * @param rollover Whether to enable log rollover.
   */
    setRollover(rollover: boolean): void;
    /**
   * Gets whether log rollover is enabled when the maximum log size is reached.
   *
   * @returns True if log rollover is enabled, false otherwise.
   */
    getRollover(): boolean;
    /**
     * Sets whether timestamps use server local time or UTC.
     *
     * Applies to every timestamp the logger produces: the %DATE%, %TIME% and
     * %DATETIME% macros in log entries, the %DATETIME% in start and end banners,
     * and the date used for file naming and rollover.
     *
     * @param useServerTime True for server local time (default), false for UTC.
     */
    setUseServerTime(useServerTime: boolean): void;
    /**
   * Gets whether timestamps use server local time or UTC.
   *
   * @returns True when using server local time (the default), false for UTC.
   */
    getUseServerTime(): boolean;
    /**
   * Logs help information to the console: log levels, the macros available in
   * the entry format and the file name format, and the constructor options with
   * their defaults.
   */
    getHelp(): string;
    /**
   * Gets the path to the current log file.
   *
   * @returns The path to the current log file.
   */
    file(): string;
    /**
   * Gets the path to the log file from the previous date.
   *
   * @returns The path to the previous log file, or "" if there has not been one.
   */
    lastFile(): string;
    /**
   * Starts the logger by initializing the log directory and files.
   *
   * Configuration comes from the constructor options and the setters, not from
   * arguments. Calling this on an already-started logger is a no-op.
   *
   * @returns True if the log file was initialized successfully, false otherwise.
   *          Failures are reported through onError rather than thrown.
   */
    start(): boolean;
    /**
   * Stops the logger by clearing intervals, closing the log file, and resetting state.
   *
   * @returns True if the logger was stopped successfully, false otherwise.
   */
    stop(): boolean;
    private addToLogs;
    /**
     * Gets the number of buffered entries discarded because the buffer limit
     * was reached while writes were failing.
     *
     * @returns The total count of discarded log entries.
     */
    getDroppedLogs(): number;
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
    log(message: string, level?: LogLevel): boolean;
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
    private logAt;
    /**
     * Logs a debug message.
     * @param {...any} args - The arguments to be logged.
     * @returns {boolean} True if the log was accepted, false otherwise.
     */
    debug(...args: any[]): boolean;
    /**
     * Logs an info message.
     * @param {...any} args - The arguments to be logged.
     * @returns {boolean} True if the log was accepted, false otherwise.
     */
    info(...args: any[]): boolean;
    /**
     * Logs a warning message.
     * @param {...any} args - The arguments to be logged.
     * @returns {boolean} True if the log was accepted, false otherwise.
     */
    warning(...args: any[]): boolean;
    /**
     * Alias for warning method.
     * @param {...any} args - The arguments to be logged.
     * @returns {boolean} True if the log was accepted, false otherwise.
     */
    warn(...args: any[]): boolean;
    /**
     * Logs an error message.
     * @param {...any} args - The arguments to be logged.
     * @returns {boolean} True if the log was accepted, false otherwise.
     */
    error(...args: any[]): boolean;
    /**
     * Logs a critical message and flushes it to disk immediately.
     * @param {...any} args - The arguments to be logged.
     * @returns {boolean} True if the log was accepted, false otherwise.
     */
    critical(...args: any[]): boolean;
}
export default LogFile;
export type { LogFileOptions, LogLevel };
export type { LogMacro } from "./formatter";
export type { FileSystem } from "./filesystem";
