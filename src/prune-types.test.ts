/**
 * Tests the declaration-pruning build step against a fixture directory.
 *
 * The script deletes files from the published package, so its reachability
 * logic is the thing standing between a decomposition and shipping broken
 * types. A false negative - missing a reference and deleting a needed file -
 * is the dangerous direction, so the cases below cover every form tsc can
 * emit, including the inline `import("./x").Type` used for inferred types.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Writes a declaration file into the fixture directory. */
const write = (name: string, contents = '') => {
  fs.writeFileSync(path.join(dir, name), contents);
};

/** Runs the script against the fixture; returns its exit code and output. */
const run = (...args: string[]): { code: number, output: string } => {
  try {
    const output = execFileSync(
      process.execPath,
      [path.resolve('scripts/prune-types.mjs'), ...args],
      { env: { ...process.env, PRUNE_DIST: dir }, encoding: 'utf8', stdio: 'pipe' }
    );
    return { code: 0, output };
  } catch (error: any) {
    return { code: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
};

const remaining = () => fs.readdirSync(dir).sort();

describe('pruning', () => {
  it('should delete a declaration nothing references', () => {
    write('index.d.ts', 'export default class {}\n');
    write('orphan.d.ts', 'export type Gone = string;\n');

    expect(run().code).toBe(0);
    expect(remaining()).toEqual(['index.d.ts']);
  });

  it('should keep the entry even when it references nothing', () => {
    write('index.d.ts', 'export default class {}\n');

    expect(run().code).toBe(0);
    expect(remaining()).toEqual(['index.d.ts']);
  });

  it('should leave non-declaration files alone', () => {
    write('index.d.ts', 'export default class {}\n');
    write('logfile.mjs', 'export default class {}\n');
    write('orphan.d.ts', '');

    run();

    expect(remaining()).toEqual(['index.d.ts', 'logfile.mjs']);
  });

  it('should be idempotent', () => {
    write('index.d.ts', 'export default class {}\n');
    write('orphan.d.ts', '');

    run();
    const second = run();

    expect(second.code).toBe(0);
    expect(second.output).toContain('all reachable');
  });
});

describe('reachability', () => {
  const keeps = (reference: string) => {
    write('index.d.ts', `${reference}\nexport default class {}\n`);
    write('needed.d.ts', 'export type Needed = string;\n');
    write('orphan.d.ts', '');

    run();
    return remaining();
  };

  it('should follow a named import', () => {
    expect(keeps('import { Needed } from "./needed";')).toEqual(['index.d.ts', 'needed.d.ts']);
  });

  it('should follow a re-export', () => {
    expect(keeps('export type { Needed } from "./needed";')).toEqual(['index.d.ts', 'needed.d.ts']);
  });

  it('should follow a star re-export', () => {
    expect(keeps('export * from "./needed";')).toEqual(['index.d.ts', 'needed.d.ts']);
  });

  it('should follow a bare side-effect import', () => {
    expect(keeps('import "./needed";')).toEqual(['index.d.ts', 'needed.d.ts']);
  });

  it('should follow the inline import() form tsc uses for inferred types', () => {
    // The dangerous one: missing this deletes a file the types depend on.
    expect(keeps('declare const x: import("./needed").Needed;'))
      .toEqual(['index.d.ts', 'needed.d.ts']);
  });

  it('should follow a specifier that carries an extension', () => {
    expect(keeps('import { Needed } from "./needed.js";')).toEqual(['index.d.ts', 'needed.d.ts']);
  });

  it('should follow references transitively', () => {
    write('index.d.ts', 'import { A } from "./a";\nexport default class {}\n');
    write('a.d.ts', 'export type { B } from "./b";\nexport type A = string;\n');
    write('b.d.ts', 'export type B = string;\n');
    write('orphan.d.ts', '');

    run();

    expect(remaining()).toEqual(['a.d.ts', 'b.d.ts', 'index.d.ts']);
  });

  it('should not loop on a circular reference', () => {
    write('index.d.ts', 'import { A } from "./a";\nexport default class {}\n');
    write('a.d.ts', 'import { B } from "./b";\nexport type A = string;\n');
    write('b.d.ts', 'import { A } from "./a";\nexport type B = string;\n');

    expect(run().code).toBe(0);
    expect(remaining()).toEqual(['a.d.ts', 'b.d.ts', 'index.d.ts']);
  });
});

describe('--check', () => {
  it('should fail and name the orphans without deleting them', () => {
    write('index.d.ts', 'export default class {}\n');
    write('orphan.d.ts', '');

    const { code, output } = run('--check');

    expect(code).toBe(1);
    expect(output).toContain('orphan.d.ts');
    expect(remaining()).toEqual(['index.d.ts', 'orphan.d.ts']);
  });

  it('should pass when everything is reachable', () => {
    write('index.d.ts', 'export default class {}\n');

    expect(run('--check').code).toBe(0);
  });
});

describe('guards', () => {
  it('should fail clearly when the build has not run', () => {
    const { code, output } = run();

    expect(code).toBe(1);
    expect(output).toContain('build first');
  });
});
