import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["prisma/testing/**/*.test.ts"],
    fileParallelism: false,
    pool: "forks",
    maxWorkers: 1,
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
