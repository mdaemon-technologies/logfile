/**
 * Tests that the documented surface stays in sync with the code.
 *
 * The log levels and the constructor options were each written out in several
 * places - the enum, the level map, the static constants, the help text, the
 * interface docs and the README - and had already drifted apart. These tests
 * make the copies verify each other, so a level or option added in one place
 * and forgotten in another fails the build.
 */
import { getLogFile, fs } from './test-helper';

let LogFile: any;

beforeAll(async () => {
  LogFile = await getLogFile();
});

/** The help text, captured from the return value rather than the console. */
const help = (): string => {
  const logger = new LogFile({ dir: './contract-logs' });
  const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
  try {
    return String(logger.getHelp());
  } finally {
    spy.mockRestore();
  }
};

/** Option names listed in the README's Constructor Options section. */
const readmeOptions = (): string[] => {
  const readme = fs.readFileSync('./README.md', 'utf8');
  const section = readme.split('### Constructor Options')[1].split('\n###')[0];
  return [...section.matchAll(/^- `([A-Za-z]+)`/gm)].map(m => m[1]);
};

/** Option names listed in the help text. */
const helpOptions = (): string[] =>
  [...help().matchAll(/^ {6}([A-Za-z]+) \(/gm)].map(m => m[1]);

/** Level names listed in the help text, e.g. "0: Debug". */
const helpLevels = (): string[] =>
  [...help().matchAll(/^ {6}\d+: ([A-Za-z]+)$/gm)].map(m => m[1]);

afterEach(() => {
  if (fs.existsSync('./contract-logs')) {
    fs.rmSync('./contract-logs', { recursive: true, force: true });
  }
});

describe('getHelp', () => {
  it('should return the help text, not just print it', () => {
    const logger = new LogFile({ dir: './contract-logs' });
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      // Deliberately not String()-wrapped: that would turn a void return into
      // the truthy string "undefined" and the test would pass regardless.
      const returned = logger.getHelp();
      expect(typeof returned).toBe('string');
      expect(returned).toContain('Log Levels');
    } finally {
      spy.mockRestore();
    }
  });

  it('should still print, so existing callers keep working', () => {
    const logger = new LogFile({ dir: './contract-logs' });
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const returned = String(logger.getHelp());
      expect(spy).toHaveBeenCalledTimes(1);
      expect(String(spy.mock.calls[0][0])).toBe(returned);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('log levels have one source', () => {
  const NAMES = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'];

  it('should expose a static constant for every level', () => {
    NAMES.forEach((name, value) => {
      expect(LogFile[name]).toBe(value);
    });
  });

  it('should list every level in the help text', () => {
    // Help renders them capitalised: "0: Debug".
    expect(helpLevels().map(l => l.toUpperCase())).toEqual(NAMES);
  });

  it('should write every level name into the log entry', () => {
    const dir = './contract-logs';
    const logger = new LogFile({ dir, logLevel: LogFile.DEBUG, logStr: '%LEVEL%|%MESSAGE%' });
    logger.start();
    NAMES.forEach((name, value) => logger.log(`entry ${name}`, value));
    logger.flushSync();
    logger.stop();

    const content = fs.readdirSync(dir)
      .map((f: string) => fs.readFileSync(`${dir}/${f}`, 'utf8')).join('');
    NAMES.forEach(name => expect(content).toContain(`${name}|entry ${name}`));
  });

  it('should render an unknown level rather than throwing', () => {
    const dir = './contract-logs';
    const logger = new LogFile({ dir, logLevel: LogFile.DEBUG, logStr: '%LEVEL%|%MESSAGE%' });
    logger.start();
    logger.log('odd', 99);
    logger.flushSync();
    logger.stop();

    const content = fs.readdirSync(dir)
      .map((f: string) => fs.readFileSync(`${dir}/${f}`, 'utf8')).join('');
    expect(content).toContain('UNKNOWN|odd');
  });
});

describe('constructor options have one source', () => {
  it('should document the same options in the help text and the README', () => {
    // Neither list is the source; both are rendered from, or checked against,
    // the option table in index.ts. Comparing them catches a new option added
    // to one and forgotten in the other.
    expect(helpOptions().sort()).toEqual(readmeOptions().sort());
  });

  it('should list every option the constructor actually reads', () => {
    // Guards against an option being dropped from the table but still honoured
    // by the constructor, which would leave it working but undocumented.
    const documented = helpOptions();
    for (const option of ['logLevel', 'dir', 'fileFormat', 'rollover', 'maxFileSize',
                          'maxBufferEntries', 'logToConsole', 'startLog', 'endLog', 'logStr',
                          'registerProcessHandlers', 'keepProcessAlive',
                          'suppressPathWarnings', 'onError']) {
      expect(documented).toContain(option);
    }
  });

  it('should document every option the interface actually declares', () => {
    // The lists above only check each other, so an option added to
    // LogFileOptions and left out of all three docs would go unnoticed.
    // This compares them against the declared members.
    const source = fs.readFileSync('./src/index.ts', 'utf8');
    const body = source.split('interface LogFileOptions {')[1].split('\n}')[0];
    const declared = [...body.matchAll(/^ {2}([A-Za-z]+)\?:/gm)].map(m => m[1]);

    expect(declared.sort()).toEqual(helpOptions().sort());
  });

  it('should document the same options in the interface JSDoc', () => {
    // The third copy. LogFileOptions is what an IDE shows on hover, so an
    // option missing there is invisible to the people most likely to want it.
    const source = fs.readFileSync('./src/index.ts', 'utf8');
    const block = source.split('interface LogFileOptions')[0];
    const documented = [...block.matchAll(/^ \* @property ([A-Za-z]+) -/gm)].map(m => m[1]);

    expect(documented.sort()).toEqual(helpOptions().sort());
  });

  it('should show defaults that match the real ones', () => {
    const text = help();
    const logger = new LogFile({ dir: './contract-logs' });

    // Each default appears exactly where the logger's own getters say it is.
    expect(text).toContain(String(logger.getLogLevel()));
    expect(text).toContain(logger.getFileFormat());
    expect(text).toContain('./logs');
    expect(text).toContain('104857600');
    expect(text).toContain('10000');
  });

  it('should document every macro the formatter substitutes', () => {
    const text = help();
    for (const macro of ['%DATETIME%', '%DATE%', '%TIME%', '%LEVEL%', '%MESSAGE%']) {
      expect(text).toContain(macro);
    }
  });

  it('should actually substitute every macro it documents', () => {
    // Guards the other direction: a macro added to the docs but not to the
    // formatter would be written into entries verbatim.
    const dir = './contract-logs';
    for (const macro of ['%DATETIME%', '%DATE%', '%TIME%', '%LEVEL%', '%MESSAGE%']) {
      const logger = new LogFile({ dir, logLevel: LogFile.DEBUG, logStr: `[${macro}]` });
      logger.start();
      logger.info('the message');
      logger.flushSync();
      logger.stop();

      const content = fs.readdirSync(dir)
        .map((f: string) => fs.readFileSync(`${dir}/${f}`, 'utf8')).join('');
      expect(content).not.toContain(macro);

      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
