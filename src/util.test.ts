/**
 * Unit tests for the helpers in util.ts.
 *
 * These import the source directly rather than going through test-helper's
 * TEST_TARGET switch. formatTimestamps and toError have no public API surface
 * yet — index.ts starts using them in phase 2 — and the rest are pure
 * functions that the bundle inlines unchanged, so there is nothing a
 * build-target switch would additionally cover here. Behaviour that is
 * observable through LogFile is covered against every target in
 * regression.test.ts.
 */
import {
  formatTimestamps,
  getDate,
  getDateTime,
  getTime,
  endWithNewLine,
  replaceMacro,
  sanitizeFileFormat,
  stringifyArgs,
  toError,
} from './util';

const pad = (n: number) => String(n).padStart(2, '0');

describe('formatTimestamps', () => {
  // A UTC instant whose local date differs in most zones, so the two modes are
  // distinguishable. Expectations derive from the same instant, so they hold
  // in any timezone including UTC.
  const instant = new Date(Date.UTC(2030, 3, 12, 2, 30, 45));

  it('should render every part of the instant it is given', () => {
    const { date, time, dateTime } = formatTimestamps(true, instant);

    expect(date).toBe(
      `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}`);
    expect(time).toBe(
      `${pad(instant.getHours())}:${pad(instant.getMinutes())}:${pad(instant.getSeconds())}`);
    // %DATETIME% has always used an unpadded date; changing it would alter
    // every existing consumer's log format.
    expect(dateTime).toBe(
      `${instant.getFullYear()}-${instant.getMonth() + 1}-${instant.getDate()} ${time}`);
  });

  it('should render the same instant in UTC when asked', () => {
    const { date, time, dateTime } = formatTimestamps(false, instant);

    expect(date).toBe('2030-04-12');
    expect(time).toBe('02:30:45');
    expect(dateTime).toBe('2030-4-12 02:30:45');
  });

  it('should agree with the single-part helpers for the same instant', () => {
    // The helpers read the clock themselves, so pin it first.
    jest.useFakeTimers({ doNotFake: ['nextTick'] });
    jest.setSystemTime(instant);
    try {
      for (const useServerTime of [true, false]) {
        const combined = formatTimestamps(useServerTime);
        expect(combined.date).toBe(getDate(useServerTime));
        expect(combined.time).toBe(getTime(useServerTime));
        expect(combined.dateTime).toBe(getDateTime(useServerTime));
      }
    } finally {
      jest.useRealTimers();
    }
  });

  it('should read the clock once, so the parts cannot disagree', () => {
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
      formatTimestamps(true);
    } finally {
      (global as any).Date = RealDate;
    }

    expect(constructed).toBe(1);
  });

  it('should default to server local time', () => {
    expect(formatTimestamps(undefined, instant)).toEqual(formatTimestamps(true, instant));
  });
});

describe('stringifyArgs', () => {
  it('should always return a string', () => {
    for (const value of [null, undefined, 0, false, '', NaN, Symbol('s'), 1n]) {
      expect(typeof stringifyArgs(value)).toBe('string');
    }
  });

  it('should name nullish values instead of erasing them', () => {
    expect(stringifyArgs(null)).toBe('null');
    expect(stringifyArgs(undefined)).toBe('undefined');
    // The defect this guards: joining erased them entirely.
    expect(['a', null, 'b'].map(stringifyArgs).join(' ')).toBe('a null b');
  });

  it('should render primitives as themselves', () => {
    expect(stringifyArgs('plain')).toBe('plain');
    expect(stringifyArgs(42)).toBe('42');
    expect(stringifyArgs(false)).toBe('false');
    expect(stringifyArgs(Symbol('secret'))).toBe('Symbol(secret)');
  });

  it('should prefer a stack trace for errors', () => {
    const error = new Error('boom');
    expect(stringifyArgs(error)).toBe(error.stack);
  });

  it('should fall back to name and message when an error has no stack', () => {
    const error = new Error('no stack here');
    error.stack = undefined;
    expect(stringifyArgs(error)).toBe('Error: no stack here');
  });

  it('should serialize objects, including ones with no prototype', () => {
    expect(stringifyArgs({ field: 'value' })).toBe('{"field":"value"}');

    // Object.create(null) has no toString, so an implicit conversion later
    // would throw "Cannot convert object to primitive value".
    const bare = Object.create(null);
    bare.field = 'value';
    expect(stringifyArgs(bare)).toBe('{"field":"value"}');
  });

  it('should not throw on values JSON cannot represent', () => {
    expect(stringifyArgs(() => 'fn')).toBe('[object Function]');
    expect(stringifyArgs({ big: 10n })).toBe('{"big":"10n"}');
    expect(stringifyArgs({ get boom() { throw new Error('getter'); } })).toBe('[Unserializable]');
  });

  it('should report a genuine cycle without recursing forever', () => {
    const cyclic: any = { name: 'root' };
    cyclic.self = cyclic;
    expect(stringifyArgs(cyclic)).toBe('{"name":"root","self":"[Circular]"}');
  });

  it('should keep a value that merely appears more than once', () => {
    const shared = { v: 1 };
    expect(stringifyArgs({ a: shared, b: shared })).toBe('{"a":{"v":1},"b":{"v":1}}');
    expect(stringifyArgs([shared, shared, shared])).toBe('[{"v":1},{"v":1},{"v":1}]');
    // Siblings deeper in the graph, where the walk unwinds more than one level.
    expect(stringifyArgs({ outer: { inner: shared }, other: shared }))
      .toBe('{"outer":{"inner":{"v":1}},"other":{"v":1}}');
  });

  it('should report a cycle back to an ancestor rather than a sibling', () => {
    const branch: any = { id: 'branch' };
    const root: any = { first: branch, second: branch };
    branch.up = root;

    // `second` is a repeat, not a cycle; `up` closes a real loop.
    expect(stringifyArgs(root))
      .toBe('{"first":{"id":"branch","up":"[Circular]"},"second":{"id":"branch","up":"[Circular]"}}');
  });
});

