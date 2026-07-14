import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { SelectedNode, NodeType, BonusHead, BonusSubhead, BonusConfigure } from '../../types';

const LS_NODE_KEY = 'bonus_selected_node';

function loadStoredNode(): SelectedNode | null {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(LS_NODE_KEY) ?? 'null') as SelectedNode | null; } catch { return null; }
}

interface TreeState {
  expandedHeads: number[];
  expandedSubheads: number[];
  loadingSubheads: number[];
  selectedNode: SelectedNode | null;
}

interface ExpandPayload {
  type: NodeType;
  id: number;
  heads?: Record<number, BonusHead>;
  subheads?: Record<number, BonusSubhead>;
  configures?: Record<number, BonusConfigure>;
}

const initialState: TreeState = {
  expandedHeads: [],
  expandedSubheads: [],
  loadingSubheads: [],
  selectedNode: loadStoredNode(),
};

export const toggleSubheadExpand = createAsyncThunk<void, number>(
  'tree/toggleSubheadExpand',
  async (id, { dispatch, getState }) => {
    const state = getState() as { tree: TreeState };
    const expanded = state.tree.expandedSubheads.includes(id);
    if (expanded) {
      dispatch(treeSlice.actions.setSubheadExpanded({ id, expanded: false }));
      return;
    }
    dispatch(treeSlice.actions.setSubheadLoading({ id, loading: true }));
    dispatch(treeSlice.actions.setSubheadExpanded({ id, expanded: true }));
    await new Promise(r => setTimeout(r, 220));
    dispatch(treeSlice.actions.setSubheadLoading({ id, loading: false }));
  }
);

const treeSlice = createSlice({
  name: 'tree',
  initialState,
  reducers: {
    toggleHead(state, action: PayloadAction<number>) {
      const id = action.payload;
      const idx = state.expandedHeads.indexOf(id);
      if (idx >= 0) state.expandedHeads.splice(idx, 1);
      else state.expandedHeads.push(id);
    },
    expandAll(state, action: PayloadAction<{ headIds: number[]; subheadIds: number[] }>) {
      state.expandedHeads = [...action.payload.headIds];
      state.expandedSubheads = [...action.payload.subheadIds];
    },
    collapseAll(state) {
      state.expandedHeads = [];
      state.expandedSubheads = [];
    },
    setSubheadExpanded(state, action: PayloadAction<{ id: number; expanded: boolean }>) {
      const { id, expanded } = action.payload;
      const idx = state.expandedSubheads.indexOf(id);
      if (expanded && idx < 0) state.expandedSubheads.push(id);
      else if (!expanded && idx >= 0) state.expandedSubheads.splice(idx, 1);
    },
    setSubheadLoading(state, action: PayloadAction<{ id: number; loading: boolean }>) {
      const { id, loading } = action.payload;
      const idx = state.loadingSubheads.indexOf(id);
      if (loading && idx < 0) state.loadingSubheads.push(id);
      else if (!loading && idx >= 0) state.loadingSubheads.splice(idx, 1);
    },
    selectNode(state, action: PayloadAction<SelectedNode | null>) {
      state.selectedNode = action.payload;
    },
    expandAncestorsOf(state, action: PayloadAction<ExpandPayload>) {
      const { type, id, heads: _heads, subheads, configures } = action.payload;
      if (type === 'head') {
        if (!state.expandedHeads.includes(id)) state.expandedHeads.push(id);
      } else if (type === 'subhead') {
        const sub = subheads?.[id];
        if (sub && sub.head_id !== undefined && !state.expandedHeads.includes(sub.head_id)) {
          state.expandedHeads.push(sub.head_id);
        }
        if (!state.expandedSubheads.includes(id)) {
          state.expandedSubheads.push(id);
        }
      } else if (type === 'configure') {
        const cfg = configures?.[id];
        if (cfg) {
          const sub = subheads?.[cfg.subhead_id];
          if (sub && sub.head_id !== undefined && !state.expandedHeads.includes(sub.head_id)) {
            state.expandedHeads.push(sub.head_id);
          }
          if (!state.expandedSubheads.includes(cfg.subhead_id)) {
            state.expandedSubheads.push(cfg.subhead_id);
          }
        }
      }
    },
  },
});

export const { toggleHead, expandAll, collapseAll, setSubheadExpanded, setSubheadLoading, selectNode, expandAncestorsOf } = treeSlice.actions;
export default treeSlice.reducer;
