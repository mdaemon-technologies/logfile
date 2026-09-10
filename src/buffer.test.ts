import { LogBuffer } from './buffer';

describe('LogBuffer', () => {
  it('should start empty', () => {
    const buffer = new LogBuffer(10);
    expect(buffer.count()).toBe(0);
    expect(buffer.bytes()).toBe(0);
    expect(buffer.isEmpty()).toBe(true);
    expect(buffer.getDropped()).toBe(0);
  });

  it('should track entries and their encoded size', () => {
    const buffer = new LogBuffer(10);
    buffer.add('abc');
    buffer.add('de');

    expect(buffer.count()).toBe(2);
    expect(buffer.bytes()).toBe(5);
    expect(buffer.isEmpty()).toBe(false);
  });

  it('should measure bytes, not UTF-16 code units', () => {
    const buffer = new LogBuffer(10);
    buffer.add("\u00e9\u00e9");

    // Two characters, four bytes once encoded.
    expect(buffer.bytes()).toBe(4);
  });

  it('should hand over its entries and reset when flushed', () => {
    const buffer = new LogBuffer(10);
    buffer.add('one');
    buffer.add('two');

    expect(buffer.flush()).toEqual(['one', 'two']);
    expect(buffer.count()).toBe(0);
    expect(buffer.bytes()).toBe(0);
  });

  it('should put flushed entries back ahead of anything added since', () => {
    // A failed write returns its entries; entries logged during the attempt
    // came later and must stay later.
    const buffer = new LogBuffer(10);
    buffer.add('first');
    const taken = buffer.flush();
    buffer.add('logged during the write');

    buffer.restore(taken);

    expect(buffer.flush()).toEqual(['first', 'logged during the write']);
  });

  it('should account for restored bytes', () => {
    const buffer = new LogBuffer(10);
    buffer.add('abcde');
    const taken = buffer.flush();
    buffer.restore(taken);

    expect(buffer.bytes()).toBe(5);
    expect(buffer.count()).toBe(1);
  });

  it('should discard the oldest entries once over the cap', () => {
    const buffer = new LogBuffer(10);
    for (let i = 0; i < 11; i++) buffer.add(`entry ${i}`);

    const dropped = buffer.enforceLimit();

    expect(dropped).toBeGreaterThan(0);
    expect(buffer.count()).toBeLessThanOrEqual(10);
    expect(buffer.getDropped()).toBe(dropped);

    // The oldest went first, so the newest is still there.
    expect(buffer.flush()).toContain('entry 10');
  });

  it('should report nothing dropped while under the cap', () => {
    const buffer = new LogBuffer(10);
    for (let i = 0; i < 10; i++) buffer.add(`entry ${i}`);

    expect(buffer.enforceLimit()).toBe(0);
    expect(buffer.getDropped()).toBe(0);
    expect(buffer.count()).toBe(10);
  });

  it('should keep the byte count correct after discarding', () => {
    const buffer = new LogBuffer(10);
    for (let i = 0; i < 20; i++) buffer.add('abcde');
    buffer.enforceLimit();

    expect(buffer.bytes()).toBe(buffer.count() * 5);
  });

  it('should accumulate the dropped total across trims', () => {
    const buffer = new LogBuffer(10);
    for (let i = 0; i < 11; i++) buffer.add(`a${i}`);
    const first = buffer.enforceLimit();
    for (let i = 0; i < 11; i++) buffer.add(`b${i}`);
    const second = buffer.enforceLimit();

    expect(buffer.getDropped()).toBe(first + second);
  });

  it('should discard in batches so trimming is not per-entry work', () => {
    // Removing one entry per call would make every log O(buffer size) once
    // the cap is reached, because a shift re-indexes the whole array.
    const buffer = new LogBuffer(100);
    for (let i = 0; i < 101; i++) buffer.add(`entry ${i}`);

    expect(buffer.enforceLimit()).toBeGreaterThan(1);
    expect(buffer.count()).toBeLessThan(100);
  });

  it('should treat a non-positive cap as the default', () => {
    for (const cap of [0, -1, NaN, undefined]) {
      const buffer = new LogBuffer(cap as number);
      expect(buffer.getLimit()).toBe(10000);
    }
  });
});
