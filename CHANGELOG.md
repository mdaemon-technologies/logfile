# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.8.0]

### Added

- `LogFileOptions`, `LogLevel`, `LogMacro` and `FileSystem` are exported as types.
- `fileSystem` option: the filesystem the logger writes through, defaulting to
  `node:fs`. A seam for tests, so behaviour that depends on I/O failing can be
  driven without putting a real disk into an awkward state.

### Changed

- Log level parameters and returns are typed `LogLevel` rather than `number`:
  `setLogLevel()`, `getLogLevel()`, `log()` and the `logLevel` option. Not a
  breaking change - `number` remains assignable to a numeric enum, so code
  passing a plain number still compiles, and the static `LogFile.DEBUG` and
  friends are unchanged. Only the editor hints improve.
- `getHelp()` returns the help text as well as printing it, so it can be shown
  somewhere other than the console. Existing callers that ignore the return
  value are unaffected.
- The package no longer ships declaration files nothing can reach. tsc emits
  one per source file while rollup bundles the runtime into one, so the
  declarations for internal modules were published unreachable. A build step
  computes reachability from the entry declaration and prunes the rest.
- The stub declarations `dist/logfile.cjs.d.ts` and `dist/logfile.mjs.d.ts` are
  gone. They typed deep imports of the built files, which the `exports` map
  already blocks at runtime, so nothing resolvable was removed.
- The published typings are the generated ones. A hand-maintained
  `dist/logfile.d.ts` sat alongside them and had already fallen behind the
  implementation - it still declared `getHelp(): void`. A consumer fixture is
  now type-checked against the built declarations on every test run.
- The buffer flushes on bytes actually written rather than on string length.
  Non-ASCII text takes up to four bytes per character, so the buffer could
  grow to several times the limit it was compared against before flushing.
- Log levels, constructor options and format macros are each defined once and
  rendered into the help text. The lists in the README and in the
  `LogFileOptions` docs are now checked against them by the test suite.
- Internals split out of the logger: `LogEntryFormatter` (compiles the entry
  template once instead of running five string passes per entry), `LogBuffer`
  (entries, byte accounting and the discard policy), `RotatingFileTarget`
  (which file is open, and when to switch: naming, date and size rollover,
  the directory, and the open/close banners) and a `FileSystem` port. The
  logger keeps levels, formatting, buffering and lifecycle. None of this
  changes the public API.

### Fixed

- `setFileFormat()` now takes effect on a running logger. The format changed
  but the open file did not, so `getFileFormat()` reported the new value while
  `file()` kept returning the old name until the date next changed. The current
  file is closed with an end banner and the new name opened, as `setLogDir()`
  already did.
- `setLogDir("")` no longer redirects logging to the filesystem root. The
  constructor guarded an empty directory with a fallback to `./logs`; the
  setter did not, and `mkdirSync` then failed on `""`.
- Arguments are no longer serialized for messages the log level discards. The
  level was checked after `stringifyArgs` had already walked every argument, so
  a logger set to `ERROR` still paid for `debug(bigObject)` in full, and could
  run application getters for an entry it was about to throw away.
- A size rollover that cannot write its end banner now moves to the next file
  anyway. It previously left the suffix and file name untouched, so the file
  stayed over the limit and every later flush retried the identical failing
  append, wedging the logger permanently.
- Restarting no longer appends to a log file that is already over
  `maxFileSize`. The suffix counter resets on start and the size was only ever
  checked after a write, so a restart wrote into the oversized file, then into
  the equally full `-1`, before finding one with room.
- With several loggers using `registerProcessHandlers`, a signal now flushes
  all of them. Each logger installed its own handler and every one called
  `process.exit`, so the first to run ended the process and the rest lost
  whatever they had buffered. One shared handler per signal is installed for
  the process, and removed when the last logger using it stops.
- `file()` and `lastFile()` return `""` when no file is open, rather than the
  directory path with a trailing slash. `existsSync(logger.file())` answered
  true about the directory before `start()` and after `stop()`.
- A size rollover with date rollover disabled names the new file after the day
  the file belongs to. The internal date advances at midnight even when
  rollover is off, so the suffixed file was stamped with a day no other file in
  the sequence shared.
- `log()` no longer reads the clock four times for one entry. Every macro and
  the rollover decision now come from a single reading, so an entry written
  across a second or midnight boundary cannot carry parts that disagree, nor be
  filed under a date it does not carry.
- `null` and `undefined` arguments are now written as `null` and `undefined`
  instead of disappearing. Entries are joined with `Array.join`, which renders
  nullish values as an empty string, so `info("a", null, "b")` previously wrote
  `"a  b"` and the argument was lost. `stringifyArgs` now always returns a
  string, which also makes its declared return type honest.
