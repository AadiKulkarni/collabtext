import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useCollabDoc } from "../hooks/useCollabDoc.js";
import { colorForClient } from "../utils/colors.js";
import "./Editor.css";

const DEFAULT_WS_URL =
  (import.meta.env.VITE_WS_URL as string | undefined) ?? "ws://localhost:8080";

export interface EditorProps {
  wsUrl?: string;
}

export function Editor({ wsUrl = DEFAULT_WS_URL }: EditorProps) {
  const {
    text,
    presence,
    status,
    clientId,
    remoteCursors,
    ready,
    handleTextChange,
    handleCaretChange,
  } = useCollabDoc({ url: wsUrl });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLPreElement>(null);

  const others = useMemo(
    () => presence.filter((id) => id !== clientId),
    [presence, clientId],
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!textarea || !mirror) {
      return;
    }
    const syncScroll = (): void => {
      mirror.scrollTop = textarea.scrollTop;
      mirror.scrollLeft = textarea.scrollLeft;
    };
    textarea.addEventListener("scroll", syncScroll);
    return () => textarea.removeEventListener("scroll", syncScroll);
  }, []);

  return (
    <div className="editor-shell">
      <header className="editor-header">
        <div className="brand">CollabText</div>
        <div className={`status status-${status}`} data-testid="connection-status">
          {status}
        </div>
      </header>

      <div className="presence" data-testid="presence-list">
        {presence.map((id) => (
          <span
            key={id}
            className="presence-chip"
            style={{ borderColor: colorForClient(id) }}
            title={id}
          >
            <span
              className="presence-dot"
              style={{ background: colorForClient(id) }}
            />
            {id === clientId ? "you" : id.slice(0, 8)}
          </span>
        ))}
      </div>

      <div className="editor-stage">
        <pre className="editor-mirror" ref={mirrorRef} aria-hidden>
          {renderWithCursors(text, remoteCursors, others)}
        </pre>
        <textarea
          ref={textareaRef}
          className="editor-input"
          value={text}
          disabled={!ready}
          spellCheck={false}
          onChange={(event) => {
            const next = event.target.value;
            const caret = event.target.selectionStart ?? next.length;
            handleTextChange(next, caret);
          }}
          onSelect={(event) => {
            const target = event.target as HTMLTextAreaElement;
            handleCaretChange(target.selectionStart ?? 0);
          }}
          onKeyUp={(event) => {
            const target = event.target as HTMLTextAreaElement;
            handleCaretChange(target.selectionStart ?? 0);
          }}
          placeholder={ready ? "Start typing…" : "Connecting…"}
          data-testid="editor-input"
        />
      </div>
    </div>
  );
}

function renderWithCursors(
  text: string,
  cursors: { clientId: string; index: number }[],
  visibleIds: string[],
): ReactNode {
  const relevant = cursors.filter((c) => visibleIds.includes(c.clientId));
  if (relevant.length === 0) {
    return text.length === 0 ? " " : text;
  }

  const marks = [...relevant].sort((a, b) => a.index - b.index);
  const parts: ReactNode[] = [];
  let cursor = 0;
  marks.forEach((mark, i) => {
    const index = Math.max(0, Math.min(text.length, mark.index));
    if (index > cursor) {
      parts.push(text.slice(cursor, index));
    }
    parts.push(
      <span
        key={`${mark.clientId}-${i}`}
        className="remote-caret"
        style={{ background: colorForClient(mark.clientId) }}
      />,
    );
    cursor = index;
  });
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }
  if (parts.length === 0) {
    return " ";
  }
  return parts;
}
