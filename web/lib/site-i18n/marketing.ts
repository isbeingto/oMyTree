/**
 * Marketing page translation dictionary for oMyTree public site.
 *
 * Keys follow a section-based convention:
 *   hero_*        – Hero section on homepage
 *   chaos_*       – ChaosVsOrder section
 *   features_*    – FeaturesBento section
 *   latest_docs_* – LatestDocs section
 *   nav_*         – FloatingNav / MarketingNav
 *   footer_*      – Footer
 *   about_*       – About page
 *   docs_*        – Docs list / detail pages
 *   common_*      – Shared labels
 */

import type { SiteLocale } from './locale-utils';

// ---------------------------------------------------------------------------
// English strings
// ---------------------------------------------------------------------------
const en = {
  // ── Nav ──
  nav_features: 'Features',
  nav_docs: 'Docs',
  nav_changelog: 'Changelog',
  nav_about: 'About',
  nav_pricing: 'Pricing',
  nav_open_app: 'Open the app',
  nav_start: 'Start Using',
  nav_pill: 'Sessions + memos',

  // ── Hero ──
  home_meta_title: 'oMyTree - The AI Workspace for Deep Research',
  home_meta_description:
    'Escape the chaos of linear chat. oMyTree is a tree-based AI canvas designed for researchers and deep thinkers to explore, annotate, and synthesize complex ideas.',
  hero_pill: 'For Deep Thinkers & Researchers',
  hero_cta_open: 'Open the app',
  hero_cta_docs: 'Read the docs',
  hero_typing_text: 'Branch this idea and compare it with the previous approach...',
  hero_anchor_label: 'Traceable Evidence',

  // ── Chaos vs Order ──
  chaos_title: 'From Linear Chaos to Structured Clarity',
  chaos_subtitle:
    'Standard AI chats bury your best ideas under endless scrolling. oMyTree gives you a spatial canvas to map out your entire thought process.',
  chaos_linear_title: 'The Linear Trap',
  chaos_linear_desc: 'Context gets buried. You lose track of alternative ideas. You scroll endlessly trying to find that one good point.',
  chaos_tree_title: 'The Tree Canvas',
  chaos_tree_desc: 'Branch out at any point. Explore multiple paths side-by-side. Never lose the context of your exploration.',
  chaos_efficiency_pill: 'High Signal-to-Noise',
  chaos_efficiency_title: 'Curate the signal.\nFilter the noise',
  chaos_efficiency_desc: 'AI generates a lot of text. You decide what matters by annotating keyframes and building a traceable chain of thought.',
  chaos_sessions: 'Branching Exploration',
  chaos_sessions_desc: 'Test different hypotheses without destroying your previous context.',
  chaos_memos: 'Manual Curation',
  chaos_memos_desc: 'Highlight and annotate the exact AI responses that contain the golden logic.',
  chaos_jumpback: 'Traceable Outcomes',
  chaos_jumpback_desc: 'Generate comprehensive reports where every claim links back to the exact node it came from.',

  // ── Features Bento ──
  features_title: 'Built for rigorous intellectual work',
  features_subtitle:
    'Tools designed to augment human reasoning, not replace it.',
  feat_context_title: 'Infinite Tree Canvas',
  feat_context_desc:
    'Visualize your entire conversation history as a branching tree. See the big picture at a glance.',
  feat_model_title: 'Multi-Model Interrogation',
  feat_model_desc: 'Ask GPT-4, Claude, and DeepSeek the same question on parallel branches and compare their reasoning.',
  feat_path_title: 'Keyframe Annotations',
  feat_path_desc:
    "Don't let AI summarize for you. Manually pin the most valuable insights to build a high-fidelity knowledge base.",
  feat_export_title: 'Academic-Grade Export',
  feat_export_desc:
    'Export your synthesized outcomes to Markdown or PDF, complete with inline citations linking back to the original AI dialogue.',
  feat_keys_title: 'Bring Your Own Keys',
  feat_keys_desc: 'Connect your own API keys for OpenAI, Anthropic, or local models. Total privacy for your research.',
  feat_keys_storage: 'Local-first architecture',
  feat_session_title: 'Knowledge Base Integration',
  feat_session_desc: 'Upload PDFs and documents. Chat with your own data using built-in RAG capabilities.',
  feat_memo_title: 'Time-Travel Replay',
  feat_memo_desc: 'Rewind and replay your entire thought process to understand how you arrived at a conclusion.',
  feat_md_title: 'Shareable Research',
  feat_md_desc: 'Publish your tree publicly. Let others explore your reasoning process, not just the final result.',

  // ── Latest Docs ──
  latest_docs_title: 'Articles & Guides',
  latest_docs_subtitle: 'Learn how to capture sessions, memos, and replayable process assets.',
  latest_docs_view_all: 'View all docs',

  // ── Resources Section ──
  resources_title: 'Evolution & Exploration',
  resources_subtitle: "Stay updated with oMyTree's evolution and master the art of turning conversations into assets.",
  resources_view_all_updates: 'View all updates',

  // ── Footer ──
  footer_tagline: 'Capture your AI workflow once, reuse it forever.',
  footer_docs: 'Docs',
  footer_changelog: 'Changelog',
  footer_about: 'About',
  footer_blog: 'Blog',
  footer_pricing: 'Pricing',
  footer_privacy: 'Privacy',
  footer_terms: 'Terms',
  footer_powered: 'Powered by ChatGPT',
  footer_rights: '© {year} oMyTree. All rights reserved.',

  // ── Pricing page ──
  pricing_meta_title: 'Pricing | oMyTree',
  pricing_meta_description: 'Flexible pricing for serious AI work. Start free, then scale when your workflow grows.',
  pricing_badge: 'Pricing',
  pricing_title: 'Pricing that scales with your thinking',
  pricing_subtitle: 'Start free, then unlock higher limits, faster workflows, and priority support when you need it.',
  pricing_free_name: 'Free',
  pricing_free_desc: 'For individuals building daily habits with AI.',
  pricing_free_price: '$0',
  pricing_free_period: 'forever',
  pricing_pro_name: 'Pro',
  pricing_pro_desc: 'For professionals who run core work through AI every day.',
  pricing_pro_price: '$5',
  pricing_pro_period: '/month',
  pricing_team_name: 'Team',
  pricing_team_desc: 'For teams building shared process assets.',
  pricing_team_price: '$29',
  pricing_team_period: '/member/month',
  pricing_cta_free: 'Get started free',
  pricing_cta_pro: 'Coming soon',
  pricing_cta_team: 'Coming soon',
  pricing_feat_turns: 'AI conversations / week',
  pricing_feat_summaries: 'Summaries / week',
  pricing_feat_uploads: 'File uploads / week',
  pricing_feat_trees: 'Trees',
  pricing_feat_nodes: 'Nodes per tree',
  pricing_feat_byok: 'Bring your own API keys',
  pricing_feat_models: 'Model access',
  pricing_feat_export: 'Export (JSON / Markdown)',
  pricing_feat_knowledge: 'Knowledge base (RAG)',
  pricing_feat_priority: 'Priority support',
  pricing_unlimited: 'Unlimited',
  pricing_included: 'Included',
  pricing_not_included: '—',
  pricing_popular: 'Most Popular',
  pricing_faq_title: 'Frequently asked questions',
  pricing_faq_q1: 'What happens when I hit my weekly limit?',
  pricing_faq_a1: 'Your quota resets every Monday at 00:00 UTC. You can also use your own API keys (BYOK) for unlimited AI conversations at any time.',
  pricing_faq_q2: 'What is BYOK?',
  pricing_faq_a2: 'Bring Your Own Key — connect your own OpenAI, Google, or DeepSeek API keys. BYOK conversations are unlimited and don\'t count against your weekly quota.',
  pricing_faq_q3: 'Can I cancel anytime?',
  pricing_faq_a3: 'Yes. There are no contracts or commitments. Downgrade to Free whenever you like.',
  pricing_faq_q4: 'How do credits reset?',
  pricing_faq_a4: 'All weekly quotas reset every Monday at 00:00 UTC automatically.',

  // ── About page ──
  about_badge: 'About',
  about_title: 'About oMyTree',
  about_subtitle:
    'oMyTree is the process layer for deep AI work, turning disposable chats into durable intellectual assets.',
  about_idea_label: 'The idea',
  about_idea_headline:
    "AI can generate answers fast, but it rarely preserves how you got there.",
  about_idea_body:
    'oMyTree turns your AI workflow into sessions, memo checkpoints, and jump-back anchors, so your reasoning stays traceable and resumable across days or weeks.',
  about_value_1: 'Clarity over endless scrolling',
  about_value_2: 'Deliberate actions, no surprise regeneration',
  about_value_3: 'Process assets you can export, audit, and reuse',
  about_for_title: "Who it's for",
  about_for_1: 'Researchers doing deep reading & synthesis',
  about_for_2: 'Builders iterating on messy problems',
  about_for_3: 'Learners who return to a topic over days/weeks',
  about_not_title: "What it's not",
  about_not_1: 'Not a "second brain" that replaces thinking',
  about_not_2: 'Not a social network or a note dump',
  about_not_3: 'Not another chat app skin',
  about_founder_title: 'Founder & Lead Developer',
  about_founder_bio_1:
    'Built by an indie builder (WUSHANG CHEN). I kept losing context in long AI threads — the useful parts weren\'t the answers, but the path I took to get there.',
  about_founder_bio_2:
    'oMyTree is my attempt to make that path visible: sessions for "what happened last time", memos for checkpoints, and anchors to jump back to the exact node.',
  about_status_label: 'Status',
  about_status_text:
    "oMyTree is under active development. If your team thinks with AI every day, we'd love your feedback.",

  // ── Docs list page ──
  docs_badge: 'Documentation Hub',
  docs_title: 'Guides, playbooks, and deep dives',
  docs_subtitle:
    'Learn the workflows behind sessions, outcomes, and reusable process assets in oMyTree.',
  docs_empty_title: 'Docs are on the way',
  docs_empty_desc: 'New guides and product notes will appear here as they are published.',
  docs_empty_admin: 'Admin? {link}',
  docs_empty_admin_link: 'Create docs in the admin panel',
  docs_cta_app: 'Open the workspace →',
  docs_cta_home: 'Back to homepage',

  // ── Doc detail page ──
  doc_back: 'Back to Docs',
  doc_cta_app: 'Try the app →',

  // ── Legal pages ──
  legal_terms_badge: 'Terms of Service',
  legal_terms_title: 'Terms of Service',
  legal_privacy_badge: 'Privacy Policy',
  legal_privacy_title: 'Privacy Policy',
  legal_refund_badge: 'Refund Policy',
  legal_refund_title: 'Refund Policy',
  footer_refund: 'Refund Policy',

  // ── Common ──
  common_lang_en: 'EN',
  common_lang_zh: '中文',
  hero_badge: 'The AI Process Layer for Deep Thinkers',
  hero_title_1: "Don't just chat",
  hero_title_2: 'Build your knowledge',
  hero_subtitle: "Escape the chaos of linear chat. oMyTree is a tree-based AI canvas that lets you branch ideas, annotate key evidence, and synthesize complex research into traceable reports.",
  hero_cta_start: 'Get Started Free',
  hero_cta_demo: 'See How It Works',

  // ── Pain Points ──
  pain_badge: 'The Cognitive Gap',
  pain_title: 'AI is evolving. Is your workflow stuck in the past?',
  pain_subtitle: "As AI becomes your daily thinking partner, the real bottleneck isn't getting answers—it's managing the wisdom behind them.",
  pain_overload_title: 'Information Overload',
  pain_overload_desc: "AI generates data faster than your brain can process it. In linear chats, valuable insights get buried under waves of text, leaving you drowning in responses instead of building on ideas.",
  pain_context_title: 'Context Amnesia',
  pain_context_desc: "You reached a breakthrough with AI three days ago, but how did you get there? The reasoning, the alternatives, the 'why'—it's all lost in the scroll. You remember the conclusion, but the bridge is gone.",
  pain_process_title: 'Process Evaporation',
  pain_process_desc: "Traditional chats treat conversations as disposable. The trial-and-error, the pivots, and the 'aha' moments evaporate once the session ends. You're forced to start from scratch every single time.",

  // ── Three Layers Overview ──
  layers_badge: 'The oMyTree Workflow',
  layers_title: 'From exploration to assets, nothing is wasted',
  layers_subtitle: 'oMyTree organizes your AI workflow into three intuitive layers, turning messy threads into a compounding knowledge base.',
  layer1_name: 'Space',
  layer1_title: 'Infinite Canvas for Thought',
  layer1_desc: 'Break free from the thread. Map every Q&A as a node on a living tree. Branch freely, switch models, and annotate insights while keeping the full context visible.',
  layer2_name: 'Curation',
  layer2_title: 'Signal Over Noise',
  layer2_desc: "Exploration is messy by design. Curation is where value is born. Transform complex trees into 'Outcomes'—traceable, readable narratives that tell the story of your discovery.",
  layer3_name: 'Assets',
  layer3_title: 'Compounding Knowledge',
  layer3_desc: 'Your curated outcomes shouldn’t just sit there. Flow them into a personalized knowledge base with RAG retrieval, letting past breakthroughs power your future questions.',

  // ── Layer 1 Features ──
  l1_badge: 'Space — Exploration',
  l1_title: 'Think in Branches, Not Scrolls',
  l1_subtitle: 'One question, one node, infinite possibilities. Branch anywhere, dive as deep as you need, and never lose your place.',
  l1_tree_title: 'Non-Linear Branching',
  l1_tree_desc: "Spotted an interesting detail? Pivot into a new branch without breaking your flow. Explore deeply, then jump back to the main map with a single click. Context follows the path, not just the last message.",
  l1_model_title: 'Model-Agnostic Context',
  l1_model_desc: "Brainstorm with GPT, review code with DeepSeek, and perform nuanced analysis with Claude—all in the same tree. Switch models on the fly while preserving your full conversation history.",
  l1_annotate_title: 'Active Thinking',
  l1_annotate_desc: "Don't just read AI responses; interact with them. Leave marginalia, doubts, or follow-up sparks. Your human input becomes a permanent, searchable part of the process record.",
  l1_multi_title: 'Multimodal & Reasoning',
  l1_multi_desc: "Analyze documents, visualize thinking chains, and generate visuals. oMyTree adapts to your modality, giving you the tools to tackle complex research tasks.",

  // ── Layer 2 Features ──
  l2_badge: 'Curation — Clarity',
  l2_title: 'Turn The Messy Middle into Your Greatest Asset',
  l2_subtitle: 'Raw exploration is chaotic. Curation makes it usable. Pick your winners and weave them into a clear, traceable story.',
  l2_outcome_title: 'One-Click Outcomes',
  l2_outcome_desc: "Reached a conclusion? Hit 'Create Outcome'. oMyTree automatically traces the path from root to breakthrough, distilling your annotations and AI reasoning into a sourced, professional report.",
  l2_trace_title: 'Source Integrity',
  l2_trace_desc: "Every paragraph in your report is hyperlinked to its original AI node. Months later, one click takes you back to the exact moment of insight, with all context intact.",

  // ── Layer 3 Features ──
  l3_badge: 'Assets — Performance',
  l3_title: 'Experience that Compounds',
  l3_subtitle: 'Results are the output; process is the asset. oMyTree turns your curated outcomes into a searchable, living brain.',
  l3_knowledge_title: 'Personalized Knowledge (RAG)',
  l3_knowledge_desc: "Plug in your research, whitepapers, or team docs. Select your custom knowledge base, and oMyTree injects that specific context into your new branches. No more copy-paste loops.",
  l3_reuse_title: 'Recycling Breakthroughs',
  l3_reuse_desc: "Your Layer 2 reports don't just die in a folder. They flow into your knowledge base, making last month's research the context for today's innovation.",

  // ── Value Propositions ──
  value_badge: 'Why It Matters',
  value_title: 'This changes how you work with AI',
  value_relay_title: 'Thought Relay Across Time',
  value_relay_desc: "Some research takes days, weeks, even months of AI collaboration. Traditional chat tools make you \"lose the thread\" after a break. With oMyTree, open your Outcome report, scan the process narrative, and you're instantly back where you left off — ready to continue, or hand off to a colleague.",
  value_integrity_title: 'Built-In Process Integrity',
  value_integrity_desc: "In the AI era, anyone can generate a polished result. But the process can't be faked. oMyTree records how you explored, questioned, and reasoned with AI. For students, researchers, and professionals — this means accountability, transparency, and proof of genuine thinking.",
  value_asset_title: 'Process as a First-Class Asset',
  value_asset_desc: "Most tools optimize for output. oMyTree treats the journey itself as the product. Your exploration paths, dead ends, pivots, and breakthroughs — all preserved, all searchable, all reusable. Because the best way to get better results is to learn from how you got the last ones.",

  // ── Final CTA ──
  cta_title: 'Start preserving your thinking process',
  cta_subtitle: "Free to start. No credit card required. Your trees, your data, your process.",
  cta_button: 'Create Your First Tree',
  cta_open: 'Open the App',

  // ── Media fallback ──
  media_placeholder: 'Upload a screenshot or GIF in the admin panel to showcase this feature.',

  // ── Changelog page ──
  changelog_badge: 'Release Notes',
  changelog_title_1: 'Release',
  changelog_title_2: 'Notes',
  changelog_subtitle: 'Track every shipped improvement, feature, and fix in one transparent timeline.',
  changelog_empty_title: 'No updates yet',
  changelog_empty_desc: 'Updates will appear here as new features and improvements are released.',
  changelog_read_docs: 'Read the docs',
  changelog_try_app: 'Try the app →',
  changelog_back: 'Back to Changelog',
  changelog_prev: 'Previous',
  changelog_next: 'Next',
  changelog_all_updates: 'All updates',
} as const;

