# oMyTree Whitepaper · Conversation as a Growing Tree

_Last updated: December 2025_

## 1. Motivation

Large language models have made it easy to **talk** to AI.  
What’s still hard is to **see how our thinking evolves** in these long conversations.

Typical problems:

- Long chats turn into endless scrollback; the path that led to a conclusion is hard to reconstruct.
- Side explorations mix with the main thread; context is easily lost.
- Sharing “what I learned” is difficult — you can’t point to a clear structure.
- Tools tend to optimize for single answers, not for **thinking over time**.

**oMyTree** explores a different direction:

> Treat every long AI conversation as a _growing tree of thought_ that can be visualized, replayed, and shared.

---

## 2. What is oMyTree?

oMyTree is a web application and backend engine that:

1. Turns each user–AI interaction into a **node** in a tree.  
2. Keeps a consistent distinction between the **root question**, the **main path**, and **side branches**.  
3. Allows users to **replay** the path to any node, **branch** safely from any step, and **export** the whole structure.

High-level goals:

- Help users see “how I got here”, not just “what is the answer”.  
- Make long AI-assisted learning sessions revisitable and shareable.  
- Provide a neutral “tree engine” that can sit on top of any LLM provider.

---

## 3. Core Concepts

### 3.1 Tree Model

At the heart of oMyTree is a simple tree model:

- **Tree** – represents one overarching topic or session.
- **Turn** – one user→AI exchange.
- **Node** – the structural unit on the tree:
  - references one or more turns
  - has a parent (except the root)
  - carries metadata (depth, labels, tags, summaries…)

Rules of the game:

- **One question, one node.**  
- **One tree, one main topic.**  
- Branches are explicit; you always know whether you’re on the trunk or exploring a side idea.

### 3.2 Views

- **Path View** – show only the nodes from root → current node (what led here).  
- **Full History View** – show the entire tree at once (global map).

### 3.3 Lens & Timeline (roadmap)

- **Lens** – a short human- or AI-written summary attached to each node.  
- **Timeline** – a time-based replay of how the tree grew during a session.

These features are gradually being integrated as the product matures.

---

## 4. System Overview

> This section intentionally stays high-level; the implementation may evolve.

### 4.1 Architecture

- **Frontend**:  
  - Next.js (App Router)  
  - Tailwind CSS + small custom components  
  - TreeVisualizer canvas for the conversation tree  
  - Landing, Docs, Auth, Admin, and App views

- **Backend**:  
  - Node.js API server  
  - PostgreSQL for persistent storage (users, trees, nodes, turns, docs, telemetry)  
  - Redis (optional) for quotas and transient state  
  - Shell-based acceptance scripts for regression tests

- **LLM Layer**:

  - Multiple **providers** (e.g. OpenAI, future: others)  
  - Two main modes:
    - **Hosted keys** – oMyTree provides models within a free tier.  
    - **BYOK** – users bring their own API keys; keys are stored encrypted and never shared.

### 4.2 Conversation Flow

1. User opens `/app` and starts a new tree.  
2. Each prompt creates a new **turn** and **node**.  
3. The backend decides where to attach the node (main path vs. branch) based on:
   - user’s current position in the tree
   - topic shift signals
4. The LLM response is returned and rendered in both:
   - the chat view  
   - the tree visualization

---

## 5. Usage & Plans

### 5.1 Initial Use Cases

- Individual learners who want to keep a **structured learning diary** with AI.  
- Engineers / researchers exploring complex topics or code bases.  
- Writers using AI to outline stories, essays, or research notes.

### 5.2 Free Tier & BYOK

Public beta focuses on:

- Generous free tier with **built-in models** to lower the barrier to entry.
- First-class BYOK support:
  - users manage their own keys and limits  
  - oMyTree focuses on the **structure layer**, not reselling tokens.

---

## 6. Data, Privacy & Telemetry

- Conversation content is stored to support replay and tree rendering.  
- API keys (BYOK) are encrypted at rest and can be deleted by the user.  
- Telemetry focuses on **aggregate behavior**, such as:
  - number of trees, turns, active days  
  - feature usage milestones (e.g. first exported tree)  
- We avoid storing or analyzing prompt content beyond what is strictly necessary for debugging and product health.

A detailed privacy policy will be published alongside the production launch.

---

## 7. Roadmap (High Level)

Short-term:

- finish core Lens / Timeline experience  
- refine sharing & public viewing  
- richer onboarding and in-product tutorials

Mid-term:

- team / classroom modes  
- better diff / comparison tools between branches  
- deeper integrations with note-taking tools

Long-term:

- expose the tree engine as an **API** / SDK that can plug into other AI tools  
- explore research collaborations around “tree-structured human–AI interaction”

---

## 8. Contact & Participation

This repo will host public docs and discussion for oMyTree.

- X: https://x.com/omytree  
- Email: contact@omytree.com  
- Founder: isbeingto@gmail.com

Issues and PRs about the docs, ideas, or whitepaper are welcome.