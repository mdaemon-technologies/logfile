/**
 * Drives the logger through an injected FileSystem.
 *
 * The point of the port: failure modes that used to need a real disk in an
 * awkward state - a full volume, a revoked permission, a directory deleted
 * mid-run - are now ordinary test setup, and nothing touches the filesystem.
 */
import { getLogFile } from './test-helper';
import type { FileSystem } from './filesystem';

let LogFile: any;

beforeAll(async () => {
  LogFile = await getLogFile();
});

/** An in-memory filesystem, with hooks for making individual calls fail. */
class FakeFileSystem implements FileSystem {
  files = new Map<string, string>();
  dirs = new Set<string>();
  failAppend: ((path: string, data: string) => Error | null) | null = null;

  appendFileSync(path: string, data: string): void {
    const failure = this.failAppend?.(path, data);
    if (failure) throw failure;
    this.files.set(path, (this.files.get(path) ?? '') + data);
  }

  existsSync(path: string): boolean {
    return this.files.has(path) || this.dirs.has(path);
  }

  mkdirSync(path: string): void {
    this.dirs.add(path);
  }

  statSync(path: string): { size: number } {
    const content = this.files.get(path);
    if (content === undefined) {
      const error: NodeJS.ErrnoException = new Error(`ENOENT: no such file, stat '${path}'`);
      error.code = 'ENOENT';
      throw error;
    }
    return { size: Buffer.byteLength(content, 'utf8') };
  }

  /** Everything written, across every file. */
  all(): string {
    return [...this.files.values()].join('');
  }
}

let fake: FakeFileSystem;
let logger: any;

beforeEach(() => {
  fake = new FakeFileSystem();
});

afterEach(() => {
  if (logger) {
    logger.stop();
    logger = null;
  }
});

const build = (options: Record<string, unknown> = {}) =>
  new LogFile({ dir: '/virtual', logLevel: LogFile.DEBUG, fileSystem: fake, ...options });

describe('writing through an injected filesystem', () => {
  it('should never touch the real disk', () => {
    logger = build();
    logger.start();
    logger.info('written to memory');
    logger.flushSync();

    expect(fake.all()).toContain('written to memory');
    expect(fake.dirs.has('/virtual')).toBe(true);
  });

  it('should create the log directory when it is missing', () => {
    logger = build();
    logger.start();

    expect(fake.dirs.has('/virtual')).toBe(true);
  });
});

describe('failures that are awkward to stage on a real disk', () => {
  it('should report a failed write through onError and keep the entries', () => {
    const errors: Error[] = [];
    logger = build({ onError: (error: Error) => errors.push(error) });
    logger.start();

    fake.failAppend = () => {
      const error: NodeJS.ErrnoException = new Error('ENOSPC: no space left on device');
      error.code = 'ENOSPC';
      return error;
    };

    logger.info('lost to a full disk');
    logger.flushSync();

    expect(errors.some(e => e.message.includes('ENOSPC'))).toBe(true);

    // Buffered, not discarded: the entry lands once writing works again.
    fake.failAppend = null;
    logger.flushSync();
    expect(fake.all()).toContain('lost to a full disk');
  });

  it('should discard the oldest entries once the retry backlog is capped', () => {
    const errors: Error[] = [];
    logger = build({ maxBufferEntries: 10, onError: (error: Error) => errors.push(error) });
    logger.start();

    fake.failAppend = () => new Error('EACCES: permission denied');
    for (let i = 0; i < 40; i++) logger.info(`entry ${i}`);
    logger.flushSync();

    expect(logger.getDroppedLogs()).toBeGreaterThan(0);
    expect(errors.some(e => e.message.includes('buffer limit'))).toBe(true);

    // Memory stays bounded rather than growing with every failed retry.
    fake.failAppend = null;
    logger.flushSync();
    expect(fake.all()).toContain('entry 39');
  });

  it('should keep reporting through onError rather than throwing', () => {
    const errors: Error[] = [];
    logger = build({ onError: (error: Error) => errors.push(error) });
    logger.start();

    fake.failAppend = () => new Error('EROFS: read-only file system');

    expect(() => {
      logger.info('one');
      logger.flushSync();
      logger.stop();
    }).not.toThrow();

    expect(errors.length).toBeGreaterThan(0);
    logger = null;
  });

  it('should report a failed start without creating the file anyway', () => {
    const errors: Error[] = [];
    logger = build({ onError: (error: Error) => errors.push(error) });

    // Only the opening banner fails. If the failure path then writes a
    // closing banner, that append succeeds and creates the file.
    fake.failAppend = (_path, data) =>
      data.includes('Log Started') ? new Error('EACCES: permission denied') : null;

    expect(logger.start()).toBe(false);
    expect(errors.length).toBeGreaterThan(0);

    // The failure path must not write a closing banner: that would create the
    // very file that could not be opened.
    expect(fake.files.size).toBe(0);
    logger = null;
  });

  it('should roll over on size without a real file on disk', () => {
    logger = build({ maxFileSize: 400 });
    logger.start();

    for (let i = 0; i < 20; i++) logger.info(`padding entry ${i} with some text`);
    logger.flushSync();

    const names = [...fake.files.keys()];
    expect(names.length).toBeGreaterThan(1);
    expect(names.some(n => /-1\.log$/.test(n))).toBe(true);
  });
});
