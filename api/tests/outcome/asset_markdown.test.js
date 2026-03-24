import { afterEach, describe, expect, it } from "vitest";

import { renderOutcomeAssetMarkdown } from "../../lib/outcome/asset_markdown.js";

const originalAppPublicUrl = process.env.APP_PUBLIC_URL;

afterEach(() => {
  process.env.APP_PUBLIC_URL = originalAppPublicUrl;
});

describe("renderOutcomeAssetMarkdown", () => {
  it("renders required sections, tree link, and deduped sources", () => {
    const markdown = renderOutcomeAssetMarkdown({
      outcome: {
        title: "成果A",
        conclusion: "这是核心结论",
        report_json: {
          sections: [
            { text: "第一步：观察问题", sources: ["node:n1", "turn:t1"] },
            { text: "第二步：形成方案", sources: ["node:n1", "keyframe:k1", "outcome:o1"] },
          ],
        },
      },
      treeId: "tree-1",
      anchorNodeId: "node-1",
      appBaseUrl: "https://app.omytree.com/",
    });

    expect(markdown).toContain("# 成果A");
    expect(markdown).toContain("## 核心结论");
    expect(markdown).toContain("这是核心结论");
    expect(markdown).toContain("## 过程要点（可溯源）");
    expect(markdown).toContain("第一步：观察问题");
    expect(markdown).toContain("第二步：形成方案");
    expect(markdown).toContain("## 回到 oMyTree");
    expect(markdown).toContain("- https://app.omytree.com/app/tree/tree-1?node=node-1");
    expect(markdown).toContain("## sources（machine-readable）");
    expect(markdown).toContain("- node:n1");
    expect(markdown).toContain("- turn:t1");
    expect(markdown).toContain("- keyframe:k1");
    expect(markdown).toContain("- outcome:o1");
    expect((markdown.match(/- node:n1/g) || []).length).toBe(1);
  });

  it("handles missing sections and empty sources with placeholders", () => {
    process.env.APP_PUBLIC_URL = "https://public.omytree.com/";

    const markdown = renderOutcomeAssetMarkdown({
      outcome: {
        title: "",
        conclusion: "",
        anchor_node_id: "anchor-from-outcome",
        report_json: {},
      },
      treeId: "tree-2",
      appBaseUrl: "",
    });

    expect(markdown).toContain("# Untitled Outcome");
    expect(markdown).toContain("## 核心结论");
    expect(markdown).toContain("（无结论）");
    expect(markdown).toContain("## 过程要点（可溯源）");
    expect(markdown).toContain("（暂无过程要点）");
    expect(markdown).toContain("## 回到 oMyTree");
    expect(markdown).toContain("- https://public.omytree.com/app/tree/tree-2?node=anchor-from-outcome");
    expect(markdown).toContain("## sources（machine-readable）");
    expect(markdown).toContain("- (none)");
  });

  it("truncates long process section to stay within 200KB", () => {
    const longText = "A".repeat(280000);

    const markdown = renderOutcomeAssetMarkdown({
      outcome: {
        title: "超长成果",
        conclusion: "结论",
        report_json: {
          sections: [{ text: longText, sources: ["node:big-node"] }],
        },
      },
      treeId: "tree-long",
      anchorNodeId: "node-long",
      appBaseUrl: "https://app.omytree.com",
    });

    expect(Buffer.byteLength(markdown, "utf8")).toBeLessThanOrEqual(200 * 1024);
    expect(markdown).toContain("...(truncated)");
    expect(markdown).toContain("...(truncated)\n\n## 回到 oMyTree");
    expect(markdown).toContain("## sources（machine-readable）");
  });

  it("never throws on malformed report_json", () => {
    expect(() =>
      renderOutcomeAssetMarkdown({
        outcome: {
          title: "异常报告",
          conclusion: null,
          report_json: "{bad-json",
        },
        treeId: "tree-safe",
        anchorNodeId: "node-safe",
      })
    ).not.toThrow();
  });
});
