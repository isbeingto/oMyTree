# oMyTree

> A visual conversation tree for AI chats — see your thinking, not just your scroll.

---

## 🔥 Quick demo (GIFs first)

### 🌳 1. Conversation grows as a tree  
![conversation-tree](/image/lovegif_1765267999625.gif)

### 🌿 2. Real-time growth 
![focus-node](/image/lovegif_1765269135055.gif)

### 🔁 3. Other minor features 
![branching](/image/lovegif_1765268453544.gif)

---

## 1. What is oMyTree?

oMyTree is a web app that turns your AI chats into a **visual conversation tree**.

Each message becomes a node.  
Each follow-up question grows a new branch.  
You can jump between branches, revisit any path, and actually *see* how your thinking evolves.

This is **not** a “knowledge tree” or curated mind map.  
It’s the raw conversation, mapped into a structure that’s easier to explore than an endless chat window.

- 🌱 One question = one node  
- 🌿 Follow-up = a branching path  
- 🌳 Whole conversation = a living tree you can navigate  

Live app: **https://www.omytree.com**  
Start a new tree: **https://www.omytree.com/app?new=1**

---

## 2. Why I built this (the pain behind oMyTree)

Two years ago, when ChatGPT first launched, I was blown away – not because it could answer questions, but because it felt like we could finally *talk* to an AI.

But the deeper I went, the more one problem kept coming back:

> **Linear chats completely break once ideas get complex.**

- After 10–20 messages, I’d forget why a certain line of reasoning started.  
- After dozens of replies, everything became an endless scroll.  
- Valuable ideas were buried somewhere in the history, effectively lost.

My brain was overloaded. The model got smarter,  
but my *experience* of using it wasn’t getting better.

So instead of asking for “better answers”, I started asking:

> Maybe what’s broken is not the model, but the **interface**.

oMyTree is my attempt to fix that:  
by giving long AI conversations a **tree structure** instead of a flat chat log.

---

## 3. How it works

At a high level:

1. You start a conversation with an AI model (or your own API key).  
2. Every time you ask a question, oMyTree creates a new node.  
3. If you ask a follow-up based on a specific message, oMyTree grows a new branch from that node.  
4. You can click any node to:
   - see the full Q&A
   - continue the conversation from there
   - grow alternate branches of thought

So instead of:

> “Where did we ask about X?” → *scroll, scroll, scroll…*

you get:

> “We asked about X on that branch.” → *click the node and continue from there.*

---

## 4. What you can do with it

Here are some concrete things oMyTree is good at:

- **Learning a new concept**  
  Explore definitions on one branch, examples on another, and counter-arguments on a third.  
  You keep all branches visible instead of losing them in history.

- **Researching a topic**  
  Keep separate branches for “background reading”, “data points”, “criticism”, “implementation steps”, etc.

- **Debugging & refactoring**  
  One branch for the failing assumption, one for the fix, one for an alternative design.

- **Planning & writing**  
  Use branches for different outlines, drafts, or styles, without merging them into one messy thread.

It’s basically a map of “how you and the model got here”.

---

## 5. Key features (current)

Some things that are already working today:

- **Visual conversation tree**  
  – One node per message, one branch per follow-up.  
  – Click any node to focus that sub-conversation.

- **Node-level follow-ups**  
  – Ask further questions from *any* previous node, not just the latest reply.  
  – Perfect for going deeper without losing alternate paths.

- **Model switching with context**  
  – Use different models (including your own API key) in the same tree.  
  – Light models for quick questions, stronger ones for deep reasoning.

- **Adjustable memory scope (still evolving)**  
  – The idea is to switch between “full-tree context” and “branch-only context”.  
  – This is under active iteration and may change as we refine the UX.

- **Export & share**  
  – Export your tree so it’s not locked inside a black box.  
  – Share a tree with others so they can *see* the path you took.

- **Reply collection**  
  – Mark particularly valuable AI responses to revisit later.

_(Some of these are still being refined – see Roadmap below.)_

---

## 6. How this is different from chat history / mind maps / note apps

- It’s **not** a regular chat window  
  – Chat UIs are great for short Q&A, but terrible for long-term reasoning.  
  – oMyTree makes the structure of the conversation first-class.

- It’s **not** a mind map tool  
  – You don’t manually drag bubbles and draw arrows.  
  – The tree grows naturally from your real conversation with the model.

- It’s **not** a note-taking tool (yet)  
  – It’s focused on *live conversations* and the path they take, not on long-form writing.  
  – But it can feed into your existing note system (via export).

---

## 7. Tech stack (for the curious)

- Frontend: **Next.js**, React, Tailwind-style minimal UI  
- Backend: **Node.js / Express-like** API layer  
- Database: **PostgreSQL**  
- Caching / rate limiting: **Redis**  
- LLM layer:  
  – Custom abstraction over providers (OpenAI, etc.)  
  – Support for user-provided API keys (BYOK)

The system started as a personal experiment and has evolved into a full web app with its own routing, event logging, and tree engine.

---

## 8. Closed-source (for now)

Right now, the core codebase is **closed-source**.

Reasons:

- I’m still actively iterating on the core ideas and UX.  
- I want to stabilize the architecture and security model before exposing internals.  
- Maintaining an open-source repo properly (issues, PRs, docs) is a non-trivial commitment.

This repo exists as:

- a canonical home for docs, screenshots, and the public roadmap  
- a place to discuss ideas, open issues, and share feedback  
- a neutral landing page I can link from Hacker News, Product Hunt, etc.

I’m open to making more of the system public over time if there’s enough interest and a clear way to do it responsibly.

---

## 9. Roadmap (short version)

Some things I’m exploring next:

- Better controls for **context scope** per branch  
- Smarter ways to **summarize branches** and trees  
- Richer **export formats** (for note apps / PKM systems)  
- Collaboration modes (share a tree and continue growing it together)  
- Possibly exposing an API so other tools can plug into the tree engine

If you have thoughts on what should exist here, I’d genuinely love to hear them.

---

## 10. About the maker

I am a soon-to-be-graduated university student in Asia., building oMyTree as a solo project.

The origin story in one line:

> I hit the limits of linear AI chats, got frustrated enough, and decided to build the interface I wished existed.

On the Chinese internet I wrote a longer essay about the background and philosophy behind oMyTree (in Chinese):  
https://zhuanlan.zhihu.com/p/1981665938895045740

If you’re reading this from Hacker News or GitHub and you’ve ever felt “lost in the scroll” of AI chats,  
oMyTree is basically me trying to fix that — first for myself, and now maybe for others too.

---

## 11. Feedback

If you’re a developer, researcher, writer, or just someone who thinks a lot with AI:

- Does this conversation-tree UI actually help you think more clearly?  
- Where does it break for you?  
- What’s missing for your workflow?

You can:

- Open an issue in this repo  
- Try the app: https://www.omytree.com  
- Or just email me: `isbeingto@gmail.com`

Thanks for reading, and for caring about better interfaces for thinking.
