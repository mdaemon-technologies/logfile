/**
 * Returns the current date in YYYY-MM-DD format.
 * @param {boolean} useServerTime - Use server local time (default) or UTC
 * @returns {string} The formatted date string
 */
export const getDate = (useServerTime: boolean = true): string => {
  const now = new Date();
  const month: number = (useServerTime ? now.getMonth() : now.getUTCMonth()) + 1;
  const monthStr = month < 10 ? `0${month}` : `${month}`;
  const day: number = useServerTime ? now.getDate() : now.getUTCDate();
  const dayStr = day < 10 ? `0${day}` : `${day}`;
  return `${useServerTime ? now.getFullYear() : now.getUTCFullYear()}-${monthStr}-${dayStr}`;
}

/**
 * Returns the current time in HH:MM:SS format.
 * @param {boolean} useServerTime - Use server local time (default) or UTC
 * @returns {string} The formatted time string
 */
export const getTime = (useServerTime: boolean = true): string => {
  const now = new Date();
  return useServerTime ? now.toTimeString().substring(0, 8) : now.toISOString().substring(11, 19);
}

/**
 * Returns the current date and time in YYYY-M-D HH:MM:SS format.
 *
 * The date part is deliberately not zero-padded here, unlike getDate, because
 * that is the format this macro has always produced.
 *
 * @param {boolean} useServerTime - Use server local time (default) or UTC
 * @returns {string} The formatted date and time string
 */
export const getDateTime = (useServerTime: boolean = true): string => {
  const now = new Date();
  const year = useServerTime ? now.getFullYear() : now.getUTCFullYear();
  const month = (useServerTime ? now.getMonth() : now.getUTCMonth()) + 1;
  const day = useServerTime ? now.getDate() : now.getUTCDate();
  return `${year}-${month}-${day} ${getTime(useServerTime)}`;
}

/**
 * Ensures a string ends with a newline character.
 * @param {string} str - The input string to check
 * @returns {string} The input string with a guaranteed trailing newline
 */
export const endWithNewLine = (str: string): string => str.endsWith("\n") ? str : str + "\n";

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
export const UNSAFE_CHARS = /\x1B\[[0-?]*[ -/]*[@-~]|[\x00-\x1F\x7F\x9B]|[\u200E\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** Path separators and null bytes are stripped from file name formats to prevent directory traversal. */
const UNSAFE_FILENAME_CHARS = /[\\/\x00]/g;

/** Fallback used when a file name format sanitizes down to a directory reference. */
const DEFAULT_FILE_FORMAT = "log-%DATE%.log";

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
export const sanitizeFileFormat = (fileFormat: string): string => {
  const sanitized = fileFormat.replace(UNSAFE_FILENAME_CHARS, "-");

  // An empty or directory-referencing name resolves to the log directory
  // itself, and writing to it fails with EISDIR.
  if (!sanitized.trim() || sanitized === "." || sanitized === "..") {
    return DEFAULT_FILE_FORMAT;
  }

  return sanitized;
};

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
export const replaceMacro = (str: string, macro: string, value: string): string => str.split(macro).join(value);

/**
 * Serializes a value to JSON without throwing.
 *
 * JSON.stringify throws on circular references, BigInt values, and any
 * throwing getter or toJSON method. Logging must never crash the caller,
 * so every failure mode degrades to a placeholder instead.
 *
 * Note: a value referenced more than once is rendered as "[Circular]" even
 * when the graph is acyclic.
 *
 * @param {Object} value - The value to serialize
 * @returns {string} The JSON representation, or a placeholder if it cannot be produced
 */
const safeStringify = (value: Object): string => {
  const seen = new WeakSet<Object>();
  try {
    const json = JSON.stringify(value, (_key: string, val: any) => {
      if (typeof val === "bigint") {
        return `${val}n`;
      }

      if (typeof val === "object" && val !== null) {
        if (seen.has(val)) {
          return "[Circular]";
        }
        seen.add(val);
      }

      return val;
    });

    // stringify returns undefined for functions and symbols
    return json === undefined ? Object.prototype.toString.call(value) : json;
  } catch {
    return "[Unserializable]";
  }
};

/**
 * Converts various argument types to their string representation.
 * @param {Error | Object | any} arg - The argument to stringify
 * @returns {string | undefined} The string representation of the argument
 *                              - For Error objects, returns the stack trace
 *                              - For Objects, returns JSON string
 *                              - For other types, returns the value directly
 */
export const stringifyArgs = (arg: Error | Object | any): string | undefined => {
  if (arg === null || arg === undefined) {
    return arg;
  }

  if (arg instanceof Error) {
    return arg.stack ?? `${arg.name}: ${arg.message}`;
  }

  // typeof rather than instanceof: an object created with Object.create(null)
  // is not an instance of Object and has no toString, so joining it later
  // would throw "Cannot convert object to primitive value".
  if (typeof arg === "object" || typeof arg === "function") {
    return safeStringify(arg);
  }

  // Symbols throw on implicit conversion; String() is the explicit form.
  if (typeof arg === "symbol") {
    return String(arg);
  }

  return arg;
};