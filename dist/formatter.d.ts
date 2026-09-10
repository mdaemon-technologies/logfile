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
export declare const MACRO_DOCS: ReadonlyArray<{
    macro: LogMacro;
    summary: string;
}>;
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
export declare class LogEntryFormatter {
    private template;
    private segments;
    constructor(template: string);
    /** Splits a template into literal and macro segments. */
    private static compile;
    /**
     * Replaces the template, recompiling it.
     *
     * @param template - The new entry format
     */
    setTemplate(template: string): void;
    /**
     * The template as given.
     *
     * @returns The current entry format
     */
    getTemplate(): string;
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
    render(values: EntryValues): string;
}
