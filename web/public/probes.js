  (function () {
    const LENS_MAX_LENGTH = 280;
    const lensState = {
    nodeId: null,
    original: { path_summary: '', parent_summary: '' },
    current: { path_summary: '', parent_summary: '' },
    lastSaved: { path_summary: '', parent_summary: '' },
    updatedAt: null,
    placeholders: { path: '', parent: '' },
    saveButton: null,
    messageEl: null,
    updatedEl: null,
    loading: false
  };
  const chatState = {
    container: null,
    treeId: null,
    rootNodeId: null,
    currentNodeId: null,
    anchorNodeId: null,
    textarea: null,
    submitButton: null,
    withAiToggle: null,
    targetEl: null,
    statusEl: null,
    errorEl: null,
    submitting: false,
    lastRoute: null,
    lastRouteReason: null,
    lastRouteScore: null,
    pendingNodeId: null,
    modalEl: null,
    modalTitle: null,
    modalMessage: null,
    modalReason: null,
    modalPrimary: null,
    modalSecondary: null,
    modalPrimaryAction: null,
    modalSecondaryAction: null,
    modalTertiary: null,
    modalTertiaryAction: null,
    modalLoading: false,
    hint: null,
    hintContainer: null,
    hintTitle: null,
    hintButton: null,
    hintAbortController: null,
    pendingDecision: null
  };

  const fragmentInputState = {
    root: null,
    textarea: null,
    button: null,
    errorEl: null,
    buttonLabel: '发送片段',
    pending: false
  };

  const turnRetryState = {
    container: null,
    button: null,
    messageEl: null,
    errorEl: null,
    pending: false,
    turnId: null
  };

  function encodeJson(value) {
    try {
      const json = JSON.stringify(value ?? null);
      if (typeof TextEncoder !== 'undefined') {
        const bytes = new TextEncoder().encode(json);
        let binary = '';
        for (let index = 0; index < bytes.length; index += 1) {
          binary += String.fromCharCode(bytes[index]);
        }
        return window.btoa(binary);
      }

      return window.btoa(json);
    } catch (error) {
      console.warn('[Dataset] Failed to encode JSON', error);
      return '';
    }
  }

  function decodeJson(encoded) {
    if (!encoded) {
      return null;
    }

    try {
      const binary = window.atob(encoded);
      if (typeof TextDecoder !== 'undefined') {
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        const json = new TextDecoder().decode(bytes);
        return JSON.parse(json);
      }

      return JSON.parse(binary);
    } catch (error) {
      console.warn('[Dataset] Failed to decode JSON', error);
      return null;
    }
  }

  function normalizeAttr(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }

  function getMainElement() {
    return document.querySelector('main[data-tree]');
  }

  function resolveFragmentParentId() {
    const main = getMainElement();
    if (!main) {
      return null;
    }

    const nodeAttr = normalizeAttr(main.getAttribute('data-node'));
    if (nodeAttr) {
      return nodeAttr;
    }

    const rootAttr = normalizeAttr(main.getAttribute('data-root'));
    return rootAttr || null;
  }

  function normalizeSiblingTitle(value) {
    if (typeof value !== 'string') {
      return '（未命名）';
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : '（未命名）';
  }

  function deriveSiblingSubtitle(source) {
    if (typeof source !== 'string') {
      return null;
    }

    const normalized = source.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return null;
    }

    const sentenceMatch = normalized.match(/(.+?[。.!?！？])(?=\s|$)/);
    const candidate = sentenceMatch ? sentenceMatch[1] : normalized;
    if (!candidate) {
      return null;
    }

    return candidate.length > 160 ? `${candidate.slice(0, 159)}…` : candidate;
  }

  function buildSiblingsEntries(local) {
    if (!local || !local.node || typeof local.node.id !== 'string') {
      return [];
    }

    const currentId = local.node.id;
    const rawList = Array.isArray(local.siblings_summary) ? local.siblings_summary : [];
    const entries = [];
    const seen = new Set();

    function toEntry(raw) {
      if (!raw || typeof raw.id !== 'string') {
        return null;
      }

      const titleSource =
        (typeof raw.title === 'string' && raw.title.trim().length > 0 && raw.title) ||
        (typeof raw.text === 'string' && raw.text.trim().length > 0 && raw.text) ||
        (raw.id === currentId && typeof local.node.text === 'string' ? local.node.text : '');

      let subtitleSource = '';
      if (typeof raw.ai_preview === 'string' && raw.ai_preview.trim()) {
        subtitleSource = raw.ai_preview;
      } else if (typeof raw.path_summary === 'string' && raw.path_summary.trim()) {
        subtitleSource = raw.path_summary;
      } else if (typeof raw.parent_summary === 'string' && raw.parent_summary.trim()) {
        subtitleSource = raw.parent_summary;
      }

      return {
        id: raw.id,
        role: typeof raw.role === 'string' && raw.role ? raw.role : 'user',
        title: normalizeSiblingTitle(titleSource),
        has_ai: Boolean(raw.has_ai),
        created_at: typeof raw.created_at === 'string' ? raw.created_at : null,
        updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : null,
        subtitle: deriveSiblingSubtitle(subtitleSource) || null
      };
    }

    const currentRaw = rawList.find((item) => item && item.id === currentId);
    if (currentRaw) {
      const entry = toEntry(currentRaw);
      if (entry) {
        entries.push(entry);
        seen.add(entry.id);
      }
    }

    for (const raw of rawList) {
      if (!raw || seen.has(raw.id)) {
        continue;
      }

      const entry = toEntry(raw);
      if (entry) {
        entries.push(entry);
        seen.add(entry.id);
      }

      if (entries.length >= 20) {
        break;
      }
    }

    if (!seen.has(currentId)) {
      const fallbackRaw = {
        id: currentId,
        role: local.node.role || 'user',
        title: typeof local.node.text === 'string' ? local.node.text : '',
        has_ai: Boolean(local.ai_reply),
        created_at: typeof local.node.created_at === 'string' ? local.node.created_at : null,
        updated_at: null,
        ai_preview:
          local.ai_reply && typeof local.ai_reply.text === 'string' ? local.ai_reply.text : '',
        path_summary: Array.isArray(local.path_titles)
          ? local.path_titles.filter(Boolean).join(' / ')
          : '',
        parent_summary:
          local.parent && typeof local.parent.text === 'string' ? local.parent.text : ''
      };

      const fallback = toEntry(fallbackRaw);
      if (fallback) {
        entries.unshift(fallback);
        seen.add(currentId);
      }
    }

    return entries.slice(0, 20);
  }

  function decodeSiblingsDataset() {
    const main = document.querySelector('main[data-tree]');
    if (!main) {
      return [];
    }

    const encoded = main.getAttribute('data-siblings-state');
    const parsed = decodeJson(encoded);
    return Array.isArray(parsed) ? parsed : [];
  }

  function updateSiblingsView(nodeId, local) {
    let entries = [];

    if (nodeId && local) {
      entries = buildSiblingsEntries(local);
    } else if (nodeId) {
      entries = decodeSiblingsDataset();
    }

    renderSiblingsPanel(nodeId, entries);
  }

  function renderSiblingsPanel(nodeId, entries) {
    const container = document.getElementById('siblings');
    const main = document.querySelector('main[data-tree]');
    const encoded = encodeJson(entries);

    if (main) {
      main.setAttribute('data-siblings-state', encoded);
    }

    if (!container) {
      return;
    }

    container.setAttribute('data-siblings-state', encoded);

    let html = '<h2 class="mb-3 text-lg font-semibold">兄弟节点</h2>';

    if (!nodeId) {
      container.innerHTML = `${html}<p class="text-sm text-gray-500">请选择节点以查看兄弟列表</p>`;
      return;
    }

    if (!entries || entries.length === 0) {
      container.innerHTML = `${html}<p class="text-sm text-gray-500">暂无兄弟节点</p>`;
      return;
    }

    const others = entries.filter((item) => item.id !== nodeId);
    html += '<div class="space-y-3">';

    entries.forEach((entry) => {
      const preview = `
        <div class="flex items-start justify-between">
          <span class="font-medium text-gray-900 truncate">${escapeHtml(entry.title)}</span>
          ${entry.has_ai ? '<span class="ml-2 text-xs font-semibold text-green-600">AI</span>' : ''}
        </div>
        ${entry.subtitle ? `<p class="mt-1 text-xs text-gray-500 truncate">${escapeHtml(entry.subtitle)}</p>` : ''}
      `;

      if (entry.id === nodeId) {
        html += `
          <div class="rounded border border-blue-500 bg-blue-50 p-3" data-node-id="${entry.id}" data-sibling-card="current">
            ${preview}
          </div>
        `;
        return;
      }

      const href = `?node=${encodeURIComponent(entry.id)}`;
      html += `
        <a
          href="${href}"
          data-sibling-link="true"
          data-node-id="${entry.id}"
          class="block rounded border border-gray-200 bg-white p-3 transition hover:border-blue-400 hover:bg-blue-50"
        >
          ${preview}
        </a>
      `;
    });

    if (others.length === 0) {
      html += '<p class="text-xs text-gray-400">暂无兄弟节点</p>';
    }

    html += '</div>';
    container.innerHTML = html;
  }

  const RELATIVE_TIME_FORMATTER =
    typeof Intl !== 'undefined' && typeof Intl.RelativeTimeFormat !== 'undefined'
      ? new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' })
      : null;

  function normalizeTimelineEntry(raw, fallbackKind) {
    if (!raw || typeof raw.id !== 'string') {
      return null;
    }

    const titleSource =
      (typeof raw.title === 'string' && raw.title.trim()) ||
      (typeof raw.text === 'string' && raw.text.trim()) ||
      '';

    return {
      id: raw.id,
      role: typeof raw.role === 'string' && raw.role ? raw.role : 'user',
      title: titleSource ? titleSource.slice(0, 80) : '（未命名）',
      created_at: typeof raw.created_at === 'string' ? raw.created_at : null,
      kind: raw.kind === 'trunk' || raw.kind === 'direct' ? raw.kind : fallbackKind
    };
  }

  function normalizeTimelinePayload(raw) {
    const trunkSource = raw && Array.isArray(raw.trunk) ? raw.trunk : [];
    const directSource = raw && Array.isArray(raw.direct) ? raw.direct : [];

    const trunk = trunkSource
      .map((item) => normalizeTimelineEntry(item, 'trunk'))
      .filter(Boolean);
    const direct = directSource
      .map((item) => normalizeTimelineEntry(item, 'direct'))
      .filter(Boolean);

    return { trunk, direct };
  }

  function decodeTimelineDataset() {
    const main = document.querySelector('main[data-tree]');
    if (!main) {
      return { trunk: [], direct: [] };
    }

    const encoded = main.getAttribute('data-timeline-state') || '';
    const parsed = decodeJson(encoded);
    return normalizeTimelinePayload(parsed || {});
  }

  function formatRelativeTimeText(value) {
    if (!value) {
      return '';
    }

    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) {
      return '';
    }

    const diffMs = timestamp - Date.now();
    const absMs = Math.abs(diffMs);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;
    const month = 30 * day;
    const year = 365 * day;

    const formatter = RELATIVE_TIME_FORMATTER;
    const fallback = new Date(timestamp).toLocaleString();

    if (!formatter) {
      return fallback;
    }

    if (absMs < minute) {
      return formatter.format(Math.round(diffMs / 1000), 'second');
    }
    if (absMs < hour) {
      return formatter.format(Math.round(diffMs / minute), 'minute');
    }
    if (absMs < day) {
      return formatter.format(Math.round(diffMs / hour), 'hour');
    }
    if (absMs < week) {
      return formatter.format(Math.round(diffMs / day), 'day');
    }
    if (absMs < month) {
      return formatter.format(Math.round(diffMs / week), 'week');
    }
    if (absMs < year) {
      return formatter.format(Math.round(diffMs / month), 'month');
    }
    return formatter.format(Math.round(diffMs / year), 'year');
  }

  function buildTimelineEntry(entry, nodeId) {
    const title = escapeHtml(entry.title || '（未命名）');
    const role = escapeHtml(entry.role || '');
    const relative = escapeHtml(formatRelativeTimeText(entry.created_at) || '刚刚');
    const content = `
      <div class="flex items-center justify-between gap-3">
        <span class="truncate font-medium text-gray-900">${title}</span>
        <span class="text-xs text-gray-500">${relative}</span>
      </div>
      <div class="text-xs uppercase tracking-wide text-gray-400">${role}</div>
    `;
    const safeId = escapeHtml(entry.id);

    if (entry.id === nodeId) {
      return `
        <div class="rounded border border-blue-500 bg-blue-50 p-3" data-node-id="${safeId}" data-timeline-current="true">
          ${content}
        </div>
      `;
    }

    const href = `?node=${encodeURIComponent(entry.id)}`;
    return `
      <a
        href="${href}"
        data-timeline-link="true"
        data-node-id="${safeId}"
        class="block rounded border border-gray-200 bg-white p-3 transition hover:border-blue-400 hover:bg-blue-50"
      >
        ${content}
      </a>
    `;
  }

  function buildTimelineGroup(label, entries, nodeId) {
    let html = `
      <div>
        <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          ${escapeHtml(label)}
        </div>
    `;

    if (!entries || entries.length === 0) {
      html += '<p class="text-xs text-gray-400">暂无</p></div>';
      return html;
    }

    html += '<div class="space-y-2">';
    entries.forEach((entry) => {
      html += buildTimelineEntry(entry, nodeId);
    });
    html += '</div></div>';
    return html;
  }

  function renderTimelinePanel(nodeId, data) {
    const container = document.getElementById('timeline');
    if (!container) {
      return;
    }

    const main = document.querySelector('main[data-tree]');
    const timeline = normalizeTimelinePayload(data || {});
    const encoded = encodeJson(timeline);

    if (main) {
      main.setAttribute('data-timeline-state', encoded);
    }
    container.setAttribute('data-timeline-state', encoded);

    let html = '<h2 class="mb-3 text-lg font-semibold">时间回放</h2>';

    if (!nodeId) {
      container.innerHTML = `${html}<p class="text-sm text-gray-500">请选择节点以查看时间回放</p>`;
      return;
    }

    const total = timeline.trunk.length + timeline.direct.length;
    if (total === 0) {
      container.innerHTML = `${html}<p class="text-sm text-gray-500">暂无历史</p>`;
      return;
    }

    html += '<div class="space-y-4">';
    html += buildTimelineGroup('主干', timeline.trunk, nodeId);
    html += buildTimelineGroup('直系', timeline.direct, nodeId);
    html += '</div>';
    container.innerHTML = html;
  }

  async function updateTimelineView(nodeId) {
    const container = document.getElementById('timeline');
    const main = document.querySelector('main[data-tree]');

    if (!container) {
      return null;
    }

    if (!nodeId) {
      if (main) {
        main.setAttribute('data-timeline-state', '');
      }
      container.setAttribute('data-timeline-state', '');
      container.innerHTML =
        '<h2 class="mb-3 text-lg font-semibold">时间回放</h2><p class="text-sm text-gray-500">请选择节点以查看时间回放</p>';
      return null;
    }

    container.innerHTML =
      '<h2 class="mb-3 text-lg font-semibold">时间回放</h2><p class="text-sm text-gray-500">加载中...</p>';

    try {
      const apiBase = window.location.origin;
      const response = await fetch(`${apiBase}/api/node/${nodeId}/timeline?limit=30&order=desc`, {
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data.ok || !data.timeline) {
        throw new Error('Invalid response');
      }

      const normalized = normalizeTimelinePayload(data.timeline);
      renderTimelinePanel(nodeId, normalized);
      return normalized;
    } catch (error) {
      console.error('[Timeline] Failed to load:', error);
      container.innerHTML =
        '<h2 class="mb-3 text-lg font-semibold">时间回放</h2><p class="text-sm text-red-600">时间回放加载失败，可稍后重试</p>';
      if (main) {
        main.setAttribute('data-timeline-state', '');
      }
      container.setAttribute('data-timeline-state', '');
      return null;
    }
  }

  function computeLensStatus() {
    if (lensState.loading) {
      return { status: 'loading', label: '加载中...', disabled: true };
    }

    if (!lensState.nodeId) {
      return { status: 'disabled', label: '保存', disabled: true };
    }

    const isDirty =
      lensState.current.path_summary !== lensState.lastSaved.path_summary ||
      lensState.current.parent_summary !== lensState.lastSaved.parent_summary;

    if (isDirty) {
      return { status: 'dirty', label: '保存', disabled: false };
    }

    if (lensState.updatedAt === null) {
      return { status: 'unsaved', label: '尚未保存', disabled: true };
    }

    return { status: 'saved', label: '已保存', disabled: true };
  }

  function navigate(nodeId, options = {}) {
    const normalized = normalizeAttr(nodeId);
    const url = new URL(window.location.href);
    if (normalized) {
      url.searchParams.set('node', normalized);
    } else {
      url.searchParams.delete('node');
    }

    syncChatNode(normalized);
    const useReplace = options.replace === true;
    if (useReplace) {
      history.replaceState({}, '', url.toString());
    } else {
      history.pushState({}, '', url.toString());
    }

    const main = getMainElement();
    if (main) {
      main.setAttribute('data-node', normalized || '');
    }

    window.dispatchEvent(
      new CustomEvent('linzhi:navigate', {
        detail: {
          nodeId: normalized,
          url: url.toString(),
          timestamp: Date.now()
        }
      })
    );

    return updateLocalView(normalized)
      .catch((error) => {
        console.error('[Navigate] Failed to load local view:', error);
        return null;
      })
      .then((local) => {
        updateTimelineView(normalized);
        return fetchLens(normalized, local);
      })
      .then(() => fetchHint(normalized));
  }

  // 更新 local view 片段（无刷新）
  async function updateLocalView(nodeId) {
    const container = document.getElementById('local-view');
    if (!container) {
      console.warn('[LocalView] Container #local-view not found');
      return null;
    }

    const main = document.querySelector('main[data-tree]');

    if (!nodeId) {
      container.innerHTML = '<div class="text-gray-500 text-sm">请选择节点以查看上下文</div>';
      if (main) {
        main.setAttribute('data-local', '');
        main.setAttribute('data-node', '');
      }
      updateSiblingsView(null, null);
      return null;
    }

    container.innerHTML = '<div class="text-gray-500 text-sm">Loading...</div>';

    try {
      const apiBase = window.location.origin;
      const response = await fetch(`${apiBase}/api/node/${nodeId}/local`, {
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data.ok || !data.local) {
        throw new Error('Invalid response structure');
      }

      renderLocalView(container, data.local);

      if (main) {
        const localBase64 = encodeJson(data.local);
        main.setAttribute('data-local', localBase64);
        main.setAttribute('data-node', nodeId);
      }

      updateSiblingsView(nodeId, data.local);
      updateMiniTreeView(nodeId, data.local);
      updateFragmentView(data.local);

      return data.local;
    } catch (error) {
      console.error('[LocalView] Failed to update:', error);
      container.innerHTML = `
        <div class="text-red-600 text-sm">
          <p>Failed to load local view: ${escapeHtml(error.message)}</p>
          <button onclick="location.reload()" class="mt-2 px-3 py-1 bg-blue-500 text-white rounded text-xs">
            Retry
          </button>
        </div>
      `;

      if (main) {
        main.setAttribute('data-local', '');
        main.setAttribute('data-node', nodeId);
      }

      updateSiblingsView(nodeId, null);

      return null;
    }
  }

  // 渲染 local view HTML
  function renderLocalView(container, local) {
    let html = '<h2 class="text-lg font-semibold mb-3">Local View</h2><div class="space-y-4">';

    if (local.node) {
      const role = local.node.role || 'Node';
      html += `
        <div class="border-l-4 border-blue-500 pl-4">
          <div class="text-xs text-gray-500 uppercase mb-1">${escapeHtml(role)}</div>
          <div class="font-medium">${escapeHtml(local.node.text || '')}</div>
        </div>
      `;
    }

    if (local.parent) {
      html += `
        <div class="text-sm text-gray-600">
          Parent: <span class="font-mono text-xs">${escapeHtml(local.parent.text || '')}</span>
        </div>
      `;
    }

    if (local.ai_reply) {
      html += `
        <div class="border-l-4 border-green-500 pl-4 bg-white p-3 rounded">
          <div class="text-xs text-gray-500 uppercase mb-1">AI Reply</div>
          <div>${escapeHtml(local.ai_reply.text || '')}</div>
        </div>
      `;
    }

    if (local.turn) {
      const statusColor =
        local.turn.status === 'completed'
          ? 'text-green-600'
          : local.turn.status === 'pending'
          ? 'text-yellow-600'
          : 'text-red-600';
      html += `
        <div class="text-xs text-gray-500">
          Turn: <span class="font-semibold ${statusColor}">${escapeHtml(local.turn.status || 'unknown')}</span>
        </div>
      `;
    }

    html += '</div>';
    container.innerHTML = html;
  }

  // 更新 MiniTree 视图
  function updateMiniTreeView(nodeId, local) {
    const miniTree = document.getElementById('mini-tree');
    if (!miniTree) {
      return;
    }

    if (!local || !local.node) {
      miniTree.innerHTML = '<h2 class="text-sm font-semibold text-gray-700 mb-2">树结构</h2><p class="text-xs text-gray-500">选择节点后显示</p>';
      return;
    }

    let html = '<h2 class="mb-3 text-sm font-semibold text-gray-700">树结构</h2><div class="space-y-2 text-xs">';

    // 父节点
    if (local.parent) {
      html += `
        <div class="flex items-start gap-2">
          <span class="pt-1 text-gray-400">↑</span>
          <button type="button" data-mini-tree-parent data-node-id="${escapeHtml(local.parent.id)}" class="flex-1 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-left text-gray-600 transition hover:border-blue-400 hover:bg-blue-50 active:bg-blue-100">
            <span class="truncate">${escapeHtml(local.parent.text || '（无标题）')}</span>
          </button>
        </div>
      `;
    }

    // 当前节点
    html += `
      <div class="flex items-start gap-2">
        <span class="pt-1 text-gray-700">●</span>
        <div class="flex-1 rounded border-2 border-blue-500 bg-blue-50 px-2 py-1">
          <span class="truncate font-medium text-blue-900">${escapeHtml(local.node.text || '（无标题）')}</span>
        </div>
      </div>
    `;

    // 子节点
    const children = Array.isArray(local.children) ? local.children : [];
    if (children.length > 0) {
      children.forEach((child) => {
        html += `
          <div class="flex items-start gap-2">
            <span class="pt-1 text-gray-400">↓</span>
            <button type="button" data-mini-tree-child data-node-id="${escapeHtml(child.id)}" class="flex-1 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-left text-gray-600 transition hover:border-blue-400 hover:bg-blue-50 active:bg-blue-100">
              <span class="truncate">${escapeHtml(child.text || '（无标题）')}</span>
            </button>
          </div>
        `;
      });
    } else if (local.parent) {
      html += '<p class="text-xs text-gray-400">无子节点</p>';
    }

    html += '</div>';
    miniTree.innerHTML = html;

    // 绑定 MiniTree 按钮事件
    bindMiniTreeEvents();
  }

  // 绑定 MiniTree 事件处理
  function bindMiniTreeEvents() {
    const miniTree = document.getElementById('mini-tree');
    if (!miniTree) {
      return;
    }

    // 父节点按钮
    const parentBtn = miniTree.querySelector('[data-mini-tree-parent]');
    if (parentBtn) {
      parentBtn.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('data-node-id');
        if (targetId) {
          navigate(targetId);
        }
      });
    }

    // 子节点按钮
    const childBtns = miniTree.querySelectorAll('[data-mini-tree-child]');
    childBtns.forEach((btn) => {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('data-node-id');
        if (targetId) {
          navigate(targetId);
        }
      });
    });
  }

  // 更新 FragmentView 视图
  function updateFragmentView(local) {
    const fragmentView = document.getElementById('fragment-view');
    if (!fragmentView) {
      return;
    }

    const roleLabelEl = fragmentView.querySelector('[data-fragment-role-label]');
    const textEl = fragmentView.querySelector('[data-fragment-text]');
    const bodyEl = fragmentView.querySelector('[data-fragment-body]');

    if (!roleLabelEl || !textEl || !bodyEl) {
      return;
    }

    if (!local || !local.node) {
      roleLabelEl.textContent = '当前片段';
      textEl.textContent = '（无内容）';
      bodyEl.setAttribute('data-fragment-empty', 'true');
      updateTurnRetryPanel(null);
      return;
    }

    bodyEl.removeAttribute('data-fragment-empty');
    const role = local.node.role || 'user';
    roleLabelEl.textContent = role === 'ai' ? 'AI 回复' : '用户问题';
    const rawText = typeof local.node.text === 'string' ? local.node.text : '';
    const hasText = rawText.trim().length > 0;
    textEl.textContent = hasText ? rawText : '（无内容）';
    updateTurnRetryPanel(local.turn || null);
  }

  function ensureTurnRetryElements() {
    if (turnRetryState.container && document.body.contains(turnRetryState.container)) {
      return turnRetryState.container;
    }
    const panel = document.querySelector('[data-turn-retry]');
    if (!panel) {
      turnRetryState.container = null;
      turnRetryState.button = null;
      turnRetryState.messageEl = null;
      turnRetryState.errorEl = null;
      return null;
    }
    turnRetryState.container = panel;
    turnRetryState.button = panel.querySelector('[data-turn-retry-button]');
    turnRetryState.messageEl = panel.querySelector('[data-turn-retry-message]');
    turnRetryState.errorEl = panel.querySelector('[data-turn-retry-error]');
    return panel;
  }

  function updateTurnRetryPanel(turn) {
    const panel = ensureTurnRetryElements();
    if (!panel) {
      return;
    }
    const button = turnRetryState.button;
    const errorEl = turnRetryState.errorEl;

    if (!turn || turn.ai_pending !== true) {
      panel.classList.add('hidden');
      panel.setAttribute('data-turn-status', '');
      panel.setAttribute('data-turn-id', '');
      turnRetryState.turnId = null;
      setTurnRetryError('');
      setTurnRetryPending(false);
      if (button) {
        button.disabled = true;
      }
      return;
    }

    panel.classList.remove('hidden');
    panel.setAttribute('data-turn-status', turn.status || 'pending');
    panel.setAttribute('data-turn-id', turn.id || '');
    if (turnRetryState.messageEl) {
      turnRetryState.messageEl.textContent =
        'AI 回答暂时未生成，可尝试补答。';
    }
    turnRetryState.turnId = turn.id || null;
    if (button && !turnRetryState.pending) {
      button.disabled = false;
      button.textContent = '点击补答';
      button.setAttribute('data-turn-id', turn.id || '');
    }
  }

  function setTurnRetryPending(pending) {
    const button = turnRetryState.button;
    turnRetryState.pending = Boolean(pending);
    if (button) {
      button.disabled = turnRetryState.pending || !turnRetryState.turnId;
      button.textContent = turnRetryState.pending ? '补答中…' : '点击补答';
    }
  }

  function setTurnRetryError(message) {
    const errorEl = turnRetryState.errorEl;
    if (!errorEl) {
      return;
    }
    if (message) {
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
    } else {
      errorEl.textContent = '';
      errorEl.classList.add('hidden');
    }
  }

  function setFragmentError(message) {
    const errorEl = fragmentInputState.errorEl;
    if (!errorEl) {
      return;
    }

    if (message) {
      errorEl.textContent = message;
    } else {
      errorEl.textContent = '';
    }
  }

  function setFragmentPendingState(pending) {
    fragmentInputState.pending = Boolean(pending);
    const button = fragmentInputState.button;
    if (!button) {
      return;
    }

    button.disabled = fragmentInputState.pending || hasPendingDecision();
    button.textContent = fragmentInputState.pending
      ? '发送中…'
      : fragmentInputState.buttonLabel || '发送片段';
  }

  function submitFragmentTurn() {
    const textarea = fragmentInputState.textarea;
    if (!textarea || fragmentInputState.pending) {
      return;
    }

    if (!ensureNoPendingDecision('fragment')) {
      return;
    }

    const rawValue = textarea.value || '';
    const userText = rawValue.trim();
    if (!userText) {
      setFragmentError('请输入需要发送的内容');
      return;
    }

    const main = getMainElement();
    const treeId = normalizeAttr(main && main.getAttribute('data-tree'));
    if (!treeId) {
      setFragmentError('无法解析树 ID');
      return;
    }

    const parentId = resolveFragmentParentId();
    if (!parentId) {
      setFragmentError('无法确定挂载节点');
      return;
    }

    setFragmentPendingState(true);
    setFragmentError('');

    submitTurn({
      tree_id: treeId,
      node_id: parentId,
      user_text: userText,
      with_ai: true,
      who: 'fragment-input'
    })
      .then((data) => {
        textarea.value = '';
        if (data && data.pending_decision) {
          handlePendingDecisionResponse(data, {
            treeId,
            nodeId: parentId,
            userText,
            withAi: true,
            who: 'fragment-input',
            source: 'fragment'
          });
          return;
        }
        const aiPending = Boolean(data && data.turn && data.turn.ai_pending);
        if (!aiPending) {
          setFragmentError('');
        }
        if (!data || !data.user_node || !data.user_node.id) {
          setFragmentError('发送成功但未返回节点 ID');
          return;
        }
        handleTurnCompletion(data, {
          fromDecision: false,
          source: 'chat',
          aiPending
        });
      })
      .catch((error) => {
        let message = '发送失败，请重试';
        if (error && typeof error.message === 'string' && error.message.trim()) {
          message = error.message.trim();
        }

        if (error && error.response) {
          const response = error.response;
          if (response && typeof response.message === 'string' && response.message.trim()) {
            message = response.message.trim();
          }

          const errorCode = normalizeAttr(response.error_code || response.code);
          if (errorCode) {
            message = `${message}（错误码：${errorCode}）`;
          }
        }

        setFragmentError(message);
      })
      .finally(() => {
        setFragmentPendingState(false);
      });
  }

  function bindFragmentInputEvents() {
    const root = document.querySelector('[data-fragment-input-root]');
    if (!root || root.dataset.fragmentBound === 'true') {
      return;
    }

    const textarea = root.querySelector('[data-fragment-input]');
    const button = root.querySelector('[data-fragment-submit]');
    const errorEl = root.querySelector('[data-fragment-error]');

    fragmentInputState.root = root;
    fragmentInputState.textarea = textarea;
    fragmentInputState.button = button;
    fragmentInputState.errorEl = errorEl;
    fragmentInputState.pending = false;
    fragmentInputState.buttonLabel = (button && button.textContent && button.textContent.trim()) || '发送片段';

    root.dataset.fragmentBound = 'true';

    if (button) {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        submitFragmentTurn();
      });
    }

    if (textarea) {
      textarea.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          submitFragmentTurn();
        }
      });
    }
  }

  // 处理 Lens 初始加载和状态

  async function fetchLens(nodeId, localContext) {
    const elements = hydrateLensElements();
    if (!elements) {
      return;
    }

    const { container: lensContainer, pathField, parentField, messageEl } = elements;
    if (!pathField || !parentField) {
      return;
    }
    const context = localContext || decodeLocalDataset();
    lensState.placeholders = deriveLensPlaceholders(context);

    pathField.placeholder = lensState.placeholders.path;
    parentField.placeholder = lensState.placeholders.parent;

    hydrateLensStateFromDataset(lensContainer);

    if (!nodeId) {
      resetLens(context);
      return;
    }

    const switchingNode = lensState.nodeId !== null && lensState.nodeId !== nodeId;
    lensState.nodeId = nodeId;

    if (switchingNode) {
      lensState.original = { path_summary: '', parent_summary: '' };
      lensState.current = { path_summary: '', parent_summary: '' };
      lensState.lastSaved = { path_summary: '', parent_summary: '' };
      lensState.updatedAt = null;
      pathField.value = '';
      parentField.value = '';
      pathField.disabled = true;
      parentField.disabled = true;
      lensState.loading = true;
      updateLensButton();
    } else {
      pathField.disabled = false;
      parentField.disabled = false;
      lensState.loading = true;
      updateLensButton();
    }
    if (messageEl) {
      messageEl.textContent = '';
      messageEl.classList.add('hidden');
    }

    try {
      const apiBase = window.location.origin;
      const response = await fetch(`${apiBase}/api/node/${nodeId}/lens`, {
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data.ok || !data.lens) {
        throw new Error('Invalid response');
      }

      const lens = data.lens;
      const pathValue = typeof lens.path_summary === 'string' ? lens.path_summary : '';
      const parentValue = typeof lens.parent_summary === 'string' ? lens.parent_summary : '';

      pathField.value = pathValue;
      parentField.value = parentValue;

      lensState.nodeId = nodeId;
      lensState.original = { path_summary: pathValue, parent_summary: parentValue };
      lensState.current = { ...lensState.original };
      lensState.lastSaved = { ...lensState.original };
      lensState.updatedAt = lens.updated_at || null;

      pathField.disabled = false;
      parentField.disabled = false;
      lensState.loading = false;

      updateLensButton();
      updateLensMeta(lens);
    } catch (error) {
      console.error('[Lens] Failed to load lens:', error);
      if (messageEl) {
        messageEl.textContent = '加载 Lens 失败，可稍后重试';
        messageEl.classList.remove('hidden');
      }

      pathField.value = '';
      parentField.value = '';
      pathField.disabled = true;
      parentField.disabled = true;
      lensState.nodeId = null;
      lensState.original = { path_summary: '', parent_summary: '' };
      lensState.current = { path_summary: '', parent_summary: '' };
      lensState.lastSaved = { path_summary: '', parent_summary: '' };
      lensState.updatedAt = null;
      lensState.loading = false;
      updateLensButton();
      updateLensMeta(null);
    }
  }

  function hydrateLensElements(container) {
    const lensContainer = container || document.querySelector('[data-lens]');
    if (!lensContainer) {
      return null;
    }

    const pathField = lensContainer.querySelector('[data-lens-field="path_summary"]');
    const parentField = lensContainer.querySelector('[data-lens-field="parent_summary"]');
    const saveButton = lensContainer.querySelector('[data-lens-save]');
    const messageEl = lensContainer.querySelector('[data-lens-message]');
    const updatedEl = lensContainer.querySelector('[data-lens-updated]');

    lensState.saveButton = saveButton || null;
    lensState.messageEl = messageEl || null;
    lensState.updatedEl = updatedEl || null;

    return { container: lensContainer, pathField, parentField, saveButton, messageEl, updatedEl };
  }

  function hydrateLensStateFromDataset(lensContainer) {
    if (!lensContainer) {
      return;
    }

    const encodedState = lensContainer.getAttribute('data-lens-state');
    if (!encodedState) {
      return;
    }

    try {
      const state = decodeJson(encodedState);
      if (!state || typeof state !== 'object') {
        return;
      }

      if (lensState.nodeId) {
        return;
      }

      const nodeId = typeof state.node_id === 'string' && state.node_id.length > 0 ? state.node_id : null;
      lensState.nodeId = nodeId;
      lensState.original = {
        path_summary: state.path_summary ?? '',
        parent_summary: state.parent_summary ?? ''
      };
      lensState.current = { ...lensState.original };
      lensState.lastSaved = { ...lensState.original };
      lensState.updatedAt = state.updated_at || null;

      updateLensMeta(state);
    } catch (error) {
      console.warn('[Lens] Failed to hydrate from SSR state', error);
    }
  }

  function resetLens(localContext) {
    const elements = hydrateLensElements();
    if (!elements) {
      return;
    }

    const { pathField, parentField, messageEl } = elements;
    if (!pathField || !parentField) {
      return;
    }
    const placeholders = deriveLensPlaceholders(localContext);

    lensState.nodeId = null;
    lensState.original = { path_summary: '', parent_summary: '' };
    lensState.current = { path_summary: '', parent_summary: '' };
    lensState.lastSaved = { path_summary: '', parent_summary: '' };
    lensState.updatedAt = null;
    lensState.loading = false;

    if (pathField) {
      pathField.value = '';
      pathField.placeholder = placeholders.path;
      pathField.disabled = true;
    }

    if (parentField) {
      parentField.value = '';
      parentField.placeholder = placeholders.parent;
      parentField.disabled = true;
    }

    if (messageEl) {
      messageEl.textContent = '';
      messageEl.classList.add('hidden');
    }

    updateLensButton();
    updateLensMeta(null);
  }

  function onLensInput(event) {
    const field = event.target.closest('[data-lens-field]');
    if (!field) {
      return;
    }

    if (!lensState.nodeId) {
      updateLensButton();
      return;
    }

    const key = field.getAttribute('data-lens-field');
    if (key !== 'path_summary' && key !== 'parent_summary') {
      return;
    }

    if (field.value.length > LENS_MAX_LENGTH) {
      field.value = field.value.slice(0, LENS_MAX_LENGTH);
    }

    lensState.current[key] = field.value;

    if (lensState.messageEl) {
      lensState.messageEl.textContent = '';
      lensState.messageEl.classList.add('hidden');
    }

    updateLensButton();
  }

  function onLensSaveClick(event) {
    const button = event.target.closest('[data-lens-save]');
    if (!button) {
      return;
    }

    event.preventDefault();

    if (button.disabled || !lensState.nodeId) {
      return;
    }

    const dirtyPath = lensState.current.path_summary !== lensState.lastSaved.path_summary;
    const dirtyParent = lensState.current.parent_summary !== lensState.lastSaved.parent_summary;

    if (!dirtyPath && !dirtyParent) {
      updateLensButton();
      return;
    }

    const payload = { who: 'web-ui' };
    if (dirtyPath) {
      payload.path_summary = lensState.current.path_summary;
    }
    if (dirtyParent) {
      payload.parent_summary = lensState.current.parent_summary;
    }

    lensState.loading = true;
    updateLensButton();

    saveLens(lensState.nodeId, payload)
      .then((lens) => {
        lensState.lastSaved = {
          path_summary: lens.path_summary ?? '',
          parent_summary: lens.parent_summary ?? ''
        };
        lensState.current = { ...lensState.lastSaved };
        lensState.updatedAt = lens.updated_at || null;
        lensState.loading = false;

        updateLensButton();
        updateLensMeta(lens);

        if (lensState.messageEl) {
          lensState.messageEl.textContent = '已保存';
          lensState.messageEl.classList.remove('hidden');
        }

        window.dispatchEvent(
          new CustomEvent('linzhi:lens:saved', {
            detail: {
              nodeId: lensState.nodeId,
              timestamp: Date.now()
            }
          })
        );
      })
      .catch((error) => {
        console.error('[Lens] Failed to save:', error);
        lensState.loading = false;
        if (lensState.messageEl) {
          lensState.messageEl.textContent = '保存失败，可重试';
          lensState.messageEl.classList.remove('hidden');
        }
        updateLensButton();
      });
  }

  function saveLens(nodeId, payload) {
    const apiBase = window.location.origin;
    return fetch(`${apiBase}/api/node/${nodeId}/lens`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        if (!data.ok || !data.lens) {
          throw new Error('Invalid response');
        }
        return data.lens;
      });
  }

  function updateLensButton() {
    const button = lensState.saveButton;
    if (!button) {
      return;
    }

    const { label, disabled } = computeLensStatus();
    button.textContent = label;
    button.disabled = disabled;
  }

  function updateLensMeta(meta) {
    if (!lensState.updatedEl) {
      return;
    }

    if (!meta || !meta.updated_at) {
      lensState.updatedEl.textContent = '尚未保存';
      return;
    }

    const date = new Date(meta.updated_at);
    const timestamp = Number.isNaN(date.getTime())
      ? meta.updated_at
      : date.toLocaleString();
    const by = (meta.updated_by || '未知').trim();
    lensState.updatedEl.textContent = `最后更新：${timestamp} · ${by}`;
  }

  function deriveLensPlaceholders(local) {
    const defaults = {
      path: '可编辑路径摘要（最多280字）',
      parent: '可编辑父级摘要（最多280字）'
    };

    if (!local) {
      return defaults;
    }

    const titles = Array.isArray(local.path_titles)
      ? local.path_titles.filter(Boolean)
      : [];
    const path = titles.length > 0 ? truncateText(titles.join(' → '), 140) : defaults.path;
    const parentText = local.parent && local.parent.text ? local.parent.text : '';
    const parent = parentText ? truncateText(parentText, 120) : defaults.parent;

    return { path, parent };
  }

  function decodeLocalDataset() {
    const main = document.querySelector('main[data-tree]');
    if (!main) {
      return null;
    }

    const encoded = main.getAttribute('data-local');
    return decodeJson(encoded);
  }

  function truncateText(text, limit) {
    if (typeof text !== 'string') {
      return '';
    }
    return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
  }

  // HTML 转义（防止 XSS）
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function hydrateChatPane() {
    const container = document.querySelector('[data-chat-pane]');
    if (!container) {
      return;
    }

    chatState.container = container;
    chatState.textarea = container.querySelector('[data-chat-input]');
    chatState.submitButton = container.querySelector('[data-chat-submit]');
    chatState.withAiToggle = container.querySelector('[data-chat-with-ai]');
    chatState.targetEl = container.querySelector('[data-chat-target]');
    chatState.statusEl = container.querySelector('[data-chat-status]');
    chatState.errorEl = container.querySelector('[data-chat-error]');
    chatState.modalEl = container.querySelector('[data-chat-modal]');
    chatState.modalTitle = container.querySelector('[data-chat-modal-title]');
    chatState.modalMessage = container.querySelector('[data-chat-modal-message]');
    chatState.modalReason = container.querySelector('[data-chat-modal-reason]');
    chatState.modalPrimary = container.querySelector('[data-chat-modal-primary]');
    chatState.modalSecondary = container.querySelector('[data-chat-modal-secondary]');
    chatState.modalTertiary = container.querySelector('[data-chat-modal-tertiary]');
    chatState.hintContainer = container.querySelector('[data-chat-hint]');
    chatState.hintTitle = container.querySelector('[data-chat-hint-title]');
    chatState.hintButton = container.querySelector('[data-chat-hint-jump]');

    const main = getMainElement();
    const explicitTreeId = normalizeAttr(container.getAttribute('data-tree-id'));
    chatState.treeId = explicitTreeId || normalizeAttr(main && main.getAttribute('data-tree'));

    const explicitRoot = normalizeAttr(container.getAttribute('data-root-node'));
    chatState.rootNodeId = explicitRoot || normalizeAttr(main && main.getAttribute('data-root'));

    chatState.currentNodeId = getActiveNodeId();
    updateChatTarget();
    updateChatControls();
    hideChatModal();
  }

  function getActiveNodeId() {
    const main = getMainElement();
    if (!main) {
      return chatState.rootNodeId;
    }
    const nodeAttr = normalizeAttr(main.getAttribute('data-node'));
    return nodeAttr || chatState.rootNodeId;
  }

  function syncChatNode(nodeId) {
    const normalized = normalizeAttr(nodeId);
    chatState.currentNodeId = normalized || chatState.rootNodeId || null;
    updateChatTarget();
    updateChatControls();
  }

  function resolveChatTargetNodeId() {
    const normalizedCurrent = normalizeAttr(chatState.currentNodeId);
    if (normalizedCurrent) {
      return normalizedCurrent;
    }
    return normalizeAttr(chatState.rootNodeId);
  }

  function updateChatTarget() {
    if (!chatState.targetEl) {
      return;
    }
    const target = resolveChatTargetNodeId();
    chatState.targetEl.textContent = target
      ? `当前挂载节点：${target}`
      : '当前挂载节点：未确定';
  }

  function updateChatStatus(message) {
    if (!chatState.statusEl) {
      return;
    }
    chatState.statusEl.textContent = message || '';
  }

  function renderHintBanner() {
    const container = chatState.hintContainer;
    if (!container) {
      return;
    }
    const button = chatState.hintButton;
    const titleEl = chatState.hintTitle;
    const hint = chatState.hint;

    if (!hint) {
      container.classList.add('hidden');
      container.classList.remove('flex');
      container.setAttribute('data-hint-state', 'empty');
      if (titleEl) {
        titleEl.textContent = '';
      }
      if (button) {
        button.removeAttribute('data-node-id');
        button.disabled = true;
      }
      return;
    }

    if (titleEl) {
      titleEl.textContent = `「${hint.title}」继续？`;
    }
    container.classList.remove('hidden');
    container.classList.add('flex');
    container.setAttribute('data-hint-state', 'ready');
    if (button) {
      button.disabled = false;
      button.setAttribute('data-node-id', hint.node_id);
    }
  }

  function fetchHint(nodeId) {
    if (!chatState.hintContainer) {
      return Promise.resolve(null);
    }
    if (!nodeId) {
      chatState.hint = null;
      renderHintBanner();
      return Promise.resolve(null);
    }

    if (chatState.hintAbortController) {
      chatState.hintAbortController.abort();
    }

    const controller = new AbortController();
    chatState.hintAbortController = controller;

    const apiBase = window.location.origin;
    return fetch(`${apiBase}/api/node/${nodeId}/hints`, { signal: controller.signal })
      .then(async (response) => {
        const text = await response.text();
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = null;
        }

        if (!response.ok) {
          const error = new Error((data && data.message) || `HTTP ${response.status}`);
          error.response = data;
          throw error;
        }
        return data;
      })
      .then((data) => {
        chatState.hint = data && data.hint ? data.hint : null;
        renderHintBanner();
        return chatState.hint;
      })
      .catch((error) => {
        if (error.name === 'AbortError') {
          return null;
        }
        console.warn('[ChatPane] Failed to fetch hint:', error);
        chatState.hint = null;
        renderHintBanner();
        return null;
      });
  }

  function setModalButtonsDisabled(disabled) {
    if (chatState.modalPrimary) {
      chatState.modalPrimary.disabled = Boolean(disabled);
    }
    if (chatState.modalSecondary) {
      chatState.modalSecondary.disabled = Boolean(disabled);
    }
    if (chatState.modalTertiary) {
      chatState.modalTertiary.disabled = Boolean(disabled);
    }
    chatState.modalLoading = Boolean(disabled);
  }

  function redirectToTree(treeId, nodeId) {
    if (!treeId || !nodeId) {
      return;
    }
    const origin = window.location.origin;
    window.location.assign(`${origin}/t/${treeId}?node=${nodeId}`);
  }

  function showChatError(message) {
    if (!chatState.errorEl) {
      return;
    }
    chatState.errorEl.textContent = message || '提问失败，可稍后重试';
    chatState.errorEl.classList.remove('hidden');
  }

  function clearChatError() {
    if (!chatState.errorEl) {
      return;
    }
    chatState.errorEl.textContent = '';
    chatState.errorEl.classList.add('hidden');
  }

  function hideChatModal() {
    if (!chatState.modalEl) {
      return;
    }
    chatState.modalEl.classList.add('hidden');
    chatState.modalEl.classList.remove('flex');
    chatState.modalPrimaryAction = null;
    chatState.modalSecondaryAction = null;
    chatState.modalTertiaryAction = null;
  }

  function showChatModal(config) {
    if (!chatState.modalEl || !config) {
      return;
    }

    if (chatState.modalTitle) {
      chatState.modalTitle.textContent = config.title || 'Irrelevance Gate';
    }
    if (chatState.modalMessage) {
      chatState.modalMessage.textContent = config.message || '';
    }
    if (chatState.modalReason) {
      if (config.reason) {
        chatState.modalReason.textContent = config.reason;
        chatState.modalReason.classList.remove('hidden');
      } else {
        chatState.modalReason.textContent = '';
        chatState.modalReason.classList.add('hidden');
      }
    }
    if (chatState.modalPrimary) {
      chatState.modalPrimary.textContent = config.primaryLabel || '确定';
      chatState.modalPrimary.disabled = false;
    }
    if (chatState.modalSecondary) {
      chatState.modalSecondary.textContent = config.secondaryLabel || '取消';
      chatState.modalSecondary.disabled = false;
      if (config.secondaryLabel === null) {
        chatState.modalSecondary.classList.add('hidden');
      } else {
        chatState.modalSecondary.classList.remove('hidden');
      }
    }
    if (chatState.modalTertiary) {
      if (config.tertiaryLabel) {
        chatState.modalTertiary.textContent = config.tertiaryLabel;
        chatState.modalTertiary.disabled = false;
        chatState.modalTertiary.classList.remove('hidden');
      } else {
        chatState.modalTertiary.textContent = '';
        chatState.modalTertiary.classList.add('hidden');
      }
    }

    chatState.modalPrimaryAction = typeof config.onPrimary === 'function' ? config.onPrimary : null;
    chatState.modalSecondaryAction = typeof config.onSecondary === 'function' ? config.onSecondary : null;
    chatState.modalTertiaryAction = typeof config.onTertiary === 'function' ? config.onTertiary : null;

    chatState.modalEl.classList.remove('hidden');
    chatState.modalEl.classList.add('flex');
  }

  function normalizeRouteInfo(payload) {
    const raw = (payload && payload.relevance) || {};
    let decision =
      raw.decision ||
      raw.relevance ||
      (payload && payload.turn && payload.turn.routed) ||
      'in';
    decision = typeof decision === 'string' ? decision.toLowerCase() : 'in';
    if (!['in', 'side', 'new'].includes(decision)) {
      decision = 'in';
    }

    const score = Number.isFinite(raw.score) ? raw.score : null;
    const reason = raw.reason || '';

    return { decision, score, reason };
  }

  function hasPendingDecision() {
    return Boolean(chatState.pendingDecision && chatState.pendingDecision.token);
  }

  function ensureNoPendingDecision(source) {
    if (!hasPendingDecision()) {
      return true;
    }
    const message = '还有 Irrelevance 决策尚未完成，请先在弹窗中选择 A/B/C';
    if (source === 'fragment') {
      setFragmentError(message);
    } else {
      showChatError(message);
    }
    renderDecisionModal();
    return false;
  }

  function handlePendingDecisionResponse(response, meta = {}) {
    if (!response || !response.pending_decision || !response.decision_token) {
      return;
    }
    const relevanceInfo = normalizeRouteInfo(response);
    chatState.pendingDecision = {
      token: response.decision_token,
      treeId: meta.treeId || chatState.treeId,
      anchorTreeId: (response.anchor && response.anchor.tree_id) || meta.treeId || chatState.treeId,
      anchorNodeId: (response.anchor && response.anchor.node_id) || meta.nodeId || chatState.currentNodeId,
      rootNodeId: chatState.rootNodeId,
      userText: meta.userText || '',
      withAi: meta.withAi !== false,
      who: meta.who || 'web-ui',
      routeInfo: relevanceInfo,
      expiresAt: response.decision_expires_at || null,
      source: meta.source || 'chat'
    };
    chatState.anchorNodeId = null;
    chatState.pendingNodeId = null;
    updateChatStatus('IrrelevanceGate · 需要你选择 A/B/C');
    if (meta.source === 'fragment') {
      setFragmentPendingState(false);
      setFragmentError('Irrelevance 判断需要你选择 A/B/C');
    }
    updateChatControls();
    renderDecisionModal();
  }

  function renderDecisionModal() {
    const decision = chatState.pendingDecision;
    if (!decision) {
      hideChatModal();
      return;
    }
    const snippet = truncateText(decision.userText || '', 90);
    const reasonParts = [];
    if (decision.routeInfo.decision) {
      reasonParts.push(`判定：${decision.routeInfo.decision}`);
    }
    if (decision.routeInfo.reason) {
      reasonParts.push(`理由：${decision.routeInfo.reason}`);
    }
    showChatModal({
      title: '这个问题似乎偏离当前主题，怎么办？',
      message: snippet ? `问题：「${snippet}」` : '系统未获取到当前问题内容',
      reason: reasonParts.join(' · '),
      primaryLabel: 'A 派生新树',
      secondaryLabel: 'B 回到根再问',
      tertiaryLabel: 'C 仍然在此发问（开发者模式）',
      onPrimary: () => handleDecisionSelect('side_fork'),
      onSecondary: () => handleDecisionSelect('back_to_root'),
      onTertiary: () => handleDecisionSelect('force_in')
    });
  }

  function handleDecisionSelect(choice) {
    const decision = chatState.pendingDecision;
    if (!decision || chatState.modalLoading) {
      return;
    }
    setModalButtonsDisabled(true);

    let flowPromise;
    if (choice === 'side_fork') {
      flowPromise = runSideForkFlow(decision);
    } else if (choice === 'back_to_root') {
      const rootId = decision.rootNodeId || chatState.rootNodeId;
      if (!rootId) {
        flowPromise = Promise.reject(new Error('无法回到根节点：未获取根节点 ID'));
      } else {
        flowPromise = finalizeDecisionChoice(choice, decision.treeId, rootId);
      }
    } else if (choice === 'force_in') {
      if (!decision.anchorNodeId) {
        flowPromise = Promise.reject(new Error('无法确定原节点，无法继续在此发问'));
      } else {
        flowPromise = finalizeDecisionChoice(choice, decision.treeId, decision.anchorNodeId);
      }
    } else {
      flowPromise = Promise.reject(new Error('未知选项'));
    }

    flowPromise
      .then((data) => {
        handleDecisionSuccess(data);
      })
      .catch((error) => {
        handleDecisionError(error);
      })
      .finally(() => {
        setModalButtonsDisabled(false);
      });
  }

  function runSideForkFlow(decision) {
    if (!decision.anchorNodeId) {
      return Promise.reject(new Error('无法派生：缺少源节点'));
    }
    updateChatStatus('正在派生新树…');
    return fetch(`${window.location.origin}/api/tree/fork`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_id: decision.anchorNodeId, created_by: 'web-ui' })
    })
      .then(async (res) => {
        const text = await res.text();
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch (parseError) {
          console.warn('[Modal] Failed to parse fork response', parseError);
        }
        if (!res.ok) {
          const message = (json && (json.message || json.error)) || `HTTP ${res.status}`;
          throw new Error(message);
        }
        return json;
      })
      .then((json) => {
        const treeId = json?.tree?.id;
        const rootId = json?.root?.id;
        if (!treeId || !rootId) {
          throw new Error('派生树失败：响应缺少 tree/root');
        }
        return finalizeDecisionChoice('side_fork', treeId, rootId);
      });
  }

  function finalizeDecisionChoice(choice, treeId, nodeId) {
    const decision = chatState.pendingDecision;
    if (!decision) {
      return Promise.reject(new Error('决策上下文已失效，请重新提问'));
    }
    if (!treeId || !nodeId) {
      return Promise.reject(new Error('缺少挂载节点，无法完成操作'));
    }
    const payload = {
      tree_id: treeId,
      node_id: nodeId,
      user_text: decision.userText,
      with_ai: decision.withAi !== false,
      who: decision.who || 'web-ui',
      route_mode: choice,
      route_token: decision.token
    };
    updateChatStatus('IrrelevanceGate · 正在执行选择…');
    return submitTurn(payload);
  }

  function handleDecisionSuccess(data) {
    const decision = chatState.pendingDecision;
    chatState.pendingDecision = null;
    hideChatModal();
    if (decision && decision.source === 'fragment') {
      setFragmentError('');
    } else {
      clearChatError();
    }
    updateChatControls();
    handleTurnCompletion(data, {
      fromDecision: true,
      source: decision?.source || 'chat'
    });
  }

  function handleDecisionError(error) {
    console.error('[IrrelevanceGate] decision error:', error);
    const message =
      (error && error.message) ||
      (error && error.response && error.response.message) ||
      '操作失败，请稍后重试';
    updateChatStatus(message);
    if (chatState.modalReason) {
      chatState.modalReason.textContent = message;
      chatState.modalReason.classList.remove('hidden');
    }
    const decision = chatState.pendingDecision;
    if (decision && decision.source === 'fragment') {
      setFragmentError(message);
    } else {
      showChatError(message);
    }
  }

  function handleTurnCompletion(data, options = {}) {
    const aiPending = options.aiPending === true;
    if (options.source === 'fragment') {
      setFragmentError('');
    } else {
      clearChatError();
    }
    const routeInfo = normalizeRouteInfo(data || {});
    chatState.lastRoute = routeInfo.decision;
    chatState.lastRouteReason = routeInfo.reason || null;
    chatState.lastRouteScore = routeInfo.score ?? null;

    if (aiPending) {
      updateChatStatus('AI 回答暂时未生成，可稍后点击补答。');
    } else {
      const bits = [
        'IrrelevanceGate',
        routeInfo.decision ? `route=${routeInfo.decision}` : '',
        Number.isFinite(routeInfo.score) ? `score=${routeInfo.score}` : '',
        options.fromDecision ? 'decision=resolved' : ''
      ].filter(Boolean);
      updateChatStatus(bits.join(' · ') || '提问成功');
    }

    const userNodeId = data && data.user_node && data.user_node.id;
    const userNodeTree = data && data.user_node && data.user_node.tree_id;
    if (!userNodeId) {
      updateChatStatus('提问成功，正在刷新…');
      window.location.reload();
      return;
    }

    chatState.pendingNodeId = userNodeId;
    chatState.anchorNodeId = null;

    if (userNodeTree && chatState.treeId && userNodeTree !== chatState.treeId) {
      redirectToTree(userNodeTree, userNodeId);
      return;
    }

    hideChatModal();
    navigate(userNodeId);
    chatState.pendingNodeId = null;
  }

  function onChatModalClick(event) {
    if (!chatState.modalEl || chatState.modalEl.classList.contains('hidden')) {
      return;
    }

    const primary = event.target.closest('[data-chat-modal-primary]');
    if (primary && typeof chatState.modalPrimaryAction === 'function') {
      if (primary.disabled) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      chatState.modalPrimaryAction();
      return;
    }

    const secondary = event.target.closest('[data-chat-modal-secondary]');
    if (secondary && typeof chatState.modalSecondaryAction === 'function') {
      if (secondary.disabled) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      chatState.modalSecondaryAction();
      return;
    }

    const tertiary = event.target.closest('[data-chat-modal-tertiary]');
    if (tertiary && typeof chatState.modalTertiaryAction === 'function') {
      if (tertiary.disabled) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      chatState.modalTertiaryAction();
      return;
    }

    if (event.target === chatState.modalEl) {
      if (chatState.pendingDecision) {
        event.preventDefault();
        return;
      }
      hideChatModal();
    }
  }

  function updateChatControls() {
    const targetNodeId = resolveChatTargetNodeId();
    const missingTree = !normalizeAttr(chatState.treeId);
    const disableSubmit = chatState.submitting || missingTree || !targetNodeId || hasPendingDecision();

    if (chatState.submitButton) {
      chatState.submitButton.disabled = disableSubmit;
      chatState.submitButton.textContent = chatState.submitting ? '发送中…' : '发送';
    }

    if (chatState.textarea) {
      chatState.textarea.disabled = chatState.submitting || missingTree || hasPendingDecision();
    }
  }

  function submitTurn(payload) {
    const apiBase = window.location.origin;
    return fetch(`${apiBase}/api/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(async (response) => {
      const text = await response.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!response.ok) {
        const error = new Error((data && data.message) || `HTTP ${response.status}`);
        error.response = data;
        throw error;
      }

      return data;
    });
  }

  function requestTurnRetry(turnId) {
    const apiBase = window.location.origin;
    return fetch(`${apiBase}/api/turn/retry/${turnId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }).then(async (response) => {
      const text = await response.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!response.ok) {
        const error = new Error((data && data.message) || `HTTP ${response.status}`);
        error.response = data;
        throw error;
      }

      return data;
    });
  }

  function refreshCurrentNodeContext() {
    const main = getMainElement();
    if (!main) {
      return Promise.resolve(null);
    }
    const nodeId = normalizeAttr(main.getAttribute('data-node'));
    if (!nodeId) {
      return Promise.resolve(null);
    }

    return updateLocalView(nodeId)
      .catch((error) => {
        console.error('[TurnRetry] Failed to refresh local view:', error);
        return null;
      })
      .then((local) => {
        updateTimelineView(nodeId);
        return fetchLens(nodeId, local);
      })
      .then(() => fetchHint(nodeId));
  }

  function onChatSubmit(event) {
    const button = event.target.closest('[data-chat-submit]');
    if (!button) {
      return;
    }

    event.preventDefault();

    if (!chatState.container) {
      hydrateChatPane();
    }

    if (!chatState.container || chatState.submitting) {
      return;
    }

    if (!ensureNoPendingDecision('chat')) {
      return;
    }

    const textarea = chatState.textarea || chatState.container.querySelector('[data-chat-input]');
    if (!textarea) {
      return;
    }

    const userText = textarea.value.trim();
    if (!userText) {
      showChatError('请输入提问内容');
      return;
    }

    const treeId = normalizeAttr(chatState.treeId);
    if (!treeId) {
      showChatError('缺少树 ID，暂无法提问');
      return;
    }

    const nodeId = resolveChatTargetNodeId();
    if (!nodeId) {
      showChatError('无法确定挂载节点');
      return;
    }

    const withAi = chatState.withAiToggle ? chatState.withAiToggle.checked : true;
    chatState.anchorNodeId = nodeId;
    chatState.submitting = true;
    updateChatControls();
    clearChatError();
    updateChatStatus('发送中…');

    const submittedText = userText;
    submitTurn({
      tree_id: treeId,
      node_id: nodeId,
      user_text: userText,
      with_ai: withAi,
      who: 'web-ui'
    })
      .then((data) => {
        textarea.value = '';
        if (data && data.pending_decision) {
          handlePendingDecisionResponse(data, {
            treeId,
            nodeId,
            userText: submittedText,
            withAi,
            who: 'web-ui',
            source: 'chat'
          });
          updateChatControls();
          return;
        }
        const aiPending = Boolean(data && data.turn && data.turn.ai_pending);
        handleTurnCompletion(data, { fromDecision: false, source: 'fragment', aiPending });
      })
      .catch((error) => {
        console.error('[ChatPane] Failed to submit question:', error);
        const message =
          (error && error.message) ||
          (error && error.response && error.response.message) ||
          '提问失败，可稍后重试';
        showChatError(message);
        updateChatStatus('');
        chatState.pendingNodeId = null;
        chatState.anchorNodeId = null;
      })
      .finally(() => {
        chatState.submitting = false;
        updateChatControls();
      });
  }

  function onTurnRetryClick(event) {
    const button = event.target.closest('[data-turn-retry-button]');
    if (!button) {
      return;
    }
    event.preventDefault();

    const turnId = button.getAttribute('data-turn-id') || turnRetryState.turnId;
    if (!turnId || turnRetryState.pending) {
      return;
    }

    setTurnRetryError('');
    setTurnRetryPending(true);

    requestTurnRetry(turnId)
      .then((data) => {
        if (!data || data.ok === false) {
          const message =
            (data && data.error && data.error.message) ||
            (data && data.message) ||
            '补答失败，请稍后重试。';
          setTurnRetryError(message);
        } else {
          setTurnRetryError('');
        }
        return refreshCurrentNodeContext();
      })
      .catch((error) => {
        const message =
          (error && error.message) ||
          (error && error.response && error.response.message) ||
          '补答失败，请稍后重试。';
        setTurnRetryError(message);
      })
      .finally(() => {
        setTurnRetryPending(false);
      });
  }

  // 拦截所有 data-node-link 和 data-breadcrumb-link 元素的点击
  document.addEventListener(
    'click',
    (event) => {
      const link = event.target.closest(
        'a[data-node-link], a[data-breadcrumb-link], a[data-sibling-link], a[data-timeline-link], [data-chat-hint-jump]'
      );
      if (!link) {
        return;
      }

      event.preventDefault();

      let nodeId = link.getAttribute('data-node-id');
      if (!nodeId) {
        const url = new URL(link.href, location.href);
        nodeId = url.searchParams.get('node');
      }

      navigate(nodeId);
    },
    true
  );

  document.addEventListener('input', onLensInput, true);
  document.addEventListener('click', onLensSaveClick, true);
  document.addEventListener('click', onChatModalClick, true);
  document.addEventListener('click', onTurnRetryClick, true);
  document.addEventListener('click', onChatSubmit, true);

  // 监听浏览器后退/前进按钮
  window.addEventListener('popstate', () => {
    const url = new URL(window.location);
    const nodeId = url.searchParams.get('node');

    syncChatNode(nodeId);
    window.dispatchEvent(
      new CustomEvent('linzhi:navigate', {
        detail: {
          nodeId,
          url: url.toString(),
          timestamp: Date.now(),
          source: 'popstate'
        }
      })
    );

    updateLocalView(nodeId)
      .catch(() => null)
      .then((local) => {
        updateTimelineView(nodeId);
        return fetchLens(nodeId, local);
      })
      .then(() => fetchHint(nodeId));
  });

  function bootstrapChat() {
    const main = document.querySelector('main[data-tree]');
    if (!main) {
      return;
    }

    hydrateChatPane();
    const nodeId = main.getAttribute('data-node') || null;
    const local = decodeLocalDataset();
    const timelineState = decodeTimelineDataset();
    updateSiblingsView(nodeId, local);
    updateMiniTreeView(nodeId, local);
    updateFragmentView(local);
    bindFragmentInputEvents();
    renderTimelinePanel(nodeId, timelineState);
    fetchLens(nodeId, local)
      .catch(() => null)
      .finally(() => {
        fetchHint(nodeId);
      });
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', bootstrapChat);
  } else {
    bootstrapChat();
  }
})();
