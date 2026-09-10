/**
 * Regression tests for confirmed defects.
 *
 * Every test in this file asserts the CORRECT behaviour, not the current one.
 * Tests for defects that are still open are marked `it.failing`, which passes
 * while the body fails and, crucially, FAILS once the body starts passing. So
 * landing a fix turns its test red until the `.failing` marker is removed,
 * which is what stops a fix from shipping without its regression test being
 * armed.
 *
 * When you fix a defect: drop `.failing` from its test and confirm it is green.
 *
 * Directories used here are unique to this file. Jest runs test files in
 * parallel workers, so sharing ./logs with unified.test.ts would race against
 * that suite's afterEach cleanup.
 */
import { getLogFile, fs } from './test-helper';

/**
 * Fails a single appendFileSync call so error paths that only trigger on a
 * partial write can be reached. Held on globalThis because a jest.mock factory
 * is hoisted above module-scope declarations and may not close over them.
 */
declare global {
  // eslint-disable-next-line no-var
  var __failAppend: ((path: string, data: string) => boolean) | null;
}
globalThis.__failAppend = null;

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    appendFileSync: (path: any, data: any, ...rest: any[]) => {
      if (globalThis.__failAppend && globalThis.__failAppend(String(path), String(data))) {
        const error: NodeJS.ErrnoException = new Error(`EPERM: operation not permitted, open '${path}'`);
        error.code = 'EPERM';
        throw error;
      }
      return actual.appendFileSync(path, data, ...rest);
    },
  };
});

let LogFile: any;

beforeAll(async () => {
  LogFile = await getLogFile();
});

const DIRS = new Set<string>();
const LOGGERS = new Set<any>();

/** Registers a scratch directory so it is removed even when a test fails. */
const scratch = (name: string): string => {
  const dir = `./regression-${name}`;
  DIRS.add(dir);
  return dir;
};

/**
 * Builds a logger that is always stopped during teardown.
 *
 * A test asserting an open defect fails before its own stop() call, and a
 * running logger holds two intervals that keep the Jest worker alive. Tests
 * that are about shutdown still call stop() themselves; stop() is idempotent.
 */
const newLogger = (options: Record<string, unknown>): any => {
  const logger = new LogFile({ logLevel: LogFile.DEBUG, ...options });
  LOGGERS.add(logger);
  return logger;
};

const readAll = (dir: string): string =>
  fs.readdirSync(dir).map((f: string) => fs.readFileSync(`${dir}/${f}`, 'utf8')).join('');

const sizesIn = (dir: string): Record<string, number> => {
  const sizes: Record<string, number> = {};
  for (const f of fs.readdirSync(dir)) sizes[f] = fs.statSync(`${dir}/${f}`).size;
  return sizes;
};

const basename = (p: string): string => p.split('/').pop() as string;

afterEach(() => {
  globalThis.__failAppend = null;
  for (const logger of LOGGERS) {
    try { logger.stop(); } catch { /* teardown must not mask the real failure */ }
  }
  LOGGERS.clear();
  jest.useRealTimers();
  for (const dir of DIRS) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
  DIRS.clear();
});

describe('B1 setFileFormat on a running logger', () => {
  it('should retarget the current file when the format changes', () => {
    const dir = scratch('b1');
    const logger = newLogger({ dir });
    logger.start();

    logger.setFileFormat('other-%DATE%.log');

    // getFileFormat() reports the new value, so file() must agree. It used to
    // keep returning the old name until the date next changed.
    expect(logger.getFileFormat()).toBe('other-%DATE%.log');
    expect(basename(logger.file())).toMatch(/^other-\d{4}-\d{2}-\d{2}\.log$/);

    logger.stop();
  });

  it('should write entries logged after the change to the new file', () => {
    const dir = scratch('b1b');
    const logger = newLogger({ dir });
    logger.start();

    logger.setFileFormat('renamed-%DATE%.log');
    logger.info('after the format change');
    logger.flushSync();
    logger.stop();

    const renamed = fs.readdirSync(dir).filter((f: string) => f.startsWith('renamed-'));
    expect(renamed.length).toBe(1);
    expect(fs.readFileSync(`${dir}/${renamed[0]}`, 'utf8')).toContain('after the format change');
  });
});

