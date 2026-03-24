/**
 * Metro Map Layout Algorithm
 * 
 * 设计思路：
 * - 纵向 = 时间轴：根节点在最下方，越新的节点越往上
 * - 横向 = 轨道：主线在最左侧，分支依次向右排列
 * - 每条轨道是一条连续的竖直线
 * - 分支从父节点右侧水平延伸，然后拐向新轨道
 */

import { QANode } from './qaClient';

// ============================================================
// 布局常量 - 这些值决定了地铁图的间距和尺寸
// ============================================================

/** 轨道间水平距离 - 分支要有明显的水平间隔 */
export const TRACK_SPACING = 200;

/** 站点间垂直距离 - 让节点之间有足够的呼吸空间 */
export const STATION_SPACING = 100;

/** 站点卡片宽度 - 足够容纳标题和摘要 */
export const CARD_WIDTH = 260;

/** 站点卡片高度 - 为标题 + 摘要留出空间 */
export const CARD_HEIGHT = 88;

/** 卡片与轨道的水平间距（圆点外缘到卡片左边缘） */
export const CARD_GAP = 18;

/** 站点圆点半径 - 小而明确的“站点”形态 */
export const STATION_DOT_RADIUS = 8;

/** 分支水平延伸长度（从父站伸出的横线）- 更长的岔口 */
export const BRANCH_STUB_LENGTH = 60;

/** 轨道线宽度 - 主干线要粗，视觉存在感强 */
export const TRACK_LINE_WIDTH = 6;

/** 分支线宽度 */
export const BRANCH_LINE_WIDTH = 4;

// ============================================================
// 类型定义
// ============================================================

export type MetroNode = {
  id: string;
  qaNode: QANode;
  /** 第几条轨道（0 = 主线，1, 2, ... = 分支） */
  track: number;
  /** 在轨道上的位置（0 = 根，越大越新） */
  position: number;
  /** 节点序号（1-based，按创建时间排序） */
  index: number;
  /** x 坐标（轨道中心线） */
  x: number;
  /** y 坐标（站点中心） */
  y: number;
  /** 是否是分支的起始节点 */
  isBranchStart: boolean;
};

export type MetroEdge = {
  from: MetroNode;
  to: MetroNode;
  /** 是否是分支连接（需要画 L 形） */
  isBranch: boolean;
};

export type MetroTrack = {
  /** 轨道编号 */
  index: number;
  /** 轨道 x 坐标 */
  x: number;
  /** 轨道起点 y（最底部的站点） */
  startY: number;
  /** 轨道终点 y（最顶部的站点） */
  endY: number;
  /** 该轨道上的节点 ID 列表 */
  nodeIds: string[];
};

export type MetroBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export type MetroLayout = {
  nodes: MetroNode[];
  edges: MetroEdge[];
  tracks: MetroTrack[];
  bounds: MetroBounds | null;
};

// ============================================================
// 主布局函数
// ============================================================

