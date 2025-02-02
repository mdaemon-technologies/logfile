const LogFile = require("../dist/logfile.cjs");
const fs = require("fs"); // we're going to want to delete the file when we're done testing it

const { DEBUG, WARNING } = LogFile;
const log = new LogFile({ logLevel: DEBUG });

describe("LogFile", () => {
  let spy = null;
  beforeEach(() => {
    logFile = new LogFile({ logLevel: LogFile.DEBUG });
    logFile.start();
    spy = jest.spyOn(logFile, "log");
  });

  afterEach(async () => {
    logFile.stop();
    if (fs.existsSync("./logs")) {
      fs.rmdirSync("./logs", { recursive: true, force: true });
    }
    if (fs.existsSync("./logs2")) {
      fs.rmdirSync("./logs2", { recursive: true, force: true });
    }
  });

  it("should start and stop", () => {
    log.start();
    log.stop();
  });

  it("should log", () => {
    log.start();
    log.log("test", 0);
    log.stop();
  });

  it("should roll over", () => {
    log.start();
    log.log("test", 0);
    log.stop();
    const files = fs.readdirSync("./logs");
    expect(files.length).toBe(1);
  });

  it("should allow set and get dir", () => {
    log.setLogDir("./logs2");
    expect(log.getLogDir()).toBe("./logs2");
  });

  it("should allow set and get log level", () => {
    log.setLogLevel(WARNING);
    expect(log.getLogLevel()).toBe(LogFile.WARNING);
  });

  it("should allow set and get rollover", () => {
    log.setRollover(false);
    expect(log.getRollover()).toBe(false);
  });

  it("should allow setLogStr", () => {
    log.setLogStr("%LEVEL% | %DATE% | %MESSAGE%");
    expect(log.getLogStr()).toBe("%LEVEL% | %DATE% | %MESSAGE%");
  });

  it("should allow setStartLog", () => {
    log.setStartLog("Log Started");
    expect(log.getStartLog()).toBe("Log Started");
  });

  it("should allow setEndLog", () => {
    log.setEndLog("Log Ended");
    expect(log.getEndLog()).toBe("Log Ended");
  });

  it("should allow you get the current file and the last file", () => {
    log.start();
    log.log("test", 0);
    log.stop();

    const currentFile = log.file();
    const lastFile = log.lastFile();

    expect(currentFile).toBeTruthy();
    expect(lastFile).toBeTruthy();

    fs.rmdirSync("./logs", { recursive: true, force: true });
  });

  test('info method logs at INFO level', () => {
    logFile.info('Test info message');
    expect(spy).toHaveBeenCalledWith('Test info message', LogFile.INFO);
  });

  test('warning method logs at WARNING level', () => {
    logFile.warning('Test warning message');
    expect(spy).toHaveBeenCalledWith('Test warning message', LogFile.WARNING);
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
    
    // DEBUG is higher number than INFO, so the string should not be logged
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
  
});

