#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ANSI = {
  cyan: "\u001b[36m",
  green: "\u001b[32m",
  red: "\u001b[31m",
  yellow: "\u001b[33m",
  dim: "\u001b[2m",
  reset: "\u001b[0m",
};

const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "coverage", "dist"]);
const TEMP_FILE = /(?:~|\.sw[opx]|\.tmp|\.temp|\.part|\.crdownload)$/i;

export function shouldIgnore(filePath) {
  const parts = filePath.split(/[\\/]/);
  const name = parts.at(-1) ?? "";
  return parts.some((part) => IGNORED_DIRECTORIES.has(part))
    || name === ".DS_Store"
    || name.startsWith(".#")
    || TEMP_FILE.test(name);
}

export async function snapshotTree(rootDir, { baseDir = dirname(rootDir) } = {}) {
  const snapshot = new Map();

  async function visit(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }

    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      const displayPath = relative(baseDir, absolutePath).split(sep).join("/");
      if (shouldIgnore(displayPath)) continue;
      if (entry.isDirectory()) await visit(absolutePath);
      if (entry.isFile()) {
        try {
          snapshot.set(displayPath, await readFile(absolutePath, "utf8"));
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
    }
  }

  await visit(rootDir);
  return snapshot;
}

function sameSnapshot(left, right) {
  if (left.size !== right.size) return false;
  for (const [path, contents] of left) {
    if (right.get(path) !== contents) return false;
  }
  return true;
}

function changedLines(before, after) {
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  const oldHasNewline = oldLines.at(-1) === "";
  const newHasNewline = newLines.at(-1) === "";
  if (oldHasNewline) oldLines.pop();
  if (newHasNewline) newLines.pop();

  const cells = oldLines.length * newLines.length;
  if (cells <= 1_000_000) {
    const lengths = Array.from(
      { length: oldLines.length + 1 },
      () => new Uint32Array(newLines.length + 1),
    );
    for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
      for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
        lengths[oldIndex][newIndex] = oldLines[oldIndex] === newLines[newIndex]
          ? lengths[oldIndex + 1][newIndex + 1] + 1
          : Math.max(lengths[oldIndex + 1][newIndex], lengths[oldIndex][newIndex + 1]);
      }
    }

    const result = [];
    let oldIndex = 0;
    let newIndex = 0;
    while (oldIndex < oldLines.length || newIndex < newLines.length) {
      if (oldLines[oldIndex] === newLines[newIndex]) {
        oldIndex += 1;
        newIndex += 1;
      } else if (
        newIndex >= newLines.length
        || (oldIndex < oldLines.length && lengths[oldIndex + 1][newIndex] >= lengths[oldIndex][newIndex + 1])
      ) {
        result.push(`- ${oldLines[oldIndex]}`);
        oldIndex += 1;
      } else {
        result.push(`+ ${newLines[newIndex]}`);
        newIndex += 1;
      }
    }
    if (oldHasNewline !== newHasNewline) result.push("\\ No newline at end of file");
    return result;
  }

  let prefix = 0;
  while (oldLines[prefix] === newLines[prefix] && prefix < oldLines.length && prefix < newLines.length) prefix += 1;
  let suffix = 0;
  while (
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
    && suffix < oldLines.length - prefix
    && suffix < newLines.length - prefix
  ) suffix += 1;

  const removed = oldLines.slice(prefix, oldLines.length - suffix);
  const added = newLines.slice(prefix, newLines.length - suffix);
  const result = [
    ...removed.map((line) => `- ${line}`),
    ...added.map((line) => `+ ${line}`),
  ];
  if (oldHasNewline !== newHasNewline) result.push("\\ No newline at end of file");
  return result;
}

export function diffSnapshots(before, after) {
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
  const changes = [];
  for (const path of paths) {
    const hadFile = before.has(path);
    const hasFile = after.has(path);
    const oldContents = before.get(path) ?? "";
    const newContents = after.get(path) ?? "";
    if (hadFile === hasFile && oldContents === newContents) continue;
    const status = !hadFile ? "CREATED" : !hasFile ? "DELETED" : "UPDATED";
    changes.push({
      path,
      status,
      before: oldContents,
      after: newContents,
      lines: changedLines(oldContents, newContents),
    });
  }
  return changes;
}

export function renderChanges(changes, { color = true } = {}) {
  const paint = (code, value) => color ? `${code}${value}${ANSI.reset}` : value;
  const output = [];
  for (const change of changes) {
    output.push(paint(ANSI.cyan, "◆ LIVE CODE"));
    output.push(`  ${change.path}  ${paint(ANSI.yellow, change.status)}`);
    output.push("");
    for (const line of change.lines) {
      output.push(paint(line.startsWith("+") ? ANSI.green : ANSI.red, line));
    }
    output.push("");
  }
  return output.join("\n");
}

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

export async function animateChanges(changes, { output = process.stdout, typing = output.isTTY } = {}) {
  for (const change of changes) {
    output.write(`\n${ANSI.cyan}◆ LIVE CODE${ANSI.reset}\n`);
    output.write(`  ${change.path}  ${ANSI.yellow}${change.status}${ANSI.reset}\n\n`);
    for (const line of change.lines) {
      const color = line.startsWith("+") ? ANSI.green : ANSI.red;
      output.write(color);
      if (typing) {
        for (let offset = 0; offset < line.length; offset += 6) {
          output.write(line.slice(offset, offset + 6));
          await delay(2);
        }
      } else {
        output.write(line);
      }
      output.write(`${ANSI.reset}\n`);
    }
  }
}

export function createObserver({
  rootDir,
  baseDir = dirname(rootDir),
  pollMs = 70,
  debounceMs = 180,
  onChanges = animateChanges,
} = {}) {
  if (!rootDir) throw new TypeError("rootDir is required");

  let baseline;
  let latest;
  let pollTimer;
  let debounceTimer;
  let scanning = false;
  let delivery = Promise.resolve();

  async function flush() {
    debounceTimer = undefined;
    const next = latest ?? await snapshotTree(rootDir, { baseDir });
    latest = undefined;
    const changes = diffSnapshots(baseline, next);
    baseline = next;
    if (changes.length > 0) {
      delivery = delivery.then(() => onChanges(changes));
      await delivery;
    }
  }

  async function scan() {
    if (scanning || !baseline) return;
    scanning = true;
    try {
      const next = await snapshotTree(rootDir, { baseDir });
      if (sameSnapshot(baseline, next)) {
        latest = undefined;
        clearTimeout(debounceTimer);
        debounceTimer = undefined;
      } else if (!latest || !sameSnapshot(latest, next)) {
        latest = next;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(flush, debounceMs);
      }
    } finally {
      scanning = false;
    }
  }

  return {
    async start() {
      if (pollTimer) return;
      baseline = await snapshotTree(rootDir, { baseDir });
      pollTimer = setInterval(scan, pollMs);
    },
    async stop() {
      clearInterval(pollTimer);
      clearTimeout(debounceTimer);
      pollTimer = undefined;
      debounceTimer = undefined;
      await delivery;
    },
    scan,
  };
}

async function main() {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const sourceRoot = join(projectRoot, "src");
  const observer = createObserver({ rootDir: sourceRoot, baseDir: projectRoot });
  await observer.start();
  process.stdout.write(`${ANSI.cyan}◆ LIVE CODE${ANSI.reset}  ${ANSI.dim}watching src/ for real workspace changes…${ANSI.reset}\n`);

  const stop = async () => {
    await observer.stop();
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
