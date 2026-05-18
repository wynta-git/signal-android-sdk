import { configureStore } from '@reduxjs/toolkit';
import uiReducer from './slices/uiSlice';
import brandsReducer from './slices/brandsSlice';
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
  },
});
