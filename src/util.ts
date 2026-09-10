/** Two-digit zero padding, for the parts of a timestamp that are padded. */
const pad2 = (value: number): string => value < 10 ? `0${value}` : `${value}`;

/**
 * The calendar parts of an instant, read in the requested zone.
 *
 * Kept in one place because the padded and unpadded renderings below must
 * agree on which day it is; reading them separately in each is how the two
 * could drift apart.
 *
 * @param {Date} now - The instant to read
 * @param {boolean} useServerTime - Use server local time or UTC
 * @returns The year, 1-based month, and day of the month
 */
const calendarParts = (now: Date, useServerTime: boolean): { year: number, month: number, day: number } => ({
  year: useServerTime ? now.getFullYear() : now.getUTCFullYear(),
  month: (useServerTime ? now.getMonth() : now.getUTCMonth()) + 1,
  day: useServerTime ? now.getDate() : now.getUTCDate(),
});

/**
 * The date part of an instant, in YYYY-MM-DD format.
 * @param {Date} now - The instant to render
 * @param {boolean} useServerTime - Use server local time or UTC
 * @returns {string} The formatted date string
 */
const datePart = (now: Date, useServerTime: boolean): string => {
  const { year, month, day } = calendarParts(now, useServerTime);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * The time part of an instant, in HH:MM:SS format.
 * @param {Date} now - The instant to render
 * @param {boolean} useServerTime - Use server local time or UTC
 * @returns {string} The formatted time string
 */
const timePart = (now: Date, useServerTime: boolean): string =>
  useServerTime ? now.toTimeString().substring(0, 8) : now.toISOString().substring(11, 19);

/**
 * The date and time of an instant, in YYYY-M-D HH:MM:SS format.
 *
 * The date part is deliberately not zero-padded here, unlike datePart, because
 * that is the format this macro has always produced.
 *
 * @param {Date} now - The instant to render
 * @param {boolean} useServerTime - Use server local time or UTC
 * @returns {string} The formatted date and time string
 */
const dateTimePart = (now: Date, useServerTime: boolean): string => {
  const { year, month, day } = calendarParts(now, useServerTime);
  return `${year}-${month}-${day} ${timePart(now, useServerTime)}`;
}

/** Every rendering of a single instant. */
export interface Timestamps {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM:SS */
  time: string;
  /** YYYY-M-D HH:MM:SS */
  dateTime: string;
}

/**
 * Renders every timestamp macro of a log entry from ONE reading of the clock.
 *
 * Calling getDate, getTime and getDateTime separately reads the clock three
 * times, so an entry written across a second or midnight boundary can carry
 * parts that disagree with each other. Callers that need more than one part of
 * the same instant must use this rather than combining the helpers below.
 *
 * @param {boolean} useServerTime - Use server local time (default) or UTC
 * @param {Date} now - The instant to render, defaulting to the current time
 * @returns {Timestamps} The date, time and date-time renderings of that instant
 */
export const formatTimestamps = (useServerTime: boolean = true, now: Date = new Date()): Timestamps => ({
  date: datePart(now, useServerTime),
  time: timePart(now, useServerTime),
  dateTime: dateTimePart(now, useServerTime),
});

/**
 * Returns the current date in YYYY-MM-DD format.
 * @param {boolean} useServerTime - Use server local time (default) or UTC
 * @returns {string} The formatted date string
 */
export const getDate = (useServerTime: boolean = true): string => datePart(new Date(), useServerTime);

/**
 * Returns the current time in HH:MM:SS format.
 * @param {boolean} useServerTime - Use server local time (default) or UTC
 * @returns {string} The formatted time string
 */
export const getTime = (useServerTime: boolean = true): string => timePart(new Date(), useServerTime);

/**
 * Returns the current date and time in YYYY-M-D HH:MM:SS format.
 * @param {boolean} useServerTime - Use server local time (default) or UTC
 * @returns {string} The formatted date and time string
 */
export const getDateTime = (useServerTime: boolean = true): string => dateTimePart(new Date(), useServerTime);

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

/**
 * Characters replaced in log file name formats.
 *
 * Path separators and null bytes prevent directory traversal. The rest are
 * illegal in a Windows file name and quietly destructive: ":" opens an NTFS
 * alternate data stream, so "app.log:hidden" writes to a stream that ordinary
 * directory listings never show. They are replaced on every platform so a
 * format behaves the same everywhere.
 */
const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|\x00]/g;