describe('B2 setLogDir input validation', () => {
  it('should fall back to the default when given an empty directory', () => {
    const dir = scratch('b2');
    const logger = newLogger({ dir });
    logger.start();

    logger.setLogDir('');

    // The setter applies the same guard as the constructor. Without it, an
    // empty string left the logger writing to the filesystem root.
    expect(logger.getLogDir()).toBe('./logs');
    expect(logger.file().startsWith('/')).toBe(false);

    logger.setLogDir(dir);
    logger.stop();
  });
});

describe('B3 nullish arguments', () => {
  it('should render null and undefined instead of dropping them', () => {
    const dir = scratch('b3');
    const logger = newLogger({ dir });
    logger.start();

    logger.info('a', null, 'b');
    logger.info('c', undefined, 'd');
    logger.flushSync();
    logger.stop();

    // Entries are joined with Array.join, which renders nullish values as "".
    // Before stringifyArgs coerced them, these collapsed to "a  b" and the
    // argument vanished from the log.
    const content = readAll(dir);
    expect(content).toContain('a null b');
    expect(content).toContain('c undefined d');
  });
});

describe('B4 serialization of filtered messages', () => {
  it('should not serialize arguments below the configured level', () => {
    const dir = scratch('b4');
    const logger = newLogger({ dir, logLevel: LogFile.ERROR });
    logger.start();

    let reads = 0;
    const expensive = { get payload() { reads++; return 'x'; } };

    logger.debug(expensive);
    logger.info(expensive);
    logger.warning(expensive);

    expect(reads).toBe(0);

    logger.stop();
  });

  it('should still serialize arguments at or above the configured level', () => {
    const dir = scratch('b4b');
    const logger = newLogger({ dir, logLevel: LogFile.ERROR });
    logger.start();

    let reads = 0;
    const expensive = { get payload() { reads++; return 'x'; } };

    logger.error(expensive);
    logger.flushSync();

    expect(reads).toBeGreaterThan(0);
    expect(readAll(dir)).toContain('"payload":"x"');

    logger.stop();
  });
});

describe('B5 size rollover failure handling', () => {
  it('should advance to a new file when the end banner cannot be written', () => {
    const dir = scratch('b5');
    const logger = newLogger({ dir, maxFileSize: 300 });
    logger.start();
    const wedged = logger.file();

    // Fail only the end banner: the entry append succeeds, so the size check
    // runs and then cannot close the oversized file.
    globalThis.__failAppend = (_path, data) => data.includes('Log Ended');

    for (let i = 0; i < 10; i++) logger.info('padding entry to exceed the size limit');
    logger.flushSync();

    // The rotation advances even when the end banner cannot be written.
    // Leaving the state behind meant every later flush retried the identical
    // failing append against a file already over the limit.
    expect(fs.statSync(wedged).size).toBeGreaterThanOrEqual(300);
    expect(logger.file()).not.toBe(wedged);

    globalThis.__failAppend = null;
    logger.stop();
  });

  it('precondition: the flush leaves the file over the size limit', () => {
    const dir = scratch('b5pre');
    const logger = newLogger({ dir, maxFileSize: 300 });
    logger.start();
    const target = logger.file();

    globalThis.__failAppend = (_path, data) => data.includes('Log Ended');
    for (let i = 0; i < 10; i++) logger.info('padding entry to exceed the size limit');
    logger.flushSync();
    globalThis.__failAppend = null;

    // The `it.failing` test above asserts this too, where a failure would be
    // silently swallowed. Verified here so a broken setup cannot hide.
    expect(fs.statSync(target).size).toBeGreaterThanOrEqual(300);
  });

  it('should keep the entries that were already written before the failure', () => {
    const dir = scratch('b5b');
    const logger = newLogger({ dir, maxFileSize: 300 });
    logger.start();

    globalThis.__failAppend = (_path, data) => data.includes('Log Ended');

    for (let i = 0; i < 10; i++) logger.info(`entry ${i} padding padding padding`);
    logger.flushSync();

    globalThis.__failAppend = null;
    logger.stop();

    expect(readAll(dir)).toContain('entry 9');
  });
});

