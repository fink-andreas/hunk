import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { once } from "node:events";
import { parse as parseShellCommand, type ParseEntry } from "shell-quote";
import { stripTerminalControl } from "./patch/normalize";

/** Detect whether generic pager stdin looks like a diff/patch that Hunk should review. */
export function looksLikePatchInput(text: string) {
  const normalized = stripTerminalControl(text.replaceAll("\r\n", "\n"));

  return (
    /^diff --git /m.test(normalized) ||
    (/^--- /m.test(normalized) && /^\+\+\+ /m.test(normalized)) ||
    /^@@ /m.test(normalized)
  );
}

interface ResolvedPagerCommand {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  displayCommand: string;
}

/** Convert shell-quote parse entries to literal argv tokens without evaluating shell operators. */
function pagerWordFromParseEntry(entry: ParseEntry) {
  if (typeof entry === "string") {
    return entry;
  }

  if ("op" in entry) {
    return entry.op === "glob" ? entry.pattern : entry.op;
  }

  return null;
}

/** Split a pager command into argv words without shell execution or variable expansion. */
function splitPagerCommand(command: string) {
  const preserveVariableReference = (name: string) => `$${name}`;
  return parseShellCommand(command, preserveVariableReference).flatMap((entry) => {
    const word = pagerWordFromParseEntry(entry);
    return word === null ? [] : [word];
  });
}

/** Return a normalized executable name for policy checks across Unix and Windows paths. */
function executableName(command: string) {
  return (
    command
      .split(/[\\/]/)
      .at(-1)
      ?.replace(/\.(?:cmd|exe)$/i, "")
      .toLowerCase() ?? ""
  );
}

/** Detect simple shell-style `NAME=value` environment assignments before a command. */
function parseEnvAssignment(word: string): [string, string] | null {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(word);
  return match ? [match[1] ?? "", match[2] ?? ""] : null;
}

/** Return the executable token after supported env-assignment prefixes. */
function resolvePagerSpec(command: string): ResolvedPagerCommand | null {
  const words = splitPagerCommand(command);
  const envOverrides: NodeJS.ProcessEnv = {};
  let commandIndex = 0;

  while (commandIndex < words.length) {
    const word = words[commandIndex];
    const assignment = word ? parseEnvAssignment(word) : null;
    if (!assignment) {
      break;
    }
    const [key, value] = assignment;
    envOverrides[key] = value;
    commandIndex += 1;
  }

  // Support the common `env NAME=value pager ...` wrapper without invoking a shell.
  if (executableName(words[commandIndex] ?? "") === "env") {
    let envIndex = commandIndex + 1;
    const wrappedEnv: NodeJS.ProcessEnv = {};

    while (envIndex < words.length) {
      const word = words[envIndex];
      const assignment = word ? parseEnvAssignment(word) : null;
      if (!assignment) {
        break;
      }
      const [key, value] = assignment;
      wrappedEnv[key] = value;
      envIndex += 1;
    }

    if (envIndex < words.length) {
      commandIndex = envIndex;
      Object.assign(envOverrides, wrappedEnv);
    }
  }

  const executable = words[commandIndex];
  if (!executable) {
    return null;
  }

  return {
    command: executable,
    args: words.slice(commandIndex + 1),
    env: envOverrides,
    displayCommand: command,
  };
}

/** Choose a plain-text pager command while avoiding recursive `hunk pager` launches. */
export function resolveTextPagerCommand(env: NodeJS.ProcessEnv = process.env): string {
  const candidate = env.HUNK_TEXT_PAGER ?? env.PAGER;
  const pagerSpec = candidate ? resolvePagerSpec(candidate) : null;

  if (!pagerSpec || executableName(pagerSpec.command) === "hunk") {
    return "less -R";
  }

  return pagerSpec.displayCommand;
}

/** Minimal dependencies for testing pager behavior without spawning a real subprocess. */
export interface PlainTextPagerDeps {
  stdout: Pick<NodeJS.WriteStream, "isTTY" | "write">;
  spawnImpl: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
}

/** Stream plain text through a normal pager, or write directly when not attached to a terminal. */
export async function pagePlainText(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
  deps: PlainTextPagerDeps = {
    stdout: process.stdout,
    spawnImpl: spawn,
  },
) {
  if (!deps.stdout.isTTY) {
    deps.stdout.write(text);
    return;
  }

  const pagerCommand = resolveTextPagerCommand(env);
  const pagerSpec = resolvePagerSpec(pagerCommand) ?? resolvePagerSpec("less -R");

  if (!pagerSpec) {
    deps.stdout.write(text);
    return;
  }

  let pager: ChildProcess;
  try {
    pager = deps.spawnImpl(pagerSpec.command, pagerSpec.args, {
      shell: false,
      stdio: ["pipe", "inherit", "inherit"],
      env: {
        ...env,
        ...pagerSpec.env,
      },
    });
  } catch (error) {
    throw new Error(`Pager command failed: ${pagerCommand}`, { cause: error });
  }

  let spawnError: unknown;
  pager.once("error", (error) => {
    spawnError = error;
  });

  pager.stdin?.end(text);
  const [code] = await once(pager, "close");

  if (spawnError || (typeof code === "number" && code !== 0)) {
    throw new Error(`Pager command failed: ${pagerCommand}`, { cause: spawnError });
  }
}
