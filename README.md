# @mdaemon/logfile

[![npm](https://img.shields.io/npm/v/@mdaemon/logfile?color=blue)](https://www.npmjs.com/package/@mdaemon/logfile)
[![license](https://img.shields.io/npm/l/@mdaemon/logfile?color=green)](LICENSE)
[![node](https://img.shields.io/node/v/@mdaemon/logfile)](https://nodejs.org)
[![install size](https://packagephobia.com/badge?p=@mdaemon/logfile)](https://packagephobia.com/result?p=@mdaemon/logfile)
[![CI](https://github.com/mdaemon-technologies/logfile/actions/workflows/node.js.yml/badge.svg)](https://github.com/mdaemon-technologies/logfile/actions/workflows/node.js.yml)

A node logging utility

A node only async logging utility. Not applicable to a browser context.

## Install

```bash
npm install @mdaemon/logfile
```

## Usage

### ES modules

```js
import LogFile from "@mdaemon/logfile";
```

### CommonJS

```js
const LogFile = require("@mdaemon/logfile");
```

## LogFile

### LogFile Initialization Options

```js
/* default LogFileOptions 
 * logLevel: 1 (INFO)
 * dir: "./logs"
 * fileFormat: "log-%DATE%.log"
 * logToConsole: false
 * rollover: true
 * maxFileSize: 104857600 (100 MB, 0 = unlimited)
 * maxBufferEntries: 10000
 * registerProcessHandlers: false
 * keepProcessAlive: true
 * suppressPathWarnings: false
 * onError: undefined
 * logStr: "%DATE% %TIME% | %LEVEL% | %MESSAGE%";
 * startLog: "-----------------------------------------\n" +
 *           "------- Log Started: %DATETIME%\n" +
 *           "-----------------------------------------\n";
 *    
 * endLog: "-----------------------------------------\n" +
 *         "------- Log Ended: %DATETIME%\n" +
 *         "-----------------------------------------\n";
*/
```

### LogFile Example

```js
const { INFO, ERROR, WARNING, CRITICAL, DEBUG } = LogFile;
const logFile = new LogFile({ logLevel: DEBUG });

logFile.start();

logFile.log("There was an error", ERROR);

logFile.stop();
/* file result 
-----------------------------------------
------- Log Started: Fri, 08 Mar 2024 16:07:19 GMT
-----------------------------------------
2024-03-08 16:07:19 | ERROR | There was an error
-----------------------------------------
------- Log Ended: Fri, 08 Mar 2024 16:07:19 GMT
-----------------------------------------
*/
```

### LogFile Options

```js
// set the log str
logFile.setLogStr("%DATE% %TIME% | %LEVEL% | %MESSAGE%");

// set the log dir
logFile.setLogDir("./logs");

// set the rollover boolean
logFile.setRollover(true);

// set the log level
logFile.setLogLevel(DEBUG);

// set the file name format
logFile.setFileFormat("log-%DATE%.log");

// set the log to console boolean
logFile.setLogToConsole(true);

// set the start log string
logFile.setStartLog("-----------------------------------------\n");

// set the end log string
logFile.setEndLog("-----------------------------------------\n");

// set whether timestamps use server local time (true, default) or UTC (false)
logFile.setUseServerTime(true);

// log help to the console
logFile.getHelp();

// log with an explicit level (defaults to DEBUG when omitted)
logFile.log("This is an error log", LogFile.ERROR);

// log to info
logFile.info("This is an info log");

// log to warning
logFile.warning("This is a warning log");

// warn is an alias for warning
logFile.warn("This is a warn log");

// log to error
logFile.error("This is an error log");

// log to critical
logFile.critical("This is a critical log");

// log to debug
logFile.debug("This is a debug log");

// force synchronous flush to disk
logFile.flushSync();

```

### Log File Rollover

The logger supports two types of automatic file rollover:

**Date-based Rollover** (when `rollover: true`):
- Automatically creates a new log file when the date changes
- File names use the `fileFormat` pattern with `%DATE%` replaced by the current date
- Example: `log-2024-01-01.log`, `log-2024-01-02.log`, etc.

**Size-based Rollover** (controlled by `maxFileSize`):
- Automatically creates a new log file when the current file exceeds `maxFileSize` (default: 100 MB)
- New files are created with an incremental numeric suffix
- Example: If `log-2024-01-01.log` exceeds the max size:
  - First rollover creates: `log-2024-01-01-1.log`
  - Second rollover creates: `log-2024-01-01-2.log`
  - And so on...
- The suffix counter resets to 0 when a date-based rollover occurs
- Set `maxFileSize: 0` to disable size-based rollover entirely (log files grow without limit)
- A rollover never truncates: if the target file already exists (a `fileFormat` without `%DATE%`, or a suffixed file left by an earlier run), it is appended to
- A `maxFileSize` smaller than the start banner causes a rollover on every flush; keep it comfortably above the banner size

**Combined Behavior**:
- Both rollover types work together seamlessly
- Date changes always create a new base file (resetting the size suffix)
- Within a single day, size-based rollovers create numbered variants
- Each new file (date or size-based) starts with the `startLog` message
- Files being closed receive the `endLog` message

```js
// Example: Create a logger with a 50 MB max file size
const logFile = new LogFile({ 
  maxFileSize: 52428800, // 50 MB in bytes
  fileFormat: "app-%DATE%.log"
});

// This will create files like:
// app-2024-01-01.log (up to 50 MB)
// app-2024-01-01-1.log (up to 50 MB)
// app-2024-01-01-2.log (up to 50 MB)
// app-2024-01-02.log (new day, suffix resets)
```

## LogFile Methods

### Log Levels
Available as static constants on the `LogFile` class:
- `LogFile.DEBUG` = 0
- `LogFile.INFO` = 1
- `LogFile.WARNING` = 2
- `LogFile.ERROR` = 3
- `LogFile.CRITICAL` = 4

Messages below the configured `logLevel` are not written.

### Configuration Methods
- `setLogStr(format)` / `getLogStr()` - Set/get the log entry format string
- `setLogDir(path)` / `getLogDir()` - Set/get the directory for log files. An empty path falls back to the default `"./logs"`, as the constructor does
- `setRollover(boolean)` / `getRollover()` - Enable/disable daily log file rollover
- `setLogLevel(level)` / `getLogLevel()` - Set/get the minimum log level
- `setFileFormat(format)` / `getFileFormat()` - Set/get the log filename format. On a running logger the change takes effect immediately: the current file is closed with an end banner and the new name is opened
- `setLogToConsole(bool)` / `getLogToConsole()` - Enable/disable console output
- `setStartLog(string)` / `getStartLog()` - Set/get the log file start string
- `setEndLog(string)` / `getEndLog()` - Set/get the log file end string
- `setUseServerTime(bool)` / `getUseServerTime()` - Use server local time (default: `true`) or UTC for timestamps. Applies to the `%DATE%`, `%TIME%` and `%DATETIME%` macros in log entries, the start/end banners, and the date used for file naming and rollover
- `getDroppedLogs()` - Number of buffered entries discarded because `maxBufferEntries` was reached

### Constructor Options
- `logLevel` - Minimum log level (default: `LogFile.INFO`)
- `dir` - Log file directory (default: `"./logs"`)
- `fileFormat` - Filename format (default: `"log-%DATE%.log"`)
- `logToConsole` - Also log to console (default: `false`)
- `rollover` - Enable date-based rollover (default: `true`)
- `maxFileSize` - Max file size in bytes before size-based rollover (default: `104857600`). Use `0` for no limit
- `maxBufferEntries` - Max entries retained after a failed write (default: `10000`)
- `logStr` - Log entry format string
- `startLog` - Message written when log file starts
- `endLog` - Message written when log file ends
- `registerProcessHandlers` - Register SIGINT/SIGTERM/exit/uncaughtException handlers (default: `false`). The handlers are shared by every logger that opts in, so a signal flushes all of them before the process ends
- `keepProcessAlive` - Whether the timers keep the Node process alive (default: `true`)
- `suppressPathWarnings` - Silence the one-time warning about a `..` segment in the log directory (default: `false`)
- `onError` - Callback invoked on I/O errors: `(error: Error) => void`
- `fileSystem` - Filesystem to write through (default: `node:fs`). A seam for tests, so I/O failures can be exercised without a real disk in an awkward state; leave unset in production

### Logging Methods
- `log(message, level)` - Log a message at the given level (defaults to `LogFile.DEBUG`)
- `debug(...args)` - Log a debug message
- `info(...args)` - Log an info message
- `warning(...args)` - Log a warning message
- `warn(...args)` - Alias for `warning`
- `error(...args)` - Log an error message
- `critical(...args)` - Log a critical message (automatically flushes to disk)

The return value reports whether the entry was **accepted**, not whether it reached disk. Writes are buffered and flushed later, so a full disk or a revoked permission is discovered after the call has already returned `true`. Use the `onError` callback to observe write failures.

Messages below the configured level are discarded before their arguments are serialized, so passing a large object to `debug()` costs nothing on a logger set to `ERROR`.

The level-specific methods accept multiple arguments; non-string arguments are stringified and joined with spaces. `null` and `undefined` are written as `null` and `undefined`.

### Utility Methods
- `getHelp()` - Returns the help text - log levels, the available macros, and every constructor option with its default - and also prints it
- `flushSync()` - Force immediate synchronous write of buffered logs to disk
- `file()` - Get the path to the current log file, or `""` when none is open (before `start()` and after `stop()`)
- `lastFile()` - Get the path to the previous log file, or `""` if there has not been one
- `start()` - Initialize the logger and set up shutdown handlers
- `stop()` - Stop the logger, flush remaining logs, and clean up resources

### Forced Shutdown Protection
The logger can optionally handle various termination scenarios to ensure logs are not lost. Set `registerProcessHandlers: true` to enable:

```js
const logFile = new LogFile({ 
  logLevel: LogFile.DEBUG,
  registerProcessHandlers: true 
});
```

- Registers handlers for exit, SIGINT, and SIGTERM signals to flush logs
- Automatically logs and flushes uncaught exceptions before termination
- Handlers are removed when `stop()` is called, preventing listener leaks
- Critical log messages are always immediately flushed to disk (regardless of this option)

### Process Lifetime
A running logger uses two timers: one to flush buffered entries, one to check for a date rollover. By default these keep the Node process alive, which is the long-standing behavior and is what a long-running service wants. It only matters for a short-lived script that finishes its work and expects to exit on its own — a pending timer is pending work, so the process will not end until `stop()` is called.

Set `keepProcessAlive: false` for those scripts:

```js
const logFile = new LogFile({ keepProcessAlive: false });
logFile.start();
logFile.info("done");
// the process exits normally here; the buffered entry is flushed on exit
```

The timers are `unref`'d so they no longer hold the event loop open — they still fire normally while the process is running — and buffered entries are flushed on process exit so nothing is lost. This has no effect on a process that exits via `process.exit()`, a signal, or a crash; those already close regardless.

### Handling of Untrusted Log Content
Log messages routinely contain user-supplied data, so the logger treats every message as untrusted:

- **Line forging is prevented.** Control characters, including newlines, are stripped from messages, so a message cannot introduce what looks like a separate log entry.
- **Escape sequences are removed.** Full ANSI/CSI sequences are stripped rather than just the `ESC` byte, so console output cannot be styled or manipulated by log content.
- **Bidirectional overrides are removed**, along with line/paragraph separators and the BOM, so log text cannot be visually reordered or hidden in an editor or terminal.
- **Replacement patterns are literal.** ``$` ``, `$&`, `$'`, and `$$` in a message are written as-is and cannot duplicate or delete parts of the rendered line.
- **Macros in a message are not expanded.** `%MESSAGE%` is substituted last, so a message containing `%DATE%` or `%LEVEL%` is written literally.
- **Serialization never throws.** Circular structures render as `[Circular]`, `BigInt` values as `123n`, and values that cannot be serialized at all as `[Unserializable]`. Symbols and null-prototype objects are handled too. Logging an object such as an HTTP request will not crash the caller.

Two things remain the application's responsibility:

- `dir` is used as given — see [Log Directory Warnings](#log-directory-warnings) below. (`fileFormat` is always reduced to a single path component, so it cannot escape the log directory.)
- Sensitive values are written verbatim. Redact secrets before logging them.

### Log Directory Warnings
The log directory is used exactly as provided. Any path the process can write to is allowed, including relative paths that climb upward with `..`, because that is a legitimate way to configure a logger.

The risk is not the path — it is where the path came from. Compare:

```js
// Fine: the value is a constant in your source
const logFile = new LogFile({ dir: "../shared-logs" });

// Vulnerability: part of the path comes from outside
const logFile = new LogFile({ dir: `./logs/${req.query.tenant}` });
// tenant = "../../../home/user/.ssh" redirects every write there
```

In the second case an attacker chooses where your process writes files. This library cannot tell the two apart — both arrive as an ordinary string — so instead it makes the situation visible: if the directory contains a `..` segment, a warning is printed once per logger.

```text
[logfile] Log directory "./logs/../../etc" contains a ".." segment, so it resolves
outside the directory it starts from. That is supported and is safe when the value is
hard-coded. If any part of it comes from user input, request data, or other untrusted
configuration, this is a path traversal risk: an attacker could direct log writes to
any location this process can write to. Pass suppressPathWarnings: true to silence
this notice.
```

The warning is triggered by the constructor and by `setLogDir()`, fires at most once per logger, and never changes behavior — logging to that path still works. Only a whole `..` path segment counts; a directory named `..data` or `archive..old` is an ordinary name.

**Keep the directory hard-coded.** If you must build it from a variable, validate that the resolved path stays inside a directory you control before passing it in:

```js
const path = require("path");

const root = path.resolve("./logs");
const target = path.resolve(root, tenant);
if (target !== root && !target.startsWith(root + path.sep)) {
  throw new Error("log directory escaped the log root");
}
```

Once you have confirmed the path is intentional, silence the notice with `suppressPathWarnings: true`.

### Behavior When Writes Fail
If a write fails — a full disk, revoked permissions, a removed directory — buffered entries are retained and retried, so a transient failure does not lose logs. To keep a persistent failure from exhausting memory, the retained backlog is capped at `maxBufferEntries` (default `10000`) and the oldest entries beyond that are discarded in batches. Each discard is reported through `onError`, and the running total is available from `getDroppedLogs()`:

```js
const logFile = new LogFile({
  maxBufferEntries: 5000,
  onError: (err) => process.stderr.write(`${err.message}\n`)
});

// later
if (logFile.getDroppedLogs() > 0) {
  // the log on disk is incomplete
}
```

Every filesystem operation is reported through `onError` rather than thrown: `start()` returns `false` if the directory or file cannot be created, and a rollover that fails (a removed or unwritable directory) is reported and recovered from on a later write. Logging never crashes the host application.

The `onError` callback is itself application code, so the logger protects against it too: a callback that logs will not re-enter and cascade, and a callback that throws is contained rather than escaping as an uncaught exception.

## Development

The package includes a comprehensive testing setup that allows for testing the following formats:

1. TypeScript source files (index.ts) before building
2. CommonJS output (logfile.cjs) after building

### Running Tests

```bash
# Test TypeScript source directly
npm run test:source

# Test CommonJS output
npm run test:cjs

# Run all tests (source, build CommonJS, then test each)
npm run test:all
```

The testing system uses a test helper that dynamically imports the appropriate module format based on environment variables, allowing the same test suite to verify all formats.

```js
// Example of how to use the test helper in tests
import { getLogFile } from './test-helper';

// Wait for the LogFile class to be dynamically loaded
const LogFile = await getLogFile();
const logFile = new LogFile({ logLevel: LogFile.DEBUG });
```

### Testing Challenges

Testing different module formats in Jest can be challenging. This project addresses these challenges by:

1. Using different Jest configurations for different module formats
2. Dynamically importing modules based on the test environment
3. Properly handling imports and mocks

If you're extending the tests, be aware that different module formats may require special handling for imports, mocks, and configuration.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

Published under the [LGPL-2.1](LICENSE) license.

Published by **MDaemon Technologies, Ltd.**  
Simple Secure Email  
[https://www.mdaemon.com](https://www.mdaemon.com)
