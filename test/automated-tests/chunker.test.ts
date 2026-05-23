import { describe, expect, it } from "vitest";
import { chunkSourceFiles, extractEndpointSignals } from "@/server/chunker";

describe("chunkSourceFiles", () => {
  it("keeps short files as a single chunk", () => {
    const chunks = chunkSourceFiles([
      {
        path: "src/routes.ts",
        language: "TypeScript",
        text: "router.get('/users', handler);",
      },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].startLine).toBe(1);
  });
});

describe("extractEndpointSignals", () => {
  it("extracts method/path style endpoints", () => {
    expect(extractEndpointSignals("GET /users\nPOST /auth/login")).toEqual([
      "/auth/login",
      "/users",
    ]);
  });

  it("extracts router endpoints", () => {
    expect(extractEndpointSignals("router.post('/api/items', createItem)")).toEqual([
      "/api/items",
    ]);
  });
});
