/**
 * Compiles a realistic consumer against the PUBLISHED typings.
 *
 * Nothing here runs; `tsc --noEmit` failing is the failure. This exists
 * because the package shipped a hand-maintained declaration file alongside
 * the generated one, and the hand-written copy silently fell behind the
 * implementation.
 */
import LogFile, { type LogFileOptions } from "@mdaemon/logfile";

const options: LogFileOptions = {
  logLevel: LogFile.DEBUG,
  dir: "./logs",
  fileFormat: "app-%DATE%.log",
  rollover: true,
  maxFileSize: 1024,
  maxBufferEntries: 100,
  logToConsole: false,
  startLog: "start",
  endLog: "end",
  logStr: "%DATE% %TIME% | %LEVEL% | %MESSAGE%",
  registerProcessHandlers: false,
  keepProcessAlive: true,
  suppressPathWarnings: true,
  onError: (error: Error) => void error.message,
};

const logger = new LogFile(options);

const started: boolean = logger.start();
const accepted: boolean = logger.info("hello", 1, { a: true }, null);
const path: string = logger.file();
const previous: string = logger.lastFile();
const dropped: number = logger.getDroppedLogs();
const level: number = logger.getLogLevel();
const usesServerTime: boolean = logger.getUseServerTime();

// getHelp returns the text as well as printing it.
const help: string = logger.getHelp();

logger.setLogLevel(LogFile.WARNING);
logger.setLogDir("./other");
logger.setFileFormat("other-%DATE%.log");
logger.setUseServerTime(false);
logger.flushSync();
const stopped: boolean = logger.stop();

void [started, accepted, path, previous, dropped, level, usesServerTime, help, stopped];
