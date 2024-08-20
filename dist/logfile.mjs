import { existsSync, mkdirSync, writeFileSync, appendFileSync } from 'fs';

function getDate() {
    return new Date().toISOString().slice(0, 10);
}
function getTime() {
    return new Date().toISOString().slice(11, 19);
}
/**
 * Appends a newline to the end of the given string if one does not exist.
 */
var endWithNewLine = function (str) { return str.endsWith("\n") ? str : str + "\n"; };
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
var LogFile = /** @class */ (function () {
    function LogFile(options) {
        var _this = this;
        this.date = "";
        this.currentFile = "";
        this.logs = [];
        this.logToConsole = false;
        this.logLevel = 0;
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
        this.rollOver = function () {
            if (getDate() === _this.date) {
                return;
            }
            _this.date = getDate();
            if (_this.rolloverEnabled) {
                appendFileSync(_this.file(), endWithNewLine(_this.endLog.replace("%DATETIME%", new Date().toUTCString())));
                _this.currentFile = _this.fileFormat.replace("%DATE%", _this.date);
                writeFileSync(_this.file(), endWithNewLine(_this.startLog.replace("%DATETIME%", new Date().toUTCString())));
                _this.pushLogs();
            }
        };
        /**
       * If there are logs buffered in memory, write them
       * to the current log file. Clear the buffer after
       * writing.
       */
        this.pushLogs = function () {
            if (_this.logs.length > 0 && !!_this.currentFile) {
                appendFileSync(_this.file(), _this.logs.join("\n") + "\n");
                _this.logs = [];
            }
        };
        this.pushInterval = null;
        this.rolloverInterval = null;
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
   * Converts a numeric log level to a string representation.
   *
   * @param level The numeric log level to convert.
   * @returns The string representation of the log level.
   */
    LogFile.prototype.logLevelToString = function (level) {
        var levelStr = "";
        switch (level) {
            case 0:
                levelStr = "INFO";
                break;
            case 1:
                levelStr = "WARNING";
                break;
            case 2:
                levelStr = "ERROR";
                break;
            case 3:
                levelStr = "CRITICAL";
                break;
            case 4:
                levelStr = "DEBUG";
                break;
        }
        return levelStr;
    };
    /**
   * Sets the log level.
   *
   * @param level - The numeric log level to set.
   */
    LogFile.prototype.setLogLevel = function (level) {
        this.logLevel = level;
    };
    /**
   * Gets the current log level.
   *
   * @returns The current numeric log level.
   */
    LogFile.prototype.getLogLevel = function () {
        return this.logLevel;
    };
    /**
   * Sets the log directory.
   *
   * @param dir - The path to the log directory.
   */
    LogFile.prototype.setLogDir = function (dir) {
        this.dir = dir;
    };
    /**
   * Gets the current log directory.
   *
   * @returns The path to the current log directory.
   */
    LogFile.prototype.getLogDir = function () {
        return this.dir;
    };
    /**
   * Sets the file name format to use for log files.
   *
   * @param fileFormat - The file name format
   */
    LogFile.prototype.setFileFormat = function (fileFormat) {
        this.fileFormat = fileFormat;
    };
    /**
   * Gets the current file name format for log files.
   *
   * @returns The current file name format
   */
    LogFile.prototype.getFileFormat = function () {
        return this.fileFormat;
    };
    /**
   * Sets whether to log to the console.
   *
   * @param logToConsole - Whether logging should be enabled on the console.
   */
    LogFile.prototype.setLogToConsole = function (logToConsole) {
        this.logToConsole = logToConsole;
    };
    /**
   * Gets whether logging to console is enabled.
   *
   * @returns True if logging to console is enabled, false otherwise.
   */
    LogFile.prototype.getLogToConsole = function () {
        return this.logToConsole;
    };
    /**
   * Sets the log string template to use for logging.
   *
   * @param logStr The log string template.
   */
    LogFile.prototype.setLogStr = function (logStr) {
        this.logStr = logStr;
    };
    /**
   * Gets the log string template used for logging.
   *
   * @returns The log string template.
   */
    LogFile.prototype.getLogStr = function () {
        return this.logStr;
    };
    /**
   * Sets the start log message to use when logging starts.
   *
   * @param startLog The start log message.
   */
    LogFile.prototype.setStartLog = function (startLog) {
        this.startLog = startLog;
    };
    /**
   * Gets the start log message used when logging starts.
   *
   * @returns The start log message.
   */
    LogFile.prototype.getStartLog = function () {
        return this.startLog;
    };
    /**
   * Sets the end log message to use when logging ends.
   *
   * @param endLog The end log message.
   */
    LogFile.prototype.setEndLog = function (endLog) {
        this.endLog = endLog;
    };
    /**
   * Gets the end log message used when logging ends.
   *
   * @returns The end log message.
   */
    LogFile.prototype.getEndLog = function () {
        return this.endLog;
    };
    /**
   * Sets whether to enable rollover when the maximum log size is reached.
   *
   * @param rollover Whether to enable log rollover.
   */
    LogFile.prototype.setRollover = function (rollover) {
        this.rolloverEnabled = rollover;
    };
    /**
   * Gets whether log rollover is enabled when the maximum log size is reached.
   *
   * @returns True if log rollover is enabled, false otherwise.
   */
    LogFile.prototype.getRollover = function () {
        return this.rolloverEnabled;
    };
    /**
   * Logs help information to the console about log levels, log string macros,
   * and the default log directory.
   */
    LogFile.prototype.getHelp = function () {
        console.log("Log Levels: \n" +
            "0: Info\n" +
            "1: Warning\n" +
            "2: Error\n" +
            "3: Critical\n" +
            "4: Debug\n");
        console.log("Log String Macros: \n" +
            "%DATETIME%: Date and Time\n" +
            "%DATE%: Date\n" +
            "%TIME%: Time\n" +
            "%LEVEL%: Log Level\n" +
            "%MESSAGE%: Message\n");
        console.log("Default directory:./logs");
    };
    /**
   * Gets the path to the current log file.
   *
   * @returns The path to the current log file.
   */
    LogFile.prototype.file = function () {
        return this.dir + "/" + this.currentFile;
    };
    /**
   * Gets the path to the log file from the previous date.
   *
   * @returns The path to the log file from the previous date.
   */
    LogFile.prototype.lastFile = function () {
        return this.dir + "/" + this.fileFormat.replace("%DATE%", getDate());
    };
    /**
   * Starts the logger by initializing the log directory and files.
   *
   * @param dir - The directory to store log files.
   * @param fileFormat - The file naming format for log files.
   * @param rollover - Whether to enable log file rollover.
   * @returns True if the log file was initialized successfully, false otherwise.
   */
    LogFile.prototype.start = function () {
        if (!existsSync(this.dir)) {
            mkdirSync(this.dir);
        }
        this.currentFile = this.fileFormat.replace("%DATE%", getDate());
        var start = endWithNewLine(this.startLog.replace("%DATETIME%", new Date().toUTCString()));
        if (!existsSync(this.file())) {
            writeFileSync(this.file(), start);
        }
        else {
            appendFileSync(this.file(), start);
        }
        this.date = getDate();
        this.pushInterval = setInterval(this.pushLogs, 1000);
        if (this.rolloverEnabled) {
            this.rolloverInterval = setInterval(this.rollOver, 5000);
        }
        return existsSync(this.file());
    };
    /**
   * Stops the logger by clearing intervals, closing the log file, and resetting state.
   *
   * @returns True if the logger was stopped successfully, false otherwise.
   */
    LogFile.prototype.stop = function () {
        if (!existsSync(this.dir)) {
            return true;
        }
        if (!existsSync(this.file())) {
            return true;
        }
        try {
            this.pushLogs();
            appendFileSync(this.file(), endWithNewLine(this.endLog.replace("%DATETIME%", new Date().toUTCString())));
            if (this.pushInterval) {
                clearInterval(this.pushInterval);
            }
            if (this.rolloverInterval) {
                clearInterval(this.rolloverInterval);
            }
            this.currentFile = "";
        }
        catch (ex) {
            return false;
        }
        return true;
    };
    /**
   * Logs a message to the log file with the given log level.
   *
   * @param message - The message to log.
   * @param level - The log level, defaults to 0.
   * @returns True if the log was successful, false otherwise.
   */
    LogFile.prototype.log = function (message, level) {
        if (level === void 0) { level = 0; }
        try {
            if (!this.currentFile) {
                this.start();
            }
            if (this.logLevel < level) {
                this.rollOver();
                return true;
            }
            var logThis = this.logStr.replace("%DATETIME%", "".concat(getDate(), " ").concat(getTime()))
                .replace("%DATE%", getDate())
                .replace("%TIME%", getTime())
                .replace("%LEVEL%", this.logLevelToString(level))
                .replace("%MESSAGE%", message.replace(/\n|\r|\t/g, ""));
            this.logs.push(logThis);
            if (this.logToConsole) {
                console.log(logThis);
            }
            this.rollOver();
        }
        catch (ex) {
            return false;
        }
        return true;
    };
    LogFile.INFO = 0;
    LogFile.WARNING = 1;
    LogFile.ERROR = 2;
    LogFile.CRITICAL = 3;
    LogFile.DEBUG = 4;
    return LogFile;
}());

export { LogFile as default };
