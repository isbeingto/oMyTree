export async function recordTurnEvent(client, { eventType, treeId, nodeId, turnId, traceId, payload }) {
  const serializedPayload = JSON.stringify(payload ?? {});
  await client.query(
    `INSERT INTO events(event_type, tree_id, node_id, turn_id, payload, trace_id)
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5::jsonb,
       COALESCE($6::uuid, uuid_generate_v4())
     )`,
    [eventType, treeId, nodeId, turnId ?? null, serializedPayload, traceId || null]
  );
}

export async function recordTurnRoutedEvent(client, { treeId, nodeId, turnId, traceId, payload }) {
  await recordTurnEvent(client, {
    eventType: 'turn.routed',
    treeId,
    nodeId,
    turnId,
    traceId,
    payload,
  });
}

export async function recordTurnCompletedEvent(client, { treeId, nodeId, turnId, traceId, payload }) {
  await recordTurnEvent(client, {
    eventType: 'turn.completed',
    treeId,
    nodeId,
    turnId,
    traceId,
    payload,
  });
}

export async function recordTurnPendingEvent(client, { treeId, nodeId, turnId, traceId, payload }) {
  await recordTurnEvent(client, {
    eventType: 'turn.pending',
    treeId,
    nodeId,
    turnId,
    traceId,
    payload,
  });
}

export async function recordTurnFailedEvent(client, { treeId, nodeId, turnId, traceId, payload }) {
  await recordTurnEvent(client, {
    eventType: 'turn.failed',
    treeId,
    nodeId,
    turnId,
    traceId,
    payload,
  });
}
