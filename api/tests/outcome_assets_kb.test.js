import { beforeEach, describe, expect, it, vi } from "vitest";

const requestWeKnoraJsonMock = vi.fn();
vi.mock("../routes/knowledge/proxy.js", () => ({
  requestWeKnoraJson: requestWeKnoraJsonMock,
}));

describe("outcome assets knowledge base helper", () => {
  beforeEach(() => {
    requestWeKnoraJsonMock.mockReset();
  });

  it("returns existing workspace outcome_kb_id directly", async () => {
    const { ensureOutcomeAssetsKnowledgeBase } = await import("../services/knowledge/outcome_assets_kb.js");

    const query = vi.fn().mockResolvedValueOnce({
      rows: [{ outcome_kb_id: "kb-existing" }],
    });
    const fakePg = { query };

    const result = await ensureOutcomeAssetsKnowledgeBase({
      pg: fakePg,
      res: { locals: { weknoraApiKey: "sk-test" } },
      workspaceId: "11111111-1111-4111-8111-111111111111",
    });

    expect(result).toEqual({ knowledgeBaseId: "kb-existing", created: false });
    expect(query).toHaveBeenCalledTimes(1);
    expect(requestWeKnoraJsonMock).not.toHaveBeenCalled();
  });

  it("reuses existing WeKnora base by fixed name and persists outcome_kb_id", async () => {
    const { ensureOutcomeAssetsKnowledgeBase, OUTCOME_ASSETS_KB_NAME } = await import(
      "../services/knowledge/outcome_assets_kb.js"
    );

    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ outcome_kb_id: null }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const fakePg = { query };

    requestWeKnoraJsonMock.mockResolvedValueOnce([
      { id: "kb-other", name: "其它库" },
      { id: "kb-assets", name: OUTCOME_ASSETS_KB_NAME },
    ]);

    const result = await ensureOutcomeAssetsKnowledgeBase({
      pg: fakePg,
      res: { locals: { weknoraApiKey: "sk-test" } },
      workspaceId: "22222222-2222-4222-8222-222222222222",
    });

    expect(result).toEqual({ knowledgeBaseId: "kb-assets", created: false });
    expect(requestWeKnoraJsonMock).toHaveBeenCalledTimes(1);
    expect(requestWeKnoraJsonMock).toHaveBeenCalledWith({
      method: "GET",
      path: "/knowledge-bases",
      res: { locals: { weknoraApiKey: "sk-test" } },
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain("UPDATE workspaces");
    expect(query.mock.calls[1][1]).toEqual(["kb-assets", "22222222-2222-4222-8222-222222222222"]);
  });

  it("creates fixed outcome assets base when not found and persists outcome_kb_id", async () => {
    const {
      ensureOutcomeAssetsKnowledgeBase,
      OUTCOME_ASSETS_KB_NAME,
      OUTCOME_ASSETS_KB_DESCRIPTION,
    } = await import("../services/knowledge/outcome_assets_kb.js");

    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ outcome_kb_id: "" }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const fakePg = { query };

    requestWeKnoraJsonMock
      .mockResolvedValueOnce([{ id: "kb-1", name: "普通知识库" }])
      .mockResolvedValueOnce({ id: "kb-assets-created" });

    const res = { locals: { weknoraApiKey: "sk-test" } };
    const result = await ensureOutcomeAssetsKnowledgeBase({
      pg: fakePg,
      res,
      workspaceId: "33333333-3333-4333-8333-333333333333",
    });

    expect(result).toEqual({ knowledgeBaseId: "kb-assets-created", created: true });
    expect(requestWeKnoraJsonMock).toHaveBeenCalledTimes(2);
    expect(requestWeKnoraJsonMock.mock.calls[0][0]).toEqual({
      method: "GET",
      path: "/knowledge-bases",
      res,
    });
    expect(requestWeKnoraJsonMock.mock.calls[1][0]).toEqual({
      method: "POST",
      path: "/knowledge-bases",
      body: {
        name: OUTCOME_ASSETS_KB_NAME,
        description: OUTCOME_ASSETS_KB_DESCRIPTION,
      },
      res,
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][1]).toEqual(["kb-assets-created", "33333333-3333-4333-8333-333333333333"]);
  });

  it("throws WORKSPACE_NOT_FOUND when workspace does not exist", async () => {
    const { ensureOutcomeAssetsKnowledgeBase } = await import("../services/knowledge/outcome_assets_kb.js");

    const query = vi.fn().mockResolvedValueOnce({ rows: [] });

    await expect(
      ensureOutcomeAssetsKnowledgeBase({
        pg: { query },
        res: { locals: { weknoraApiKey: "sk-test" } },
        workspaceId: "44444444-4444-4444-8444-444444444444",
      })
    ).rejects.toMatchObject({
      status: 404,
      code: "WORKSPACE_NOT_FOUND",
    });

    expect(requestWeKnoraJsonMock).not.toHaveBeenCalled();
  });

  it("bubbles upstream WeKnora key errors", async () => {
    const { ensureOutcomeAssetsKnowledgeBase } = await import("../services/knowledge/outcome_assets_kb.js");

    const query = vi.fn().mockResolvedValueOnce({ rows: [{ outcome_kb_id: null }] });
    requestWeKnoraJsonMock.mockRejectedValueOnce({
      status: 500,
      code: "workspace_weknora_key_missing",
      message: "workspace WeKnora api key is not configured",
    });

    await expect(
      ensureOutcomeAssetsKnowledgeBase({
        pg: { query },
        res: { locals: {} },
        workspaceId: "55555555-5555-4555-8555-555555555555",
      })
    ).rejects.toMatchObject({
      status: 500,
      code: "workspace_weknora_key_missing",
    });
  });

  it("throws INVALID_WORKSPACE_ID on malformed workspaceId", async () => {
    const { ensureOutcomeAssetsKnowledgeBase } = await import("../services/knowledge/outcome_assets_kb.js");

    await expect(
      ensureOutcomeAssetsKnowledgeBase({
        pg: { query: vi.fn() },
        res: { locals: { weknoraApiKey: "sk-test" } },
        workspaceId: "not-a-uuid",
      })
    ).rejects.toMatchObject({
      status: 422,
      code: "INVALID_WORKSPACE_ID",
    });
  });
});
