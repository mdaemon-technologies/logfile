import { RotatingFileTarget } from './target';
import type { FileSystem } from './filesystem';

class FakeFileSystem implements FileSystem {
  files = new Map<string, string>();
  dirs = new Set<string>();
  failAppend: ((path: string) => Error | null) | null = null;

  appendFileSync(path: string, data: string): void {
    const failure = this.failAppend?.(path);
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
    if (content === undefined) throw new Error(`ENOENT ${path}`);
    return { size: Buffer.byteLength(content, 'utf8') };
  }
  /** Pre-seeds a file, as a previous run would have left it. */
  seed(path: string, size: number): void {
    this.files.set(path, 'x'.repeat(size));
  }
}

let fs: FakeFileSystem;
let reported: Array<{ error: Error, context: string }>;

const build = (overrides: Record<string, unknown> = {}) => {
  fs = fs ?? new FakeFileSystem();
  return new RotatingFileTarget({
    fs,
    dir: '/logs',
    fileFormat: 'log-%DATE%.log',
    maxFileSize: 0,
    banner: (kind: 'start' | 'end') => `[${kind}]\n`,
    onError: (error: Error, context: string) => reported.push({ error, context }),
    ...overrides,
  });
};

beforeEach(() => {
  fs = new FakeFileSystem();
  reported = [];
});

describe('naming', () => {
  it('should substitute the date into the format', () => {
    const target = build();
    target.open('2031-05-06');
    expect(target.path()).toBe('/logs/log-2031-05-06.log');
  });

  it('should report no path before it is opened', () => {
    expect(build().path()).toBe('');
    expect(build().previousPath()).toBe('');
  });

  it('should insert the suffix before the extension', () => {
    const target = build({ maxFileSize: 50 });
    target.open('2031-05-06');
    target.write('x'.repeat(100));
    target.rollIfOversized();
    expect(target.path()).toBe('/logs/log-2031-05-06-1.log');
  });

  it('should append the suffix when the format has no extension', () => {
    const target = build({ fileFormat: 'applog', maxFileSize: 50 });
    target.open('2031-05-06');
    target.write('x'.repeat(100));
    target.rollIfOversized();
    expect(target.path()).toBe('/logs/applog-1');
  });
});

describe('opening', () => {
  it('should create the directory and write a start banner', () => {
    const target = build();
    target.open('2031-05-06');

    expect(fs.dirs.has('/logs')).toBe(true);
    expect(fs.files.get('/logs/log-2031-05-06.log')).toBe('[start]\n');
  });

  it('should append to an existing file rather than truncating it', () => {
    fs.seed('/logs/log-2031-05-06.log', 0);
    fs.files.set('/logs/log-2031-05-06.log', 'from an earlier run\n');

    build().open('2031-05-06');

    expect(fs.files.get('/logs/log-2031-05-06.log')).toContain('from an earlier run');
  });

  it('should skip past a file left oversized by an earlier run', () => {
    fs.seed('/logs/log-2031-05-06.log', 500);
    fs.seed('/logs/log-2031-05-06-1.log', 500);

    const target = build({ maxFileSize: 100 });
    target.open('2031-05-06');

    expect(target.path()).toBe('/logs/log-2031-05-06-2.log');
  });
});

describe('date rollover', () => {
  it('should close the old file and open the new day', () => {
    const target = build();
    target.open('2031-05-06');
    target.rollToDate('2031-05-07');

    expect(fs.files.get('/logs/log-2031-05-06.log')).toContain('[end]');
    expect(target.path()).toBe('/logs/log-2031-05-07.log');
    expect(target.previousPath()).toBe('/logs/log-2031-05-06.log');
  });

  it('should reset the suffix for the new day', () => {
    const target = build({ maxFileSize: 60 });
    target.open('2031-05-06');
    target.write('x'.repeat(100));
    target.rollIfOversized();
    expect(target.path()).toContain('-1.log');

    target.rollToDate('2031-05-07');
    expect(target.path()).toBe('/logs/log-2031-05-07.log');
  });
});

describe('size rollover', () => {
  it('should do nothing while the file is under the limit', () => {
    const target = build({ maxFileSize: 10000 });
    target.open('2031-05-06');
    const before = target.path();

    target.rollIfOversized();

    expect(target.path()).toBe(before);
  });

  it('should do nothing when the limit is disabled', () => {
    const target = build({ maxFileSize: 0 });
    target.open('2031-05-06');
    target.write('x'.repeat(5000));
    const before = target.path();

    target.rollIfOversized();

    expect(target.path()).toBe(before);
  });

  it('should name the new file after the day the old one belongs to', () => {
    // The calendar date can move on without the file rolling over, when date
    // rollover is disabled. The suffixed name must follow the file, not today.
    const target = build({ maxFileSize: 50 });
    target.open('2031-05-06');
    target.write('x'.repeat(100));
    target.rollIfOversized();

    expect(target.path()).toBe('/logs/log-2031-05-06-1.log');
  });
});

describe('failure handling', () => {
  it('should advance even when the end banner cannot be written', () => {
    const target = build({ maxFileSize: 50 });
    target.open('2031-05-06');
    target.write('x'.repeat(100));

    fs.failAppend = (path) => path.endsWith('log-2031-05-06.log')
      ? new Error('EPERM')
      : null;

    target.rollIfOversized();

    // Staying put would retry the same failing append on every later flush.
    expect(target.path()).toBe('/logs/log-2031-05-06-1.log');
    expect(reported.some(r => r.error.message === 'EPERM')).toBe(true);
  });

  it('should report through onError rather than throwing', () => {
    const target = build();
    fs.failAppend = () => new Error('EROFS');

    expect(() => target.open('2031-05-06')).not.toThrow();
    expect(reported.length).toBeGreaterThan(0);
  });

  it('should let a write failure reach the caller', () => {
    // Entry writes are different: the buffer has to know they failed so it
    // can put the entries back.
    const target = build();
    target.open('2031-05-06');
    fs.failAppend = () => new Error('ENOSPC');

    expect(() => target.write('an entry\n')).toThrow('ENOSPC');
  });
});

describe('closing', () => {
  it('should write an end banner and forget the file', () => {
    const target = build();
    target.open('2031-05-06');
    target.close();

    expect(fs.files.get('/logs/log-2031-05-06.log')).toContain('[end]');
    expect(target.path()).toBe('');
  });

  it('should be safe to close when nothing is open', () => {
    const target = build();
    expect(() => target.close()).not.toThrow();
    expect(reported).toEqual([]);
  });
});

describe('reconfiguring', () => {
  it('should move to a new directory', () => {
    const target = build();
    target.open('2031-05-06');
    target.setDir('/other');

    expect(target.path()).toBe('/other/log-2031-05-06.log');
  });

  it('should switch files when the format changes while open', () => {
    const target = build();
    target.open('2031-05-06');
    target.setFormat('app-%DATE%.log', '2031-05-06');

    expect(target.path()).toBe('/logs/app-2031-05-06.log');
    expect(fs.files.get('/logs/log-2031-05-06.log')).toContain('[end]');
  });

  it('should not switch files when the format is unchanged', () => {
    const target = build();
    target.open('2031-05-06');
    const banners = (fs.files.get('/logs/log-2031-05-06.log') ?? '').split('[end]').length;

    target.setFormat('log-%DATE%.log', '2031-05-06');

    expect((fs.files.get('/logs/log-2031-05-06.log') ?? '').split('[end]').length).toBe(banners);
  });
});
