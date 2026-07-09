export interface LogFileOptions {
  logLevel?: number;
  dir?: string;
  fileFormat?: string;
  rollover?: boolean;
  maxFileSize?: number;
  logToConsole?: boolean;
  startLog?: string;
  endLog?: string;
  logStr?: string;
  registerProcessHandlers?: boolean;
  onError?: (error: Error) => void;
}

export default class LogFile {
  static readonly DEBUG: number;
  static readonly INFO: number;
  static readonly WARNING: number;
  static readonly ERROR: number;
  static readonly CRITICAL: number;
  constructor(options: LogFileOptions);
  setLogLevel(level: number): void;
  getLogLevel(): number;
  setLogDir(dir: string): void;
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
  setUseServerTime(useServerTime: boolean): void;
  getHelp(): void;
  file(): string;
  lastFile(): string;
  start(): boolean;
  stop(): boolean;
  flushSync(): void;
  log(message: string, level?: number): boolean;
  debug(...args: any[]): boolean;
  info(...args: any[]): boolean;
  warning(...args: any[]): boolean;
  warn(...args: any[]): boolean;
  error(...args: any[]): boolean;
  critical(...args: any[]): boolean;
}
