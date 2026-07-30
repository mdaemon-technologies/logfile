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
      // Mock necessary functions for testing TypeScript source directly
      if (!global.__TEST_HELPER_SETUP__) {
        // Only setup once to avoid redefinition errors
        global.__TEST_HELPER_SETUP__ = true;
        
        // Mock fs functions if they're not being imported correctly
        global.existsSync = fs.existsSync;
        global.writeFileSync = fs.writeFileSync;
        global.appendFileSync = fs.appendFileSync;
        global.mkdirSync = fs.mkdirSync;
        
        // Mock utility functions
        global.getDate = getDate;
        global.getTime = getTime;
        global.getDateTime = getDateTime;
        global.endWithNewLine = endWithNewLine;
        global.stringifyArgs = stringifyArgs;
      }
      
      // Test the TypeScript source directly
      const sourceModule = await import('./index');
      return sourceModule.default;
    
    case 'compiled-cjs':
    default:
      // Test the CommonJS build (default)
      return require('../dist/logfile.cjs');
  }
}

// Add type definition for the global namespace
declare global {
  var __TEST_HELPER_SETUP__: boolean;
  var existsSync: typeof fs.existsSync;
  var writeFileSync: typeof fs.writeFileSync;
  var appendFileSync: typeof fs.appendFileSync;
  var mkdirSync: typeof fs.mkdirSync;
  var getDate: (arg?: any) => string;
  var getTime: (arg?: any) => string;
  var getDateTime: (arg?: any) => string;
  var endWithNewLine: (str: string) => string;
  var stringifyArgs: (arg: any) => string | undefined;
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