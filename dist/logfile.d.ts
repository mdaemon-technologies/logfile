export interface LogFileOptions {
  dir?: string;
  file?: string;
  rollover?: boolean;
  startLog?: string;
  endLog?: string;
  logStr?: string;
}

export default class LogFile {
  private date: string;
  private currentFile: string;
  private logs: string[];
  private dir: string;
  private fileFormat: string;
  private logStr: string;
  private logLevel: number;
  private logToConsole: boolean;
  private startLog: string;
  private endLog: string;
  private rolloverEnabled: boolean;
  private pushInterval: NodeJS.Timer;
  private rolloverInterval: NodeJS.Timer;
  static INFO: number;
  static WARNING: number;
  static ERROR: number;
  static CRITICAL: number;
  static DEBUG: number;
  constructor(options: LogFileOptions);
  private rollover();
  private pushLogs();
  private logLevelToString(level: number);
  setLogLevel(level: number): void;
  getLogLevel(): number;
  getLogDir(): string;
  setFileFormat(fileFormat: string): void;
  getFileFormat(): string;
  setLogToConsole(logToConsole: boolean): void;
  getLogToConsole(): boolean;
  setLogStr(logStr: string): void;
  getLogStr(): string;
  setStartLog(startLog: string): void;
  getStartLog(): string;
  setEndLog(endLog: string): void;
  getEndLog(): string;
  setRollover(rollover: boolean): void;
  getRollover(): boolean;
  getHelp(): void;
  file(): string;
  lastFile(): string;
  start(): void;
  stop(): void;
  log(message: string, level: number): boolean;
  info(...args: any[]): boolean;
  warning(...args: any[]): boolean;
  error(...args: any[]): boolean;
  critical(...args: any[]): boolean;
  debug(...args: any[]): boolean;
}