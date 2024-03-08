[![Dynamic JSON Badge](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmdaemon-technologies%2Flogfile%2Fmain%2Fpackage.json&query=%24.version&prefix=v&label=npm&color=blue)](https://www.npmjs.com/package/@mdaemon/logfile) [![Static Badge](https://img.shields.io/badge/node-v16%2B-blue?style=flat&label=node&color=blue)](https://nodejs.org) [![install size](https://packagephobia.com/badge?p=@mdaemon/logfile)](https://packagephobia.com/result?p=@mdaemon/logfile) [![Dynamic JSON Badge](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmdaemon-technologies%2Flogfile%2Fmain%2Fpackage.json&query=%24.license&prefix=v&label=license&color=green)](https://github.com/mdaemon-technologies/logfile/blob/main/LICENSE) [![Node.js CI](https://github.com/mdaemon-technologies/logfile/actions/workflows/node.js.yml/badge.svg)](https://github.com/mdaemon-technologies/logfile/actions/workflows/node.js.yml)

# @mdaemon/logfile, A node only async logging utility
 
 Not applicable to a browser context.

# Install #

    $ npm install @mdaemon/logfile --save

# Node CommonJS #
```javascript
    const LogFile = require("@mdaemon/logfile/dist/logfile.cjs");
```

# Node Modlues #
```javascript
    import LogFile from "@mdaemon/logfile/dist/logfile.mjs";
```

### LogFile ###

```javascript
  /* default LogFileOptions 
   * dir: "./logs"
    fileFormat: "log-%DATE%.log"
    logToConsole: false
    rollover: true
    logStr: "%DATE% %TIME% | %LEVEL% | %MESSAGE%";
    startLog: "-----------------------------------------\n" +
              "------- Log Started: %DATETIME%\n" +
              "-----------------------------------------\n";

    endLog: "-----------------------------------------\n" +
            "------- Log Ended: %DATETIME%\n" +
            "-----------------------------------------\n";
  */
  const logFile = new LogFile({});

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
# License #

Published under the [GPL-3.0 license](https://github.com/mdaemon-technologies/logfile/blob/main/LICENSE "GPL-3.0 License").