export type MarketingKey = keyof typeof en;

// ---------------------------------------------------------------------------
// Simplified Chinese strings
// ---------------------------------------------------------------------------
const zhHansCN: Record<MarketingKey, string> = {
  // ── Nav ──
  nav_features: '功能',
  nav_docs: '文档',
  nav_changelog: '更新日志',
  nav_about: '关于',
  nav_pricing: '定价',
  nav_open_app: '打开应用',
  nav_start: '开始使用',
  nav_pill: '会话 + 备忘',

  // ── Hero ──
  home_meta_title: 'oMyTree - 深度研究者的 AI 工作台',
  home_meta_description: '告别“越聊越乱”的线性对话。oMyTree 是专为深度研究打造的树状 AI 画布，助你发散思路、提纯逻辑、沉淀可溯源的研究资产。',
  hero_pill: '专为深度思考者与研究员打造',
  hero_cta_open: '打开应用',
  hero_cta_docs: '阅读文档',
  hero_typing_text: '基于这个思路分叉，并与上一个方案进行对比...',
  hero_anchor_label: '可溯源证据点',

  // ── Chaos vs Order ──
  chaos_title: '从线性混乱到结构化清晰',
  chaos_subtitle:
    '传统的 AI 聊天框会把最好的想法埋没在无尽的滚动中。oMyTree 给你一个空间画布，完整映射你的思考轨迹。',
  chaos_linear_title: '线性对话的陷阱',
  chaos_linear_desc: '上下文不断丢失，无法对比不同方案，为了找回一句有用的话只能疯狂向上滚动。',
  chaos_tree_title: '全景式树状画布',
  chaos_tree_desc:
    '在任意节点自由分叉。平行探索多种可能性。永远不会丢失探索的上下文。',
  chaos_efficiency_pill: '高信噪比',
  chaos_efficiency_title: 'AI 负责发散，\n你负责收敛',
  chaos_efficiency_desc: 'AI 会生成大量废话。通过手动批注关键帧，由你来决定什么才是真正的黄金逻辑。',
  chaos_sessions: '平行分支探索',
  chaos_sessions_desc: '大胆测试不同的假设和 Prompt，而不必担心破坏当前的对话上下文。',
  chaos_memos: '高信噪比提纯',
  chaos_memos_desc: '对 AI 回复中的关键证据进行高亮和批注，拒绝 AI 幻觉，构建坚实的证据链。',
  chaos_jumpback: '可溯源的成果报告',
  chaos_jumpback_desc: '一键生成结构化报告，报告中的每一个结论都能精准跳回原始的对话节点。',

  // ── Features Bento ──
  features_title: '为严谨的脑力劳动而生',
  features_subtitle:
    '我们的工具旨在增强人类的思考能力，而不是取代它。',
  feat_context_title: '无限生长的思维树',
  feat_context_desc:
    '将完整的对话历史可视化为一棵不断生长的树。全局视角，一览无余。',
  feat_model_title: '多模型交叉验证',
  feat_model_desc: '在平行的分支上分别询问 GPT-4、Claude 和 DeepSeek，直观对比它们的推理过程。',
  feat_path_title: '关键帧批注 (Keyframes)',
  feat_path_desc:
    '不要盲目相信 AI 的自动总结。手动钉住最有价值的洞察，构建高保真的个人知识库。',
  feat_export_title: '学术级成果导出',
  feat_export_desc:
    '将提纯后的成果导出为 Markdown 或 PDF，自带内联引用（脚注），完美接入你的写作流。',
  feat_keys_title: '自带密钥，数据安全',
  feat_keys_desc: '支持填入你自己的 API Key。你的研究数据和核心机密完全掌握在自己手中。',
  feat_keys_storage: '本地优先架构',
  feat_session_title: '私有知识库 (RAG)',
  feat_session_desc: '上传 PDF 文献和内部文档，在对话中随时引用，让 AI 基于你的专属资料进行严谨作答。',
  feat_memo_title: '思维轨迹回放',
  feat_memo_desc: '像播放电影一样回放你的整棵思维树，复盘你是如何一步步推导出最终结论的。',
  feat_md_title: '分享你的推演过程',
  feat_md_desc: '生成公开链接。不仅向团队分享最终结论，更分享你获得结论的完整心路历程。',

  // ── Latest Docs ──
  latest_docs_title: '文章 & 指南',
  latest_docs_subtitle: '了解如何捕获会话、备忘和可回放的过程资产。',
  latest_docs_view_all: '查看全部文档',

  // ── Resources Section ──
  resources_title: '持续进化与深度探索',
  resources_subtitle: '了解 oMyTree 的最新动态，掌握将对话转化为资产的最佳实践。',
  resources_view_all_updates: '查看全部更新',

  // ── Footer ──
  footer_tagline: '让 AI 工作流沉淀为可回放、可复用的长期资产。',
  footer_docs: '文档',
  footer_changelog: '更新日志',
  footer_about: '关于',
  footer_blog: '博客',
  footer_pricing: '定价',
  footer_privacy: '隐私',
  footer_terms: '条款',
  footer_powered: 'Powered by ChatGPT',
  footer_rights: '© {year} oMyTree. 保留所有权利。',

  // ── Pricing page ──
  pricing_meta_title: '定价 | oMyTree',
  pricing_meta_description: '为深度 AI 协作设计的定价体系。免费起步，按成长节奏升级。',
  pricing_badge: '定价',
  pricing_title: '随思维增长而扩展的定价',
  pricing_subtitle: '先免费使用，再在需要更高配额、更快协作与优先支持时升级。',
  pricing_free_name: '免费版',
  pricing_free_desc: '适合建立日常 AI 协作习惯的个人用户。',
  pricing_free_price: '$0',
  pricing_free_period: '永久免费',
  pricing_pro_name: '专业版',
  pricing_pro_desc: '适合将核心工作持续运行在 AI 上的专业用户。',
  pricing_pro_price: '$5',
  pricing_pro_period: '/月',
  pricing_team_name: '团队版',
  pricing_team_desc: '适合构建共享过程资产的团队。',
  pricing_team_price: '$29',
  pricing_team_period: '/成员/月',
  pricing_cta_free: '免费开始',
  pricing_cta_pro: '即将推出',
  pricing_cta_team: '即将推出',
  pricing_feat_turns: 'AI 对话 / 周',
  pricing_feat_summaries: '摘要生成 / 周',
  pricing_feat_uploads: '文件上传 / 周',
  pricing_feat_trees: '思维树',
  pricing_feat_nodes: '每棵树节点数',
  pricing_feat_byok: '自带 API 密钥',
  pricing_feat_models: '模型访问',
  pricing_feat_export: '导出（JSON / Markdown）',
  pricing_feat_knowledge: '知识库（RAG）',
  pricing_feat_priority: '优先支持',
  pricing_unlimited: '无限制',
  pricing_included: '包含',
  pricing_not_included: '—',
  pricing_popular: '最受欢迎',
  pricing_faq_title: '常见问题',
  pricing_faq_q1: '周配额用完了怎么办？',
  pricing_faq_a1: '配额每周一 00:00 UTC 自动重置。你也可以随时使用自己的 API 密钥（BYOK）进行无限制的 AI 对话。',
  pricing_faq_q2: '什么是 BYOK？',
  pricing_faq_a2: '自带密钥（Bring Your Own Key）—— 连接你自己的 OpenAI、Google 或 DeepSeek API 密钥。BYOK 对话不限量，不计入周配额。',
  pricing_faq_q3: '可以随时取消吗？',
  pricing_faq_a3: '可以。没有合同或承诺。你可以随时降级到免费版。',
  pricing_faq_q4: '配额如何重置？',
  pricing_faq_a4: '所有周配额在每周一 00:00 UTC 自动重置。',

  // ── About page ──
  about_badge: '关于',
  about_title: '关于 oMyTree',
  about_subtitle:
    'oMyTree 是面向深度 AI 协作的过程层，把一次性聊天转化为可沉淀的认知资产。',
  about_idea_label: '理念',
  about_idea_headline:
    'AI 可以快速给出答案，但很少保留你抵达答案的过程。',
  about_idea_body:
    'oMyTree 将 AI 工作流组织为会话、备忘检查点和跳回锚点，让你的推理路径在数天或数周后依旧可追溯、可续接。',
  about_value_1: '用结构化清晰，替代无尽滚动',
  about_value_2: '所有动作可控，拒绝意外重生成',
  about_value_3: '过程资产可导出、可审计、可复用',
  about_for_title: '适合谁',
  about_for_1: '进行深度阅读和综合研究的研究者',
  about_for_2: '在复杂问题上迭代的构建者',
  about_for_3: '数天/数周后回到某个主题的学习者',
  about_not_title: '它不是什么',
  about_not_1: '不是取代思考的「第二大脑」',
  about_not_2: '不是社交网络或笔记堆放区',
  about_not_3: '不是另一个聊天应用的皮肤',
  about_founder_title: '创始人 & 首席开发者',
  about_founder_bio_1:
    '由独立开发者（陈武尚）构建。我在长篇 AI 对话中不断丢失上下文 —— 有价值的不是答案，而是我到达那里的路径。',
  about_founder_bio_2:
    'oMyTree 是我让那条路径可见的尝试：用会话记录「上次发生了什么」，用备忘做检查点，用锚点跳回到精确的节点。',
  about_status_label: '状态',
  about_status_text:
    'oMyTree 正在持续迭代。如果你的团队每天都与 AI 协作，我们非常期待你的真实反馈。',

  // ── Docs list page ──
  docs_badge: '文档中心',
  docs_title: '指南、实战手册与深度拆解',
  docs_subtitle:
    '系统掌握 oMyTree 的会话、成果与过程资产工作流，把 AI 协作真正转化为长期能力。',
  docs_empty_title: '文档正在整理中',
  docs_empty_desc: '新的指南与产品说明发布后将第一时间出现在这里。',
  docs_empty_admin: '管理员？{link}',
  docs_empty_admin_link: '在管理面板中创建文档',
  docs_cta_app: '进入工作空间 →',
  docs_cta_home: '回到首页',

  // ── Doc detail page ──
  doc_back: '返回文档',
  doc_cta_app: '试用应用 →',

  // ── Legal pages ──
  legal_terms_badge: '服务条款',
  legal_terms_title: '服务条款',
  legal_privacy_badge: '隐私政策',
  legal_privacy_title: '隐私政策',
  legal_refund_badge: '退款政策',
  legal_refund_title: '退款政策',
  footer_refund: '退款政策',

  // ── Common ──
  common_lang_en: 'EN',
  common_lang_zh: '中文',
  hero_badge: '面向深度思考者的 AI 过程资产层',
  hero_title_1: '不只是聊天',
  hero_title_2: '构建你的知识树',
  hero_subtitle: '告别“越聊越乱”的线性对话。oMyTree 提供全景式树状画布，让你随时分叉试错、手动批注关键证据，并将碎片化的对话沉淀为带有严谨引用的研究报告。',
  hero_cta_start: '免费开始',
  hero_cta_demo: '了解工作方式',

  // ── Pain Points ──
  pain_badge: '认知鸿沟',
  pain_title: 'AI 在进化，你的工作方式还在原地吗？',
  pain_subtitle: '当 AI 成为你的日常思考伙伴，真正的瓶颈不再是获取答案——而是如何管理答案背后的智慧。',
  pain_overload_title: '信息黑洞',
  pain_overload_desc: 'AI 生成数据的速度远超大脑处理上限。在线性聊天中，宝贵的洞见会被源源不断的新回复淹没，让你迷失在答非所问的海洋中。',
  pain_context_title: '上下文断片',
  pain_context_desc: '三天前你与 AI 探讨出一个关键突破，但今天你还记得是怎么推导出来的吗？逻辑路径、被否决的备选方案……全部遗失在滚动条里。',
  pain_process_title: '过程蒸发',
  pain_process_desc: '传统的聊天工具将对话视为一次性用品。那些反复试错、路径转折和灵光一现的瞬间，在会话结束后便烟消云散。下一次，你只能被迫从零开始。',

  // ── Three Layers ──
  layers_badge: 'oMyTree 协作流',
  layers_title: '从探索到资产，没有一次思考被浪费',
  layers_subtitle: 'oMyTree 将你的 AI 工作流组织为三个直观层级，把杂乱的线索转化为可持续产生收益的知识资产。',
  layer1_name: '空间层',
  layer1_title: '无限探索的画布',
  layer1_desc: '跳出对话气泡。将每个问答对映射为思维树上的节点。自由分支、切换模型，边批注边思考，同时保持完整的上下文纵览。',
  layer2_name: '策展层',
  layer2_title: '从噪音中提炼信号',
  layer2_desc: '探索天然是混乱的。策展就是将杂乱的“树”转化为“成果”——即一份可追溯、可阅读的叙事报告，讲述你发现真理的旅程。',
  layer3_name: '资产层',
  layer3_title: '知识的复利积累',
  layer3_desc: '策展后的成果不应被尘封。它们会自动流入你的个人知识库，通过 RAG 检索技术，让过去的突破为未来的提问持续赋能。',

  // ── Layer 1 ──
  l1_badge: '第一层 — 空间',
  l1_title: '用树结构思考，告别无限滚动',
  l1_subtitle: '一问一答一节点。随处分支，全速深入。在复杂的思考迷宫里，你永远知道自己在哪里。',
  l1_tree_title: '非线性思维分支',
  l1_tree_desc: '在 AI 的回复中发现了值得深挖的细节？直接就地开辟新路径，无需打断主线讨论。探索完毕后，在地图上一键跳回。上下文随路径流动，而非仅限最后一句。',
  l1_model_title: '模型切换，语境不丢',
  l1_model_desc: '用 GPT 脑暴，换 DeepSeek 写码，再请 Claude 深度复核——全在同一棵思维树中。你可以根据需求随时切换 AI 工具，而当前的对话背景始终如影随心。',
  l1_annotate_title: '边读边写，注入灵魂',
  l1_annotate_desc: '不要只是阅读 AI 的回复，要在上面留下你的注记、质疑或灵感。这些批注将成为过程记录中永久、可搜索的一环，让 AI 协作不再只有机器的参与。',
  l1_multi_title: '原生多模态与思维链',
  l1_multi_desc: '无论是上传文档分析、透视思维链展开，还是生成视觉草图，oMyTree 都能完美适配你的研究重任，让复杂任务化繁为简。',

  // ── Layer 2 ──
  l2_badge: '第二层 — 策展',
  l2_title: '混乱的中间过程，才是最宝贵的资产',
  l2_subtitle: '探索天然是混乱的。策展的作用就是从噪音中提炼信号，将碎片化的探索织成条理清晰的发现报告。',
  l2_outcome_title: '一键生成「成果」',
  l2_outcome_desc: '当得出关键结论时，点击「创建成果」。oMyTree 会自动回溯从起点到巅峰的每一步，将你的批注与 AI 的推理编织成一份详实、专业且自带来源的报告。',
  l2_trace_title: '段落级来源溯源',
  l2_trace_desc: '成果报告中的每一段都深度链接。几个月后，只需轻轻一点，就能瞬间回到产出该结论的那个对话节点，当时的心理状态与上下文一览无余。',

  // ── Layer 3 ──
  l3_badge: '第三层 — 资产',
  l3_title: '经验产生复利',
  l3_subtitle: '答案只是产出，过程才是资产。oMyTree 将你的策展成果转化为可检索、活生生的「个人大脑」。',
  l3_knowledge_title: '个性化知识库 (RAG)',
  l3_knowledge_desc: '植入你的研究文献、技术文档或参考资料。在开启新对话时选择特定知识库，让 AI 基于你的专属背景给出回答，彻底终结反复拷贝的苦恼。',
  l3_reuse_title: '灵感的循环再生',
  l3_reuse_desc: '你在第二层产出的报告不会尘封在文件夹里。它们会自动流入知识库，让上个月的研究成果成为今天创新的基石。',

  // ── Value Props ──
  value_badge: '为什么选择 oMyTree',
  value_title: '这将改变你与 AI 协作的方式',
  value_relay_title: '跨越时间的思维接力',
  value_relay_desc: '深度研究是一场马拉松。传统对话在窗口关闭时就“死掉”了。oMyTree 让你能在数周后精准接棒，或者将完整的思维闭环直接移交给同事接力，无需任何解释。',
  value_integrity_title: '天然的过程诚信',
  value_integrity_desc: '在这个结果泛滥的时代，思考的过程才是你的核心竞争力。oMyTree 记录了你的严谨探索与逻辑推理论证，为研究者、建设者和学生提供无可辩驳的真诚思考证明。',
  value_asset_title: '知识的复利效应',
  value_asset_desc: '大多数工具只追求下一个答案，oMyTree 追求下一个突破。通过保存那些转折、尝试与顿悟，我们将你的交互历史转化为极具价值的智力资产。',

  // ── Final CTA ──
  cta_title: '开始栽培你的思维之林',
  cta_subtitle: '免费开始，无需信用卡。你的数据，你的过程，你的成长。',
  cta_button: '种下第一棵思维树',
  cta_open: '进入工作空间',

  // ── Media fallback ──
  media_placeholder: '在管理后台上传截图或 GIF 来展示此功能。',
  // ── Changelog page ──
  changelog_badge: '发布说明',
  changelog_title_1: '更新',
  changelog_title_2: '日志',
  changelog_subtitle: '每一次功能迭代、体验优化与问题修复，都在这里透明记录。',
  changelog_empty_title: '暂无更新',
  changelog_empty_desc: '后续发布的新功能与优化内容将持续更新在这里。',
  changelog_read_docs: '阅读文档',
  changelog_try_app: '开始体验 →',
  changelog_back: '返回更新日志',
  changelog_prev: '上一篇',
  changelog_next: '下一篇',
  changelog_all_updates: '全部更新',};

// ---------------------------------------------------------------------------
// Message table & public API
// ---------------------------------------------------------------------------

const messages: Record<SiteLocale, Record<MarketingKey, string>> = {
  en,
  'zh-Hans-CN': zhHansCN,
};

/**
 * Get a marketing translation string.
 *
 *   mt('en', 'hero_title_1')           → "Don't just chat."
 *   mt('zh-Hans-CN', 'hero_title_1')   → "不只是聊天。"
 */
export function mt(locale: SiteLocale | undefined, key: MarketingKey): string {
  const loc = locale ?? 'en';
  const table = messages[loc] ?? messages.en;
  return table[key] ?? messages.en[key] ?? key;
}
