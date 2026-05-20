import { configureStore } from '@reduxjs/toolkit';
import uiReducer from './slices/uiSlice';
import brandsReducer from 'wynta-react-common/store/slices/brandsSlice';
import treeReducer from './slices/treeSlice';
import headsReducer from './slices/headsSlice';
import subheadsReducer from './slices/subheadsSlice';
import configuresReducer from './slices/configuresSlice';
import promoCodesReducer from './slices/promoCodesSlice';
import budgetsReducer from './slices/budgetsSlice';
import usageReducer from './slices/usageSlice';
import historyReducer from './slices/historySlice';
import segmentsReducer from './slices/segmentsSlice';
import kpiReducer from './slices/kpiSlice';
import usersReducer from 'wynta-react-common/store/slices/usersSlice';
import type { SelectedNode } from '@/types';

const LS_NODE_KEY = 'bonus_selected_node';

export const store = configureStore({
  reducer: {
    ui: uiReducer,
    brands: brandsReducer,
    tree: treeReducer,
    heads: headsReducer,
    subheads: subheadsReducer,
    configures: configuresReducer,
    promoCodes: promoCodesReducer,
    budgets: budgetsReducer,
    usage: usageReducer,
    history: historyReducer,
    segments: segmentsReducer,
    kpi: kpiReducer,
    users: usersReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

let _prevNode: SelectedNode | null | undefined;
store.subscribe(() => {
  if (typeof window === 'undefined') return;
  const node = store.getState().tree.selectedNode;
  if (node === _prevNode) return;
  _prevNode = node;
  try {
    if (node) localStorage.setItem(LS_NODE_KEY, JSON.stringify(node));
    else localStorage.removeItem(LS_NODE_KEY);
  } catch {}
});
