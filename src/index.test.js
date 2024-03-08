const LogFile = require("../dist/logfile.cjs");
const fs = require("fs"); // we're going to want to delete the file when we're done testing it

const log = new LogFile({});

describe("LogFile", () => {
  
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

    //fs.rmdirSync("./logs", { recursive: true, force: true });
  });
});

