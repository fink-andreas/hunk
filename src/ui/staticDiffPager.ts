import { loadAppBootstrap } from "../core/loaders";
import type { CommonOptions, DiffFile } from "../core/types";
import { buildStackRows, loadHighlightedDiff, type DiffRow, type RenderSpan } from "./diff/pierre";
import { resolveTheme, type AppTheme } from "./themes";

const RESET = "\x1b[0m";

/** Convert a six-digit hex color into one ANSI truecolor code. */
function ansiColor(kind: "fg" | "bg", hex: string | undefined) {
  const normalized = hex?.replace(/^#/, "");
  if (!normalized || !/^[0-9a-f]{6}$/i.test(normalized)) {
    return "";
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `\x1b[${kind === "fg" ? 38 : 48};2;${red};${green};${blue}m`;
}

/** Wrap one terminal text fragment in ANSI colors. */
function colorText(text: string, fg?: string, bg?: string) {
  if (!text) {
    return "";
  }

  const prefix = `${ansiColor("fg", fg)}${ansiColor("bg", bg)}`;
  return prefix ? `${prefix}${text}${RESET}` : text;
}

/** Serialize highlighted code spans into ANSI text, preserving a row background when present. */
function serializeSpans(spans: RenderSpan[], rowBg: string) {
  return spans.map((span) => colorText(span.text, span.fg, span.bg ?? rowBg)).join("");
}

function lineColor(kind: "context" | "addition" | "deletion", theme: AppTheme) {
  switch (kind) {
    case "addition":
      return { fg: theme.addedSignColor, bg: theme.addedBg };
    case "deletion":
      return { fg: theme.removedSignColor, bg: theme.removedBg };
    case "context":
      return { fg: theme.muted, bg: theme.contextBg };
  }
}

function lineNumberText(value: number | undefined, width: number) {
  return value === undefined ? " ".repeat(width) : String(value).padStart(width, " ");
}

/** Render one non-interactive stacked diff row as ANSI text. */
function renderStaticRow(row: DiffRow, theme: AppTheme, lineNumberWidth: number) {
  if (row.type === "collapsed") {
    return colorText(`  ${row.text}`, theme.muted);
  }

  if (row.type === "hunk-header") {
    return colorText(`  ${row.text}`, theme.accent);
  }

  if (row.type !== "stack-line") {
    return "";
  }

  const { cell } = row;
  const colors = lineColor(cell.kind, theme);
  const oldLine = lineNumberText(cell.oldLineNumber, lineNumberWidth);
  const newLine = lineNumberText(cell.newLineNumber, lineNumberWidth);
  const prefix = `${cell.sign} ${oldLine} ${newLine} │ `;
  return `${colorText(prefix, colors.fg, colors.bg)}${serializeSpans(cell.spans, colors.bg)}`;
}

function maxLineNumberWidth(file: DiffFile, rows: DiffRow[]) {
  let max = 1;
  for (const row of rows) {
    if (row.type !== "stack-line") {
      continue;
    }

    max = Math.max(
      max,
      row.cell.oldLineNumber ? String(row.cell.oldLineNumber).length : 1,
      row.cell.newLineNumber ? String(row.cell.newLineNumber).length : 1,
    );
  }

  return Math.max(max, String(file.metadata.additionLines.length).length);
}

/** Describe the file-level change without exposing raw patch transport headers. */
function fileStatusLabel(file: DiffFile) {
  if (file.isTooLarge) {
    return "skipped large file";
  }

  if (file.isBinary) {
    return "binary";
  }

  switch (file.metadata.type) {
    case "new":
      return file.isUntracked ? "untracked" : "new file";
    case "deleted":
      return "deleted";
    case "rename-pure":
      return "renamed";
    case "rename-changed":
      return "renamed modified";
    case "change":
    default:
      return file.metadata.prevMode && file.metadata.prevMode !== file.metadata.mode
        ? "mode changed"
        : "modified";
  }
}

/** Use an arrow label for renamed files so static output keeps important path metadata. */
function fileDisplayPath(file: DiffFile) {
  const previousPath = file.previousPath ?? file.metadata.prevName;
  return previousPath && previousPath !== file.path ? `${previousPath} → ${file.path}` : file.path;
}

function fileModeText(file: DiffFile) {
  if (
    file.metadata.prevMode &&
    file.metadata.mode &&
    file.metadata.prevMode !== file.metadata.mode
  ) {
    return ` ${file.metadata.prevMode}→${file.metadata.mode}`;
  }

  if ((file.metadata.type === "new" || file.metadata.type === "deleted") && file.metadata.mode) {
    return ` ${file.metadata.mode}`;
  }

  return "";
}

/** Format one parsed diff file for static pager hosts like LazyGit's diff panel. */
async function renderStaticFile(file: DiffFile, theme: AppTheme) {
  const highlighted =
    file.isBinary || file.isTooLarge ? null : await loadHighlightedDiff(file, theme.appearance);
  const rows = buildStackRows(file, highlighted, theme);
  const lineNumberWidth = maxLineNumberWidth(file, rows);
  const stats = `${colorText(`+${file.stats.additions}${file.statsTruncated ? "+" : ""}`, theme.badgeAdded)} ${colorText(`-${file.stats.deletions}`, theme.badgeRemoved)}`;
  const status = colorText(`${fileStatusLabel(file)}${fileModeText(file)}`, theme.muted);
  const header = `${colorText(fileDisplayPath(file), theme.text)} ${status} ${stats}`;

  if (rows.length === 0) {
    const message = file.isTooLarge
      ? "  Skipped because the file is too large to render."
      : file.isBinary
        ? "  Binary file."
        : "  No textual changes.";
    return [header, colorText(message, theme.muted)].join("\n");
  }

  return [header, ...rows.map((row) => renderStaticRow(row, theme, lineNumberWidth))].join("\n");
}

/** Render diff-like pager stdin as colored static output, falling back to the original patch on failure. */
export async function renderStaticDiffPager(text: string, options: CommonOptions = {}) {
  try {
    const bootstrap = await loadAppBootstrap({
      kind: "patch",
      file: "-",
      text,
      options: {
        ...options,
        pager: true,
      },
    });
    const theme = resolveTheme(options.theme, null);
    const rendered = await Promise.all(
      bootstrap.changeset.files.map((file) => renderStaticFile(file, theme)),
    );

    return rendered.length > 0 ? `${rendered.join("\n\n")}\n` : text;
  } catch {
    return text;
  }
}
