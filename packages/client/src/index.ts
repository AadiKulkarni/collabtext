/**
 * @collabtext/client — React UI for CollabText.
 *
 * Owns the editor surface, sync client, and presence UI. Local keystrokes
 * become RGA operations via @collabtext/crdt; remote operations arrive over
 * WebSocket and are applied through the same CRDT so all clients converge.
 */

export { Editor } from "./components/Editor.js";
export { useCollabDoc } from "./hooks/useCollabDoc.js";
export { SyncClient } from "./sync/SyncClient.js";
