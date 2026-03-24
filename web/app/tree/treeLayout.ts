import {
  computeMetroLayout,
  computeActivePath,
  computeActiveTrackSegments,
  TRACK_SPACING,
  STATION_SPACING,
  type MetroLayout,
  type MetroNode,
  type MetroEdge,
  type MetroTrack,
  type ActiveTrackSegment,
} from './metroLayout';
import { QANode } from './qaClient';

export type TreeLayout = MetroLayout;
export type TreeNode = MetroNode;
export type TreeEdge = MetroEdge;
export type TreeTrack = MetroTrack;
export type TreeActiveSegment = ActiveTrackSegment;

export type TreeLayoutOptions = {
  trackSpacing?: number;
  nodeSpacing?: number;
};

export function layoutTree(
  nodes: QANode[],
  options: TreeLayoutOptions = {}
): TreeLayout {
  const trackSpacing = options.trackSpacing ?? TRACK_SPACING;
  const nodeSpacing = options.nodeSpacing ?? STATION_SPACING;
  return computeMetroLayout(nodes, trackSpacing, nodeSpacing);
}

export {
  computeActivePath,
  computeActiveTrackSegments,
  TRACK_SPACING as DEFAULT_TRACK_SPACING,
  STATION_SPACING as DEFAULT_NODE_SPACING,
};
