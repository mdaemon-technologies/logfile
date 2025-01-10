import { writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";

function getDate() : string {
  let date = new Date();
  let month: number = date.getMonth() + 1;
  let monthStr = month < 10 ? `0${month}` : `${month}`;
  let day: number = date.getDate();
  let dayStr = day < 10 ? `0${day}` : `${day}`;
  return `${date.getFullYear()}-${monthStr}-${dayStr}`;
}

function getTime() : string {
  return new Date().toTimeString().substring(0, 8);
}

function getDateTime() : string {
  let date = new Date();
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.toTimeString().substring(0, 8)}`;
}

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
  logLevel?: number;
  dir?: string;
  fileFormat?: string;
  rollover?: boolean;
  logToConsole?: boolean;
  startLog?: string;
  endLog?: string;
  logStr?: string;
}

/**
 * Appends a newline to the end of the given string if one does not exist.
 */
const endWithNewLine = (str: string) => str.endsWith("\n") ? str : str + "\n";

const stringifyArgs = arg => {
  if (arg instanceof Error) {
    return arg.stack;
  }
  
  if (arg instanceof Object) {
    return JSON.stringify(arg);
  }
  
  return arg;
};

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
  private logStr: string;
  private startLog: string;
  private endLog: string;
  private rolloverEnabled: boolean;
  private logToConsole: boolean = false;
  private logLevel: number = 0;
  private useServerTime: boolean = true;

  static DEBUG : number = 0;
  static INFO : number = 1;
  static WARNING : number = 2;
  static ERROR : number = 3;
  static CRITICAL : number = 4;

  constructor(options: LogFileOptions) {
    this.logLevel = options.logLevel || LogFile.INFO;
    this.dir = options.dir || "./logs";
    this.fileFormat = options.fileFormat || "log-%DATE%.log";
    this.logToConsole = options.logToConsole || false;
    this.rolloverEnabled = typeof options.rollover !== "undefined" ? options.rollover : true;
    this.logStr = options.logStr || "%DATE% %TIME% | %LEVEL% | %MESSAGE%";
    this.startLog = options.startLog || "-----------------------------------------\n" +
      "------- Log Started: %DATETIME%\n" +
      "-----------------------------------------\n";

    this.endLog = options.endLog || "-----------------------------------------\n" +
      "------- Log Ended: %DATETIME%\n" +
      "-----------------------------------------\n";
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
    if (this.logs.length > 0 && !!this.currentFile) {
      appendFileSync(this.file(), this.logs.join("\n") + "\n");
      this.logs = [];
    }
  }

  /**
 * Converts a numeric log level to a string representation.
 * 
 * @param level The numeric log level to convert.
 * @returns The string representation of the log level.
 */
  private logLevelToString(level: number): string {
    let levelStr = "";
    switch (level) {
      case 0:
        levelStr = "DEBUG";
        break;
      case 1:
        levelStr = "INFO";
        break;
      case 2:
        levelStr = "WARNING";
        break;
      case 3:
        levelStr = "ERROR";
        break;
      case 4:
        levelStr = "CRITICAL";
        break;
    }
    return levelStr;
  }

  /**
 * Sets the log level.
 *
 * @param level - The numeric log level to set.
 */
  setLogLevel(level: number): void {
    this.logLevel = level;
  }

  /**
 * Gets the current log level.
 * 
 * @returns The current numeric log level.
 */
  getLogLevel(): number {
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
  setLogStr(logStr: string): void {
    this.logStr = logStr;
  }

  /**
 * Gets the log string template used for logging.
 * 
 * @returns The log string template.
 */
  getLogStr(): string {
    return this.logStr;
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
    console.log("Log Levels: \n" +
      "0: Debug\n" +
      "1: Info\n" +
      "2: Warning\n" +
      "3: Error\n" +
      "4: Critical\n");
    console.log("Log String Macros: \n" +
      "%DATETIME%: Date and Time\n" +
      "%DATE%: Date\n" +
      "%TIME%: Time\n" +
      "%LEVEL%: Log Level\n" +
      "%MESSAGE%: Message\n");
    console.log("Default directory:./logs");
  }

  /**
 * Gets the path to the current log file.
 * 
 * @returns The path to the current log file.
 */
  file(): string {
    return this.dir + "/" + this.currentFile;
  }

  /**
 * Gets the path to the log file from the previous date.
 *
 * @returns The path to the log file from the previous date.
 */
  lastFile(): string {
    return this.dir + "/" + this.previousFile;
  }

  private pushInterval: NodeJS.Timeout | null = null;
  private rolloverInterval: NodeJS.Timeout | null = null;

  /**
 * Starts the logger by initializing the log directory and files.
 * 
 * @param dir - The directory to store log files.
 * @param fileFormat - The file naming format for log files.
 * @param rollover - Whether to enable log file rollover. 
 * @returns True if the log file was initialized successfully, false otherwise.
 */
  start(): boolean {
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

    this.pushInterval = setInterval(this.pushLogs, 1000);

    if (this.rolloverEnabled) {
      this.rolloverInterval = setInterval(this.rollOver, 5000);
    }

    return existsSync(this.file());
  }

  /**
 * Stops the logger by clearing intervals, closing the log file, and resetting state.
 * 
 * @returns True if the logger was stopped successfully, false otherwise.
 */
  stop(): boolean {
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

    return true;
  }

  /**
 * Logs a message to the log file with the given log level. 
 * 
 * @param message - The message to log.
 * @param level - The log level, defaults to 0.
 * @returns True if the log was successful, false otherwise.
 */
  log(message: string, level: number = 0): boolean {
    try {
      if (!this.currentFile) {
        this.start();
      }

      if (level < this.logLevel) {
        this.rollOver();
        return true;
      }

      let logThis = this.logStr.replace("%DATETIME%", `${getDateTime()}`)
        .replace("%DATE%", getDate())
        .replace("%TIME%", getTime())
        .replace("%LEVEL%", this.logLevelToString(level))
        .replace("%MESSAGE%", message.replace(/\n|\r|\t/g, ""));

      this.logs.push(logThis);

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
   * Logs an info message.
   * @param {...any} args - The arguments to be logged.
   * @returns {boolean} True if the log was successful, false otherwise.
   */
  info(...args: any[]): boolean {
    args = args.map(stringifyArgs);
    return this.log(args.join(" "), LogFile.INFO);
  }

  /**
   * Logs a warning message.
   * @param {...any} args - The arguments to be logged.
   * @returns {boolean} True if the log was successful, false otherwise.
   */
  warning(...args: any[]): boolean {
    args = args.map(stringifyArgs);
    return this.log(args.join(" "), LogFile.WARNING);
  }

  /**
   * Logs an error message.
   * @param {...any} args - The arguments to be logged.
   * @returns {boolean} True if the log was successful, false otherwise.
   */
  error(...args: any[]): boolean {
    args = args.map(stringifyArgs);
    return this.log(args.join(" "), LogFile.ERROR);
  }

  /**
   * Logs a critical message.
   * @param {...any} args - The arguments to be logged.
   * @returns {boolean} True if the log was successful, false otherwise.
   */
  critical(...args: any[]): boolean {
    args = args.map(stringifyArgs);
    return this.log(args.join(" "), LogFile.CRITICAL);
  }

  /**
   * Logs a debug message.
   * @param {...any} args - The arguments to be logged.
   * @returns {boolean} True if the log was successful, false otherwise.
   */
  debug(...args: any[]): boolean {
    args = args.map(stringifyArgs);
    return this.log(args.join(" "), LogFile.DEBUG);
  }
}

export default LogFile;