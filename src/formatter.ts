import { UNSAFE_CHARS } from "./util";

/** The macros a log entry format may contain. */
export type LogMacro = "%DATETIME%" | "%DATE%" | "%TIME%" | "%LEVEL%" | "%MESSAGE%";

/**
 * Every macro, with what it expands to.
 *
 * Typed by LogMacro, so adding a macro to the type without documenting it here
 * fails to compile. LogFile.getHelp() renders this rather than restating it.
 *
 * A format is just a string. An earlier LogFormat alias tried to require a
 * macro but included `| string` in the union, which collapsed the whole thing
 * back to string and checked nothing. Formats without macros are legitimate
 * anyway: a startLog of "Log Started" has none.
 */
export const MACRO_DOCS: ReadonlyArray<{ macro: LogMacro, summary: string }> = [
  { macro: "%DATETIME%", summary: "Date and Time" },
  { macro: "%DATE%", summary: "Date" },
  { macro: "%TIME%", summary: "Time" },
  { macro: "%LEVEL%", summary: "Log Level" },
  { macro: "%MESSAGE%", summary: "Message" }
];

/**
 * Matches any macro, longest first.
 *
 * Order matters: "%DATE%" is a prefix of "%DATETIME%", and regex alternation
 * takes the first branch that matches at a position. Shortest-first would turn
 * "%DATETIME%" into the date followed by a stray "TIME%".
 */
const MACRO_PATTERN = new RegExp(
  [...MACRO_DOCS].map(m => m.macro).sort((a, b) => b.length - a.length).join("|"),
  "g"
);

/** The values a single entry is rendered from. */
export interface EntryValues {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM:SS */
  time: string;
  /** YYYY-M-D HH:MM:SS */
  dateTime: string;
  /** The level name, e.g. "INFO" */
  level: string;
  /** The already-serialized message */
  message: string;
}

/** A literal run of template text, or a macro to substitute. */
type Segment = { literal: string } | { macro: LogMacro };

/**
 * Renders log entries from a template.
 *
 * The template is compiled once, into alternating literal and macro segments,
 * and rendering walks those segments. Entries were previously produced by five
 * successive split/join passes over the whole template string, allocating a
 * new copy of it per macro per entry.
 *
 * Compiling also removes the need to substitute %MESSAGE% last. The message is
 * untrusted, and the old code relied on ordering so that macros inside it were
 * not expanded by a later pass. Here the message is placed as a value at its
 * own segment and is never rescanned, which is the same guarantee without
 * depending on the order of operations.
 */
export class LogEntryFormatter {
  private template: string;
  private segments: Segment[] = [];

  constructor(template: string) {
    this.template = template;
    this.segments = LogEntryFormatter.compile(template);
  }

  /** Splits a template into literal and macro segments. */
  private static compile(template: string): Segment[] {
    const segments: Segment[] = [];
    let index = 0;

    // Fresh lastIndex per call: the pattern is global and module-level.
    MACRO_PATTERN.lastIndex = 0;
    let match = MACRO_PATTERN.exec(template);
    while (match !== null) {
      if (match.index > index) {
        segments.push({ literal: template.substring(index, match.index) });
      }
      segments.push({ macro: match[0] as LogMacro });
      index = match.index + match[0].length;
      match = MACRO_PATTERN.exec(template);
    }

    if (index < template.length) {
      segments.push({ literal: template.substring(index) });
    }

    return segments;
  }

  /**
   * Replaces the template, recompiling it.
   *
   * @param template - The new entry format
   */
  setTemplate(template: string): void {
    this.template = template;
    this.segments = LogEntryFormatter.compile(template);
  }

  /**
   * The template as given.
   *
   * @returns The current entry format
   */
  getTemplate(): string {
    return this.template;
  }

  /**
   * Renders one entry.
   *
   * Only the message is sanitized. The template comes from the application and
   * a newline in it is deliberate; the message may come from anywhere, and its
   * control characters would let a caller forge log lines.
   *
   * @param values - The values to substitute
   * @returns The rendered entry, as a single line
   */
  render(values: EntryValues): string {
    const message = values.message.replace(UNSAFE_CHARS, "");
    let rendered = "";

    for (const segment of this.segments) {
      if ("literal" in segment) {
        rendered += segment.literal;
        continue;
      }

      switch (segment.macro) {
        case "%DATETIME%": rendered += values.dateTime; break;
        case "%DATE%": rendered += values.date; break;
        case "%TIME%": rendered += values.time; break;
        case "%LEVEL%": rendered += values.level; break;
        case "%MESSAGE%": rendered += message; break;
      }
    }

    return rendered;
  }
}