- A value referenced more than once in the same object is no longer reported as
  `[Circular]`. Serialization tracked every object it had visited, so
  `{ a: x, b: x }` lost its second branch even though nothing was circular.
  Only a genuine cycle back to an ancestor is reported now.
- `%DATETIME%` reads the clock once. Its date and time parts were taken from
  two separate readings and could come from different seconds.
- Log file name formats are sanitized more thoroughly. `:` `*` `?` `"` `<` `>`
  and `|` are replaced, as path separators and null bytes already were: `:` in
  particular opened an NTFS alternate data stream, so `app.log:hidden` wrote to
  a stream that ordinary directory listings never show. Trailing dots and
  spaces are dropped, matching what Windows does when it opens the file, and a
  format whose name is a Windows device (`CON`, `NUL`, `COM1`, and the rest,
  with or without an extension) falls back to the default rather than
  addressing the device.

## [3.7.0]

Hardening release. Log messages are untrusted input, and several code paths did
not treat them that way. No breaking API changes.

### Added

- `maxFileSize: 0` (or any value `<= 0`) disables size-based rollover, allowing
  a log file to grow without limit. The default remains `104857600` (100 MB).
- `maxBufferEntries` option (default `10000`) caps how many entries are retained
  after a failed write. This bounds the retry backlog; during normal operation
  the buffer is flushed well before it grows that large. Entries are discarded
  in batches, so the count can dip slightly below the cap.
- `getDroppedLogs()` returns the number of buffered entries discarded because
  that cap was reached.
- `getUseServerTime()`, completing the set - every setter now has a matching
  getter.
- A one-time console warning when the log directory contains a `..` segment,
  plus a `suppressPathWarnings` option (default `false`) to silence it. The
  directory is still used exactly as given - climbing out with `..` is a valid
  configuration and is not blocked. The warning exists because the library
  cannot tell a hard-coded path from one built out of user input, and only the
  latter is a path traversal vulnerability. It fires from the constructor and
  from `setLogDir()`, at most once per logger, and never changes behavior. Only
  a whole `..` path segment counts, so a directory named `..data` is not
  reported.
- `keepProcessAlive` option (default `true`). The flush and rollover timers are
  pending event-loop work, so a started logger prevents a script from exiting on
  its own. That is unchanged by default. Setting it to `false` unrefs both
  timers - they still fire, but no longer hold the process open - and flushes
  buffered entries on process exit so nothing is lost. Intended for short-lived
  scripts; a long-running service is unaffected either way, as are processes
  that end via `process.exit()`, a signal, or a crash.

### Changed

- `getHelp()` now prints every constructor option with its default, alongside
  the log levels and macros it already listed. It also distinguishes which
  macros apply where: `startLog` and `endLog` expand `%DATETIME%` only, and
  `fileFormat` expands `%DATE%` only.

### Fixed

- **A rollover never truncates an existing file.** Both the date-based and
  size-based paths opened the new file with a truncating write. A `fileFormat`
  without `%DATE%` produces the same name every day, so the entire log was
  destroyed at midnight; a suffixed name left over from an earlier run was
  destroyed the same way. Files are now always opened for append - the library
  no longer calls a truncating write anywhere, so no code path can discard an
  existing log, and there is no window in which another writer could create the
  file between an existence check and the write.
- **Entries are written to the day they belong to.** Two ordering problems put
  entries in the wrong file across a date rollover: `log()` buffered an entry
  before checking for a date change, so once the buffer timeout had elapsed the
  entry was flushed into the previous day's file; and `rollOver()` switched
  files before flushing, so anything still buffered from before midnight was
  written into the new day's file. The rollover check now runs first, and the
  buffer is flushed while the previous date is still current.
- **Logging an object with circular references no longer throws into the
  caller.** `debug`/`info`/`warning`/`warn`/`error`/`critical` serialized their
  arguments outside the internal `try`/`catch`, so `JSON.stringify` failures
  propagated out of the log call. Logging a request, response, or socket object
  crashed the caller — and with `registerProcessHandlers: true`, the resulting
  `uncaughtException` exited the process. Cycles now render as `[Circular]`,
  `BigInt` values as `123n`, and anything still unserializable (a throwing
  getter or `toJSON`) as `[Unserializable]`. The same applies to values that
  cannot be implicitly converted to a string at all: a `Symbol` argument, or an
  object created with `Object.create(null)`, previously threw out of the log
  call when the arguments were joined.
- **A failing rollover no longer crashes the process.** `rollOver()` performed
  its writes with no error handling and is driven by a five-second timer with
  no `try`/`catch` above it, so a log directory that was removed or became
  unwritable turned the next date change into an uncaught exception. Failures
  are now reported through `onError`, and the logger advances to the new day so
  later writes recover once the directory is usable again.
