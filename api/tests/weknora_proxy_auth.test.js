import { describe, expect, it, vi } from "vitest";

describe("weknora proxy auth", () => {
  it("throws workspace_weknora_key_missing when no api key provided", async () => {
    const { requestWeKnoraJson } = await import("../routes/knowledge/proxy.js");
    let err = null;
    try {
      await requestWeKnoraJson({
        method: "GET",
        path: "/knowledge-bases",
        res: { locals: {} },
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeTruthy();
    expect(err.code).toBe("workspace_weknora_key_missing");
  });

  it("accepts explicit X-API-Key header", async () => {
    const { requestWeKnoraJson } = await import("../routes/knowledge/proxy.js");
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const data = await requestWeKnoraJson({
      method: "GET",
      path: "/knowledge-bases",
      headers: { "X-API-Key": "sk-test" },
      res: { locals: {} },
    });
    expect(Array.isArray(data)).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });
});

