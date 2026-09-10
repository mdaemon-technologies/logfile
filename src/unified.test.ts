// This file works with source TypeScript, CommonJS, and ES Modules
import { getLogFile, fs } from './test-helper';
import { execFileSync } from 'child_process';
import * as path from 'path';

let LogFile: any;
let logFile: any;
let DEBUG: number;
let WARNING: number;

/** Removes scratch directories left by a test, ignoring the ones never created. */
const removeDirs = (...dirs: string[]): void => {
  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
};

// Setup function to initialize LogFile before tests
beforeAll(async () => {
  LogFile = await getLogFile();
  DEBUG = LogFile.DEBUG;
  WARNING = LogFile.WARNING;
});

describe("LogFile", () => {
  let spy: null | jest.SpyInstance = null;
  
  beforeEach(async () => {
    logFile = new LogFile({ logLevel: LogFile.DEBUG });
    logFile.start();
    spy = jest.spyOn(logFile, "log");
  });
  afterEach(async () => {
    logFile.stop();
    removeDirs("./logs", "./logs2");
  });

  // Safety net: a test that creates a directory and then fails leaves it on
  // disk, and a stray directory in the repo root is easy to miss because
  // .gitignore hides *.log. Nothing here should be needed on a green run.
  //
  // Limited to directories this suite owns. The a/, b/ and c/ dirs that used
  // to accumulate are fixed at the source in "should warn only once per
  // logger"; deleting root directories by those names on every run would be a
  // trap for anyone who later adds a real one.
  afterAll(() => {
    removeDirs("./logs", "./logs2", "./logs3");
  });

  it("should start and stop", () => {
    logFile.start();
    logFile.stop();
  });

  it("should log", () => {
    logFile.start();
    logFile.log("test", 0);
    logFile.stop();
  });

  it("should roll over", () => {
    logFile.start();
    logFile.log("test", 0);
    logFile.stop();
    const files = fs.readdirSync("./logs");
    expect(files.length).toBe(1);
  });

  it("should allow set and get dir", () => {
    logFile.setLogDir("./logs2");
    expect(logFile.getLogDir()).toBe("./logs2");
  });

  it("should allow set and get log level", () => {
    logFile.setLogLevel(WARNING);
    expect(logFile.getLogLevel()).toBe(LogFile.WARNING);
  });

  it("should allow set and get rollover", () => {
    logFile.setRollover(false);
    expect(logFile.getRollover()).toBe(false);
  });

  it("should allow setLogStr", () => {
    logFile.setLogStr("%LEVEL% | %DATE% | %MESSAGE%");
    expect(logFile.getLogStr()).toBe("%LEVEL% | %DATE% | %MESSAGE%");
  });

  it("should allow setStartLog", () => {
    logFile.setStartLog("Log Started");
    expect(logFile.getStartLog()).toBe("Log Started");
  });

  it("should allow setEndLog", () => {
    logFile.setEndLog("Log Ended");
    expect(logFile.getEndLog()).toBe("Log Ended");
  });
  it("should allow you get the current file and the last file", () => {
    // toBeTruthy() alone proves nothing here: both getters return "./logs/"
    // when there is no file set, which is truthy. Assert real paths instead.
    const sizeLogFile = new LogFile({ logLevel: LogFile.DEBUG, maxFileSize: 500 });
    sizeLogFile.start();

    const firstFile = sizeLogFile.file();
    expect(firstFile).toMatch(/^\.\/logs\/log-\d{4}-\d{2}-\d{2}\.log$/);

    for (let i = 0; i < 40; i++) sizeLogFile.info(`padding entry ${i} with extra text to force a rollover`);
    sizeLogFile.flushSync();

    // after a size rollover the current file advanced and lastFile points back
    expect(sizeLogFile.file()).not.toBe(firstFile);
    expect(sizeLogFile.file()).toMatch(/-1\.log$/);
    expect(sizeLogFile.lastFile()).toBe(firstFile);
    expect(fs.existsSync(sizeLogFile.lastFile())).toBe(true);

    sizeLogFile.stop();
  });

  test('info method logs at INFO level', () => {
    logFile.info('Test info message');
    expect(spy).toHaveBeenCalledWith('Test info message', LogFile.INFO);
  });

  test('warning method logs at WARNING level', () => {
    logFile.warning('Test warning message');
    expect(spy).toHaveBeenCalledWith('Test warning message', LogFile.WARNING);
  });

  test('warn method logs at WARNING level', () => {
    logFile.warn('Test warning message using alias "warn"');
    expect(spy).toHaveBeenCalledWith('Test warning message using alias "warn"', LogFile.WARNING);
  });

  test('error method logs at ERROR level', () => {
    logFile.error('Test error message');
    expect(spy).toHaveBeenCalledWith('Test error message', LogFile.ERROR);
  });

  test('critical method logs at CRITICAL level', () => {
    logFile.critical('Test critical message');
    expect(spy).toHaveBeenCalledWith('Test critical message', LogFile.CRITICAL);
  });

  test('debug method logs at DEBUG level', () => {
    logFile.debug('Test debug message');
    expect(spy).toHaveBeenCalledWith('Test debug message', LogFile.DEBUG);
  });

  test('methods handle multiple arguments', () => {
    logFile.info('Test', 'multiple', 'arguments');
    expect(spy).toHaveBeenCalledWith('Test multiple arguments', LogFile.INFO);
  });

  test('methods handle object arguments', () => {
    const testObj = { key: 'value' };
    logFile.info('Test object:', testObj);
    expect(spy).toHaveBeenCalledWith('Test object: {"key":"value"}', LogFile.INFO);
  });

  test('methods handle Error objects', () => {
    const testError = new Error('Test error');
    logFile.error('An error occurred:', testError);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('An error occurred: Error: Test error'), LogFile.ERROR);
  });

  it('should not log string when message level is higher than log level', async () => {
    logFile.setLogLevel(LogFile.INFO);
    
    // DEBUG is lower number than INFO, so the debug message should not be logged
    logFile.debug('This debug message should not appear');
    // INFO messages should still be logged
    logFile.info('This info message should appear');

    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for the file to be written
    const files = fs.readdirSync("./logs");
    const logContent = fs.readFileSync(`./logs/${files[0]}`, 'utf8');
    
    expect(logContent).not.toContain('This debug message should not appear');
    expect(logContent).toContain('INFO | This info message should appear');
  });
  
  it('should filter multiple log levels correctly in file content', async () => {
    logFile.setLogLevel(LogFile.CRITICAL);
    
    logFile.debug('Debug message');
    logFile.info('Info message');
    logFile.warning('Warning message');
    logFile.error('Error message');
    logFile.critical('Critical message');
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for the file to be written
    const files = fs.readdirSync("./logs");
    const logContent = fs.readFileSync(`./logs/${files[0]}`, 'utf8');
    
    expect(logContent).not.toContain('Debug message');
    expect(logContent).not.toContain('Info message');
    expect(logContent).not.toContain('Warning message');
    expect(logContent).not.toContain('Error message');
    expect(logContent).toContain('CRITICAL | Critical message');
  });
  
  it('should not start logger if already started', () => {
    const initialStartResult = logFile.start(); // Already started in beforeEach
    expect(initialStartResult).toBe(true);
    
    // Calling start again should return true without re-initializing
    const secondStartResult = logFile.start();
    expect(secondStartResult).toBe(true);
  });
  
  it('should not stop logger if already stopped', () => {
    // First stop the logger (it was started in beforeEach)
    logFile.stop();
    
    // Try to stop again - should return true without error
    const stopResult = logFile.stop();
    expect(stopResult).toBe(true);
  });
  
  it('should flush logs synchronously when critical is called', () => {
    const flushSyncSpy = jest.spyOn(logFile, 'flushSync');
    
    logFile.critical('Critical error happened');

    // Called, but not pinned to exactly once: internal flushes go through the
    // same method, so a buffer threshold reached while building the entry
    // legitimately adds one. Counting made the test depend on how long the
    // suite had been running.
    expect(flushSyncSpy).toHaveBeenCalled();
    
    flushSyncSpy.mockRestore();
  });
  
  it('should write logs to file immediately when flushSync is called', async () => {
    // Write some logs but don't wait for auto-flush
    logFile.info('Test message 1');
    logFile.info('Test message 2');
    
    // Call flushSync
    logFile.flushSync();
    
    // Check file content immediately without waiting
    const files = fs.readdirSync("./logs");
    const logContent = fs.readFileSync(`./logs/${files[0]}`, 'utf8');
    
    expect(logContent).toContain('Test message 1');
    expect(logContent).toContain('Test message 2');
  });
    it('should handle process termination signals', () => {
    // Mock the process.exit to prevent actual exit
    const exitSpy = jest.spyOn(process, 'exit');
    
    // Create a logger with process handlers enabled
    const handlerLogFile = new LogFile({ logLevel: LogFile.DEBUG, registerProcessHandlers: true });
    handlerLogFile.start();
    
    // Create a spy on the flushSync method
    const flushSyncSpy = jest.spyOn(handlerLogFile, 'flushSync');
    const stopSpy = jest.spyOn(handlerLogFile, 'stop');
    
    // Simulate SIGINT signal (Ctrl+C)
    process.emit('SIGINT');
    
    // Verify logs were pushed and logger was stopped
    expect(stopSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
    
    // Clean up mocks
    flushSyncSpy.mockRestore();
    stopSpy.mockRestore();
  });
  
  it('should handle uncaught exceptions', () => {
    // Mock the process.exit to prevent actual exit
    const exitSpy = jest.spyOn(process, 'exit');
    
    // Create a logger with process handlers enabled
    const handlerLogFile = new LogFile({ logLevel: LogFile.DEBUG, registerProcessHandlers: true });
    handlerLogFile.start();
    
    // Create spies for methods that should be called
    const criticalSpy = jest.spyOn(handlerLogFile, 'critical');
    const stopSpy = jest.spyOn(handlerLogFile, 'stop');
    
    // Simulate an uncaught exception
    const testError = new Error('Test uncaught exception');
    process.emit('uncaughtException', testError);
    
    // Verify critical was called with error and logger was stopped
    expect(criticalSpy).toHaveBeenCalledWith('Uncaught Exception:', testError);
    expect(stopSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
    
    // Clean up mocks
    criticalSpy.mockRestore();
    stopSpy.mockRestore();
  });

  it('should rollover to a new file when maxFileSize is exceeded', async () => {
    // Create a logger with a small max file size (1 KB)
    const smallSizeLogFile = new LogFile({ 
      logLevel: LogFile.DEBUG,
      maxFileSize: 1024 // 1 KB
    });
    smallSizeLogFile.start();
    
    // Write enough logs to exceed the file size limit
    for (let i = 0; i < 100; i++) {
      smallSizeLogFile.info(`This is test message number ${i} with some extra content to make it longer`);
    }
    
    // Force flush to ensure all logs are written
    smallSizeLogFile.flushSync();
    
    // Wait a bit for file operations to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check that multiple files were created
    const files = fs.readdirSync("./logs");
    expect(files.length).toBeGreaterThan(1);
    
    // Verify file naming pattern (should have -1, -2, etc. suffixes)
    const hasRolloverFile = files.some(file => file.match(/log-\d{4}-\d{2}-\d{2}-\d+\.log/));
    expect(hasRolloverFile).toBe(true);
    
    smallSizeLogFile.stop();
  });

  it('should create files with incrementing numeric suffixes during size rollover', async () => {
    // Create a logger with a very small max file size (500 bytes)
    const tinyLogFile = new LogFile({ 
      logLevel: LogFile.DEBUG,
      maxFileSize: 500
    });
    tinyLogFile.start();
    
    // Write lots of logs to trigger multiple rollovers
    for (let i = 0; i < 150; i++) {
      tinyLogFile.info(`Test message ${i} with additional content to reach size limit quickly`);
    }
    
    tinyLogFile.flushSync();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const files = fs.readdirSync("./logs");
    
    // Should have base file plus rollover files
    expect(files.length).toBeGreaterThanOrEqual(2);
    
    // Check for sequential numbering (-1, -2, etc.)
    const rolloverFiles = files.filter(file => file.match(/log-\d{4}-\d{2}-\d{2}-\d+\.log/));
    expect(rolloverFiles.length).toBeGreaterThan(0);
    
    // Verify first rollover file has -1 suffix
    const hasFile1 = files.some(file => file.match(/log-\d{4}-\d{2}-\d{2}-1\.log/));
    expect(hasFile1).toBe(true);
    
    tinyLogFile.stop();
  });

  it('should use default maxFileSize of 100 MB when not specified', () => {
    const defaultLogFile = new LogFile({ logLevel: LogFile.DEBUG });
    defaultLogFile.start();
    
    // Write a few logs (nowhere near 100 MB)
    for (let i = 0; i < 10; i++) {
      defaultLogFile.info(`Test message ${i}`);
    }
    
    defaultLogFile.flushSync();
    
    // Should only have one file since we didn't exceed 100 MB
    const files = fs.readdirSync("./logs");
    expect(files.length).toBe(1);
    
    // File should not have a numeric suffix
    expect(files[0]).toMatch(/^log-\d{4}-\d{2}-\d{2}\.log$/);
    
    defaultLogFile.stop();
  });

  it('should never rollover on size when maxFileSize is 0', async () => {
    // maxFileSize of 0 means no size limit
    const unlimitedLogFile = new LogFile({
      logLevel: LogFile.DEBUG,
      maxFileSize: 0
    });
    unlimitedLogFile.start();

    // Write far more than any of the small-size tests use to trigger a rollover
    for (let i = 0; i < 500; i++) {
      unlimitedLogFile.info(`This is test message number ${i} with some extra content to make it longer`);
    }

    unlimitedLogFile.flushSync();
    await new Promise(resolve => setTimeout(resolve, 100));

    const files = fs.readdirSync("./logs");

    // Only the base file should exist, with no numeric suffix
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^log-\d{4}-\d{2}-\d{2}\.log$/);

    unlimitedLogFile.stop();
  });

  it('should accept custom maxFileSize in constructor options', async () => {
    // Create logger with custom 2 KB max size
    const customLogFile = new LogFile({ 
      logLevel: LogFile.DEBUG,
      maxFileSize: 2048 // 2 KB
    });
    customLogFile.start();
    
    // Write enough to potentially trigger rollover
    for (let i = 0; i < 50; i++) {
      customLogFile.info(`Custom size test message number ${i} with extra padding text`);
    }
    
    customLogFile.flushSync();
    await new Promise(resolve => setTimeout(resolve, 100));

    // "at least one file" is true even if maxFileSize is ignored entirely.
    // Assert the limit was actually applied: a rollover happened, and the file
    // that was rolled had genuinely reached the limit.
    const files = fs.readdirSync("./logs");
    expect(files.length).toBeGreaterThan(1);
    expect(files.some((f: string) => /-1\.log$/.test(f))).toBe(true);

    // Size is checked after each flush, so the rolled file overshoots by the
    // payload of the flush that tripped it - but it must reach the limit first.
    const base = files.find((f: string) => /^log-\d{4}-\d{2}-\d{2}\.log$/.test(f)) as string;
    expect(base).toBeDefined();
    expect(fs.statSync(`./logs/${base}`).size).toBeGreaterThanOrEqual(2048);

    customLogFile.stop();
  });

  it('should include start and end log messages in rollover files', async () => {
    const rolloverLogFile = new LogFile({ 
      logLevel: LogFile.DEBUG,
      maxFileSize: 800
    });
    rolloverLogFile.start();
    
    // Write enough to trigger rollover
    for (let i = 0; i < 80; i++) {
      rolloverLogFile.info(`Message ${i} for rollover test with padding content`);
    }
    
    rolloverLogFile.flushSync();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const files = fs.readdirSync("./logs");
    
    if (files.length > 1) {
      // Check that rollover file exists and has start log
      const rolloverFile = files.find(f => f.match(/log-\d{4}-\d{2}-\d{2}-\d+\.log/));
      if (rolloverFile) {
        const content = fs.readFileSync(`./logs/${rolloverFile}`, 'utf8');
        expect(content).toContain('Log Started:');
      }
    }
    
    rolloverLogFile.stop();
  });

  it('should handle file size checks without errors when file does not exist', () => {
    const testLogFile = new LogFile({ 
      logLevel: LogFile.DEBUG,
      maxFileSize: 1024
    });
    
    // Don't start the logger, so no file exists yet
    // This should not throw an error when checking file size
    expect(() => {
      testLogFile.flushSync();
    }).not.toThrow();
  });

  // The date-based rollover is covered properly by the "date rollover" block
  // below, which moves the clock. What is not covered anywhere else is that
  // entries keep their order across a flush and across a size rollover.
  it('should preserve entry order across flushes and rollovers', () => {
    const orderedLogFile = new LogFile({ logLevel: LogFile.DEBUG, maxFileSize: 700 });
    orderedLogFile.start();

    for (let i = 0; i < 60; i++) {
      orderedLogFile.info(`ordered ${String(i).padStart(3, "0")} padding to force rollovers`);
      if (i % 7 === 0) orderedLogFile.flushSync();   // flush at irregular points
    }
    orderedLogFile.flushSync();

    // read every file the run produced, oldest suffix first
    // Anchor the suffix pattern to the whole name: a loose /-(\d+)\.log$/ also
    // matches the day in "log-2026-07-29.log" and sorts the base file as 29.
    const suffixOf = (f: string) => Number((f.match(/^log-\d{4}-\d{2}-\d{2}-(\d+)\.log$/) || [, "0"])[1]);
    const files = fs.readdirSync("./logs").sort((a: string, b: string) => suffixOf(a) - suffixOf(b));
    expect(files.length).toBeGreaterThan(1);

    const seen: number[] = [];
    for (const file of files) {
      for (const line of fs.readFileSync(`./logs/${file}`, "utf8").split("\n")) {
        const m = line.match(/ordered (\d{3})/);
        if (m) seen.push(Number(m[1]));
      }
    }

    expect(seen.length).toBe(60);
    expect(seen).toEqual([...Array(60).keys()]);   // no reordering, loss, or duplication

    orderedLogFile.stop();
  });

  it('should not duplicate or lose entries when a write fails and later recovers', () => {
    const flakyLogFile = new LogFile({ logLevel: LogFile.DEBUG, onError: () => {} });
    flakyLogFile.start();

    flakyLogFile.info("entry one");
    flakyLogFile.setLogDir("./logs/gone\0bad");   // writes now fail
    flakyLogFile.info("entry two");
    flakyLogFile.flushSync();                      // fails; entries retained
    flakyLogFile.flushSync();                      // fails again - must not duplicate

    flakyLogFile.setLogDir("./logs");               // disk recovers
    flakyLogFile.info("entry three");
    flakyLogFile.flushSync();

    const body = readLogLines().join("\n");
    for (const entry of ["entry one", "entry two", "entry three"]) {
      expect(body.split(entry).length - 1).toBe(1);   // exactly once
    }

    flakyLogFile.stop();
  });

  it('should record an Error argument with its stack on a single line', () => {
    const failure = new Error("database unreachable");
    logFile.error("request failed:", failure);
    logFile.flushSync();

    const lines = readLogLines();
    const line = lines.find((l: string) => l.includes("database unreachable")) ?? "";

    expect(line).toContain("request failed:");
    expect(line).toContain("Error: database unreachable");
    expect(line).toContain("at ");                 // stack frames survived
    expect(line).not.toContain("\n");              // collapsed, cannot forge a line
    expect(lines.filter((l: string) => l.includes("database unreachable")).length).toBe(1);
  });

  const readLogLines = (dir = "./logs"): string[] => {
    const file = fs.readdirSync(dir)[0];
    return fs.readFileSync(`${dir}/${file}`, "utf8")
      .split("\n")
      .filter((line: string) => line && !line.startsWith("-"));
  };

  it('should not throw when logging an object with circular references', () => {
    const circular: any = { url: "/api/thing" };
    circular.self = circular;

    expect(() => logFile.info("request:", circular)).not.toThrow();
    expect(logFile.info("request:", circular)).toBe(true);

    logFile.flushSync();
    const lines = readLogLines();
    expect(lines.some((l: string) => l.includes("[Circular]"))).toBe(true);
  });

  it('should not throw when logging values JSON.stringify rejects', () => {
    const throwingGetter = { get boom() { throw new Error("nope"); } };

    expect(() => logFile.info("bigint:", { id: 10n })).not.toThrow();
    expect(() => logFile.info("getter:", throwingGetter)).not.toThrow();
    expect(() => logFile.info("fn:", () => "x")).not.toThrow();

    logFile.flushSync();
    const lines = readLogLines();
    expect(lines.some((l: string) => l.includes("10n"))).toBe(true);
    expect(lines.some((l: string) => l.includes("[Unserializable]"))).toBe(true);
  });

  it('should treat $ replacement patterns in a message as literal text', () => {
    logFile.info("evil $` and $& and $' and $$ end");
    logFile.flushSync();

    const line = readLogLines().find((l: string) => l.includes("evil")) ?? "";
    expect(line).toContain("evil $` and $& and $' and $$ end");
    // the timestamp/level prefix must appear exactly once
    expect((line.match(/\| INFO \|/g) ?? []).length).toBe(1);
  });

  it('should strip ANSI escape sequences entirely, not just the ESC byte', () => {
    logFile.info("ansi \x1B[31mRED\x1B[0m done");
    logFile.flushSync();

    const line = readLogLines().find((l: string) => l.includes("ansi"));
    expect(line).toContain("ansi RED done");
    expect(line).not.toContain("[31m");
    expect(line).not.toContain("\x1B");
  });

  it('should strip newlines and bidi overrides so log lines cannot be forged', () => {
    logFile.info("real\n2020-01-01 00:00:00 | CRITICAL | forged");
    logFile.info("bidi ‮reversed‬ end");
    logFile.flushSync();

    const lines = readLogLines();
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain("real2020-01-01 00:00:00 | CRITICAL | forged");
    expect(lines[1]).toContain("bidi reversed end");
    expect(lines[1]).not.toContain("‮");
  });

  it('should expand every occurrence of a macro, not just the first', () => {
    logFile.setLogStr("%LEVEL% %LEVEL% | %MESSAGE%");
    logFile.info("twice");
    logFile.flushSync();

    const line = readLogLines().find((l: string) => l.includes("twice"));
    expect(line).toBe("INFO INFO | twice");
  });

  it('should not expand macros contained in the message itself', () => {
    logFile.info("literal %DATE% %LEVEL% %MESSAGE%");
    logFile.flushSync();

    const line = readLogLines().find((l: string) => l.includes("literal"));
    expect(line).toContain("literal %DATE% %LEVEL% %MESSAGE%");
  });

  it('should strip path separators from the file format to prevent traversal', () => {
    const traversalLogFile = new LogFile({
      logLevel: LogFile.DEBUG,
      fileFormat: "../../escaped-%DATE%.log"
    });
    traversalLogFile.start();
    traversalLogFile.info("contained");
    traversalLogFile.flushSync();

    try {
      expect(traversalLogFile.getFileFormat()).not.toContain("/");
      expect(traversalLogFile.getFileFormat()).not.toContain("\\");

      // the log stays a single path component inside the log directory
      expect(traversalLogFile.file().startsWith("./logs/")).toBe(true);
      expect(traversalLogFile.file().slice("./logs/".length)).not.toContain("/");
      expect(fs.existsSync(traversalLogFile.file())).toBe(true);

      // and nothing was written outside of it
      const escaped = (dir: string) => fs.readdirSync(dir).some((f: string) => f.startsWith("escaped-"));
      expect(escaped(".")).toBe(false);
      expect(escaped("..")).toBe(false);
    } finally {
      traversalLogFile.stop();
    }
  });

  it('should bound the buffer and count drops when writes keep failing', () => {
    const errors: Error[] = [];
    const failingLogFile = new LogFile({
      logLevel: LogFile.DEBUG,
      maxBufferEntries: 10,
      onError: (e: Error) => errors.push(e)
    });
    failingLogFile.start();
    failingLogFile.setLogDir("./logs/missing/\0invalid");

    for (let i = 0; i < 60; i++) {
      failingLogFile.info(`entry ${i}`);
      failingLogFile.flushSync();
    }

    expect(failingLogFile.getDroppedLogs()).toBeGreaterThan(0);
    expect(errors.some((e: Error) => /Log buffer limit/.test(e.message))).toBe(true);

    failingLogFile.setLogDir("./logs");
    failingLogFile.flushSync();

    // the most recent entries survive; the oldest were dropped
    const lines = readLogLines();
    expect(lines.length).toBeLessThanOrEqual(10);
    expect(lines[lines.length - 1]).toContain("entry 59");

    failingLogFile.stop();
  });

  it('should restart cleanly after stop() when the log file was removed externally', () => {
    logFile.info("before");
    logFile.flushSync();

    // simulate an external logrotate deleting the active file
    fs.rmSync(logFile.file());

    expect(logFile.stop()).toBe(true);
    expect(logFile.start()).toBe(true);
    expect(fs.existsSync(logFile.file())).toBe(true);

    logFile.info("after");
    logFile.flushSync();
    expect(readLogLines().some((l: string) => l.includes("after"))).toBe(true);
  });

  it('should not re-enter the logger when the onError callback logs', () => {
    let calls = 0;
    const reentrantLogFile = new LogFile({
      logLevel: LogFile.DEBUG,
      maxBufferEntries: 5,
      onError: () => {
        calls++;
        // a callback that logs is natural user code; it must not amplify
        if (calls < 5000) reentrantLogFile.error("io failure");
      }
    });
    reentrantLogFile.start();
    reentrantLogFile.setLogDir("./logs/gone\0bad");

    for (let i = 0; i < 20; i++) {
      reentrantLogFile.info(`entry ${i}`);
      reentrantLogFile.flushSync();
    }

    // Bounded: roughly one report per failing operation (the buffered write and
    // the explicit flush), not the unbounded cascade an unguarded callback
    // produced. The nested call from the callback is silently suppressed.
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThanOrEqual(60);

    reentrantLogFile.setLogDir("./logs");
    reentrantLogFile.stop();
  });

  it('should contain an onError callback that throws', () => {
    const throwingLogFile = new LogFile({
      logLevel: LogFile.DEBUG,
      onError: () => { throw new Error("callback blew up"); }
    });
    throwingLogFile.start();

    expect(() => throwingLogFile.setLogDir("./logs/gone\0bad")).not.toThrow();
    expect(() => throwingLogFile.info("x")).not.toThrow();
    expect(() => throwingLogFile.flushSync()).not.toThrow();
    expect(() => throwingLogFile.stop()).not.toThrow();

    throwingLogFile.setLogDir("./logs");
  });

  it('should keep buffer accounting correct across a failed write', () => {
    const accountingLogFile = new LogFile({ logLevel: LogFile.DEBUG, onError: () => {} });
    accountingLogFile.start();
    accountingLogFile.setLogDir("./logs/gone\0bad");

    accountingLogFile.info("first");
    accountingLogFile.flushSync();  // fails; entry is retained

    accountingLogFile.setLogDir("./logs");
    accountingLogFile.info("second");
    accountingLogFile.flushSync();

    const lines = readLogLines();
    expect(lines.some((l: string) => l.includes("first"))).toBe(true);
    expect(lines.some((l: string) => l.includes("second"))).toBe(true);
    expect(accountingLogFile.getDroppedLogs()).toBe(0);

    accountingLogFile.stop();
  });

  it('should not throw on argument types that cannot be implicitly stringified', () => {
    const nullProto = Object.create(null);
    nullProto.field = "value";

    expect(() => logFile.info("symbol:", Symbol("secret"))).not.toThrow();
    expect(() => logFile.info("nullproto:", nullProto)).not.toThrow();
    expect(() => logFile.info()).not.toThrow();
    expect(() => logFile.info(null, undefined)).not.toThrow();

    logFile.flushSync();
    const lines = readLogLines();
    expect(lines.some((l: string) => l.includes("Symbol(secret)"))).toBe(true);
    expect(lines.some((l: string) => l.includes('"field":"value"'))).toBe(true);
  });

  it('should fall back to the default when a file format sanitizes to nothing', () => {
    logFile.setFileFormat("");
    expect(logFile.getFileFormat()).toBe("log-%DATE%.log");

    logFile.setFileFormat("/");
    expect(logFile.getFileFormat()).not.toBe("");

    // the logger stays usable rather than failing with EISDIR against the directory
    logFile.setFileFormat("..");
    expect(logFile.getFileFormat()).toBe("log-%DATE%.log");
    expect(() => { logFile.stop(); logFile.start(); }).not.toThrow();
    expect(fs.existsSync(logFile.file())).toBe(true);
  });

  it('should expand every %DATE% occurrence in the file format', () => {
    const twiceLogFile = new LogFile({ logLevel: LogFile.DEBUG, fileFormat: "%DATE%-log-%DATE%.log" });
    twiceLogFile.start();
    twiceLogFile.info("x");
    twiceLogFile.flushSync();

    const name = twiceLogFile.file().split("/").pop();
    expect(name).not.toContain("%DATE%");
    expect(name).toMatch(/^\d{4}-\d{2}-\d{2}-log-\d{4}-\d{2}-\d{2}\.log$/);

    twiceLogFile.stop();
  });

  it('should not lose entries when a size rollover lands on an existing file', () => {
    // a previous run already left a suffixed file behind
    const date = new Date();
    const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    fs.mkdirSync("./logs", { recursive: true });
    fs.writeFileSync(`./logs/log-${stamp}-1.log`, "PRIOR RUN CONTENT\n");

    const sizeLogFile = new LogFile({ logLevel: LogFile.DEBUG, maxFileSize: 600 });
    sizeLogFile.start();
    for (let i = 0; i < 40; i++) sizeLogFile.info(`padding entry number ${i} with extra text`);
    sizeLogFile.flushSync();

    expect(fs.readFileSync(`./logs/log-${stamp}-1.log`, "utf8")).toContain("PRIOR RUN CONTENT");

    sizeLogFile.stop();
  });

  it('should report a failed start instead of throwing', () => {
    const errors: Error[] = [];
    const unstartableLogFile = new LogFile({
      logLevel: LogFile.DEBUG,
      dir: "./logs/no\0such",
      onError: (e: Error) => errors.push(e)
    });

    // documented contract: "True if the log file was initialized successfully, false otherwise"
    let result: boolean | undefined;
    expect(() => { result = unstartableLogFile.start(); }).not.toThrow();
    expect(result).toBe(false);
    expect(errors.length).toBeGreaterThan(0);

    // and logging against a logger that could not start stays contained
    expect(() => unstartableLogFile.info("dropped")).not.toThrow();
  });

  it('should write buffered entries to the directory they were logged against', () => {
    logFile.info("logged while dir was ./logs");
    const oldFile = logFile.file();

    logFile.setLogDir("./logs2");
    logFile.info("logged while dir was ./logs2");
    logFile.flushSync();

    expect(fs.readFileSync(oldFile, "utf8")).toContain("logged while dir was ./logs");
    expect(fs.readFileSync(logFile.file(), "utf8")).toContain("logged while dir was ./logs2");
    expect(fs.readFileSync(logFile.file(), "utf8")).not.toContain("logged while dir was ./logs\n");
  });

  it('should arm and disarm the rollover timer when toggled at runtime', () => {
    jest.useFakeTimers({ doNotFake: ["nextTick"] });
    jest.setSystemTime(new Date(2032, 1, 3, 12, 0, 0));

    // started with rollover off: the timer must not be running
    const toggleLogFile = new LogFile({ logLevel: LogFile.DEBUG, rollover: false });
    toggleLogFile.start();
    const firstFile = toggleLogFile.file();

    jest.setSystemTime(new Date(2032, 1, 4, 12, 0, 0));
    jest.advanceTimersByTime(6000);
    expect(toggleLogFile.file()).toBe(firstFile);

    // enabling it at runtime must arm the timer, so an idle logger still rolls
    toggleLogFile.setRollover(true);
    jest.setSystemTime(new Date(2032, 1, 5, 12, 0, 0));
    jest.advanceTimersByTime(6000);
    expect(toggleLogFile.file()).toBe("./logs/log-2032-02-05.log");

    // disabling it must stop the timer
    toggleLogFile.setRollover(false);
    const beforeIdle = toggleLogFile.file();
    jest.setSystemTime(new Date(2032, 1, 6, 12, 0, 0));
    jest.advanceTimersByTime(6000);
    expect(toggleLogFile.file()).toBe(beforeIdle);

    toggleLogFile.stop();
    jest.useRealTimers();
  });

  it('should sanitize console output, not just the file', () => {
    // the console is where escape sequences would actually be interpreted
    const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const consoleLogFile = new LogFile({ logLevel: LogFile.DEBUG, logToConsole: true });
    consoleLogFile.start();

    consoleLogFile.info("danger \x1B[31mRED\x1B[0m and\nforged line");

    expect(consoleSpy).toHaveBeenCalled();
    const printed = consoleSpy.mock.calls[consoleSpy.mock.calls.length - 1][0] as string;
    expect(printed).not.toContain("\x1B");
    expect(printed).not.toContain("\n");
    expect(printed).toContain("danger RED and");

    consoleSpy.mockRestore();
    consoleLogFile.stop();
  });

  it('should fall back to console.error when no onError callback is set', () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const noCallbackLogFile = new LogFile({ logLevel: LogFile.DEBUG });   // no onError
    noCallbackLogFile.start();
    noCallbackLogFile.setLogDir("./logs/gone\0bad");

    noCallbackLogFile.info("this write fails");
    noCallbackLogFile.flushSync();

    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls.some(c => String(c[0]).includes("Failed to flush logs"))).toBe(true);

    // Clean up while the spy is still installed: this logger has no onError, so
    // the failing flush inside setLogDir would otherwise print a stack trace
    // into the test output.
    noCallbackLogFile.setLogDir("./logs");
    noCallbackLogFile.stop();
    errorSpy.mockRestore();
  });

  it('should return false from stop when the closing write fails', () => {
    const errors: Error[] = [];
    const blockedLogFile = new LogFile({ logLevel: LogFile.DEBUG, onError: (e: Error) => errors.push(e) });
    blockedLogFile.start();
    blockedLogFile.info("entry");
    blockedLogFile.flushSync();

    // replace the log file with a directory: the path still exists, but every
    // write to it fails with EISDIR on every platform
    const target = blockedLogFile.file();
    fs.rmSync(target);
    fs.mkdirSync(target);

    expect(blockedLogFile.stop()).toBe(false);
    expect(errors.length).toBeGreaterThan(0);

    fs.rmSync(target, { recursive: true, force: true });
  });

  it('should suffix a file format that has no extension', () => {
    const noExtLogFile = new LogFile({ logLevel: LogFile.DEBUG, fileFormat: "applog", maxFileSize: 400 });
    noExtLogFile.start();

    for (let i = 0; i < 30; i++) noExtLogFile.info(`entry ${i} with padding text to trip the limit`);
    noExtLogFile.flushSync();

    const files = fs.readdirSync("./logs");
    expect(files).toContain("applog");
    expect(files.some((f: string) => /^applog-\d+$/.test(f))).toBe(true);

    noExtLogFile.stop();
  });

  it('should ignore setRollover before the logger is started', () => {
    const notStartedLogFile = new LogFile({ logLevel: LogFile.DEBUG });
    expect(() => notStartedLogFile.setRollover(true)).not.toThrow();
    expect(notStartedLogFile.getRollover()).toBe(true);

    // no timer was armed, so nothing keeps the suite alive and start() still works
    expect(notStartedLogFile.start()).toBe(true);
    notStartedLogFile.stop();
  });

  it('should expose useServerTime through a getter', () => {
    expect(logFile.getUseServerTime()).toBe(true);   // default

    logFile.setUseServerTime(false);
    expect(logFile.getUseServerTime()).toBe(false);

    logFile.setUseServerTime(true);
    expect(logFile.getUseServerTime()).toBe(true);
  });

  it('should pair every setter with a getter', () => {
    // guards against a future setter landing without its accessor
    const members = Object.getOwnPropertyNames(Object.getPrototypeOf(logFile));
    const setters = members.filter((m: string) => /^set[A-Z]/.test(m));

    expect(setters.length).toBeGreaterThan(0);
    for (const setter of setters) {
      expect(typeof (logFile as any)[setter.replace(/^set/, "get")]).toBe("function");
    }
  });

  it('should describe levels, macros and options in getHelp', () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    logFile.getHelp();

    expect(logSpy).toHaveBeenCalledTimes(1);
    const help = String(logSpy.mock.calls[0][0]);
    logSpy.mockRestore();

    for (const macro of ["%DATETIME%", "%DATE%", "%TIME%", "%LEVEL%", "%MESSAGE%"]) {
      expect(help).toContain(macro);
    }
    for (const level of ["Debug", "Info", "Warning", "Error", "Critical"]) {
      expect(help).toContain(level);
    }
    // every constructor option should be discoverable from the help output
    for (const option of ["logLevel", "dir", "fileFormat", "logStr", "rollover", "maxFileSize",
                          "maxBufferEntries", "logToConsole", "registerProcessHandlers",
                          "keepProcessAlive", "suppressPathWarnings", "onError"]) {
      expect(help).toContain(option);
    }
    // and the documented defaults should match the real ones
    expect(help).toContain("104857600");
    expect(help).toContain("10000");
    expect(help).toContain("log-%DATE%.log");
    expect(help).toContain("./logs");
  });

  it('should round-trip logToConsole', () => {
    expect(logFile.getLogToConsole()).toBe(false);
    logFile.setLogToConsole(true);
    expect(logFile.getLogToConsole()).toBe(true);
    logFile.setLogToConsole(false);
    expect(logFile.getLogToConsole()).toBe(false);
  });

  describe("path traversal notice", () => {
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
      warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    });
    afterEach(() => {
      warnSpy.mockRestore();
      removeDirs("./logs3");
    });

    const warnings = () => warnSpy.mock.calls.map(c => String(c[0]));

    it('should warn when the configured directory climbs out with ..', () => {
      new LogFile({ logLevel: LogFile.DEBUG, dir: "./logs/../../elsewhere" });

      expect(warnings().length).toBe(1);
      const message = warnings()[0];
      expect(message).toContain("[logfile]");
      expect(message).toContain("./logs/../../elsewhere");
      expect(message).toContain("path traversal");
      expect(message).toContain("suppressPathWarnings");
    });

    it('should warn on a Windows-style backslash traversal', () => {
      new LogFile({ logLevel: LogFile.DEBUG, dir: "logs\\..\\..\\elsewhere" });
      expect(warnings().length).toBe(1);
    });

    it('should warn when a computed directory is set at runtime', () => {
      const runtimeLogFile = new LogFile({ logLevel: LogFile.DEBUG, dir: "./logs3" });
      runtimeLogFile.start();
      expect(warnings().length).toBe(0);

      // the realistic mistake: a path built from outside input
      const tenant = "../../etc";
      runtimeLogFile.setLogDir(`./logs3/${tenant}`);

      expect(warnings().length).toBe(1);
      runtimeLogFile.setLogDir("./logs3");
      runtimeLogFile.stop();
    });

    it('should not warn for ordinary paths', () => {
      new LogFile({ logLevel: LogFile.DEBUG, dir: "./logs" });
      new LogFile({ logLevel: LogFile.DEBUG, dir: "/var/log/app" });
      new LogFile({ logLevel: LogFile.DEBUG, dir: "C:\\logs\\app" });
      new LogFile({ logLevel: LogFile.DEBUG, dir: "logs/nested/deep" });

      expect(warnings().length).toBe(0);
    });

    it('should not warn for names that merely contain dots', () => {
      // ".." only counts as a whole path segment
      new LogFile({ logLevel: LogFile.DEBUG, dir: "./logs/..data" });
      new LogFile({ logLevel: LogFile.DEBUG, dir: "./logs/archive..old" });
      new LogFile({ logLevel: LogFile.DEBUG, dir: "./logs/v1.2..3" });

      expect(warnings().length).toBe(0);
    });

    it('should warn only once per logger', () => {
      // The ".." segments stay inside ./logs3 so the directories these create
      // are removed by afterEach. Paths like "./logs3/../a" resolve to the repo
      // root and left a/, b/ and c/ behind after every run.
      const noisyLogFile = new LogFile({ logLevel: LogFile.DEBUG, dir: "./logs3/sub/../a" });
      noisyLogFile.start();
      noisyLogFile.setLogDir("./logs3/sub/../b");
      noisyLogFile.setLogDir("./logs3/sub/../c");

      expect(warnings().length).toBe(1);
      noisyLogFile.setLogDir("./logs3");
      noisyLogFile.stop();
    });

    it('should stay silent when suppressPathWarnings is set', () => {
      const quietLogFile = new LogFile({
        logLevel: LogFile.DEBUG,
        dir: "./logs3/../quiet",
        suppressPathWarnings: true
      });
      quietLogFile.setLogDir("./logs3/../still-quiet");

      expect(warnings().length).toBe(0);
    });

    it('should not interfere with logging to a traversal path', () => {
      // the notice is advisory; the path must still work
      const workingLogFile = new LogFile({ logLevel: LogFile.DEBUG, dir: "./logs/../logs3" });
      workingLogFile.start();
      workingLogFile.info("written through a traversal path");
      workingLogFile.flushSync();

      const file = fs.readdirSync("./logs3")[0];
      expect(fs.readFileSync(`./logs3/${file}`, "utf8")).toContain("written through a traversal path");

      workingLogFile.stop();
    });
  });

  describe("keepProcessAlive", () => {
    const exitListeners = () => process.listenerCount("exit");

    it('should not register an exit listener by default', () => {
      const before = exitListeners();
      const defaultLogFile = new LogFile({ logLevel: LogFile.DEBUG });
      defaultLogFile.start();

      expect(exitListeners()).toBe(before);

      defaultLogFile.stop();
    });

    it('should register an exit flush when disabled, and remove it on stop', () => {
      const before = exitListeners();
      const shortLivedLogFile = new LogFile({ logLevel: LogFile.DEBUG, keepProcessAlive: false });
      shortLivedLogFile.start();

      expect(exitListeners()).toBe(before + 1);

      shortLivedLogFile.info("still flushes normally");
      shortLivedLogFile.flushSync();
      expect(readLogLines().some((l: string) => l.includes("still flushes normally"))).toBe(true);

      shortLivedLogFile.stop();
      expect(exitListeners()).toBe(before);
    });

    it('should not double-register when process handlers are also enabled', () => {
      const before = exitListeners();
      const bothLogFile = new LogFile({
        logLevel: LogFile.DEBUG,
        keepProcessAlive: false,
        registerProcessHandlers: true
      });
      bothLogFile.start();

      // registerProcessHandlers already installs an exit flush
      expect(exitListeners()).toBe(before + 1);

      bothLogFile.stop();
      expect(exitListeners()).toBe(before);
    });

    // Only the compiled build can be required by a child process.
    const target = process.env.TEST_TARGET || 'compiled-cjs';
    const childIt = target === 'compiled-cjs' ? it : it.skip;

    const childScript = (options: string) =>
      `const L=require(${JSON.stringify(path.resolve("dist/logfile.cjs"))});` +
      `const l=new L(${options});l.start();l.info("written by the child");`;

    childIt('should let the process exit and still flush when disabled', () => {
      expect(() => {
        execFileSync(process.execPath, ["-e", childScript('{dir:"./logs",logLevel:0,keepProcessAlive:false}')], { timeout: 10000 });
      }).not.toThrow();

      // the exit handler wrote the buffered entry before the process ended
      expect(readLogLines().some((l: string) => l.includes("written by the child"))).toBe(true);
    }, 20000);

    childIt('should hold the process open by default', () => {
      // documented behavior: the timers keep the loop alive, so this times out
      expect(() => {
        execFileSync(process.execPath, ["-e", childScript('{dir:"./logs",logLevel:0}')], { timeout: 3000 });
      }).toThrow();
    }, 20000);
  });

  it('should flush on its own timer without an explicit flush', async () => {
    // every other timing test uses fake timers; this exercises the real interval.
    // No assertion that it is *not* yet written: whether the entry flushes
    // immediately depends on how long the buffer timeout has been idle.
    logFile.info("written by the interval");

    await new Promise(resolve => setTimeout(resolve, 1400));

    expect(readLogLines().some((l: string) => l.includes("written by the interval"))).toBe(true);
  });

  it('should bound the buffer when there is no writable target at all', () => {
    // rollover disabled, so nothing incidentally assigns a target file
    const strandedLogFile = new LogFile({
      logLevel: LogFile.DEBUG,
      dir: "./logs/no\0such",
      rollover: false,
      maxBufferEntries: 10,
      onError: () => {}
    });
    expect(strandedLogFile.start()).toBe(false);

    for (let i = 0; i < 5000; i++) strandedLogFile.info(`entry ${i} with padding`);

    // nothing can be written, so entries must be discarded rather than accumulate
    expect(strandedLogFile.getDroppedLogs()).toBeGreaterThan(4000);
  });

  it('should flush buffered entries on stop even if the file was removed', () => {
    logFile.info("buffered but never flushed");
    const target = logFile.file();

    // an external rotate removes the active file before shutdown
    fs.rmSync(target);
    expect(logFile.stop()).toBe(true);

    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target, "utf8")).toContain("buffered but never flushed");
  });

  it('should restart on the next log call after stop', () => {
    logFile.info("before stop");
    logFile.stop();

    logFile.info("after stop");
    logFile.flushSync();

    expect(readLogLines().some((l: string) => l.includes("after stop"))).toBe(true);
  });

  it('should not throw out of the rollover interval when the directory is gone', () => {
    jest.useFakeTimers({ doNotFake: ["nextTick"] });
    jest.setSystemTime(new Date(2031, 7, 20, 12, 0, 0));

    const errors: Error[] = [];
    const intervalLogFile = new LogFile({
      logLevel: LogFile.DEBUG,
      onError: (e: Error) => errors.push(e)
    });
    intervalLogFile.start();
    intervalLogFile.info("before");
    intervalLogFile.flushSync();

    // an operator removes the log directory, then the date turns over
    fs.rmSync("./logs", { recursive: true, force: true });
    jest.setSystemTime(new Date(2031, 7, 21, 12, 0, 0));

    // the 5s rollover interval fires with no try/catch above it
    expect(() => jest.advanceTimersByTime(6000)).not.toThrow();
    expect(errors.length).toBeGreaterThan(0);

    intervalLogFile.stop();
    jest.useRealTimers();
  });

  describe("useServerTime", () => {
    // An instant whose UTC date differs from local time in most zones, so the
    // two modes are actually distinguishable. Assertions are derived from the
    // same instant, so they hold in any timezone (including UTC itself).
    const instant = new Date(Date.UTC(2030, 3, 12, 2, 30, 45));
    const pad = (n: number) => String(n).padStart(2, "0");
    const utcDate = `${instant.getUTCFullYear()}-${pad(instant.getUTCMonth() + 1)}-${pad(instant.getUTCDate())}`;
    const utcTime = `${pad(instant.getUTCHours())}:${pad(instant.getUTCMinutes())}:${pad(instant.getUTCSeconds())}`;
    const localDate = `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}`;
    const localTime = `${pad(instant.getHours())}:${pad(instant.getMinutes())}:${pad(instant.getSeconds())}`;

    afterEach(() => {
      jest.useRealTimers();
    });

    const logAt = (useServerTime: boolean): string => {
      jest.useFakeTimers({ doNotFake: ["nextTick"] });
      jest.setSystemTime(instant);

      const timeLogFile = new LogFile({ logLevel: LogFile.DEBUG, logStr: "%DATE%|%TIME%|%DATETIME%|%MESSAGE%" });
      timeLogFile.setUseServerTime(useServerTime);
      timeLogFile.start();
      timeLogFile.info("entry");
      timeLogFile.flushSync();

      // read this logger's own file; the shared logger writes a differently named one
      const content = fs.readFileSync(timeLogFile.file(), "utf8");
      timeLogFile.stop();
      return content.split("\n").find((l: string) => l.includes("entry")) ?? "";
    };

    it('should use server local time in log entries by default', () => {
      const line = logAt(true);
      expect(line).toBe(`${localDate}|${localTime}|${instant.getFullYear()}-${instant.getMonth() + 1}-${instant.getDate()} ${localTime}|entry`);
    });

    it('should use UTC in log entries when disabled', () => {
      const line = logAt(false);
      expect(line).toBe(`${utcDate}|${utcTime}|${instant.getUTCFullYear()}-${instant.getUTCMonth() + 1}-${instant.getUTCDate()} ${utcTime}|entry`);
    });

    it('should name files by the UTC date when disabled', () => {
      jest.useFakeTimers({ doNotFake: ["nextTick"] });
      jest.setSystemTime(instant);

      const utcLogFile = new LogFile({ logLevel: LogFile.DEBUG });
      utcLogFile.setUseServerTime(false);
      utcLogFile.start();

      expect(utcLogFile.file()).toBe(`./logs/log-${utcDate}.log`);

      utcLogFile.stop();
    });
  });

  it('should stay bounded when maxFileSize is smaller than the start banner', () => {
    // every new file already exceeds the limit, so each flush rolls over once;
    // this must stay linear rather than looping
    const tinyLogFile = new LogFile({ logLevel: LogFile.DEBUG, maxFileSize: 10 });
    tinyLogFile.start();

    for (let i = 0; i < 5; i++) {
      tinyLogFile.info(`entry ${i}`);
      tinyLogFile.flushSync();
    }

    const files = fs.readdirSync("./logs");
    expect(files.length).toBeGreaterThan(1);
    expect(files.length).toBeLessThanOrEqual(8);

    tinyLogFile.stop();
  });

  describe("date rollover", () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('should not truncate the log when the format has no %DATE%', () => {
      jest.useFakeTimers({ doNotFake: ["nextTick"] });
      jest.setSystemTime(new Date(2030, 0, 1, 12, 0, 0));

      const fixedLogFile = new LogFile({ logLevel: LogFile.DEBUG, fileFormat: "app.log" });
      fixedLogFile.start();
      fixedLogFile.info("first day entry");
      fixedLogFile.flushSync();

      // cross midnight; log() drives the rollover
      jest.setSystemTime(new Date(2030, 0, 2, 12, 0, 0));
      fixedLogFile.info("second day entry");
      fixedLogFile.flushSync();

      const content = fs.readFileSync("./logs/app.log", "utf8");
      expect(content).toContain("first day entry");
      expect(content).toContain("second day entry");

      fixedLogFile.stop();
    });

    it('should flush entries buffered before midnight to the previous day file', () => {
      jest.useFakeTimers({ doNotFake: ["nextTick"] });
      jest.setSystemTime(new Date(2030, 5, 10, 23, 59, 59));

      const midnightLogFile = new LogFile({ logLevel: LogFile.DEBUG });
      midnightLogFile.start();
      midnightLogFile.info("logged before midnight");   // buffered, not yet flushed

      jest.setSystemTime(new Date(2030, 5, 11, 0, 0, 1));
      midnightLogFile.info("logged after midnight");
      midnightLogFile.flushSync();

      const dayOne = fs.readFileSync("./logs/log-2030-06-10.log", "utf8");
      const dayTwo = fs.readFileSync("./logs/log-2030-06-11.log", "utf8");

      expect(dayOne).toContain("logged before midnight");
      expect(dayTwo).toContain("logged after midnight");
      expect(dayTwo).not.toContain("logged before midnight");

      midnightLogFile.stop();
    });

    it('should roll to a new file and reset the suffix when the date changes', () => {
      jest.useFakeTimers({ doNotFake: ["nextTick"] });
      jest.setSystemTime(new Date(2030, 2, 5, 12, 0, 0));

      const rollLogFile = new LogFile({ logLevel: LogFile.DEBUG, maxFileSize: 500 });
      rollLogFile.start();
      for (let i = 0; i < 30; i++) rollLogFile.info(`day one entry ${i} with padding text`);
      rollLogFile.flushSync();

      // a size rollover should have happened, so the suffix is non-zero
      expect(fs.readdirSync("./logs").some((f: string) => /2030-03-05-\d+\.log$/.test(f))).toBe(true);

      jest.setSystemTime(new Date(2030, 2, 6, 12, 0, 0));
      rollLogFile.info("day two entry");
      rollLogFile.flushSync();

      // the new day starts at the unsuffixed name again
      expect(rollLogFile.file()).toBe("./logs/log-2030-03-06.log");
      expect(fs.readFileSync("./logs/log-2030-03-06.log", "utf8")).toContain("day two entry");

      rollLogFile.stop();
    });
  });

  it('should create the directory when setLogDir is called on a running logger', () => {
    logFile.setLogDir("./logs2");
    expect(fs.existsSync("./logs2")).toBe(true);

    logFile.info("moved");
    logFile.flushSync();
    expect(readLogLines("./logs2").some((l: string) => l.includes("moved"))).toBe(true);
  });
});
