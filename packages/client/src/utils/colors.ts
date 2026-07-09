/**
 * Stable color assignment for presence / remote cursors.
 * Hashing the clientId keeps a user's color consistent across re-renders
 * without storing a palette on the server.
 */

const PALETTE = [
  "#c45c26",
  "#2f6f4e",
  "#1f4e79",
  "#8b3a3a",
  "#6b4c9a",
  "#b8860b",
  "#0e7c7b",
  "#a14a6b",
];

export function colorForClient(clientId: string): string {
  let hash = 0;
  for (let i = 0; i < clientId.length; i += 1) {
    hash = (hash * 31 + clientId.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length] ?? PALETTE[0]!;
}