/**
 * Windows device names, which cannot be used as a file name even with an
 * extension: writing to "CON" or "NUL.log" addresses the device, not a file.
 */
const RESERVED_FILENAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

/** Fallback used when a file name format sanitizes down to nothing usable. */
const DEFAULT_FILE_FORMAT = "log-%DATE%.log";

/**
 * Reduces a log file name format to a single, safe path component.
 *
 * The file format names a file, never a path. Applications that derive it
 * from external input (a tenant or account name, for example) would otherwise
 * allow "../" segments to redirect writes outside the log directory.
 *
 * @param {string} fileFormat - The requested file name format
 * @returns {string} The format reduced to a usable file name
 */
export const sanitizeFileFormat = (fileFormat: string): string => {
  // Trailing dots and spaces are dropped by Windows when it opens the file, so
  // "log." and "log" are the same file. Removing them here keeps the name the
  // logger reports identical to the name on disk.
  const sanitized = fileFormat.replace(UNSAFE_FILENAME_CHARS, "-").trim().replace(/[. ]+$/, "");

  // Catches "", ".", ".." and " .. ": each resolves to the log directory
  // itself rather than a file in it, and writing to it fails with EISDIR.
  if (!sanitized) {
    return DEFAULT_FILE_FORMAT;
  }

  // Only the name before the extension is tested, because "NUL.log" addresses
  // the NUL device just as "NUL" does. The FIRST dot, not the last: Windows
  // matches the device against everything before it, so "CON.a.log" is
  // reserved too. A leading dot is a hidden file rather than an extension, so
  // ".log" is left as a whole name.
  const extIndex = sanitized.indexOf(".");
  const base = extIndex > 0 ? sanitized.substring(0, extIndex) : sanitized;
  if (RESERVED_FILENAMES.test(base)) {
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
 * Only a genuine cycle is reported as "[Circular]". Tracking every object ever
 * visited would also flag a value that merely appears twice, so { a: x, b: x }
 * would lose its second branch even though nothing about it is circular.
 * `path` therefore holds the ancestors of the value being visited, and is
 * unwound as the walk leaves each branch.
 *
 * @param {unknown} value - The value to serialize
 * @returns {string} The JSON representation, or a placeholder if it cannot be produced
 */
const safeStringify = (value: unknown): string => {
  const path: unknown[] = [];
  try {
    // A function, not an arrow: JSON.stringify calls the replacer with `this`
    // bound to the object holding the value, which is what identifies the
    // branch currently being walked.
    const json = JSON.stringify(value, function (this: unknown, _key: string, val: any) {
      if (typeof val === "bigint") {
        return `${val}n`;
      }

      if (typeof val === "object" && val !== null) {
        // Drop any ancestors the walk has already left behind.
        while (path.length > 0 && path[path.length - 1] !== this) {
          path.pop();
        }

        if (path.includes(val)) {
          return "[Circular]";
        }

        path.push(val);
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
 * Converts an argument to the string that will appear in the log entry.
 *
 * Always returns a string. Returning the value unchanged made the declared
 * type a lie and, worse, lost the argument: entries are joined with
 * Array.join, which renders null and undefined as "", so info("a", null, "b")
 * wrote "a  b" and the null vanished from the log.
 *
 * @param {unknown} arg - The argument to stringify
 * @returns {string} The string representation of the argument
 *                   - For Error objects, the stack trace
 *                   - For objects and functions, a JSON string
 *                   - For everything else, the value as a string
 */
export const stringifyArgs = (arg: unknown): string => {
  if (arg === null) {
    return "null";
  }

  if (arg === undefined) {
    return "undefined";
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

  // Everything else is a primitive. String() rather than interpolation because
  // a symbol throws on implicit conversion; String() is the explicit form.
  return String(arg);
};

/**
 * Coerces a caught value into an Error.
 *
 * A `catch` binding can hold anything a `throw` was given, so every error path
 * needs this before reporting. String() is guarded because it throws on a
 * value with no primitive conversion, such as one made with
 * Object.create(null), and a logger reporting a failure must not fail itself.
 *
 * @param {unknown} value - The caught value
 * @returns {Error} The value if it is already an Error, otherwise a new Error describing it
 */
export const toError = (value: unknown): Error => {
  if (value instanceof Error) {
    return value;
  }

  try {
    return new Error(String(value));
  } catch {
    return new Error("[Unstringifiable thrown value]");
  }
};
