import { configureStore } from "@reduxjs/toolkit";
import type { Middleware } from "@reduxjs/toolkit";
import uiReducer from "./slices/uiSlice";
import brandsReducer, {
  fetchBrands,
} from "wynta-react-common/store/slices/brandsSlice";
import treeReducer from "./slices/treeSlice";
import headsReducer, { fetchHeads } from "./slices/headsSlice";
import subheadsReducer from "./slices/subheadsSlice";
import configuresReducer from "./slices/configuresSlice";
import promoCodesReducer from "./slices/promoCodesSlice";
import budgetsReducer from "./slices/budgetsSlice";
import usageReducer from "./slices/usageSlice";
import historyReducer from "./slices/historySlice";
import segmentsReducer, {
  fetchSegments,
} from "wynta-react-common/store/slices/segmentsSlice";
import kpiReducer, { fetchKpiSnapshot } from "./slices/kpiSlice";
import usersReducer, {
  authenticateWithBridgeToken,
} from "wynta-react-common/store/slices/usersSlice";
import type { SelectedNode } from "../types";

const initOnAuthMiddleware: Middleware = (storeApi) => (next) => (action) => {
  const result = next(action);

  // console.log("Middleware triggered for action: " + action.type);

  // if (action.type === "users/auth/fulfilled") {
  //   // eslint-disable-next-line @typescript-eslint/no-explicit-any
  //   const state = storeApi.getState() as any;
  //   const siteId: number | undefined = state.users?.bridgeData?.site_id;
  //   const isAuthenticated = state.users?.authStatus === "succeeded";
  //   if (isAuthenticated) {
  //     storeApi.dispatch(fetchBrands() as never);
  //     storeApi.dispatch(fetchSegments() as never);

  //     if (siteId != null) {
  //       storeApi.dispatch(fetchHeads(siteId) as never);
  //       storeApi.dispatch(fetchKpiSnapshot(siteId) as never);
  //     }
  //   }
  // }
  return result;
};

const LS_NODE_KEY = "bonus_selected_node";

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
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(initOnAuthMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

let _prevNode: SelectedNode | null | undefined;
store.subscribe(() => {
  if (typeof window === "undefined") return;
  const node = store.getState().tree.selectedNode;
  if (node === _prevNode) return;
  _prevNode = node;
  try {
    if (node) localStorage.setItem(LS_NODE_KEY, JSON.stringify(node));
    else localStorage.removeItem(LS_NODE_KEY);
  } catch {}
});