describe('B6 restart onto an oversized file', () => {
  it('should not open a file that is already over the size limit', () => {
    const dir = scratch('b6');
    const maxFileSize = 300;

    const first = newLogger({ dir, maxFileSize });
    first.start();
    for (let i = 0; i < 40; i++) first.info('y'.repeat(60));
    first.flushSync();
    first.stop();

    const before = sizesIn(dir);
    expect(Math.max(...Object.values(before))).toBeGreaterThan(maxFileSize);

    const second = newLogger({ dir, maxFileSize });
    second.start();

    // fileSuffix resets to 0 on a restart, so without a size check on open
    // the logger reopened the largest file from the previous run.
    const opened = before[basename(second.file())] ?? 0;
    expect(opened).toBeLessThan(maxFileSize);

    second.stop();
  });

  it('precondition: the first run leaves a file over the size limit behind', () => {
    const dir = scratch('b6pre');
    const maxFileSize = 300;

    const first = newLogger({ dir, maxFileSize });
    first.start();
    for (let i = 0; i < 40; i++) first.info('y'.repeat(60));
    first.flushSync();
    first.stop();

    // Same reasoning as B5's precondition: asserted inside `it.failing` above,
    // so it needs an independent check that actually reports.
    expect(Math.max(...Object.values(sizesIn(dir)))).toBeGreaterThan(maxFileSize);
  });
});

describe('B7 process handlers across multiple loggers', () => {
  const signals = ['SIGINT', 'SIGTERM', 'uncaughtException'] as const;

  it('should install one handler per signal no matter how many loggers opt in', () => {
    const dir = scratch('b7');
    const before = Object.fromEntries(signals.map(s => [s, process.listenerCount(s)]));

    const loggers = [0, 1, 2].map(n => {
      const logger = newLogger({ dir: `${dir}/${n}`, registerProcessHandlers: true });
      logger.start();
      return logger;
    });

    try {
      // The handlers are shared. Per-instance ones each called process.exit,
      // so the first to run ended the process and the rest never flushed.
      for (const signal of signals) {
        expect(process.listenerCount(signal) - before[signal]).toBe(1);
      }
    } finally {
      loggers.forEach(l => l.stop());
    }
  });

  it('should remove its handlers on stop', () => {
    const dir = scratch('b7b');
    const before = process.listenerCount('SIGINT');

    const logger = newLogger({ dir, registerProcessHandlers: true });
    logger.start();
    expect(process.listenerCount('SIGINT')).toBeGreaterThan(before);

    logger.stop();
    expect(process.listenerCount('SIGINT')).toBe(before);
  });
});

describe('B9 timestamp sourcing', () => {
  it('should build one entry from a single clock reading', () => {
    const dir = scratch('b9');
    const logger = newLogger({ dir });
    logger.start();
    logger.flushSync();

    const RealDate = global.Date;
    let constructed = 0;
    class CountingDate extends RealDate {
      constructor(...args: any[]) {
        super(...(args as []));
        constructed++;
      }
    }
    (global as any).Date = CountingDate;
    try {
      logger.info('one entry');
    } finally {
      (global as any).Date = RealDate;
    }

    // log() takes one reading and uses it for every macro AND for the
    // rollover decision. It previously took five: rollOver()'s today(),
    // getDateTime()'s two, then getDate() and getTime(). An entry spanning a
    // second or midnight boundary could disagree with itself, and the
    // rollover could file an entry under a date it did not carry.
    expect(constructed).toBeLessThanOrEqual(1);

    logger.flushSync();
    logger.stop();
  });
});