- **`start()` returns `false` on failure instead of throwing**, as its
  documentation already stated, and reports the cause through `onError`. An
  unwritable or invalid directory previously threw at the caller.
- **The buffer is bounded even when there is no file to write to.** If `start()`
  failed and date rollover was disabled, the logger had no target file, so no
  write was ever attempted, no write ever failed, and the `maxBufferEntries` cap
  never applied - entries accumulated without limit. The cap is now applied
  whenever there is no target.
- **`setLogDir()` writes buffered entries to the directory they were logged
  against.** Entries still in the buffer were flushed to the new directory after
  the switch, misfiling them.
- **`setRollover()` starts and stops the rollover timer.** It only set a flag,
  so enabling rollover on a running logger left the timer unarmed - an idle
  process would not roll over at midnight until something was logged - and
  disabling it left the timer running.
- **`stop()` no longer discards buffered entries when the log file was removed.**
  It checked for the file's existence before flushing and returned early if it
  was missing, so entries still in the buffer were lost at shutdown - a likely
  outcome when an external rotation removes the active file. The flush now
  happens first and recreates the file. `stop()` also clears the current file on
  every path, so a later log call restarts the logger with its intervals rather
  than writing with no timers running.
- **A file format that sanitizes down to nothing falls back to the default.**
  `setFileFormat("")` (or `"."`, or `"/"`) left the logger pointing at the log
  directory itself, and the next `start()` threw an uncaught `EISDIR`.
- **`$` patterns in a message are inserted literally.** Message content was used
  as the replacement argument of `String.replace`, which interprets ``$` ``,
  `$&`, `$'`, and `$$`. A message containing ``$` `` duplicated the
  timestamp/level prefix inside its own line, letting user-controlled text
  imitate a second log entry. Macro expansion no longer interprets these.
- **ANSI escape sequences are removed completely.** `ESC` falls inside the
  `\x00-\x1F` control-character class, which matched first and consumed only the
  `ESC` byte, leaving visible residue such as `[31m` in the log. The escape
  sequence alternative is now tried first.
- **Failed writes no longer grow the buffer without bound.** Entries are
  restored on failure so a transient error does not lose them, but the buffer is
  capped at `maxBufferEntries` and drops the oldest entries beyond that, each
  drop reported through `onError`. Writes also back off for one second after a
  failure instead of attempting a synchronous write for every subsequent entry.
- **`stop()` no longer wedges the logger when the log file was removed
  externally.** It returned early without clearing `isStarted`, so the following
  `start()` was a no-op and the flush and rollover intervals were never
  recreated, silently ending time-based flushing.
- **Every occurrence of a macro is expanded**, not just the first, so a format
  string such as `"%LEVEL% %LEVEL% | %MESSAGE%"` renders as intended. `%MESSAGE%`
  is still substituted last, so macros inside a message are never expanded.
- **Path separators and null bytes are stripped from `fileFormat`.** The file
  format names a file, never a path; applications deriving it from external
  input could previously redirect writes outside the log directory with `../`
  segments.
- **`setLogDir()` on a running logger creates the directory**, instead of
  leaving every subsequent write to fail against a path that does not exist.
- **Bidirectional overrides, line/paragraph separators, and the BOM are stripped
  from messages**, alongside the control characters already removed. These can
  visually reorder or conceal log text in editors and terminals.
- **A logger with `useServerTime: false` no longer performs a spurious rollover
  at startup.** `start()` derived the date from UTC while `rollOver()` compared
  against the local date, so the first timer tick rolled the file over whenever
  the two differed.
- An unrecognized log level no longer resolves through the prototype chain when
  reported as a string.
- **`useServerTime` now applies to log entries, not just banners.** The `%DATE%`,
  `%TIME%` and `%DATETIME%` macros always rendered in server local time, so a
  logger configured with `useServerTime: false` wrote UTC banners and file names
  around local-time entries. All timestamps now follow the setting.

  This changes output for anyone using `useServerTime: false`: entry timestamps
  shift from local time to UTC, which is what the setting has always claimed to
  do. Loggers left at the default (`true`) are unaffected, and the rendered
  format is unchanged in both modes.
- **The `onError` callback is isolated from the logger.** A callback that logs —
  natural user code — re-entered the logger, and each nested failure reported
  again, amplifying without bound. Reentrant reports are now suppressed. A
  callback that throws is also contained: because it is invoked from
  timer-driven flushes with no `try`/`catch` above them, an exception
  previously surfaced as an uncaught exception instead of a logging failure.

### Security

Newline stripping already prevented forged log lines, and that behavior is
unchanged. The fixes above close the remaining input-driven issues: a crash
reachable from any circular object (availability), buffer growth under write
failure (availability), prefix duplication via `$` patterns and escape-sequence
residue (log integrity), and traversal via a caller-supplied `fileFormat`.
