const RECOGNIZED_TYPES = new Set(["branch.confirm.accepted"]);

export function planReplay(events, targetRaw) {
  const eventsOrdered = [...events];
  const target = typeof targetRaw === "string" ? targetRaw.trim() : "";

  if (!target || target === "latest" || target === "head") {
    return {
      applied: eventsOrdered,
      changed: false,
      revertedTo: null,
    };
  }

  const byIdIndex = eventsOrdered.findIndex((event) => event.event_id === target);
  if (byIdIndex >= 0) {
    const applied = eventsOrdered.slice(0, byIdIndex + 1);
    return {
      applied,
      changed: applied.length !== eventsOrdered.length,
      revertedTo: eventsOrdered[byIdIndex].event_id,
    };
  }

  const timestamp = Date.parse(target);
  if (Number.isNaN(timestamp)) {
    return {
      error: "invalid_replay_target",
      hint: "Use a known event_id or ISO 8601 timestamp",
      detail: target,
    };
  }

  const applied = eventsOrdered.filter((event) => new Date(event.ts).getTime() <= timestamp);
  const changed = applied.length !== eventsOrdered.length;
  const revertedTo = applied.length > 0 ? new Date(applied[applied.length - 1].ts).toISOString() : new Date(timestamp).toISOString();

  return {
    applied,
    changed,
    revertedTo: changed ? revertedTo : null,
  };
}

export function foldEvents(events) {
  const state = new Map();

  for (const event of events) {
    if (!RECOGNIZED_TYPES.has(event.type)) {
      continue;
    }

    const payload = event.payload ?? {};
    const nodeId = payload.node_id;
    if (!nodeId) {
      continue;
    }

    state.set(nodeId, {
      node_id: nodeId,
      parent_id: payload.parent_id ?? null,
      title: payload.title ?? "",
      summary: typeof payload.summary === "undefined" ? null : payload.summary,
      status: "confirmed",
      trace_id: payload.trace_id ?? null,
      created_at: payload.created_at ?? event.ts,
    });
  }

  return state;
}
