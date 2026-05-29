import { describe, expect, it } from "vitest";
import { chunkSourceFiles, extractEndpointLocations, extractEndpointSignals } from "@/server/chunker";

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

  it("extracts Express endpoint locations with HTTP methods", () => {
    expect(extractEndpointLocations("app.get('/tasks/:taskId/intervention-plan', handler)", "src/api/server.ts")).toEqual([
      {
        path: "src/api/server.ts",
        endpoint: { method: "GET", path: "/tasks/:taskId/intervention-plan" },
      },
    ]);
  });

  it("extracts Next.js App Router route handlers with methods", () => {
    expect(
      extractEndpointSignals(
        "export async function GET() {}\nexport async function POST() {}",
        "src/app/api/analyses/route.ts",
      ),
    ).toEqual(["GET /api/analyses", "POST /api/analyses"]);
  });

  it("converts Next.js dynamic and catch-all segments", () => {
    expect(extractEndpointSignals("export async function GET() {}", "src/app/api/analyses/[id]/route.ts")).toEqual([
      "GET /api/analyses/:id",
    ]);
    expect(extractEndpointSignals("export async function GET() {}", "src/app/api/users/[...slug]/route.ts")).toEqual([
      "GET /api/users/:slug*",
    ]);
  });
});
