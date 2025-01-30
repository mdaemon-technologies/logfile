/**
 * Returns the current date in YYYY-MM-DD format.
 * @returns {string} The formatted date string
 */
export const getDate = (): string => {
  const now = new Date();
  const month: number = now.getMonth() + 1;
  const monthStr = month < 10 ? `0${month}` : `${month}`;
  const day: number = now.getDate();
  const dayStr = day < 10 ? `0${day}` : `${day}`;
  return `${now.getFullYear()}-${monthStr}-${dayStr}`;
}

/**
 * Returns the current time in HH:MM:SS format.
 * @returns {string} The formatted time string
 */
export const getTime = (): string => {
  return new Date().toTimeString().substring(0, 8);
}

/**
 * Returns the current date and time in YYYY-M-D HH:MM:SS format.
 * @returns {string} The formatted date and time string
 */
export const getDateTime = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()} ${now.toTimeString().substring(0, 8)}`;
}

/**
 * Ensures a string ends with a newline character.
 * @param {string} str - The input string to check
 * @returns {string} The input string with a guaranteed trailing newline
 */
export const endWithNewLine = (str: string): string => str.endsWith("\n") ? str : str + "\n";

/**
 * Converts various argument types to their string representation.
 * @param {Error | Object | any} arg - The argument to stringify
 * @returns {string | undefined} The string representation of the argument
 *                              - For Error objects, returns the stack trace
 *                              - For Objects, returns JSON string
 *                              - For other types, returns the value directly
 */
export const stringifyArgs = (arg: Error | Object | any): string | undefined => {
  if (arg instanceof Error) {
    return arg.stack;
  }
  
  if (arg instanceof Object) {
    return JSON.stringify(arg);
  }
  
  return arg;
};