const activeStreams = new Map();

export function registerStreamAbort(turnId, controller) {
  if (!turnId || !controller) return;
  activeStreams.set(turnId, { controller, registeredAt: Date.now() });
}

export function hasActiveStream(turnId) {
  if (!turnId) return false;
  return activeStreams.has(turnId);
}

export function abortStream(turnId) {
  const entry = activeStreams.get(turnId);
  if (!entry) return false;
  try {
    entry.controller.abort(new Error('Stream aborted by user'));
    return true;
  } catch (err) {
    console.warn('[stream_abort_registry] abort failed:', err?.message || err);
    return false;
  } finally {
    activeStreams.delete(turnId);
  }
}

export function removeStream(turnId) {
  if (!turnId) return;
  activeStreams.delete(turnId);
}