export function computeMetroLayout(
  qaNodes: QANode[],
  trackSpacing: number = TRACK_SPACING,
  nodeSpacing: number = STATION_SPACING
): MetroLayout {
  if (qaNodes.length === 0) {
    return { nodes: [], edges: [], tracks: [], bounds: null };
  }

  // 1. 构建 ID 映射和创建时间排序
  const nodeById = new Map<string, QANode>();
  qaNodes.forEach(n => nodeById.set(n.id, n));

  const sortedByTime = [...qaNodes].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return ta - tb;
  });
  
  const indexMap = new Map<string, number>();
  sortedByTime.forEach((n, i) => indexMap.set(n.id, i + 1));

  // 2. 找到根节点
  const knownIds = new Set(qaNodes.map(n => n.id));
  const roots = qaNodes.filter(n => !n.parent_id || !knownIds.has(n.parent_id));
  
  if (roots.length === 0) {
    // 如果没有明确的根，用第一个节点
    roots.push(sortedByTime[0]);
  }

  // 3. DFS 分配轨道和位置
  const visited = new Set<string>();
  const metroNodes: MetroNode[] = [];
  const trackData = new Map<number, { nodeIds: string[], minPos: number, maxPos: number }>();
  let nextTrack = 0;

  function assignTrack(node: QANode, track: number, position: number, isBranchStart: boolean) {
    if (visited.has(node.id)) return;
    visited.add(node.id);

    const metroNode: MetroNode = {
      id: node.id,
      qaNode: node,
      track,
      position,
      index: indexMap.get(node.id) ?? 1,
      x: track * trackSpacing,
      y: -position * nodeSpacing, // 负数，因为 SVG y 轴向下，但我们要根在下
      isBranchStart
    };
    metroNodes.push(metroNode);

    // 记录轨道数据
    if (!trackData.has(track)) {
      trackData.set(track, { nodeIds: [], minPos: position, maxPos: position });
    }
    const td = trackData.get(track)!;
    td.nodeIds.push(node.id);
    td.minPos = Math.min(td.minPos, position);
    td.maxPos = Math.max(td.maxPos, position);

    // 处理子节点
    const childrenIds = node.children_ids || [];
    if (childrenIds.length > 0) {
      // 第一个子节点继续在当前轨道
      const firstChild = nodeById.get(childrenIds[0]);
      if (firstChild) {
        assignTrack(firstChild, track, position + 1, false);
      }

      // 后续子节点开新轨道
      for (let i = 1; i < childrenIds.length; i++) {
        const child = nodeById.get(childrenIds[i]);
        if (child && !visited.has(child.id)) {
          nextTrack++;
          assignTrack(child, nextTrack, position + 1, true);
        }
      }
    }
  }

  // 从每个根开始
  roots.forEach((root, idx) => {
    if (idx > 0) nextTrack++;
    assignTrack(root, nextTrack, 0, false);
  });

  // 处理孤立节点
  qaNodes.forEach(n => {
    if (!visited.has(n.id)) {
      nextTrack++;
      assignTrack(n, nextTrack, 0, false);
    }
  });

  // 4. 构建边
  const nodeMap = new Map<string, MetroNode>();
  metroNodes.forEach(n => nodeMap.set(n.id, n));

  const edges: MetroEdge[] = [];
  metroNodes.forEach(mn => {
    const qa = mn.qaNode;
    if (qa.parent_id && nodeMap.has(qa.parent_id)) {
      const parent = nodeMap.get(qa.parent_id)!;
      edges.push({
        from: parent,
        to: mn,
        isBranch: mn.track !== parent.track
      });
    }
  });

  // 5. 翻转 y 坐标使根在下方，新节点在上方
  // 当前 y: 根=0, 子=-80, 孙=-160 (position 越大，y 越负)
  // 目标 y: 根有最大 y (底部), 叶子有最小 y (顶部)
  // 
  // 解决方案: y = maxDepth * SPACING - position * SPACING + MARGIN
  // 这样 position=0 (根) 得到最大 y，position=maxDepth 得到最小 y
  if (metroNodes.length > 0) {
    const maxPosition = Math.max(...metroNodes.map(n => n.position));
    metroNodes.forEach(n => {
      // 根 (position=0) → y = maxPosition * SPACING + MARGIN = 最大
      // 叶子 (position=max) → y = 0 + MARGIN = 最小
      n.y = (maxPosition - n.position) * nodeSpacing + nodeSpacing;
    });
  }

  // 6. 构建轨道信息（需要重新计算 startY 和 endY）
  const tracks: MetroTrack[] = [];
  trackData.forEach((data, trackIdx) => {
    // 获取该轨道上的实际 y 值
    const trackNodeYs = metroNodes
      .filter(n => n.track === trackIdx)
      .map(n => n.y);
    
    if (trackNodeYs.length > 0) {
      tracks.push({
        index: trackIdx,
        x: trackIdx * trackSpacing,
        startY: Math.min(...trackNodeYs),
        endY: Math.max(...trackNodeYs),
        nodeIds: data.nodeIds
      });
    }
  });

  // 7. 计算边界
  if (metroNodes.length === 0) {
    return { nodes: [], edges: [], tracks: [], bounds: null };
  }

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  // 卡片位于圆点右边: cardX = node.x + STATION_DOT_RADIUS + CARD_GAP
  const cardOffset = STATION_DOT_RADIUS + CARD_GAP;
  
  metroNodes.forEach(n => {
    // 左边界：圆点左侧留一些空间给轨道线
    minX = Math.min(minX, n.x - STATION_DOT_RADIUS - 30);
    // 右边界：卡片右侧 = node.x + cardOffset + CARD_WIDTH + margin
    maxX = Math.max(maxX, n.x + cardOffset + CARD_WIDTH + 30);
    // 上下边界：考虑轨道延伸
    minY = Math.min(minY, n.y - CARD_HEIGHT / 2 - nodeSpacing * 0.4);
    maxY = Math.max(maxY, n.y + CARD_HEIGHT / 2 + nodeSpacing * 0.4);
  });

  return {
    nodes: metroNodes,
    edges,
    tracks,
    bounds: { minX, maxX, minY, maxY }
  };
}

// ============================================================
// 计算当前路径（从选中节点到根的路径）
// ============================================================

export function computeActivePath(qaNodes: QANode[], selectedId?: string | null): Set<string> {
  const pathIds = new Set<string>();
  if (!selectedId) return pathIds;

  const nodeById = new Map<string, QANode>();
  qaNodes.forEach(n => nodeById.set(n.id, n));

  let current = nodeById.get(selectedId);
  while (current) {
    pathIds.add(current.id);
    current = current.parent_id ? nodeById.get(current.parent_id) : undefined;
  }

  return pathIds;
}

// ============================================================
// 计算活跃轨道（当前路径经过的轨道段）
// ============================================================

export type ActiveTrackSegment = {
  track: number;
  x: number;
  fromY: number;
  toY: number;
};

export function computeActiveTrackSegments(
  layout: MetroLayout,
  activePath: Set<string>
): ActiveTrackSegment[] {
  const segments: ActiveTrackSegment[] = [];
  
  // 按轨道分组路径上的节点
  const trackNodes = new Map<number, MetroNode[]>();
  layout.nodes.forEach(n => {
    if (activePath.has(n.id)) {
      if (!trackNodes.has(n.track)) {
        trackNodes.set(n.track, []);
      }
      trackNodes.get(n.track)!.push(n);
    }
  });

  // 为每个轨道创建段
  trackNodes.forEach((nodes, track) => {
    if (nodes.length === 0) return;
    
    // 按 y 排序
    nodes.sort((a, b) => a.y - b.y);
    
    // 创建连续段
    const minY = nodes[0].y;
    const maxY = nodes[nodes.length - 1].y;
    
    segments.push({
      track,
      x: track * TRACK_SPACING,
      fromY: minY,
      toY: maxY
    });
  });

  return segments;
}
