import type { AgentAnnotation, DiffFile, LayoutMode } from "../../../core/types";
import { isEscapeKey } from "../../lib/keyboard";
import { wrapText } from "../../lib/agentPopover";
import { annotationRangeLabel, reviewNoteSource } from "../../lib/agentAnnotations";
import { fitText, padText } from "../../lib/text";
import type { AppTheme } from "../../themes";

function inlineNoteTitle(annotation: AgentAnnotation, noteIndex: number, noteCount: number) {
  if (annotation.source === "user-draft") {
    return "Draft note";
  }

  const source = reviewNoteSource(annotation);
  const label = source === "user" ? "Your note" : source === "agent" ? "Agent note" : "AI note";
  return noteCount > 1 ? `${label} ${noteIndex + 1}/${noteCount}` : label;
}

interface AgentInlineNoteLine {
  kind: "summary" | "rationale";
  text: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function splitColumnWidths(width: number) {
  const markerWidth = 1;
  const separatorWidth = 1;
  const usableWidth = Math.max(0, width - markerWidth - separatorWidth);
  const leftWidth = Math.max(0, markerWidth + Math.floor(usableWidth / 2));
  const rightWidth = Math.max(0, separatorWidth + usableWidth - Math.floor(usableWidth / 2));
  return { leftWidth, rightWidth };
}

export function measureAgentInlineNoteHeight({
  annotation,
  anchorSide,
  layout,
  width,
}: {
  annotation: AgentAnnotation;
  anchorSide?: "old" | "new";
  layout: Exclude<LayoutMode, "auto">;
  width: number;
}) {
  const splitWidths = splitColumnWidths(width);
  const canDockRight = layout === "split" && anchorSide === "new" && width >= 84;
  const canDockLeft = layout === "split" && anchorSide === "old" && width >= 84;
  const preferredDockWidth = canDockRight
    ? splitWidths.rightWidth
    : canDockLeft
      ? splitWidths.leftWidth
      : Math.max(34, width - 4);
  const boxWidth = clamp(preferredDockWidth, 28, Math.max(28, width - 4));
  const innerWidth = Math.max(1, boxWidth - 2);
  const bodyWidth = innerWidth;
  const contentWidth = Math.max(1, bodyWidth - 2);
  const lines: AgentInlineNoteLine[] = [
    ...wrapText(annotation.summary, contentWidth).map((text) => ({
      kind: "summary" as const,
      text,
    })),
    ...(annotation.rationale
      ? wrapText(annotation.rationale, contentWidth).map((text) => ({
          kind: "rationale" as const,
          text,
        }))
      : []),
  ];

  if (annotation.source === "user-draft") {
    // Title cap + connector + five-line body + button footer.
    return 11;
  }

  // top border + title row + body lines + bottom border
  return 3 + lines.length;
}

/** Render the note card itself before the start of an annotated range. */
export function AgentInlineNote({
  annotation,
  anchorSide,
  file,
  layout,
  noteCount = 1,
  noteIndex = 0,
  draft,
  onClose,
  theme,
  width,
}: {
  annotation: AgentAnnotation;
  anchorSide?: "old" | "new";
  file?: DiffFile;
  layout: Exclude<LayoutMode, "auto">;
  noteCount?: number;
  noteIndex?: number;
  draft?: {
    body: string;
    focused: boolean;
    onCancel: () => void;
    onInput: (value: string) => void;
    onSave: () => void;
  };
  onClose?: () => void;
  theme: AppTheme;
  width: number;
}) {
  const closeText = onClose ? "[x]" : "";
  const titleSeparator = annotation.source === "user-draft" ? " - " : " · ";
  const titleText = `${inlineNoteTitle(annotation, noteIndex, noteCount)}${titleSeparator}${annotationRangeLabel(annotation, file)}`;
  const splitWidths = splitColumnWidths(width);
  const canDockRight = layout === "split" && anchorSide === "new" && width >= 84;
  const canDockLeft = layout === "split" && anchorSide === "old" && width >= 84;
  const preferredDockWidth = canDockRight
    ? splitWidths.rightWidth
    : canDockLeft
      ? splitWidths.leftWidth
      : Math.max(34, width - 4);
  const boxWidth = clamp(preferredDockWidth, 28, Math.max(28, width - 4));
  const boxLeft = canDockRight
    ? Math.max(0, width - boxWidth)
    : canDockLeft
      ? 0
      : Math.min(4, Math.max(0, width - boxWidth));
  const innerWidth = Math.max(1, boxWidth - 2);
  const titleSidePadding = 1;
  const closeGapWidth = closeText ? 1 : 0;
  const closeWidth = closeText.length;
  const titleWidth = Math.max(1, innerWidth - titleSidePadding * 2 - closeGapWidth - closeWidth);
  const bodyWidth = innerWidth;
  const contentWidth = Math.max(1, bodyWidth - 2);
  const lines: AgentInlineNoteLine[] = [
    ...wrapText(annotation.summary, contentWidth).map((text) => ({
      kind: "summary" as const,
      text,
    })),
    ...(annotation.rationale
      ? wrapText(annotation.rationale, contentWidth).map((text) => ({
          kind: "rationale" as const,
          text,
        }))
      : []),
  ];
  const topBorder = `┌${"─".repeat(Math.max(0, boxWidth - 2))}┐`;
  const bottomBorder =
    anchorSide === "new" && canDockRight
      ? `└${"─".repeat(Math.max(0, boxWidth - 2))}┤`
      : anchorSide === "old" && canDockLeft
        ? `├${"─".repeat(Math.max(0, boxWidth - 2))}┘`
        : `└${"─".repeat(Math.max(0, boxWidth - 2))}┘`;

  if (draft) {
    const draftBodyRows = 5;
    const draftTitleBoxWidth = clamp(titleText.length + 4, 16, boxWidth);
    const draftInnerWidth = Math.max(1, boxWidth - 2);
    const draftContentWidth = Math.max(1, draftInnerWidth - 2);
    const connectorRightWidth = Math.max(0, boxWidth - draftTitleBoxWidth - 1);
    const saveInnerWidth = 6;
    const cancelInnerWidth = 8;
    const footerRemainderWidth = Math.max(
      0,
      boxWidth - (1 + saveInnerWidth + 1 + cancelInnerWidth + 1 + 1),
    );
    const footerWidth = 1 + saveInnerWidth + 1 + cancelInnerWidth + 1;
    const draftTopBorder = `┌${"─".repeat(Math.max(0, draftTitleBoxWidth - 2))}┐`;
    const draftConnector = `├${"─".repeat(Math.max(0, draftTitleBoxWidth - 2))}┴${"─".repeat(connectorRightWidth)}┐`;
    const draftActionBorder = `├${"─".repeat(saveInnerWidth)}┬${"─".repeat(cancelInnerWidth)}┬${"─".repeat(footerRemainderWidth)}┘`;
    const draftButtonBottom = `└${"─".repeat(saveInnerWidth)}┴${"─".repeat(cancelInnerWidth)}┘`;

    return (
      <box style={{ width: "100%", flexDirection: "column", backgroundColor: theme.panel }}>
        <box
          style={{ width: "100%", height: 1, flexDirection: "row", backgroundColor: theme.panel }}
        >
          <box style={{ width: boxLeft, height: 1, backgroundColor: theme.panel }}>
            <text>{" ".repeat(boxLeft)}</text>
          </box>
          <box style={{ width: draftTitleBoxWidth, height: 1, backgroundColor: theme.panel }}>
            <text fg={theme.noteBorder} bg={theme.noteBackground}>
              {draftTopBorder}
            </text>
          </box>
        </box>

        <box
          style={{ width: "100%", height: 1, flexDirection: "row", backgroundColor: theme.panel }}
        >
          <box style={{ width: boxLeft, height: 1, backgroundColor: theme.panel }}>
            <text>{" ".repeat(boxLeft)}</text>
          </box>
          <box style={{ width: 1, height: 1, backgroundColor: theme.panel }}>
            <text fg={theme.noteBorder} bg={theme.noteBackground}>
              │
            </text>
          </box>
          <box
            style={{
              width: Math.max(0, draftTitleBoxWidth - 2),
              height: 1,
              backgroundColor: theme.panel,
            }}
          >
            <text fg={theme.noteTitleText} bg={theme.noteTitleBackground}>
              {padText(fitText(` ${titleText} `, draftTitleBoxWidth - 2), draftTitleBoxWidth - 2)}
            </text>
          </box>
          <box style={{ width: 1, height: 1, backgroundColor: theme.panel }}>
            <text fg={theme.noteBorder} bg={theme.noteBackground}>
              │
            </text>
          </box>
        </box>

        <box
          style={{ width: "100%", height: 1, flexDirection: "row", backgroundColor: theme.panel }}
        >
          <box style={{ width: boxLeft, height: 1, backgroundColor: theme.panel }}>
            <text>{" ".repeat(boxLeft)}</text>
          </box>
          <box style={{ width: boxWidth, height: 1, backgroundColor: theme.panel }}>
            <text fg={theme.noteBorder} bg={theme.noteBackground}>
              {draftConnector}
            </text>
          </box>
        </box>

        {Array.from({ length: draftBodyRows }, (_, rowIndex) => (
          <box
            key={`draft-body:${rowIndex}`}
            style={{ width: "100%", height: 1, flexDirection: "row", backgroundColor: theme.panel }}
          >
            <box style={{ width: boxLeft, height: 1, backgroundColor: theme.panel }}>
              <text>{" ".repeat(boxLeft)}</text>
            </box>
            <box style={{ width: 1, height: 1, backgroundColor: theme.panel }}>
              <text fg={theme.noteBorder} bg={theme.noteBackground}>
                │
              </text>
            </box>
            <box style={{ width: 1, height: 1, backgroundColor: theme.noteBackground }}>
              <text bg={theme.noteBackground}> </text>
            </box>
            <box
              style={{ width: draftContentWidth, height: 1, backgroundColor: theme.noteBackground }}
            >
              {rowIndex === 0 ? (
                <input
                  width={draftContentWidth}
                  value={draft.body}
                  placeholder="Write a note…"
                  focused={draft.focused}
                  onInput={draft.onInput}
                  onSubmit={draft.onSave}
                  onKeyDown={(key) => {
                    if (isEscapeKey(key)) {
                      key.preventDefault();
                      key.stopPropagation();
                      draft.onCancel();
                      return;
                    }

                    if (key.ctrl && (key.name === "s" || key.sequence === "\u0013")) {
                      key.preventDefault();
                      key.stopPropagation();
                      draft.onSave();
                    }
                  }}
                />
              ) : (
                <text bg={theme.noteBackground}>{" ".repeat(draftContentWidth)}</text>
              )}
            </box>
            <box style={{ width: 1, height: 1, backgroundColor: theme.noteBackground }}>
              <text bg={theme.noteBackground}> </text>
            </box>
            <box style={{ width: 1, height: 1, backgroundColor: theme.panel }}>
              <text fg={theme.noteBorder} bg={theme.noteBackground}>
                │
              </text>
            </box>
          </box>
        ))}

        <box
          style={{ width: "100%", height: 1, flexDirection: "row", backgroundColor: theme.panel }}
        >
          <box style={{ width: boxLeft, height: 1, backgroundColor: theme.panel }}>
            <text>{" ".repeat(boxLeft)}</text>
          </box>
          <box style={{ width: boxWidth, height: 1, backgroundColor: theme.panel }}>
            <text fg={theme.noteBorder} bg={theme.noteBackground}>
              {draftActionBorder}
            </text>
          </box>
        </box>

        <box
          style={{ width: "100%", height: 1, flexDirection: "row", backgroundColor: theme.panel }}
        >
          <box style={{ width: boxLeft, height: 1, backgroundColor: theme.panel }}>
            <text>{" ".repeat(boxLeft)}</text>
          </box>
          <box style={{ width: 1, height: 1, backgroundColor: theme.panel }}>
            <text fg={theme.noteBorder} bg={theme.noteBackground}>
              │
            </text>
          </box>
          <box onMouseUp={draft.onSave} style={{ width: saveInnerWidth, height: 1 }}>
            <text fg={theme.noteTitleText} bg={theme.noteTitleBackground}>
              {padText(" Save", saveInnerWidth)}
            </text>
          </box>
          <box style={{ width: 1, height: 1, backgroundColor: theme.panel }}>
            <text fg={theme.noteBorder} bg={theme.noteBackground}>
              │
            </text>
          </box>
          <box onMouseUp={draft.onCancel} style={{ width: cancelInnerWidth, height: 1 }}>
            <text fg={theme.noteTitleText} bg={theme.noteBackground}>
              {padText(" Cancel", cancelInnerWidth)}
            </text>
          </box>
          <box style={{ width: 1, height: 1, backgroundColor: theme.panel }}>
            <text fg={theme.noteBorder} bg={theme.noteBackground}>
              │
            </text>
          </box>
        </box>

        <box
          style={{ width: "100%", height: 1, flexDirection: "row", backgroundColor: theme.panel }}
        >
          <box style={{ width: boxLeft, height: 1, backgroundColor: theme.panel }}>
            <text>{" ".repeat(boxLeft)}</text>
          </box>
          <box style={{ width: footerWidth, height: 1, backgroundColor: theme.panel }}>
            <text fg={theme.noteBorder} bg={theme.noteBackground}>
              {draftButtonBottom}
            </text>
          </box>
        </box>
      </box>
    );
  }

  return (
    <box style={{ width: "100%", flexDirection: "column", backgroundColor: theme.panel }}>
      <box style={{ width: "100%", height: 1, flexDirection: "row", backgroundColor: theme.panel }}>
        <box style={{ width: boxLeft, height: 1, backgroundColor: theme.panel }}>
          <text>{" ".repeat(boxLeft)}</text>
        </box>
        <box style={{ width: boxWidth, height: 1, backgroundColor: theme.panel }}>
          <text fg={theme.noteBorder} bg={theme.noteBackground}>
            {topBorder}
          </text>
        </box>
      </box>

      <box style={{ width: "100%", height: 1, flexDirection: "row", backgroundColor: theme.panel }}>
        <box style={{ width: boxLeft, height: 1, backgroundColor: theme.panel }}>
          <text>{" ".repeat(boxLeft)}</text>
        </box>
        <box style={{ width: 1, height: 1, backgroundColor: theme.panel }}>
          <text fg={theme.noteBorder} bg={theme.noteBackground}>
            │
          </text>
        </box>
        <box style={{ width: titleSidePadding, height: 1, backgroundColor: theme.panel }}>
          <text bg={theme.noteBackground}>{" ".repeat(titleSidePadding)}</text>
        </box>
        <box style={{ width: titleWidth, height: 1, backgroundColor: theme.panel }}>
          <text fg={theme.noteTitleText} bg={theme.noteTitleBackground}>
            {padText(fitText(titleText, titleWidth), titleWidth)}
          </text>
        </box>
        {closeText ? (
          <box style={{ width: closeGapWidth, height: 1, backgroundColor: theme.panel }}>
            <text bg={theme.noteBackground}>{" ".repeat(closeGapWidth)}</text>
          </box>
        ) : null}
        {closeText ? (
          <box
            onMouseUp={onClose}
            style={{ width: closeWidth, height: 1, backgroundColor: theme.panel }}
          >
            <text fg={theme.noteTitleText} bg={theme.noteTitleBackground}>
              {closeText}
            </text>
          </box>
        ) : null}
        <box style={{ width: titleSidePadding, height: 1, backgroundColor: theme.panel }}>
          <text bg={theme.noteBackground}>{" ".repeat(titleSidePadding)}</text>
        </box>
        <box style={{ width: 1, height: 1, backgroundColor: theme.panel }}>
          <text fg={theme.noteBorder} bg={theme.noteBackground}>
            │
          </text>
        </box>
      </box>

      {lines.map((line, index) => (
        <box
          key={`${line.kind}:${index}`}
          style={{ width: "100%", height: 1, flexDirection: "row", backgroundColor: theme.panel }}
        >
          <box style={{ width: boxLeft, height: 1, backgroundColor: theme.panel }}>
            <text>{" ".repeat(boxLeft)}</text>
          </box>
          <box style={{ width: 1, height: 1, backgroundColor: theme.panel }}>
            <text fg={theme.noteBorder} bg={theme.noteBackground}>
              │
            </text>
          </box>
          <box style={{ width: 1, height: 1, backgroundColor: theme.noteBackground }}>
            <text bg={theme.noteBackground}> </text>
          </box>
          <box style={{ width: contentWidth, height: 1, backgroundColor: theme.panel }}>
            <text fg={line.kind === "summary" ? theme.text : theme.muted} bg={theme.noteBackground}>
              {padText(line.text, contentWidth)}
            </text>
          </box>
          <box style={{ width: 1, height: 1, backgroundColor: theme.noteBackground }}>
            <text bg={theme.noteBackground}> </text>
          </box>
          <box style={{ width: 1, height: 1, backgroundColor: theme.panel }}>
            <text fg={theme.noteBorder} bg={theme.noteBackground}>
              │
            </text>
          </box>
        </box>
      ))}

      <box style={{ width: "100%", height: 1, flexDirection: "row", backgroundColor: theme.panel }}>
        <box style={{ width: boxLeft, height: 1, backgroundColor: theme.panel }}>
          <text>{" ".repeat(boxLeft)}</text>
        </box>
        <box style={{ width: boxWidth, height: 1, backgroundColor: theme.panel }}>
          <text fg={theme.noteBorder} bg={theme.noteBackground}>
            {bottomBorder}
          </text>
        </box>
      </box>
    </box>
  );
}
