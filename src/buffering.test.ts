/**
 * Tests for when the buffer decides to flush.
 *
 * Three separate limits govern this and none of them had a test: the entry
 * count, the byte size, and the idle timeout. Fake timers freeze the clock so
 * the timeout cannot fire and mask the limit actually under test.
 */
import { getLogFile, fs } from './test-helper';

let LogFile: any;

beforeAll(async () => {
  LogFile = await getLogFile();
});

const DIR = './buffering-logs';

/** Everything on disk in the log directory, without flushing first. */
const onDisk = (): string => {
  if (!fs.existsSync(DIR)) return '';
  return fs.readdirSync(DIR)
    .map((f: string) => fs.readFileSync(`${DIR}/${f}`, 'utf8'))
    .join('');
};

let logger: any;

beforeEach(() => {
  // Freeze the clock before construction: the logger records the flush time
  // when it is built, and an unfrozen clock would let the idle timeout fire.
  jest.useFakeTimers({ doNotFake: ['nextTick'] });
  jest.setSystemTime(new Date(2031, 0, 15, 9, 0, 0));
});

afterEach(() => {
  if (logger) {
    logger.stop();
    logger = null;
  }
  jest.useRealTimers();
  if (fs.existsSync(DIR)) fs.rmSync(DIR, { recursive: true, force: true });
});

describe('byte-size threshold', () => {
  it('should flush on bytes written, not on UTF-16 code units', () => {
    logger = new LogFile({ dir: DIR, logLevel: LogFile.DEBUG, logStr: '%MESSAGE%' });
    logger.start();

    // A two-byte character written as an escape, so the source stays ASCII
    // and cannot be normalised into a different encoding by an editor.
    const payload = "\u00e9".repeat(4400);

    // 8800 UTF-16 code units across the two entries, but 17600 bytes on
    // disk. Counting code units leaves this under the 16 KB limit, so
    // nothing is written until something else forces a flush.
    expect(payload.length * 2).toBeLessThan(16384);
    expect(Buffer.byteLength(payload, "utf8") * 2).toBeGreaterThan(16384);

    logger.info(payload);
    logger.info(payload);

    expect(onDisk()).toContain(payload);
  });

  it('should not flush while the buffered bytes stay under the limit', () => {
    logger = new LogFile({ dir: DIR, logLevel: LogFile.DEBUG, logStr: '%MESSAGE%' });
    logger.start();

    const payload = 'a'.repeat(100);
    logger.info(payload);

    // Well under every limit, and the clock has not moved.
    expect(onDisk()).not.toContain(payload);
  });
});

describe('entry-count threshold', () => {
  it('should flush once enough entries are buffered', () => {
    logger = new LogFile({ dir: DIR, logLevel: LogFile.DEBUG, logStr: '%MESSAGE%' });
    logger.start();

    // Short entries, so the byte limit is nowhere near reached: 1000 entries
    // of 5 characters is 6 KB against a 16 KB byte limit.
    for (let i = 0; i < 999; i++) logger.info('xxxxx');
    expect(onDisk()).not.toContain('xxxxx');

    logger.info('xxxxx');
    expect(onDisk()).toContain('xxxxx');
  });
});

describe('idle timeout threshold', () => {
  it('should flush an entry logged after a quiet period', () => {
    logger = new LogFile({ dir: DIR, logLevel: LogFile.DEBUG, logStr: '%MESSAGE%' });
    logger.start();

    logger.info('first');
    expect(onDisk()).not.toContain('first');

    // Past the buffer timeout, so the next entry flushes immediately rather
    // than waiting for the interval.
    jest.setSystemTime(new Date(2031, 0, 15, 9, 0, 5));
    logger.info('second');

    expect(onDisk()).toContain('first');
    expect(onDisk()).toContain('second');
  });
});
