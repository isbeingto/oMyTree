-- 创建一棵空树 + 根节点（仅当不存在）
WITH t AS (
  INSERT INTO trees(topic, created_by, status)
  SELECT 'Demo Topic Root', 'system', 'active'
  WHERE NOT EXISTS (SELECT 1 FROM trees WHERE topic='Demo Topic Root')
  RETURNING id
), t0 AS (
  SELECT id FROM t
  UNION ALL
  SELECT id FROM trees WHERE topic='Demo Topic Root' LIMIT 1
)
INSERT INTO nodes(tree_id, parent_id, level, role, text)
SELECT (SELECT id FROM t0), NULL, 0, 'system', 'ROOT'
WHERE NOT EXISTS (
  SELECT 1 FROM nodes n
  WHERE n.tree_id = (SELECT id FROM t0) AND n.parent_id IS NULL AND n.level = 0
);

-- 事件记录
INSERT INTO events(event_type, tree_id, payload)
SELECT 'tree.created', (SELECT id FROM trees WHERE topic='Demo Topic Root' LIMIT 1),
       jsonb_build_object('topic','Demo Topic Root')
WHERE NOT EXISTS (
  SELECT 1 FROM events WHERE event_type='tree.created'
    AND tree_id=(SELECT id FROM trees WHERE topic='Demo Topic Root' LIMIT 1)
);

INSERT INTO events(event_type, tree_id, node_id, payload)
SELECT 'node.created',
       n.tree_id, n.id,
       jsonb_build_object('role','system','level',0)
FROM nodes n
JOIN trees t ON t.id = n.tree_id
WHERE t.topic='Demo Topic Root' AND n.parent_id IS NULL AND n.level=0
  AND NOT EXISTS (
    SELECT 1 FROM events e
    WHERE e.event_type='node.created' AND e.node_id=n.id
  );
