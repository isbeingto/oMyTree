const MAX_DEPTH_DEFAULT = 12;
const MAX_CHILDREN_DEFAULT = 20;

function parseLimit(rawValue, fallback) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return fallback;
  }
  const parsed = Number.parseInt(String(rawValue), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

const growthLimits = {
  maxDepth: parseLimit(
    process.env.LINZHI_MAX_DEPTH ?? process.env.TREE_MAX_DEPTH,
    MAX_DEPTH_DEFAULT
  ),
  maxChildrenPerNode: parseLimit(
    process.env.LINZHI_MAX_CHILDREN_PER_NODE ?? process.env.TREE_MAX_CHILDREN,
    MAX_CHILDREN_DEFAULT
  ),
};

export { MAX_DEPTH_DEFAULT, MAX_CHILDREN_DEFAULT };
export default growthLimits;
