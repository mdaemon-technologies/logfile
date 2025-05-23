[![Dynamic JSON Badge](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmdaemon-technologies%2Flogfile%2Fmain%2Fpackage.json&query=%24.version&prefix=v&label=npm&color=blue)](https://www.npmjs.com/package/@mdaemon/logfile) [![Static Badge](https://img.shields.io/badge/node-v16%2B-blue?style=flat&label=node&color=blue)](https://nodejs.org) [![install size](https://packagephobia.com/badge?p=@mdaemon/logfile)](https://packagephobia.com/result?p=@mdaemon/logfile) [![Dynamic JSON Badge](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmdaemon-technologies%2Flogfile%2Fmain%2Fpackage.json&query=%24.license&prefix=v&label=license&color=green)](https://github.com/mdaemon-technologies/logfile/blob/main/LICENSE) [![Node.js CI](https://github.com/mdaemon-technologies/logfile/actions/workflows/node.js.yml/badge.svg)](https://github.com/mdaemon-technologies/logfile/actions/workflows/node.js.yml)

# @mdaemon/logfile, A node only async logging utility
 
 Not applicable to a browser context.

# Install #

    $ npm install @mdaemon/logfile --save

# Node CommonJS #
```javascript
    const LogFile = require("@mdaemon/logfile/dist/logfile.cjs");
```

# Node Modules #
```javascript
    import LogFile from "@mdaemon/logfile/dist/logfile.mjs";
```

### LogFile ###

#### LogFile Initialization Options ####
```javascript
  /* default LogFileOptions 
   * logLevel: 0 (INFO)
   * dir: "./logs"
   * fileFormat: "log-%DATE%.log"
   * logToConsole: false
   * rollover: true
   * useServerTime: true
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
#### LogFile Example ####
```javascript
  const { INFO, ERROR, WARN, CRITICAL, DEBUG } = LogFile;
  const logFile = new LogFile({ logLevel: DEBUG });

  logFile.start();

  logFile.log("There was an error", 2);

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

#### LogFile Options ####
```javascript
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

  // log help to the console
  logFile.getHelp();

  // log to info
  logFile.info("This is an info log");

  // log to warn
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

#### LogFile Methods ####

### Configuration Methods
- `setLogStr(format)` - Set the log entry format string
- `setLogDir(path)` - Set the directory for log files
- `setRollover(boolean)` - Enable/disable daily log file rollover
- `setLogLevel(level)` - Set the minimum log level
- `setFileFormat(format)` - Set the log filename format
- `setLogToConsole(bool)` - Enable/disable console output
- `setStartLog(string)` - Set the log file start string
- `setEndLog(string)` - Set the log file end string
- `setUseServerTime(bool)` - Enable/disable server time

### Logging Methods
- `info(message)` - Log an info message
- `warn(message)` - Log a warning message
- `error(message)` - Log an error message
- `critical(message)` - Log a critical message (automatically flushes to disk)
- `debug(message)` - Log a debug message

### Utility Methods
- `getHelp()` - Display help information
- `flushSync()` - Force immediate synchronous write of buffered logs to disk
- `start()` - Initialize the logger and set up shutdown handlers
- `stop()` - Stop the logger, flush remaining logs, and clean up resources

### Forced Shutdown Protection
The logger automatically handles various termination scenarios to ensure logs are not lost:

- Registers handlers for exit, SIGINT, and SIGTERM signals to flush logs
- Automatically logs and flushes uncaught exceptions before termination
- Critical log messages are immediately flushed to disk

# Testing

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

```javascript
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

# License #

Published under the [LGPL-2.1 license](https://github.com/mdaemon-technologies/logfile/blob/main/LICENSE "LGPL-2.1 License").

Published by<br/> 
<b>MDaemon Technologies, Ltd.<br/>
Simple Secure Email</b><br/>
[https://www.mdaemon.com](https://www.mdaemon.com)