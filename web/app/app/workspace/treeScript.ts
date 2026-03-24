// NOTE: Legacy tree script helper, no longer wired into the UI (T20-5).
// Keep for internal reference only.

export type TreeScriptStep = {
  id: string;
  label: string;
  prompt: string;
  nodeHint?: string;
  branchFromStepId?: string;
};

export type TreeScript = {
  id: string;
  topic: string;
  shortTagline: string;
  steps: TreeScriptStep[];
};

export const treeScriptV1: TreeScript = {
  id: 'tree-script-v1',
  topic: 'Neural algorithms as a thinking tree',
  shortTagline: 'A guided five-step tour to showcase oMyTree for neural networks.',
  steps: [
    {
      id: 'step-1-root',
      label: 'Root: what is a thinking tree?',
      prompt:
        "I'm building an AI-powered 'thinking tree' app called oMyTree. How would you explain the idea of a 'thinking tree' for learning neural networks to a curious beginner?",
      nodeHint: 'Use this as the very first question to seed the tree (root + first AI reply).',
    },
    {
      id: 'step-2-branches',
      label: 'Main branches',
      prompt:
        'Break this into 3–5 major branches a beginner should learn first, and give each branch a short, memorable title.',
      nodeHint: 'Stay on the main path to outline the core structure.',
    },
    {
      id: 'step-3-backprop',
      label: 'Zoom into one branch',
      prompt:
        'Pick the backpropagation branch and list the key questions a beginner should ask, in a rough learning order.',
      nodeHint: 'Continue on the main path so Lens/Timeline show a clean spine.',
    },
    {
      id: 'step-4-study-plan',
      label: 'Side branch: study plan',
      prompt:
        'Now imagine a student with only 30 minutes per day. Using this thinking tree, outline a 2-week study plan.',
      nodeHint: 'Jump to a mid-tree AI node and branch off to show siblings.',
      branchFromStepId: 'step-2-branches',
    },
    {
      id: 'step-5-compare',
      label: 'Side branch: compare with textbooks',
      prompt:
        'How is learning with this tree different from following a linear textbook or a simple cheat sheet?',
      nodeHint: 'Branch from another node to create a second visible sibling.',
      branchFromStepId: 'step-2-branches',
    },
  ],
};
