import { Page } from '@playwright/test';

export type ScenarioState = {
  name: string;
  advanced: boolean;
  hasByok: boolean;
  provider: string;
  treeId: string;
  trees: any[];
  lastStartPayload?: any;
  lastTurnPayload?: any;
  lastProfile?: string | null;
  lastScope?: string | null;
};

type SetupOptions = {
  name: string;
  advanced?: boolean;
  hasByok?: boolean;
  treeId: string;
};

export async function setupContextMocks(page: Page, options: SetupOptions): Promise<ScenarioState> {
  const state: ScenarioState = {
    name: options.name,
    advanced: options.advanced ?? false,
    hasByok: options.hasByok ?? false,
    provider: options.advanced ? 'openai' : 'omytree-default',
    treeId: options.treeId,
    trees: [],
    lastProfile: null,
    lastScope: null,
  };

  page.on('console', (msg) => {
    // eslint-disable-next-line no-console
    console.log('[browser]', msg.text());
  });

  const sessionUser = () => ({
    id: `user-${state.name}`,
    email: `${state.name}@e2e.test`,
    name: `User ${state.name}`,
    preferred_language: 'en',
    enable_advanced_context: state.advanced,
    role: 'user',
    is_active: true,
    emailVerified: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });

  const defaultProvider = (enabled: boolean) => ({
    id: 'omytree-default',
    name: 'oMyTree Default',
    badge: 'Platform',
    isByok: false,
    disabled: !enabled,
    disabled_reason: enabled ? null : '高级模式开启后不可选择平台默认模型',
    models: [
      {
        id: 'gpt-lite',
        name: 'GPT-Lite',
        description: 'Platform default model',
        enabled,
      },
    ],
  });

  const byokProvider = () => ({
    id: 'openai',
    name: 'OpenAI',
    badge: 'BYOK',
    isByok: true,
    hasApiKey: state.hasByok,
    models: [
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o mini',
        description: 'BYOK test model',
        enabled: state.hasByok,
      },
    ],
  });

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;

    // Session endpoint used by NextAuth client
    if (pathname.startsWith('/api/auth/session')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: sessionUser(), expires: '2999-01-01T00:00:00.000Z' }),
      });
    }

    // LLM settings
    if (pathname.startsWith('/api/account/llm-settings')) {
      if (route.request().method() === 'POST') {
        let body: any = {};
        try {
          body = route.request().postDataJSON();
        } catch (err) {
          body = {};
        }
        // eslint-disable-next-line no-console
        console.log('[mock:llm-settings]', body);
        if (typeof body.enable_advanced_context === 'boolean') {
          state.advanced = body.enable_advanced_context;
        }
        if (typeof body.provider === 'string') {
          state.provider = body.provider;
        } else if (state.advanced && state.hasByok) {
          state.provider = 'openai';
        }
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          provider: state.provider,
          enable_advanced_context: state.advanced,
          advanced_available: state.hasByok,
          advanced_disabled_reason: state.hasByok
            ? null
            : '需先添加并启用至少一个自带模型 API Key 才能开启高级模式',
          has_key: state.hasByok,
        }),
      });
    }

    // Available models
    if (pathname.startsWith('/api/account/available-models')) {
      const providers = [];
      if (state.advanced) {
        if (state.hasByok) {
          providers.push(byokProvider());
        }
        providers.push(defaultProvider(false));
      } else {
        providers.push(defaultProvider(true));
        if (state.hasByok) {
          providers.push(byokProvider());
        }
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          providers,
          enable_advanced_context: state.advanced,
        }),
      });
    }

    // API keys (minimal)
    if (pathname.startsWith('/api/account/api-keys')) {
      const keys = state.hasByok
        ? [
            {
              id: 'key-openai',
              provider: 'openai',
              label: 'Test Key',
              api_key_masked: 'sk-****1234',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]
        : [];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, keys }),
      });
    }

    // BYOK providers (kept empty to avoid extra UI noise)
    if (pathname.startsWith('/api/account/user-providers')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, providers: [] }),
      });
    }

    // Trees list
    if (pathname.startsWith('/api/trees')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, trees: state.trees }),
      });
    }

    // Start a new tree (SSE)
    if (pathname.startsWith('/api/tree/start-root/stream')) {
      let body: any = {};
      try {
        body = route.request().postDataJSON();
      } catch {
        body = {};
      }
      state.lastStartPayload = body;
      const profile = state.advanced ? body.context_profile || 'lite' : 'lite';
      const scope = state.advanced ? body.memory_scope || 'branch' : 'branch';
      state.lastProfile = profile;
      state.lastScope = scope;
      const now = new Date().toISOString();
      const treeId = state.treeId;
      const userText = body.user_text || 'New tree';
      const rootNode = {
        id: `${treeId}-root`,
        tree_id: treeId,
        parent_id: null,
        level: 0,
        role: 'user',
        text: userText,
        created_at: now,
        context_profile: profile,
        memory_scope: scope,
      };
      const userNode = {
        id: `${treeId}-user`,
        tree_id: treeId,
        parent_id: rootNode.id,
        level: 1,
        role: 'user',
        text: userText,
        created_at: now,
        context_profile: profile,
        memory_scope: scope,
      };
      const aiNode = {
        id: `${treeId}-ai`,
        tree_id: treeId,
        parent_id: userNode.id,
        level: 2,
        role: 'ai',
        text: 'Stub answer',
        created_at: now,
        context_profile: profile,
        memory_scope: scope,
        provider: state.provider,
        model: state.provider === 'openai' ? 'gpt-4o-mini' : 'default',
        is_byok: state.provider !== 'omytree-default',
      };
      state.trees = [
        {
          id: treeId,
          topic: userText,
          display_title: null,
          root_title: userText,
          title: userText,
          created_at: now,
          updated_at: now,
        },
      ];

      // eslint-disable-next-line no-console
      console.log('[mock:start-root]', { profile, scope, userText });

      const sseBody = [
        `data: ${JSON.stringify({ type: 'start', tree: { id: treeId, topic: userText, created_at: now, context_profile: profile, memory_scope: scope }, root_node: rootNode, user_node: userNode })}`,
        '',
        `data: ${JSON.stringify({ type: 'done', tree: { id: treeId, topic: userText, created_at: now, context_profile: profile, memory_scope: scope }, root_node: rootNode, user_node: userNode, ai_node: aiNode })}`,
        '',
      ].join('\n');

      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: sseBody,
      });
    }

    // Subsequent turn stream (not heavily used in these scenarios)
    if (pathname.startsWith('/api/turn/stream')) {
      let body: any = {};
      try {
        body = route.request().postDataJSON();
      } catch {
        body = {};
      }
      state.lastTurnPayload = body;
      const profile = body.context_profile || state.lastProfile || 'lite';
      const scope = body.memory_scope || state.lastScope || 'branch';
      const now = new Date().toISOString();
      const treeId = body.tree_id || state.treeId;
      const aiNode = {
        id: `${treeId}-ai-2`,
        tree_id: treeId,
        parent_id: body.node_id || `${treeId}-user`,
        level: 3,
        role: 'ai',
        text: 'Second answer',
        created_at: now,
        context_profile: profile,
        memory_scope: scope,
        provider: body.provider || state.provider,
        model: body.model || 'byok-model',
        is_byok: (body.provider || state.provider) !== 'omytree-default',
      };

      const sseBody = [
        `data: ${JSON.stringify({ type: 'start', tree: { id: treeId, context_profile: profile, memory_scope: scope }, user_node: { id: body.node_id || `${treeId}-user`, parent_id: null, role: 'user', text: body.user_text || 'Follow up', level: 1, created_at: now } })}`,
        '',
        `data: ${JSON.stringify({ type: 'done', tree: { id: treeId, context_profile: profile, memory_scope: scope }, ai_node: aiNode })}`,
        '',
      ].join('\n');

      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: sseBody,
      });
    }

    // QA tree snapshot
    if (pathname.includes('/qa')) {
      const match = pathname.match(/\/api\/tree\/([^/]+)\/qa/);
      const treeId = match?.[1] || state.treeId;
      const profile = state.lastProfile || (state.advanced ? 'lite' : 'lite');
      const scope = state.lastScope || 'branch';
      const qaNode = {
        id: `${treeId}-qa-root`,
        tree_id: treeId,
        user_node_id: `${treeId}-root`,
        user_text: 'Root question',
        ai_node_id: `${treeId}-ai`,
        ai_text: 'Stub answer',
        parent_id: null,
        children_ids: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        context_profile: profile,
        memory_scope: scope,
      };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, nodes: [qaNode], root_id: qaNode.id }),
      });
    }

    // Fallback for other API calls to keep UI calm
    // eslint-disable-next-line no-console
    console.warn('[mock:fallback]', route.request().url());
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  return state;
}
