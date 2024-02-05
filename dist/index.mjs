import fs from 'fs';

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol */


function __classPrivateFieldGet(receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

var _LogFile_instances, _LogFile_rollOver, _LogFile_pushLogs;
function getDate() {
    return new Date().toISOString().slice(0, 10);
}
function getTime() {
    return new Date().toISOString().slice(11, 19);
}
var LogFile = /** @class */ (function () {
    function LogFile(options) {
        _LogFile_instances.add(this);
        this.date = "";
        this.currentFile = "";
        this.logs = [];
        this.logToConsole = false;
        this.dir = options.dir || "./logs";
        this.file = options.file || "log-%DATE%.log";
        this.logToConsole = options.logToConsole || false;
        this.rollover = typeof options.rollover !== "undefined" ? options.rollover : true;
        this.startLog = options.startLog || "-----------------------------------------\n" +
            "------- Log Started: " + new Date().toUTCString() + "\n" +
            "-----------------------------------------\n";
        this.endLog = options.endLog || "-----------------------------------------\n" +
            "------- Log Ended: " + new Date().toUTCString() + "\n" +
            "-----------------------------------------\n";
        this.logStr = options.logStr || "%DATE% %TIME% | %LEVEL% | %MESSAGE%\n";
    }
    LogFile.prototype.setLogStr = function (logStr) {
        this.logStr = logStr;
    };
    LogFile.prototype.setStartLog = function (startLog) {
        this.startLog = startLog;
    };
    LogFile.prototype.setEndLog = function (endLog) {
        this.endLog = endLog;
    };
    LogFile.prototype.setRollover = function (rollover) {
        this.rollover = rollover;
    };
    LogFile.prototype.getHelp = function () {
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
    };
    LogFile.prototype.start = function () {
        if (!fs.existsSync(this.dir)) {
            fs.mkdirSync(this.dir);
        }
        this.currentFile = this.file.replace("%DATE%", getDate());
        if (!fs.existsSync(this.dir + "/" + this.currentFile)) {
            fs.writeFileSync(this.dir + "/" + this.currentFile, this.startLog);
        }
        this.date = getDate();
        setInterval(__classPrivateFieldGet(this, _LogFile_instances, "m", _LogFile_pushLogs).bind(this), 1000);
        if (this.rollover) {
            setInterval(__classPrivateFieldGet(this, _LogFile_instances, "m", _LogFile_rollOver).bind(this), 5000);
        }
    };
    LogFile.prototype.stop = function () {
        if (!fs.existsSync(this.dir)) {
            return;
        }
        if (!fs.existsSync(this.dir + "/" + this.currentFile)) {
            return;
        }
        fs.appendFileSync(this.dir + "/" + this.currentFile, this.endLog);
        this.currentFile = "";
    };
    LogFile.prototype.log = function (message, level) {
        if (level === void 0) { level = 0; }
        if (!this.currentFile) {
            this.start();
        }
        this.logs.push(this.logStr.replace("%DATE%", getDate()).replace("%TIME%", getTime()).replace("%LEVEL%", level.toString()).replace("%MESSAGE%", message));
        if (this.logToConsole) {
            console.log(message);
        }
        __classPrivateFieldGet(this, _LogFile_instances, "m", _LogFile_rollOver).call(this);
    };
    return LogFile;
}());
_LogFile_instances = new WeakSet(), _LogFile_rollOver = function _LogFile_rollOver() {
    if (getDate() === this.date) {
        return;
    }
    this.date = getDate();
    if (this.rollover) {
        fs.appendFileSync(this.dir + "/" + this.currentFile, this.endLog);
        this.currentFile = this.file.replace("%DATE%", this.date);
        fs.writeFileSync(this.dir + "/" + this.currentFile, this.startLog);
        __classPrivateFieldGet(this, _LogFile_instances, "m", _LogFile_pushLogs).call(this);
    }
}, _LogFile_pushLogs = function _LogFile_pushLogs() {
    if (this.logs.length > 0) {
        fs.appendFileSync(this.dir + "/" + this.currentFile, this.logs.join(""));
        this.logs = [];
    }
};

export { LogFile as default };
