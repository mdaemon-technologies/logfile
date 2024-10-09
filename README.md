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

```javascript
  /* default LogFileOptions 
   * logLevel: 0 (INFO)
   * dir: "./logs"
   * fileFormat: "log-%DATE%.log"
   * logToConsole: false
   * rollover: true
   * logStr: "%DATE% %TIME% | %LEVEL% | %MESSAGE%";
   * startLog: "-----------------------------------------\n" +
   *           "------- Log Started: %DATETIME%\n" +
   *           "-----------------------------------------\n";
   *    
   * endLog: "-----------------------------------------\n" +
   *         "------- Log Ended: %DATETIME%\n" +
   *         "-----------------------------------------\n";
  */

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

```
# License #

Published under the [LGPL-2.1 license](https://github.com/mdaemon-technologies/logfile/blob/main/LICENSE "LGPL-2.1 License").

Published by<br/> 
<b>MDaemon Technologies, Ltd.<br/>
Simple Secure Email</b><br/>
[https://www.mdaemon.com](https://www.mdaemon.com)