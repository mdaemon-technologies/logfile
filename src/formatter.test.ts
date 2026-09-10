import { LogEntryFormatter, MACRO_DOCS } from './formatter';

const values = {
  date: '2031-02-03',
  time: '04:05:06',
  dateTime: '2031-2-3 04:05:06',
  level: 'INFO',
  message: 'hello',
};

describe('LogEntryFormatter', () => {
  it('should substitute every macro', () => {
    const formatter = new LogEntryFormatter('%DATE%|%TIME%|%DATETIME%|%LEVEL%|%MESSAGE%');
    expect(formatter.render(values))
      .toBe('2031-02-03|04:05:06|2031-2-3 04:05:06|INFO|hello');
  });

  it('should match %DATETIME% ahead of %DATE%', () => {
    // %DATE% is a prefix of %DATETIME%, so a scanner that takes the shorter
    // match first turns "%DATETIME%" into the date followed by a stray "TIME%".
    const formatter = new LogEntryFormatter('%DATETIME%');
    expect(formatter.render(values)).toBe('2031-2-3 04:05:06');
  });

  it('should substitute every occurrence of a repeated macro', () => {
    const formatter = new LogEntryFormatter('%LEVEL% %LEVEL% %LEVEL%');
    expect(formatter.render(values)).toBe('INFO INFO INFO');
  });

  it('should keep literal text around the macros', () => {
    const formatter = new LogEntryFormatter('[[ %LEVEL% ]] -- %MESSAGE% --');
    expect(formatter.render(values)).toBe('[[ INFO ]] -- hello --');
  });

  it('should leave a template with no macros untouched', () => {
    const formatter = new LogEntryFormatter('a constant line');
    expect(formatter.render(values)).toBe('a constant line');
  });

  it('should not expand macros that appear inside the message', () => {
    // The message is untrusted. Substituting it as a value rather than by
    // rewriting the string means its contents are never rescanned.
    const formatter = new LogEntryFormatter('%LEVEL%|%MESSAGE%');
    const rendered = formatter.render({ ...values, message: '%LEVEL% and %DATE%' });
    expect(rendered).toBe('INFO|%LEVEL% and %DATE%');
  });

  it('should insert replacement patterns literally', () => {
    // "$&" and friends are meaningful to String.replace; they must not be.
    const formatter = new LogEntryFormatter('<%MESSAGE%>');
    for (const message of ['$&', '$`', "$'", '$$', '$1']) {
      expect(formatter.render({ ...values, message })).toBe(`<${message}>`);
    }
  });

  it('should strip control characters and escapes from the message', () => {
    const formatter = new LogEntryFormatter('%MESSAGE%');
    const esc = String.fromCharCode(27);

    // ANSI colour sequences and the newlines that allow log forging.
    const message = `clean${esc}[31mred${esc}[0m` + String.fromCharCode(10) + 'forged';
    expect(formatter.render({ ...values, message })).toBe('cleanredforged');
  });

  it('should only strip the message, not the template', () => {
    // A caller-supplied template is trusted; a newline in it is deliberate.
    const formatter = new LogEntryFormatter('a\nb %MESSAGE%');
    expect(formatter.render(values)).toBe('a\nb hello');
  });

  it('should recompile when the template changes', () => {
    const formatter = new LogEntryFormatter('%LEVEL%');
    expect(formatter.render(values)).toBe('INFO');

    formatter.setTemplate('%MESSAGE%');
    expect(formatter.render(values)).toBe('hello');
    expect(formatter.getTemplate()).toBe('%MESSAGE%');
  });

  it('should compile the template once, not on every render', () => {
    // The old formatter ran five split/join passes over the whole string for
    // every entry. Compiling on construction is the point of the class, so
    // rendering must not touch the template again.
    const formatter = new LogEntryFormatter('%DATE% %LEVEL% %MESSAGE%');
    const template = (formatter as any).template as string;
    const spy = jest.spyOn(String.prototype, 'split');
    try {
      formatter.render(values);
      formatter.render(values);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
    expect(template).toBe('%DATE% %LEVEL% %MESSAGE%');
  });

  it('should document every macro it can substitute', () => {
    const formatter = new LogEntryFormatter(MACRO_DOCS.map(m => m.macro).join('|'));
    const rendered = formatter.render(values);
    for (const { macro } of MACRO_DOCS) {
      expect(rendered).not.toContain(macro);
    }
  });
});
