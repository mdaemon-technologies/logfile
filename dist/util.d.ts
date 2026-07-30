/**
 * Returns the current date in YYYY-MM-DD format.
 * @param {boolean} useServerTime - Use server local time (default) or UTC
 * @returns {string} The formatted date string
 */
export declare const getDate: (useServerTime?: boolean) => string;
/**
 * Returns the current time in HH:MM:SS format.
 * @param {boolean} useServerTime - Use server local time (default) or UTC
 * @returns {string} The formatted time string
 */
export declare const getTime: (useServerTime?: boolean) => string;
/**
 * Returns the current date and time in YYYY-M-D HH:MM:SS format.
 *
 * The date part is deliberately not zero-padded here, unlike getDate, because
 * that is the format this macro has always produced.
 *
 * @param {boolean} useServerTime - Use server local time (default) or UTC
 * @returns {string} The formatted date and time string
 */
export declare const getDateTime: (useServerTime?: boolean) => string;
/**
 * Ensures a string ends with a newline character.
 * @param {string} str - The input string to check
 * @returns {string} The input string with a guaranteed trailing newline
 */
export declare const endWithNewLine: (str: string) => string;
/**
 * Characters removed from log messages before they are written.
 *
 * The ANSI escape-sequence alternative must come first: ESC (\x1B) is itself
 * inside the \x00-\x1F range, so a leading control-character class would
 * consume the ESC on its own and leave the rest of the sequence as visible
 * text. Covers, in order:
 * - ANSI/CSI escape sequences
 * - C0/C1 control characters, including the newlines that allow log forging
 * - bidirectional overrides, line/paragraph separators, and the BOM, which
 *   can visually reorder or hide log text in editors and terminals
 */
export declare const UNSAFE_CHARS: RegExp;
/**
 * Strips path separators and null bytes from a log file name format.
 *
 * The file format names a file, never a path. Applications that derive it
 * from external input (a tenant or account name, for example) would otherwise
 * allow "../" segments to redirect writes outside the log directory.
 *
 * @param {string} fileFormat - The requested file name format
 * @returns {string} The format reduced to a single path component
 */
export declare const sanitizeFileFormat: (fileFormat: string) => string;
/**
 * Replaces every occurrence of a macro in a template string.
 *
 * Uses split/join rather than String.replace because replace() interprets
 * "$&", "$`", "$'" and "$$" in the replacement value. Log messages are
 * untrusted input, so those patterns must be inserted literally.
 *
 * @param {string} str - The template string
 * @param {string} macro - The macro to replace, e.g. "%MESSAGE%"
 * @param {string} value - The literal value to insert
 * @returns {string} The template with every occurrence of the macro replaced
 */
export declare const replaceMacro: (str: string, macro: string, value: string) => string;
/**
 * Converts various argument types to their string representation.
 * @param {Error | Object | any} arg - The argument to stringify
 * @returns {string | undefined} The string representation of the argument
 *                              - For Error objects, returns the stack trace
 *                              - For Objects, returns JSON string
 *                              - For other types, returns the value directly
 */
export declare const stringifyArgs: (arg: Error | Object | any) => string | undefined;
