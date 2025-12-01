# oMyTree · Conversation → Tree

oMyTree is an independent developer project that turns long AI chats into structured trees of thought.

Instead of one endless scroll of messages, every question becomes a node and every follow-up grows a branch.  
You can replay how you got to a conclusion, branch safely from any point, and export or share the whole structure.

- Live app: https://www.omytree.com  
- Status: Public beta 

---

## 1. What is oMyTree?

Most AI tools are built around a single, flat chat log:

- Context is hidden in the scrollback.
- Side explorations and the main line of thought are mixed together.
- Revisiting “how did we get here?” is difficult.
- Sharing what you learned is just a screenshot or a raw transcript.

oMyTree treats every long AI session as a **tree**:

- The first question becomes the **root**.
- Each follow-up from that point grows a **child node**.
- Branching from any earlier node is explicit and visible.
- You always know whether you are on the main trunk or on a side branch.

The goal is not to be “yet another chat UI”, but to be a **structure layer** on top of large language models:
a place where your thinking path is visible, navigable, and replayable.

---

## 2. Who is building this?

oMyTree is built and maintained by a single independent developer, with AI tools as collaborators rather than black boxes.

- No large company behind it.
- No big VC funding.
- Just a long-term attempt to answer a simple question:

> If we keep using AI to think, how do we keep track of how our thinking evolves?

I use multiple AI agents (including ChatGPT) as “co-workers” for coding, testing, and design, but the product decisions, architecture, and direction are owned and curated by one person.

If you want to talk, collaborate, or just say hi:

- Founder: **isbeingto**  
- Email (personal): **isbeingto@gmail.com**  
- Email (general): **contact@omytree.com**  
- X (Twitter): **https://x.com/omytree**

---

## 3. Core Concepts

### 3.1 Tree-based conversations

At the core of oMyTree is a simple idea:

- **One question → one node.**
- **One tree → one main topic.**

You can:

- Start from a root topic (for example: “Overview of the American Civil War”).
- Ask follow-up questions that extend the main trunk.
- At any node, branch off to explore a side question without losing the main path.
- Return to any previous node and continue from there.

The tree becomes a living record of:

- What you asked.
- How the AI responded.
- Where you changed direction.
- How your understanding grew over time.

### 3.2 Views and navigation

oMyTree exposes two main perspectives:

- **Path view**  
  Show only the nodes from the root to the current node.  
  This answers: “How did I get here?”

- **Full tree view**  
  Show the entire tree at once on the right-hand side.  
  This answers: “What else did I explore? Where are the side branches?”

You can click any node in the tree to:

- Focus that node in the chat pane (replaying its path).
- Continue asking new questions from that point.
- See a consistent visual representation of the branch structure.

---

## 4. Current Feature Set

As of the current public beta, oMyTree includes:

### 4.1 User accounts and auth

- Email-based registration and login.
- Email verification flow.
- Password reset flow.
- Basic account status management (active / inactive).

### 4.2 Conversation and tree engine

- Create and manage multiple trees (“My Trees” sidebar).
- One tree per topic, with a clear root and branches.
- Tree visualization panel:
  - modern metro-like layout with a main trunk and branches,
  - nodes grow upward from the root,
  - smooth node expansion animation when a node becomes “active”.
- Current node highlighting and automatic centering in the canvas.
- Light and dark themes, with a dot-grid “engineering” background and subtle glow around the active node.

### 4.3 Documentation system

- `/docs` page on the public site.
- Admin can create, edit, publish, and delete docs in Markdown via `/admin/docs`.
- Published docs appear on `/docs` and are rendered with Markdown.

### 4.4 LLM usage model

- **Hosted models for free tier**  
  The app provides built-in models for new users so they can try the tree experience without bringing their own keys.

- **BYOK (Bring Your Own Key)**  
  Users can attach their own LLM API keys (for example, OpenAI) in the settings.  
  The app then uses those keys for that user’s trees.

- The long-term vision is that oMyTree is **LLM-agnostic**: it does not try to “lock you” into one provider, but focuses on the tree engine and UX.

---

## 5. Pricing and Philosophy (early beta)

During the early public beta, the focus is:

- Let people experience a different way of working with AI: **structured, visual, and revisitable**.
- Keep the free tier generous enough for real learning sessions.
- Allow power users to rely on their own API keys if they want more control or higher volume.

Because this is an independent project:

- There is no “infinite runway” to undercut large players on price.
- The priority is to make the product genuinely useful and sustainable, not to win a race to the bottom.

Expect pricing and quotas to evolve.  
The guiding principle: **clarity and honesty**, not dark patterns.

---

## 6. Architecture Overview (high level)

The main production code lives in a private repository for now, but the architecture is roughly:

- **Frontend**
  - Next.js (App Router) with TypeScript.
  - Tailwind CSS for styling.
  - Framer Motion for subtle animations.
  - A dedicated TreeCanvas component for rendering the conversation tree.

- **Backend**
  - Node.js API server.
  - PostgreSQL as the primary database.
  - Shell-based acceptance scripts and test suites to keep behavior consistent.

- **LLM abstraction**
  - A provider layer that knows how to talk to different model vendors.
  - Configuration for free-tier hosted models + per-user BYOK profiles.

This public repository is focused on:

- The README (this file).
- Whitepapers and conceptual docs.
- Possibly API or developer docs in the future.

---

## 7. Roadmap (high level)

Short term:

- Improve onboarding for first-time users.
- Polish the tree UI further (lens, summaries, time-based replay).
- Stabilize free-tier model usage and quotas.

Medium term:

- Better sharing:
  - read-only public links,
  - “embed tree in blog post” style integrations.
- Team and classroom scenarios:
  - shared trees,
  - teaching workflows,
  - review tools.

Long term:

- Expose the tree engine as an API or SDK.
- Allow other tools to plug into oMyTree as a “thinking map layer” on top of their own chats.

---

## 8. Contributing and Feedback

Right now the core app is not open-sourced, but:

- Feedback on the concept, UX, and docs is very welcome.
- If you are interested in research collaborations (education, cognitive science, HCI, AI-assisted learning), please get in touch.
- If you are a developer/designer interested in contributing to future versions, feel free to reach out as well.

Contact:

- Personal: **isbeingto@gmail.com**  
- General: **contact@omytree.com**  
- X (Twitter): **https://x.com/omytree**

---

## 9. License

This documentation repository is currently **all rights reserved** by the author.

If you would like to quote, translate, or adapt parts of the README or future whitepaper, please contact the maintainer first.