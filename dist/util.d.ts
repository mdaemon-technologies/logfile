/**
 * Returns the current date in YYYY-MM-DD format.
 * @returns {string} The formatted date string
 */
export declare const getDate: () => string;
/**
 * Returns the current time in HH:MM:SS format.
 * @returns {string} The formatted time string
 */
export declare const getTime: () => string;
/**
 * Returns the current date and time in YYYY-M-D HH:MM:SS format.
 * @returns {string} The formatted date and time string
 */
export declare const getDateTime: () => string;
/**
 * Ensures a string ends with a newline character.
 * @param {string} str - The input string to check
 * @returns {string} The input string with a guaranteed trailing newline
 */
export declare const endWithNewLine: (str: string) => string;
/**
 * Converts various argument types to their string representation.
 * @param {Error | Object | any} arg - The argument to stringify
 * @returns {string | undefined} The string representation of the argument
 *                              - For Error objects, returns the stack trace
 *                              - For Objects, returns JSON string
 *                              - For other types, returns the value directly
 */
export declare const stringifyArgs: (arg: Error | Object | any) => string | undefined;
