#!/usr/bin/env node
/**
 * T26-0: Seed initial documentation into site_docs table
 * 
 * This script migrates the old static docs content into the database.
 * Run: node api/scripts/seed_docs.js
 */

import pg from "pg";
import { randomUUID } from "crypto";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.PG_DSN || "postgres://omytree:test_password@127.0.0.1:5432/omytree",
});

const docs = [
  {
    title: "Conversation as a Growing Tree",
    slug: "conversation-as-a-growing-tree",
    summary: "Turn long AI chats into a visual tree you can replay, branch, export, and share.",
    lang: "en",
    content: `# What is oMyTree?

oMyTree is a conversation-to-tree learning tool. Every chat turns into a growing tree you can replay, branch, and share. It keeps the context of long AI conversations organized in a visual structure.

## Why a Conversation Tree?

Linear chats are easy to lose: you can't see structure, branches, or how you got here. A tree makes the root question, the main path, and side branches explicit. You can jump back, branch safely, and replay your reasoning later.

## How It Works (3 Steps)

1. **Start a tree with a question** — the first user prompt becomes the root.
2. **Ask & branch** — each new question/answer grows under the selected node.
3. **Replay and export** — switch Path vs Full History, view the tree, export JSON/Markdown, or share a readonly link.

## Key Features

- **Path view vs full history** (beta) — see only the current branch or the entire conversation.
- **Tree Drawer** with mini map, siblings, timeline, metrics, and learning report.
- **Export** as JSON or Markdown for backup or sharing.
- **Shareable readonly link** at \`/share/<token>\` and a public viewer (no auth required).

## FAQ

**Do I need an account?**
Yes, sign in to create and manage your own trees.

**Can others see my trees?**
By default trees are private; only shared links are viewable by others.

**Is this production-ready?**
Early-access demo; expect rapid changes as we iterate.

**Pricing?**
Still experimenting; current demo is free for early testers.

---

Ready to try? [Open the app →](/app)
`,
    status: "published",
  },
  {
    title: "Getting Started with oMyTree",
    slug: "getting-started",
    summary: "A quick guide to create your first conversation tree and explore its features.",
    lang: "en",
    content: `# Getting Started with oMyTree

Welcome! This guide will help you create your first conversation tree in just a few minutes.

## Step 1: Create Your Account

1. Click **Start Using** on the homepage
2. Enter your email and create a password
3. Check your inbox for the verification email (optional but recommended)

## Step 2: Start Your First Tree

1. After signing in, you'll see the **My Trees** panel
2. Click **New tree** to begin
3. Type your first question or prompt — this becomes the root of your tree

## Step 3: Build Your Tree

As you chat with the AI:
- Each message pair (your question + AI response) creates a new node
- Click any node in the tree to branch from that point
- Use the **Tree Drawer** to see the full structure

## Step 4: Explore Features

- **Path View**: See only the current conversation path
- **Full History**: View all branches and alternatives
- **Export**: Download as JSON or Markdown
- **Share**: Create a readonly link for others

## Tips for Power Users

- Use branching to explore multiple approaches to a problem
- The Tree Drawer shows siblings — alternative responses at the same level
- Export regularly to keep backups of important conversations

---

Questions? Check out our [full documentation](/docs) or start exploring!
`,
    status: "published",
  },
  {
    title: "使用 oMyTree 开始",
    slug: "getting-started",
    summary: "快速指南：创建你的第一棵对话树并探索其功能。",
    lang: "zh-CN",
    content: `# 使用 oMyTree 开始

欢迎！本指南将帮助你在几分钟内创建第一棵对话树。

## 第一步：创建账户

1. 点击首页的 **Start Using**
2. 输入邮箱并创建密码
3. 检查收件箱中的验证邮件（可选但推荐）

## 第二步：开始你的第一棵树

1. 登录后，你会看到 **My Trees** 面板
2. 点击 **New tree** 开始
3. 输入你的第一个问题或提示——这将成为树的根节点

## 第三步：构建你的树

在与 AI 对话时：
- 每对消息（你的问题 + AI 的回答）创建一个新节点
- 点击树中的任意节点从该点分支
- 使用 **Tree Drawer** 查看完整结构

## 第四步：探索功能

- **路径视图**：仅查看当前对话路径
- **完整历史**：查看所有分支和备选方案
- **导出**：下载为 JSON 或 Markdown
- **分享**：为他人创建只读链接

## 高级用户技巧

- 使用分支来探索解决问题的多种方法
- Tree Drawer 显示兄弟节点——同一层级的备选回复
- 定期导出以备份重要对话

---

有问题？查看我们的[完整文档](/docs)或开始探索！
`,
    status: "published",
  },
];

async function seedDocs() {
  const client = await pool.connect();
  try {
    console.log("🌱 Seeding documentation...\n");

    for (const doc of docs) {
      // Check if doc already exists (by slug + lang)
      const existing = await client.query(
        "SELECT id FROM site_docs WHERE slug = $1 AND lang = $2",
        [doc.slug, doc.lang]
      );

      if (existing.rows.length > 0) {
        console.log(`⏭️  Skipping "${doc.title}" (${doc.lang}) - already exists`);
        continue;
      }

      const id = randomUUID();
      await client.query(
        `INSERT INTO site_docs (id, title, slug, summary, content, lang, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
        [id, doc.title, doc.slug, doc.summary, doc.content, doc.lang, doc.status]
      );
      console.log(`✅ Created "${doc.title}" (${doc.lang})`);
    }

    console.log("\n🎉 Documentation seeding complete!");
  } catch (err) {
    console.error("❌ Failed to seed docs:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seedDocs();
