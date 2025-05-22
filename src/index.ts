import { writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { getDate, getTime, getDateTime, endWithNewLine, stringifyArgs } from "./util";

enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARNING = 2,
  ERROR = 3,
  CRITICAL = 4
}

type LogMacro = "%DATETIME%" | "%DATE%" | "%TIME%" | "%LEVEL%" | "%MESSAGE%";
type LogFormat = `${string}${LogMacro}${string}` | string | `${LogMacro}`;

const levelMap = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO", 
  [LogLevel.WARNING]: "WARNING",
  [LogLevel.ERROR]: "ERROR",
  [LogLevel.CRITICAL]: "CRITICAL"
};

/**
 * Interface for log file options.
 * 
 * @property dir - Optional directory to write log files to. Defaults to current working directory.
 * @property file - Name of log file. Defaults to 'app.log'.  
 * @property rollover - Whether to rollover the log file when it reaches a max size. Default false.
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
  logToConsole?: boolean;
  startLog?: LogFormat;
  endLog?: LogFormat;
  logStr?: LogFormat;
}

/**
 * LogFile class to handle writing log messages to file.
 *
 * @param options - Options for configuring the log file.
 * @param options.logLevel - Log level to log at. Default 0.
 * @param options.dir - Directory to write log files. Default ./logs.
 * @param options.fileFormat - Log file name format. Default log-%DATE%.log. 
 * @param options.rollover - Whether to rollover log when size limit reached.
 * @param options.logToConsole - Whether to also log to console. 
 * @param options.startLog - Message logged on start.
 * @param options.endLog - Message logged on end.  
 * @param options.logStr - Format for log messages.
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
  private readonly BUFFER_SIZE = 1000;
  private readonly BUFFER_TIMEOUT = 1000;
  private lastFlushTime = Date.now();
  private bufferSize = 0;
  private maxBufferSize = 16384; // 16 KB

  static readonly DEBUG = LogLevel.DEBUG;
  static readonly INFO = LogLevel.INFO;
  static readonly WARNING = LogLevel.WARNING;
  static readonly ERROR = LogLevel.ERROR;
  static readonly CRITICAL = LogLevel.CRITICAL;

  constructor(options: LogFileOptions) {
    this.logLevel = options.logLevel ?? LogLevel.INFO
    this.dir = options.dir || "./logs";
    this.fileFormat = options.fileFormat || "log-%DATE%.log";
    this.logToConsole = options.logToConsole || false;
    this.rolloverEnabled = typeof options.rollover !== "undefined" ? options.rollover : true;
    this.logStr = options.logStr || "%DATE% %TIME% | %LEVEL% | %MESSAGE%" as LogFormat;
    this.startLog = options.startLog || "-----------------------------------------\n" +
      "------- Log Started: %DATETIME%\n" +
      "-----------------------------------------\n" as LogFormat;

    this.endLog = options.endLog || "-----------------------------------------\n" +
      "------- Log Ended: %DATETIME%\n" +
      "-----------------------------------------\n" as LogFormat;
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
    if (getDate() === this.date) {
      return;
    }

    this.date = getDate();
    if (this.rolloverEnabled) {
      appendFileSync(this.file(), endWithNewLine(this.endLog.replace("%DATETIME%", this.useServerTime ? new Date().toString() : new Date().toUTCString())));
      this.previousFile = this.currentFile;
      this.currentFile = this.fileFormat.replace("%DATE%", this.date);
      writeFileSync(this.file(), endWithNewLine(this.startLog.replace("%DATETIME%", this.useServerTime ? new Date().toString() : new Date().toUTCString())));
      this.pushLogs();
    }
  }

  /**
 * If there are logs buffered in memory, write them 
 * to the current log file. Clear the buffer after
 * writing.
 */
  private pushLogs = (): void => {
    if (this.logs.length < 1 || !this.currentFile) {
      return;
    }

    try {
      const logsToWrite = `${this.logs.join("\n")}\n`;
      appendFileSync(this.file(), logsToWrite);
      this.logs = [];
      this.bufferSize = 0;
      this.lastFlushTime = Date.now();
    } catch (error) {
      console.error("Failed to flush logs:", error);
    }
    
  }

  /**
 * Converts a numeric log level to a string representation.
 * 
 * @param level The numeric log level to convert.
 * @returns The string representation of the log level.
 */
  private logLevelToString(level: number): string {
    return levelMap[level] || "UNKNOWN";
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
 * @param dir - The path to the log directory.
 */
  setLogDir(dir: string): void {
    this.dir = dir;
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
    this.fileFormat = fileFormat;
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
 * Sets whether to enable rollover when the maximum log size is reached.
 * 
 * @param rollover Whether to enable log rollover.
 */
  setRollover(rollover: boolean): void {
    this.rolloverEnabled = rollover;
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
 * Sets whether to enable useServerTime 
 * 
 * @param useServerTime Whether to enable useServerTime.
 */
  setUseServerTime(useServerTime: boolean): void {
    this.useServerTime = useServerTime;
  }

  /**
 * Logs help information to the console about log levels, log string macros, 
 * and the default log directory.
 */
  getHelp(): void {
    console.log(`
      Log Levels: 
      0: Debug
      1: Info
      2: Warning
      3: Error
      4: Critical
    
      Log String Macros:
      %DATETIME%: Date and Time
      %DATE%: Date
      %TIME%: Time
      %LEVEL%: Log Level
      %MESSAGE%: Message
    
      Default directory:./logs`);
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

  /**
 * Starts the logger by initializing the log directory and files.
 * 
 * @param dir - The directory to store log files.
 * @param fileFormat - The file naming format for log files.
 * @param rollover - Whether to enable log file rollover. 
 * @returns True if the log file was initialized successfully, false otherwise.
 */
  start(): boolean {
    if (this.isStarted) {
      return existsSync(this.file());
    }

    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }

    this.date = this.useServerTime ? getDate() : new Date().toISOString().substring(0, 10);
    this.currentFile = this.fileFormat.replace("%DATE%", this.date);

    let start = endWithNewLine(this.startLog.replace("%DATETIME%", this.useServerTime ? new Date().toString() : new Date().toUTCString()));
    if (!existsSync(this.file())) {
      writeFileSync(this.file(), start);
    }
    else {
      appendFileSync(this.file(), start);
    }

    this.pushInterval = setInterval(this.pushLogs, this.BUFFER_TIMEOUT);

    if (this.rolloverEnabled) {
      this.rolloverInterval = setInterval(this.rollOver, 5000);
    }

    // Register handlers for process termination signals
    process.on('exit', () => this.pushLogs());
    process.on('SIGINT', () => {
      this.pushLogs();
      this.stop();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      this.pushLogs();
      this.stop();
      process.exit(0);
    });
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.critical('Uncaught Exception:', error);
      this.pushLogs();
      this.stop();
      process.exit(1);
    });

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

    if (!existsSync(this.dir)) {
      return true;
    }

    if (!existsSync(this.file())) {
      return true;
    }

    try {
      
      this.pushLogs();
      appendFileSync(this.file(), endWithNewLine(this.endLog.replace("%DATETIME%", this.useServerTime ? new Date().toString() : new Date().toUTCString())))

      this.currentFile = "";

    } catch (ex) {
      return false;
    }

    this.isStarted = false;
    return true;
  }

  private addToLogs(log: string) {
    this.logs.push(log);
    this.bufferSize += log.length;

    if (this.bufferSize >= this.maxBufferSize ||
        this.logs.length >= this.BUFFER_SIZE ||
        Date.now() - this.lastFlushTime >= this.BUFFER_TIMEOUT) {
      this.pushLogs();
    }
    
  }

  /**
   * Synchronously flushes logs to disk immediately.
   * Use sparingly as this blocks the event loop.
   */
  flushSync(): void {
    if (this.logs.length < 1 || !this.currentFile) {
      return;
    }

    try {
      const logsToWrite = `${this.logs.join("\n")}\n`;
      appendFileSync(this.file(), logsToWrite);
      this.logs = [];
      this.bufferSize = 0;
      this.lastFlushTime = Date.now();
    } catch (error) {
      console.error("Failed to flush logs synchronously:", error);
    }
  }

  /**
 * Logs a message to the log file with the given log level. 
 * 
 * @param message - The message to log.
 * @param level - The log level, defaults to 0.
 * @returns True if the log was successful, false otherwise.
 */
  log(message: string, level: LogLevel = LogLevel.DEBUG): boolean {
    try {
      if (!this.currentFile) {
        this.start();
      }

      if (level < this.logLevel) {
        this.rollOver();
        return true;
      }

      const logThis = this.logStr.replace("%DATETIME%", getDateTime())
        .replace("%DATE%", getDate())
        .replace("%TIME%", getTime())
        .replace("%LEVEL%", this.logLevelToString(level))
        .replace("%MESSAGE%", message.replace(/\n|\r|\t/g, ""));

      this.addToLogs(logThis);

      if (this.logToConsole) {
        console.log(logThis);
      }

      this.rollOver();

    } catch (ex) {
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