import { describe, expect, it, vi } from "vitest";

const requestWeKnoraJsonMock = vi.fn(async () => []);
vi.mock("../routes/knowledge/proxy.js", () => ({
  requestWeKnoraJson: requestWeKnoraJsonMock,
}));

describe("knowledge search service weknora headers", () => {
  it("passes X-API-Key into requestWeKnoraJson", async () => {
    const { searchKnowledgeBase, searchKnowledgeBases } = await import(
      "../services/knowledge/search_service.js"
    );

    await searchKnowledgeBase("kb-1", "hello", { topK: 1, weknoraApiKey: "sk-abc" });
    expect(requestWeKnoraJsonMock).toHaveBeenCalled();
    expect(requestWeKnoraJsonMock.mock.calls[0][0].headers["X-API-Key"]).toBe("sk-abc");

    requestWeKnoraJsonMock.mockClear();
    await searchKnowledgeBases(["kb-1", "kb-2"], "hello", 2, { weknoraApiKey: "sk-xyz" });
    expect(requestWeKnoraJsonMock).toHaveBeenCalled();
    expect(requestWeKnoraJsonMock.mock.calls[0][0].headers["X-API-Key"]).toBe("sk-xyz");
  });
});
