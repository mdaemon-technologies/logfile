// This file runs before test files to set up the environment
// Specifically handles any special setup needed for ESM testing

// If we're testing ES modules, set up the environment properly
if (process.env.TEST_TARGET === 'compiled-esm') {
  jest.mock('fs', () => {
    return {
      ...jest.requireActual('fs'),
    };
  });
}

// Add helper for handling both CJS pushLogs and ESM flushSync in SIGINT handler tests
global.__getLogMethod = (logFile) => {
  if (process.env.TEST_TARGET === 'source' || process.env.TEST_TARGET === 'compiled-esm') {
    return logFile.flushSync ? 'flushSync' : 'pushLogs';
  } else {
    return 'pushLogs';
  }
};

// Mock exit for all tests to prevent actual process termination
const originalExit = process.exit;
process.exit = jest.fn(code => {
  console.log(`[MOCK] process.exit called with code: ${code}`);
  return code;
});
