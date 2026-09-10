import * as fs from 'fs';
import { getDate, getTime, getDateTime, endWithNewLine, stringifyArgs } from './util';

// Re-export utility functions used by the source index.ts that wouldn't be
// available in tests. These are the real implementations rather than copies:
// duplicating them let the copies drift from the code under test.
export { getDate, getTime, getDateTime, endWithNewLine, stringifyArgs };

// Function to dynamically load the appropriate module based on environment variable
async function getLogFileModule() {
  const testTarget = process.env.TEST_TARGET || 'compiled-cjs';

  switch (testTarget) {
    case 'source':
      // Test the TypeScript source directly.
      //
      // This used to assign fs and utility functions onto globalThis, as a
      // workaround for the logger reaching straight for the fs module. Nothing
      // ever read those globals, and the logger now takes a FileSystem through
      // its `fileSystem` option, so a test that wants to control I/O injects
      // one instead of patching the environment.
      const sourceModule = await import('./index');
      return sourceModule.default;

    case 'compiled-cjs':
    default:
      // Test the CommonJS build (default)
      return require('../dist/logfile.cjs');
  }
}

// Cache the LogFile class
let LogFileClass: any = null;

// Export functions to access the LogFile class
export async function getLogFile() {
  if (!LogFileClass) {
    LogFileClass = await getLogFileModule();
  }
  return LogFileClass;
}

export { fs };
