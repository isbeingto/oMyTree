export const KEY_EVENT_TYPES = Object.freeze([
  "turn.pending",
  "turn.completed",
  "turn.failed",
  "turn.routed",
  "tree.forked",
  "node.soft_deleted",
  "tree.rollbacked",
  "node.leaf_deleted",
]);

export function isKeyEventType(value) {
  if (typeof value !== "string") {
    return false;
  }
  return KEY_EVENT_TYPES.includes(value.trim());
}

export default KEY_EVENT_TYPES;
