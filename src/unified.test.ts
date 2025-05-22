// This file works with source TypeScript, CommonJS, and ES Modules
import { getLogFile, fs } from './test-helper';

let LogFile: any;
let logFile: any;
let DEBUG: number;
let WARNING: number;

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
    if (fs.existsSync("./logs")) {
      // Handle different fs.rmdirSync signatures between Node versions
      try {
        fs.rmdirSync("./logs", { recursive: true } as any);
      } catch (e) {
        throw e;
      }
    }
    if (fs.existsSync("./logs2")) {
      try {
        fs.rmdirSync("./logs2", { recursive: true } as any);
      } catch (e) {
        throw e;
      }
    }
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
    logFile.start();
    logFile.log("test", 0);
    logFile.stop();

    const currentFile = logFile.file();
    const lastFile = logFile.lastFile();

    expect(currentFile).toBeTruthy();
    expect(lastFile).toBeTruthy();

    // Clean up with proper error handling
    try {
      fs.rmdirSync("./logs", { recursive: true } as any);
    } catch (e) {
      throw e;
    }
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
    
    // Mock fs.existsSync to verify it wasn't called again for re-initialization
    const existsSpy = jest.spyOn(fs, 'existsSync');
    const mkdirSpy = jest.spyOn(fs, 'mkdirSync');
    
    const secondStartResult = logFile.start();
    expect(secondStartResult).toBe(true);
    
    // Verify fs.existsSync was called for file existence check but not for directory creation
    expect(existsSpy).toHaveBeenCalled();
    expect(mkdirSpy).not.toHaveBeenCalled();
    
    existsSpy.mockRestore();
    mkdirSpy.mockRestore();
  });
  
  it('should not stop logger if already stopped', () => {
    // First stop the logger (it was started in beforeEach)
    logFile.stop();
    
    // Create mocks to verify nothing happens on second stop
    const appendSpy = jest.spyOn(fs, 'appendFileSync');
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    
    // Try to stop again
    const stopResult = logFile.stop();
    expect(stopResult).toBe(true);
    
    // Verify no calls to append end log message
    expect(appendSpy).not.toHaveBeenCalled();
    // clearInterval shouldn't be called since intervals are already null
    expect(clearIntervalSpy).not.toHaveBeenCalledWith(null);
    
    appendSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });
  
  it('should flush logs synchronously when critical is called', () => {
    // Get the correct method name (flushSync for source/ESM, pushLogs for CJS)
    const flushSyncSpy = jest.spyOn(logFile, 'flushSync');
    
    logFile.critical('Critical error happened');
    
    // Check if the method was called
    expect(flushSyncSpy).toHaveBeenCalledTimes(1);
    
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
    
    // Set up logFile to start fresh
    logFile.setLogDir('./logs');
    
    // Create a spy on the flushSync method
    const flushSyncSpy = jest.spyOn(logFile, 'flushSync');
    const stopSpy = jest.spyOn(logFile, 'stop');
    
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
    
    // Create spies for methods that should be called
    const criticalSpy = jest.spyOn(logFile, 'critical');
    const stopSpy = jest.spyOn(logFile, 'stop');
    
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
});
