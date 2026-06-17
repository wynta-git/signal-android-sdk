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

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return {};
  }
}

const initOnAuthMiddleware: Middleware = (storeApi) => (next) => (action) => {
  const result = next(action);

  if (action.type === "users/auth/fulfilled") {
    // Auth token is now registered — safe to fetch brand-gated data.
    // Decode the portal JWT to get project_id for the brands query.
    const portalToken: string | undefined = (action as { payload?: { data?: { token?: string } } }).payload?.data?.token;
    const programId = portalToken ? Number(decodeJwtPayload(portalToken).project_id) || 1 : 1;
    storeApi.dispatch(fetchBrands(programId) as never);
    storeApi.dispatch(fetchSegments() as never);
  }
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
