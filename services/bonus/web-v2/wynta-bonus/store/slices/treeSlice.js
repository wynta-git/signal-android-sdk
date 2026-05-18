import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

const LS_NODE_KEY = 'bonus_selected_node';

function loadStoredNode() {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(LS_NODE_KEY)); } catch { return null; }
}

export const toggleSubheadExpand = createAsyncThunk(
  'tree/toggleSubheadExpand',
  async (id, { dispatch, getState }) => {
    const expanded = getState().tree.expandedSubheads.includes(id);
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
  initialState: {
    expandedHeads: [],
    expandedSubheads: [],
    loadingSubheads: [],
    selectedNode: loadStoredNode(),
  },
  reducers: {
    toggleHead(state, action) {
      const id = action.payload;
      const idx = state.expandedHeads.indexOf(id);
      if (idx >= 0) state.expandedHeads.splice(idx, 1);
      else state.expandedHeads.push(id);
    },
    setSubheadExpanded(state, action) {
      const { id, expanded } = action.payload;
      const idx = state.expandedSubheads.indexOf(id);
      if (expanded && idx < 0) state.expandedSubheads.push(id);
      else if (!expanded && idx >= 0) state.expandedSubheads.splice(idx, 1);
    },
    setSubheadLoading(state, action) {
      const { id, loading } = action.payload;
      const idx = state.loadingSubheads.indexOf(id);
      if (loading && idx < 0) state.loadingSubheads.push(id);
      else if (!loading && idx >= 0) state.loadingSubheads.splice(idx, 1);
    },
    selectNode(state, action) {
      state.selectedNode = action.payload;
    },
    expandAncestorsOf(state, action) {
      const { type, id, heads, subheads, configures } = action.payload;
      if (type === 'head') {
        if (!state.expandedHeads.includes(id)) state.expandedHeads.push(id);
      } else if (type === 'subhead') {
        const sub = subheads?.[id];
        if (sub && !state.expandedHeads.includes(sub.head_id)) {
          state.expandedHeads.push(sub.head_id);
        }
        if (!state.expandedSubheads.includes(id)) {
          state.expandedSubheads.push(id);
        }
      } else if (type === 'configure') {
        const cfg = configures?.[id];
        if (cfg) {
          const sub = subheads?.[cfg.subhead_id];
          if (sub && !state.expandedHeads.includes(sub.head_id)) {
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

export const { toggleHead, setSubheadExpanded, setSubheadLoading, selectNode, expandAncestorsOf } = treeSlice.actions;
export default treeSlice.reducer;
