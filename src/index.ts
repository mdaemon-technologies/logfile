import fs from "fs";

function getDate() {
  return new Date().toISOString().slice(0, 10);
}

function getTime() {
  return new Date().toISOString().slice(11, 19);
}

interface LogFileOptions {
  dir?: string;
  file?: string;
  rollover?: boolean;
  startLog?: string;
  endLog?: string;
  logStr?: string;
}

class LogFile {

  date: string;

  logStr: string;

  startLog: string;
  
  endLog: string;

  rollover: boolean;

  logs: string[];

  dir: string;

  file: string;

  currentFile: string;

  constructor(options: LogFileOptions) {
    this.date = "";
    this.dir = options.dir || "./logs";
    this.file = options.file || "log-%DATE%.txt";
    this.currentFile = "";
    this.rollover = typeof options.rollover !== "undefined" ? options.rollover : true;
    this.startLog = options.startLog || "-----------------------------------------\n" +
                    "------- Log Started: " + new Date().toUTCString() + "\n" +
                    "-----------------------------------------\n";

    this.endLog = options.endLog || "-----------------------------------------\n" +
                  "------- Log Ended: " + new Date().toUTCString() + "\n" +
                  "-----------------------------------------\n";

    this.logStr = options.logStr || "%DATE% %TIME% | %LEVEL% | %MESSAGE%\n";
  }

  setLogStr(logStr: string) {
    this.logStr = logStr;
  }

  setStartLog(startLog: string) {
    this.startLog = startLog;
  }

  setEndLog(endLog: string) { 
    this.endLog = endLog;
  }

  setRollover(rollover: boolean) {
    this.rollover = rollover;
  }

  getHelp() {
    console.log("Log Levels: \n" +
                "0: Info\n" +
                "1: Warning\n" +
                "2: Error\n" +
                "3: Critical\n" +
                "4: Debug\n");
    console.log("Log String Macros: \n" +
    "%DATE%: Date\n" +
    "%TIME%: Time\n" +
    "%LEVEL%: Log Level\n" +
    "%MESSAGE%: Message\n");
    console.log("Default directory:./logs");
  }

  #rollOver() {
    if (getDate() === this.date) {
      return;
    }

    this.date = getDate();
    if (this.rollover) {
      fs.appendFileSync(this.dir + "/" + this.currentFile, this.endLog);
      this.currentFile = this.file.replace("%DATE%", this.date);
      fs.writeFileSync(this.dir + "/" + this.currentFile, this.startLog);
      this.#pushLogs();
    }
  }

  #pushLogs() {
    if (this.logs.length > 0) {
      fs.appendFileSync(this.dir + "/" + this.currentFile, this.logs.join(""));
      this.logs = [];
    }
  }

  start() {
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir);
    }

    this.currentFile = this.file.replace("%DATE%", getDate());

    if (!fs.existsSync(this.dir + "/" + this.currentFile)) { 
      fs.writeFileSync(this.dir + "/" + this.currentFile, this.startLog);
    }

    this.date = getDate();
    setInterval(this.#pushLogs.bind(this), 1000);

    if (this.rollover) {
      setInterval(this.#rollOver.bind(this), 5000);
    }
  }

  stop() {
    if (!fs.existsSync(this.dir)) {
      return;
    }

    if (!fs.existsSync(this.dir + "/" + this.currentFile)) {
      return;
    }

    fs.appendFileSync(this.dir + "/" + this.currentFile, this.endLog);

    this.currentFile = "";
  }

  log(message: string, level: number = 0) {
    if (!this.currentFile) {
      this.start();
    }
    this.logs.push(this.logStr.replace("%DATE%", getDate()).replace("%TIME%", getTime()).replace("%LEVEL%", level.toString()).replace("%MESSAGE%", message));
    
    this.#rollOver();
  }
}

export default LogFile;