describe('B10 file paths before start and after stop', () => {
  it('should report no current file before start', () => {
    const dir = scratch('b10');
    const logger = newLogger({ dir });

    // These used to return "<dir>/", so existsSync(logger.file()) answered
    // true about the directory rather than about a log file.
    expect(logger.file()).toBe('');
    expect(logger.lastFile()).toBe('');
  });

  it('should report no current file after stop', () => {
    const dir = scratch('b10b');
    const logger = newLogger({ dir });
    logger.start();
    logger.stop();

    expect(logger.file()).toBe('');
  });
});

describe('B11 size rollover naming when date rollover is disabled', () => {
  it('should name suffixed files after the date the file was opened', () => {
    const dir = scratch('b11');
    jest.useFakeTimers({ doNotFake: ['nextTick'] });
    jest.setSystemTime(new Date(2030, 3, 1, 12, 0, 0));

    const logger = newLogger({ dir, rollover: false, maxFileSize: 300 });
    logger.start();
    for (let i = 0; i < 20; i++) logger.info('day one padding padding padding');
    logger.flushSync();

    // rollOver() advances this.date even with rollover disabled, while
    // currentFile keeps its original date, so the suffixed name has to come
    // from the file's own date rather than from today.
    jest.setSystemTime(new Date(2030, 3, 2, 12, 0, 0));
    for (let i = 0; i < 20; i++) logger.info('still the same file, rollover is off');
    logger.flushSync();
    logger.stop();

    // Assert on the names, not on a boolean, so a failure names the offender.
    const misdated = fs.readdirSync(dir).filter((f: string) => !f.startsWith('log-2030-04-01'));
    expect(misdated).toEqual([]);
  });
});

describe('B12 file format sanitizing', () => {
  it('should strip characters that are invalid or dangerous in a file name', () => {
    const logger = newLogger({ dir: scratch('b12') });

    // ":" opens an NTFS alternate data stream rather than a file.
    logger.setFileFormat('log-%DATE%.log:hidden');
    expect(logger.getFileFormat()).not.toContain(':');

    logger.setFileFormat('log-%DATE%<>|?*.log');
    expect(logger.getFileFormat()).toMatch(/^[^<>|?*]+$/);
  });

  it('should fall back to the default for reserved device names', () => {
    const logger = newLogger({ dir: scratch('b12b') });

    for (const reserved of ['CON', 'NUL', 'PRN', 'AUX', 'COM1', 'LPT1', 'con.log', 'NUL.txt']) {
      logger.setFileFormat(reserved);
      expect(logger.getFileFormat()).toBe('log-%DATE%.log');
    }
  });

  it('should fall back to the default for a padded directory reference', () => {
    const logger = newLogger({ dir: scratch('b12c') });

    // The "." / ".." comparison runs against the untrimmed string today.
    logger.setFileFormat(' . ');
    expect(logger.getFileFormat()).toBe('log-%DATE%.log');

    logger.setFileFormat(' .. ');
    expect(logger.getFileFormat()).toBe('log-%DATE%.log');
  });

  it('should keep an ordinary format untouched', () => {
    const logger = newLogger({ dir: scratch('b12d') });

    logger.setFileFormat('app-%DATE%.log');
    expect(logger.getFileFormat()).toBe('app-%DATE%.log');
  });
});

describe('B13 serializing shared references', () => {
  it('should not report a repeated reference as circular', () => {
    const dir = scratch('b13');
    const logger = newLogger({ dir });
    logger.start();

    const shared = { v: 1 };
    logger.info({ a: shared, b: shared });
    logger.flushSync();
    logger.stop();

    // safeStringify used to mark every object it visited, so the second
    // reference to the same value was misreported as a cycle.
    const content = readAll(dir);
    expect(content).not.toContain('[Circular]');
    expect(content).toContain('{"a":{"v":1},"b":{"v":1}}');
  });

  it('should still report a genuine cycle as circular', () => {
    const dir = scratch('b13b');
    const logger = newLogger({ dir });
    logger.start();

    const cyclic: any = { name: 'root' };
    cyclic.self = cyclic;
    logger.info(cyclic);
    logger.flushSync();
    logger.stop();

    expect(readAll(dir)).toContain('[Circular]');
  });
});
