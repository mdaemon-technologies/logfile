declare enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARNING = 2,
    ERROR = 3,
    CRITICAL = 4
}
type LogMacro = "%DATETIME%" | "%DATE%" | "%TIME%" | "%LEVEL%" | "%MESSAGE%";
type LogFormat = `${string}${LogMacro}${string}` | string | `${LogMacro}`;
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
declare class LogFile {
    private date;
    private currentFile;
    private previousFile;
    private logs;
    private dir;
    private fileFormat;
    private logStr;
    private startLog;
    private endLog;
    private rolloverEnabled;
    private logToConsole;
    private logLevel;
    private useServerTime;
    private registerProcessHandlers;
    private handlersRegistered;
    private keepProcessAlive;
    private suppressPathWarnings;
    private warnedAboutPath;
    private onError?;
    private readonly BUFFER_SIZE;
    private readonly BUFFER_TIMEOUT;
    private readonly FLUSH_RETRY_INTERVAL;
    private readonly ROLLOVER_INTERVAL;
    private lastFlushTime;
    private lastFlushError;
    private bufferSize;
    private maxBufferSize;
    private maxBufferEntries;
    private droppedLogs;
    private reportingError;
    private maxFileSize;
    private fileSuffix;
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
    private banner;
    /**
   * Opens the current file with a start banner.
   *
   * Appends when the file already exists rather than truncating it. A rollover
   * can land on an existing file in two ways: a fileFormat without %DATE%
   * produces the same name every day, and a suffixed name may already be on
   * disk from an earlier run. Truncating would discard those logs.
   */
    private openCurrentFile;
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
   * Check if the current log file exceeds the maximum file size.
   * If so, rollover to a new file with an incremented suffix.
   */
    private checkFileSizeAndRollover;
    /**
   * Discards the oldest buffered entries once the buffer exceeds
   * maxBufferEntries, keeping memory bounded while writes are failing.
   * Every discarded entry is counted and reported.
   */
    private enforceBufferLimit;
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
    private pushLogs;
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
    setLogStr(logStr: LogFormat): void;
    /**
   * Gets the log string template used for logging.
   *
   * @returns The log string template.
   */
    getLogStr(): LogFormat;
    /**
   * Sets the start log message to use when logging starts.
   *
   * @param startLog The start log message.
   */
    setStartLog(startLog: LogFormat): void;
    /**
   * Gets the start log message used when logging starts.
   *
   * @returns The start log message.
   */
    getStartLog(): LogFormat;
    /**
   * Sets the end log message to use when logging ends.
   *
   * @param endLog The end log message.
   */
    setEndLog(endLog: LogFormat): void;
    /**
   * Gets the end log message used when logging ends.
   *
   * @returns The end log message.
   */
    getEndLog(): LogFormat;
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
    getHelp(): void;
    /**
   * Gets the path to the current log file.
   *
   * @returns The path to the current log file.
   */
    file(): string;
    /**
   * Gets the path to the log file from the previous date.
   *
   * @returns The path to the log file from the previous date.
   */
    lastFile(): string;
    private pushInterval;
    private rolloverInterval;
    private isStarted;
    private _onExit;
    private _onSIGINT;
    private _onSIGTERM;
    private _onUncaughtException;
    private _onExitFlush;
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
     * Synchronously flushes logs to disk immediately.
     * Use sparingly as this blocks the event loop.
     */
    flushSync(): void;
    /**
   * Logs a message to the log file with the given log level.
   *
   * @param message - The message to log.
   * @param level - The log level, defaults to LogLevel.DEBUG (0).
   * @returns True if the log was successful, false otherwise.
   */
    log(message: string, level?: LogLevel): boolean;
    /**
     * Logs a debug message.
     * @param {...any} args - The arguments to be logged.
     * @returns {boolean} True if the log was successful, false otherwise.
     */
    debug(...args: any[]): boolean;
    /**
     * Logs an info message.
     * @param {...any} args - The arguments to be logged.
     * @returns {boolean} True if the log was successful, false otherwise.
     */
    info(...args: any[]): boolean;
    /**
     * Logs a warning message.
     * @param {...any} args - The arguments to be logged.
     * @returns {boolean} True if the log was successful, false otherwise.
     */
    warning(...args: any[]): boolean;
    /**
     * Alias for warning method.
     * @param {...any} args - The arguments to be logged.
     * @returns {boolean} True if the log was successful, false otherwise.
     */
    warn(...args: any[]): boolean;
    /**
     * Logs an error message.
     * @param {...any} args - The arguments to be logged.
     * @returns {boolean} True if the log was successful, false otherwise.
     */
    error(...args: any[]): boolean;
    /**
     * Logs a critical message.
     * @param {...any} args - The arguments to be logged.
     * @returns {boolean} True if the log was successful, false otherwise.
     */
    critical(...args: any[]): boolean;
}
export default LogFile;