describe('sanitizeFileFormat', () => {
  const DEFAULT = 'log-%DATE%.log';

  it('should leave an ordinary format untouched', () => {
    expect(sanitizeFileFormat(DEFAULT)).toBe(DEFAULT);
    expect(sanitizeFileFormat('%DATE%-app.log')).toBe('%DATE%-app.log');
    expect(sanitizeFileFormat('.hidden')).toBe('.hidden');
  });

  it('should reduce a path to a single component', () => {
    expect(sanitizeFileFormat('../../etc/passwd')).toBe('..-..-etc-passwd');
    expect(sanitizeFileFormat('logs\\app.log')).toBe('logs-app.log');
    expect(sanitizeFileFormat('app\x00.log')).toBe('app-.log');
  });

  it('should replace characters that are illegal or destructive in a file name', () => {
    // ":" would open an NTFS alternate data stream instead of a file.
    expect(sanitizeFileFormat('app.log:hidden')).toBe('app.log-hidden');
    expect(sanitizeFileFormat('a<b>c|d?e*f"g.log')).toBe('a-b-c-d-e-f-g.log');
  });

  it('should fall back when the format names the directory rather than a file', () => {
    for (const format of ['', '   ', '.', '..', ' . ', ' .. ', '...']) {
      expect(sanitizeFileFormat(format)).toBe(DEFAULT);
    }
  });

  it('should keep a bare separator as an ordinary name', () => {
    // "-" is a usable file name, so there is nothing to fall back from. This
    // is also the behaviour before reserved-name handling was added, and
    // unified.test.ts pins it via `expect(getFileFormat()).not.toBe("")`.
    expect(sanitizeFileFormat('/')).toBe('-');
    expect(sanitizeFileFormat('\\')).toBe('-');
  });

  it('should fall back for Windows device names, with or without an extension', () => {
    for (const format of ['CON', 'con', 'NUL', 'nul.log', 'PRN', 'AUX', 'COM1', 'LPT9', 'Com1.txt']) {
      expect(sanitizeFileFormat(format)).toBe(DEFAULT);
    }
  });

  it('should match a device name against the first dot, as Windows does', () => {
    // "CON.a.log" addresses the console device; only the part before the FIRST
    // dot is the device name, so testing the last dot would miss this.
    expect(sanitizeFileFormat('CON.a.log')).toBe(DEFAULT);
    expect(sanitizeFileFormat('nul.%DATE%.log')).toBe(DEFAULT);
  });

  it('should not mistake an ordinary name for a device name', () => {
    for (const format of ['CONSOLE.log', 'console', 'NULL.log', 'COM.log', 'COM10.log', 'my-CON.log']) {
      expect(sanitizeFileFormat(format)).toBe(format);
    }
  });

  it('should drop trailing dots and spaces, which Windows ignores when opening', () => {
    expect(sanitizeFileFormat('app.log.')).toBe('app.log');
    expect(sanitizeFileFormat('app.log   ')).toBe('app.log');
    expect(sanitizeFileFormat('  app.log  ')).toBe('app.log');
  });
});

describe('toError', () => {
  it('should pass an Error through unchanged', () => {
    const error = new TypeError('original');
    expect(toError(error)).toBe(error);
  });

  it('should describe a non-Error throw', () => {
    expect(toError('a string').message).toBe('a string');
    expect(toError(404).message).toBe('404');
    expect(toError(null).message).toBe('null');
    expect(toError(undefined).message).toBe('undefined');
  });

  it('should not itself throw on a value with no primitive conversion', () => {
    // String() on this throws "Cannot convert object to primitive value";
    // reporting a failure must not fail.
    const bare = Object.create(null);
    expect(() => toError(bare)).not.toThrow();
    expect(toError(bare).message).toBe('[Unstringifiable thrown value]');
  });

  it('should always produce something reportable', () => {
    for (const value of [Symbol('s'), {}, [], () => 0, 0n]) {
      expect(toError(value)).toBeInstanceOf(Error);
      expect(typeof toError(value).message).toBe('string');
    }
  });
});

describe('replaceMacro', () => {
  it('should replace every occurrence', () => {
    expect(replaceMacro('%A%-%A%', '%A%', 'x')).toBe('x-x');
  });

  it('should insert replacement patterns literally', () => {
    // String.replace would interpret these; split/join must not.
    for (const value of ['$&', '$`', "$'", '$$', '$1']) {
      expect(replaceMacro('[%M%]', '%M%', value)).toBe(`[${value}]`);
    }
  });
});

describe('endWithNewLine', () => {
  it('should add a newline only when one is missing', () => {
    expect(endWithNewLine('a')).toBe('a\n');
    expect(endWithNewLine('a\n')).toBe('a\n');
    expect(endWithNewLine('')).toBe('\n');
  });
});
