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
 * @property dir - Optional directory to write log files to. Defaults to current working directory.
 * @property file - Name of log file. Defaults to 'app.log'.
 * @property rollover - Whether to rollover the log file when it reaches a max size. Default false.
 * @property maxFileSize - Maximum file size in bytes before triggering a size-based rollover. Default 104857600 (100 MB). When exceeded, creates a new file with a numeric suffix (e.g., log-2024-01-01-1.log, log-2024-01-01-2.log).
 * @property logToConsole - Whether to also log to the console. Default false.
 * @property startLog - Message to log on application start.
 * @property endLog - Message to log on application end.
 * @property logStr - Format string for log messages. Defaults to '[{timestamp}] {level}: {msg}'.
 */
interface LogFileOptions {
    logLevel?: LogLevel;
    dir?: string;
    fileFormat?: string;
    rollover?: boolean;
    maxFileSize?: number;
    logToConsole?: boolean;
    startLog?: LogFormat;
    endLog?: LogFormat;
    logStr?: LogFormat;
    registerProcessHandlers?: boolean;
    onError?: (error: Error) => void;
}
/**
 * LogFile class to handle writing log messages to file.
 *
 * @param options - Options for configuring the log file.
 * @param options.logLevel - Log level to log at. Default 0.
 * @param options.dir - Directory to write log files. Default ./logs.
 * @param options.fileFormat - Log file name format. Default log-%DATE%.log.
 * @param options.rollover - Whether to rollover log when size limit reached.
 * @param options.maxFileSize - Maximum file size in bytes before triggering size-based rollover. Default 104857600 (100 MB). When exceeded, a new file is created with an incremental numeric suffix (e.g., log-2024-01-01-1.log, log-2024-01-01-2.log).
 * @param options.logToConsole - Whether to also log to console.
 * @param options.startLog - Message logged on start.
 * @param options.endLog - Message logged on end.
 * @param options.logStr - Format for log messages.
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
    private onError?;
    private readonly BUFFER_SIZE;
    private readonly BUFFER_TIMEOUT;
    private lastFlushTime;
    private bufferSize;
    private maxBufferSize;
    private maxFileSize;
    private fileSuffix;
    static readonly DEBUG = LogLevel.DEBUG;
    static readonly INFO = LogLevel.INFO;
    static readonly WARNING = LogLevel.WARNING;
    static readonly ERROR = LogLevel.ERROR;
    static readonly CRITICAL = LogLevel.CRITICAL;
    constructor(options: LogFileOptions);
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
   * If there are logs buffered in memory, write them
   * to the current log file. Clear the buffer after
   * writing.
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
   * Sets whether to enable rollover when the maximum log size is reached.
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
     * Sets whether to enable useServerTime
     *
     * @param useServerTime Whether to enable useServerTime.
     */
    setUseServerTime(useServerTime: boolean): void;
    /**
   * Logs help information to the console about log levels, log string macros,
   * and the default log directory.
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
    /**
   * Starts the logger by initializing the log directory and files.
   *
   * @param dir - The directory to store log files.
   * @param fileFormat - The file naming format for log files.
   * @param rollover - Whether to enable log file rollover.
   * @returns True if the log file was initialized successfully, false otherwise.
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
     * Synchronously flushes logs to disk immediately.
     * Use sparingly as this blocks the event loop.
     */
    flushSync(): void;
    /**
   * Logs a message to the log file with the given log level.
   *
   * @param message - The message to log.
   * @param level - The log level, defaults to 0.
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
