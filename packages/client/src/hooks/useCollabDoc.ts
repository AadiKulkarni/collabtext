/**
 * useCollabDoc — React hook owning SyncClient + local RGA editing.
 *
 * Keystrokes become real RGA insert/delete ops with correct leftOrigin /
 * targetId derived from the visible caret index. That mapping is what makes
 * multi-caret collaborative editing converge; a simplified "replace whole
 * string" approach would break the CRDT guarantees.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionStatus } from "../sync/protocol.js";
import { SyncClient } from "../sync/SyncClient.js";

export interface RemoteCursor {
  clientId: string;
  index: number;
}

export interface UseCollabDocResult {
  text: string;
  presence: string[];
  status: ConnectionStatus;
  clientId: string | null;
  remoteCursors: RemoteCursor[];
  ready: boolean;
  handleTextChange: (next: string, caretAfter: number) => void;
  handleCaretChange: (index: number) => void;
}

export interface UseCollabDocOptions {
  url: string;
  /** Optional pre-built client (tests). */
  client?: SyncClient;
  autoConnect?: boolean;
}

export function useCollabDoc(options: UseCollabDocOptions): UseCollabDocResult {
  const clientRef = useRef<SyncClient | null>(options.client ?? null);
  if (clientRef.current === null) {
    clientRef.current = new SyncClient({ url: options.url });
  }
  const client = clientRef.current;

  const [text, setText] = useState(client.getText());
  const [presence, setPresence] = useState<string[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>(client.getStatus());
  const [clientId, setClientId] = useState<string | null>(client.getClientId());
  const [ready, setReady] = useState(client.isReady());
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([]);

  useEffect(() => {
    const unsubDoc = client.onDocumentChange(setText);
    const unsubPresence = client.onPresenceChange(setPresence);
    const unsubStatus = client.onStatusChange(setStatus);
    const unsubReady = client.onReadyChange((isReady) => {
      setReady(isReady);
      setClientId(client.getClientId());
    });
    const unsubCursor = client.onCursorChange((id, index) => {
      setRemoteCursors((prev) => {
        const others = prev.filter((c) => c.clientId !== id);
        return [...others, { clientId: id, index }];
      });
    });

    if (options.autoConnect !== false && !options.client) {
      client.connect();
    }

    return () => {
      unsubDoc();
      unsubPresence();
      unsubStatus();
      unsubReady();
      unsubCursor();
      if (!options.client) {
        client.disconnect();
      }
    };
  }, [client, options.autoConnect, options.client]);

  const handleTextChange = useCallback(
    (next: string, caretAfter: number) => {
      const rga = client.getRga();
      if (!rga) {
        return;
      }
      const current = rga.toString();
      if (next === current) {
        return;
      }

      // Diff current vs next around the caret to emit proper insert/delete ops.
      // Prefer single-char insert/backspace (the common typing path).
      if (next.length === current.length + 1) {
        const insertAt = caretAfter - 1;
        if (insertAt >= 0 && insertAt <= current.length) {
          const prefix = current.slice(0, insertAt);
          const suffix = current.slice(insertAt);
          const inserted = next.slice(insertAt, insertAt + 1);
          if (next === prefix + inserted + suffix && inserted.length === 1) {
            const leftOrigin = rga.leftOriginAtVisibleIndex(insertAt);
            const op = rga.insert(leftOrigin, inserted);
            client.sendLocalOperation(op);
            client.sendCursor(caretAfter);
            return;
          }
        }
      }

      if (next.length === current.length - 1) {
        const deleteAt = caretAfter;
        if (deleteAt >= 0 && deleteAt < current.length) {
          const prefix = current.slice(0, deleteAt);
          const removed = current.slice(deleteAt, deleteAt + 1);
          const suffix = current.slice(deleteAt + 1);
          if (next === prefix + suffix && removed.length === 1) {
            const targetId = rga.targetIdBeforeVisibleIndex(deleteAt + 1);
            if (targetId) {
              const op = rga.delete(targetId);
              client.sendLocalOperation(op);
              client.sendCursor(caretAfter);
              return;
            }
          }
        }
      }

      // Fallback for paste / multi-char edits: delete then re-insert by walking
      // a simple LCP/LCS-style prefix/suffix trim.
      let start = 0;
      while (
        start < current.length &&
        start < next.length &&
        current[start] === next[start]
      ) {
        start += 1;
      }
      let endCurrent = current.length;
      let endNext = next.length;
      while (
        endCurrent > start &&
        endNext > start &&
        current[endCurrent - 1] === next[endNext - 1]
      ) {
        endCurrent -= 1;
        endNext -= 1;
      }

      for (let i = endCurrent - 1; i >= start; i -= 1) {
        const targetId = rga.targetIdBeforeVisibleIndex(i + 1);
        if (targetId) {
          const op = rga.delete(targetId);
          client.sendLocalOperation(op);
        }
      }

      let leftOrigin = rga.leftOriginAtVisibleIndex(start);
      for (let i = start; i < endNext; i += 1) {
        const char = next[i];
        if (char === undefined) {
          continue;
        }
        const op = rga.insert(leftOrigin, char);
        client.sendLocalOperation(op);
        leftOrigin = op.id;
      }
      client.sendCursor(caretAfter);
    },
    [client],
  );

  const handleCaretChange = useCallback(
    (index: number) => {
      client.sendCursor(index);
    },
    [client],
  );

  return {
    text,
    presence,
    status,
    clientId,
    remoteCursors,
    ready,
    handleTextChange,
    handleCaretChange,
  };
}
