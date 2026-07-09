import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@collabtext/crdt": path.resolve(rootDir, "../crdt/src/index.ts"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
  },
});
