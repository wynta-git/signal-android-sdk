import { configureStore } from "@reduxjs/toolkit";
import type { Middleware } from "@reduxjs/toolkit";
import uiReducer from "./slices/uiSlice";
import brandsReducer from "wynta-react-common/store/slices/brandsSlice";
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
import spendReducer from "./slices/spendSlice";
import bonusDashboardReducer from "./slices/bonusDashboardSlice";
import usersReducer, {
  authenticateWithBridgeToken,
} from "wynta-react-common/store/slices/usersSlice";
import eventsReducer from "wynta-react-common/store/slices/eventsSlice";
import settingsReducer from "wynta-react-common/store/slices/settingsSlice";
import copilotReducer from "wynta-react-common/store/slices/copilotSlice";
import type { SelectedNode } from "../types";


const initOnAuthMiddleware: Middleware = (storeApi) => (next) => (action) => {
  const result = next(action);

  const typedAction = action as { type?: string; payload?: { data?: { token?: string } } };
  if (typedAction.type === "users/auth/fulfilled") {
    // Brands and settings are already fetched unconditionally by AppShell's
    // own mount effect (wynta-react-common/components/AppShell.tsx), which —
    // thanks to BonusAdminApp's token-ready gate — only mounts after auth
    // succeeds anyway. Dispatching them here too caused duplicate GET calls
    // (confirmed for fetchBrands; fetchUserSettings was moved out for the
    // same reason after it caused a duplicate GET /users/me/settings when
    // this store is used as wynta-web's ambient store alongside CrmApp's own
    // nested store, which also fetches settings on mount).
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
    spend: spendReducer,
    bonusDashboard: bonusDashboardReducer,
    users: usersReducer,
    events: eventsReducer,
    settings: settingsReducer,
    copilot: copilotReducer,
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
