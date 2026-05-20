# Claude Code Prompt — Convert "Bonus Dashboard.html" to Next.js + Redux Toolkit

Copy everything below into Claude Code (in the same folder as `Bonus Dashboard.html`). It is written as a brief for Claude Code to execute end-to-end.

---

## Brief

The repo contains a single-file React prototype: **`Bonus Dashboard.html`** (~8,600 lines).
It is the **Wynta Bonus Admin** — a Bonus Heads → Subheads → Configures → Promo Codes management console. Everything is currently inline: CSS in `<style>`, mock data in a plain `<script>`, and the entire React tree compiled in-browser via `@babel/standalone` inside `<script type="text/babel">`.

**Goal:** port this to a real **Next.js 14 (App Router) + React 18** project, with **Redux Toolkit + `createAsyncThunk`** managing all app state. Mock data must remain mock (no real backend) — it should live behind a tiny "fake API" service that the thunks call, simulating latency with `setTimeout`.

**Hard requirement: the running app must be 100% visually identical to `Bonus Dashboard.html`.** Same layout, same colors, same fonts, same paddings, same hover states, same icons (lucide), same KPI strip animation, same drawer slide-in, same context menus, same toasts. Pixel parity is the bar — if anything looks different, fix it.

---

## Step 0 — Read the source first

Before touching anything, read `Bonus Dashboard.html` in full. It has three sections:

1. **Lines 1–3262** — the entire stylesheet inside `<style>`. CSS custom properties at the top (`--blue`, `--g50`…), then layout shell, sidebar, topbar, three-zone, hierarchy tree, detail panel, drawer, modals, etc.
2. **Lines 3271–4486** — plain `<script>` block defining the mock data layer: `MOCK_HEADS`, `MOCK_SUBHEADS`, `MOCK_CONFIGURES`, `LIFECYCLE_STATES`, `CONFIGURE_USAGE`, `CODE_USAGE`, `CONFIGURE_BUDGETS`, `CODE_BUDGETS`, `STATE_META`, `HEAD_HISTORY`, `SUBHEAD_HISTORY`, `CONFIGURE_HISTORY`, `HISTORY_KIND_META`. Plus an `iso()` helper and a `now` anchor (`'2026-05-16T12:00:00Z'`).
3. **Lines 4488–8622** — `<script type="text/babel">` containing every React component plus the `App()` root. Components are grouped with banner comments — keep those groupings as your file boundaries.

Read it. Don't skip. The file is the spec.

---

## Step 1 — Scaffold

Use **Next.js 14 App Router with the JavaScript template** (no TypeScript — the source is plain JS; don't pretend to add types you didn't infer). No Tailwind, no ESLint prompt, no `src/` dir.

```bash
npx create-next-app@latest wynta-bonus --js --app --no-tailwind --no-eslint --no-src-dir --import-alias "@/*"
cd wynta-bonus
npm install @reduxjs/toolkit react-redux lucide-react
```

Use `lucide-react` (the React bindings), not the UMD CDN build the HTML uses. The icon names match.

Remove the default `app/page.js`, default `app/globals.css` boilerplate, default favicon, etc. Start clean.

---

## Step 2 — Project structure

Create this layout:

```
app/
  layout.js                 ← root layout; loads Geist via next/font; mounts <Providers>
  page.js                   ← renders <BonusAdminApp/> ("use client")
  providers.js              ← "use client"; <Provider store={store}>
  globals.css               ← the entire stylesheet from <style> in the HTML, verbatim, minus the @import for Geist (next/font handles that)
components/
  primitives/
    Icon.jsx
    CountUp.jsx
    CountUpCurrency.jsx
    BudgetRing.jsx
    ValidityBar.jsx
    Badge.jsx
    OwnerPill.jsx
    Toggle.jsx
    Toast.jsx
    LifecycleBar.jsx
    UsageBreakdown.jsx
    EmptyState.jsx
    ActionBar.jsx
    BudgetGrid.jsx
    Pager.jsx
    ContextMenu.jsx
    MultiSelect.jsx
  shell/
    Sidebar.jsx
    Topbar.jsx
    GlobalSearch.jsx
    SearchResultRow.jsx
    BrandSwitcher.jsx
    KpiStrip.jsx
  tree/
    HierarchyTree.jsx
    HeadNode.jsx
    SubheadNodeFull.jsx
    ConfigureNode.jsx      ← lives inline in HTML; extract it
  detail/
    DetailPanel.jsx
    HeadDetailPanel.jsx
    SubheadDetailPanel.jsx
    ConfigureDetailPanel.jsx
    PromoCodeRow.jsx
    ChangeHistory.jsx
    HistoryRow.jsx
  segments/
    PlayerSegmentsPanel.jsx
    SegmentsModal.jsx
    SegmentsBrowse.jsx
    SegmentBuilder.jsx
    RuleEditor.jsx
    SegmentPlayersList.jsx
    SegmentPlayersModal.jsx
    PlayerSegmentPicker.jsx
    PlayerProfileModal.jsx
  drawers/
    SlideDrawer.jsx
    HistoryDrawer.jsx
    DrawerForm.jsx
    DrawerFooter.jsx
    forms/
      HeadForm.jsx
      SubheadForm.jsx
      ConfigureForm.jsx
      PromoCodeForm.jsx
      EligibilityForm.jsx
      TriggerForm.jsx
      ManualBonusForm.jsx
      IssueCodeBonusForm.jsx
      BudgetForm.jsx
  BonusAdminApp.jsx          ← the App() root from the HTML, refactored to read/dispatch Redux
store/
  index.js                   ← configureStore, exports store + hooks
  hooks.js                   ← useAppDispatch / useAppSelector wrappers
  slices/
    uiSlice.js               ← sidebarActive, selectedBrand, drawerState, historyDrawer, contextMenu, toast
    treeSlice.js             ← expandedHeads, expandedSubheads, loadingSubheads, selectedNode
    headsSlice.js            ← heads entities + fetch/create/update thunks
    subheadsSlice.js
    configuresSlice.js
    promoCodesSlice.js
    budgetsSlice.js
    usageSlice.js            ← CONFIGURE_USAGE + CODE_USAGE
    historySlice.js          ← HEAD/SUBHEAD/CONFIGURE_HISTORY
    segmentsSlice.js         ← MANUAL_SEGMENTS + segment builder state + players list
    kpiSlice.js              ← the live counters used by KpiStrip
services/
  api.js                     ← the fake backend; exports promise-returning functions that resolve from the mock dataset
  mocks/
    heads.js                 ← MOCK_HEADS (exported)
    subheads.js              ← MOCK_SUBHEADS
    configures.js            ← MOCK_CONFIGURES
    lifecycle.js             ← LIFECYCLE_STATES, STATE_META, CONFIGURE_USAGE, CODE_USAGE
    budgets.js               ← CONFIGURE_BUDGETS, CODE_BUDGETS
    history.js               ← HEAD_HISTORY, SUBHEAD_HISTORY, CONFIGURE_HISTORY, HISTORY_KIND_META
    constants.js             ← FREQUENCIES, TRIGGER_TYPES, VALUE_TYPES, BRANDS, DRAWER_TITLES, USAGE_PERIODS, MANUAL_SEGMENTS, SEGMENT_FIELDS, OPS, PLAYER_FIRST_NAMES, PLAYER_LAST_NAMES, PLAYER_STATES, PLAYER_TIERS, PLAYER_KYC, PLAYER_PRODUCTS, PLAYERS_PAGE_SIZE, PLAYERS_SEARCH_CAP
    iso.js                   ← the iso() helper + the fixed `now` anchor (export both)
public/
  wynta-logo.png             ← extract the base64 in WYNTA_LOGO from the HTML and save as a real PNG; import it in Sidebar/Topbar with next/image or a plain <img>
```

Component file count maps almost 1:1 to the function declarations in the source. Use the line markers below as your inventory — every name on the left becomes a default-exported component in the file on the right.

| Source line | Function | Destination |
| --- | --- | --- |
| 4496 | `Icon` | `components/primitives/Icon.jsx` (wrap `lucide-react` icons) |
| 4528 | `CountUp` | `components/primitives/CountUp.jsx` |
| 4536 | `BudgetRing` | `components/primitives/BudgetRing.jsx` |
| 4591 | `ValidityBar` | `components/primitives/ValidityBar.jsx` |
| 4633 | `Badge` | `components/primitives/Badge.jsx` |
| 4648 | `OwnerPill` | `components/primitives/OwnerPill.jsx` |
| 4666 | `Toggle` | `components/primitives/Toggle.jsx` |
| 4678 | `Toast` | `components/primitives/Toast.jsx` |
| 4697 | `LifecycleBar` | `components/primitives/LifecycleBar.jsx` |
| 4766 | `UsageBreakdown` | `components/primitives/UsageBreakdown.jsx` |
| 4844 | `KpiStrip` | `components/shell/KpiStrip.jsx` |
| 4983 | `CountUpCurrency` | `components/primitives/CountUpCurrency.jsx` |
| 4993 | `ContextMenu` | `components/primitives/ContextMenu.jsx` |
| 5111 | `HeadNode` | `components/tree/HeadNode.jsx` |
| 5167 | `SubheadNodeFull` | `components/tree/SubheadNodeFull.jsx` |
| ~5050 | `ConfigureNode` (inline `const`) | `components/tree/ConfigureNode.jsx` |
| 5235 | `BrandSwitcher` | `components/shell/BrandSwitcher.jsx` |
| 5296 | `HierarchyTree` | `components/tree/HierarchyTree.jsx` |
| 5340 | `PlayerSegmentsPanel` | `components/segments/PlayerSegmentsPanel.jsx` |
| 5427 | `SegmentsModal` | `components/segments/SegmentsModal.jsx` |
| 5493 | `SegmentsBrowse` | `components/segments/SegmentsBrowse.jsx` |
| 5591 | `SegmentBuilder` | `components/segments/SegmentBuilder.jsx` |
| 5692 | `RuleEditor` | `components/segments/RuleEditor.jsx` |
| 5777 | `MultiSelect` | `components/primitives/MultiSelect.jsx` |
| 5816 | `EmptyState` | `components/primitives/EmptyState.jsx` |
| 5836 | `ActionBar` | `components/primitives/ActionBar.jsx` |
| 5843 | `BudgetGrid` | `components/primitives/BudgetGrid.jsx` |
| 5874 | `HeadDetailPanel` | `components/detail/HeadDetailPanel.jsx` |
| 5999 | `SubheadDetailPanel` | `components/detail/SubheadDetailPanel.jsx` |
| 6109 | `HistoryDrawer` | `components/drawers/HistoryDrawer.jsx` |
| 6155 | `ChangeHistory` | `components/detail/ChangeHistory.jsx` |
| 6186 | `HistoryRow` | `components/detail/HistoryRow.jsx` |
| 6234 | `PromoCodeRow` | `components/detail/PromoCodeRow.jsx` |
| 6482 | `Pager` | `components/primitives/Pager.jsx` |
| 6512 | `SegmentPlayersList` | `components/segments/SegmentPlayersList.jsx` |
| 6626 | `PlayerProfileModal` | `components/segments/PlayerProfileModal.jsx` |
| 6749 | `SegmentPlayersModal` | `components/segments/SegmentPlayersModal.jsx` |
| 6799 | `PlayerSegmentPicker` | `components/segments/PlayerSegmentPicker.jsx` |
| 6900 | `ConfigureDetailPanel` | `components/detail/ConfigureDetailPanel.jsx` |
| 7050 | `DetailPanel` | `components/detail/DetailPanel.jsx` |
| 7094 | `SlideDrawer` | `components/drawers/SlideDrawer.jsx` |
| 7141 | `DrawerForm` | `components/drawers/DrawerForm.jsx` |
| 7162 | `DrawerFooter` | `components/drawers/DrawerFooter.jsx` |
| 7176 | `HeadForm` | `components/drawers/forms/HeadForm.jsx` |
| 7232 | `SubheadForm` | `components/drawers/forms/SubheadForm.jsx` |
| 7285 | `ConfigureForm` | `components/drawers/forms/ConfigureForm.jsx` |
| 7447 | `PromoCodeForm` | `components/drawers/forms/PromoCodeForm.jsx` |
| 7515 | `EligibilityForm` | `components/drawers/forms/EligibilityForm.jsx` |
| 7566 | `TriggerForm` | `components/drawers/forms/TriggerForm.jsx` |
| 7697 | `ManualBonusForm` | `components/drawers/forms/ManualBonusForm.jsx` |
| 7899 | `IssueCodeBonusForm` | `components/drawers/forms/IssueCodeBonusForm.jsx` |
| 7989 | `BudgetForm` | `components/drawers/forms/BudgetForm.jsx` |
| 8067 | `Sidebar` | `components/shell/Sidebar.jsx` |
| 8126 | `GlobalSearch` | `components/shell/GlobalSearch.jsx` |
| 8244 | `SearchResultRow` | `components/shell/SearchResultRow.jsx` |
| 8389 | `Topbar` | `components/shell/Topbar.jsx` |
| 8446 | `App` | `components/BonusAdminApp.jsx` |

Don't merge files; don't rename components.

---

## Step 3 — Move CSS verbatim

Copy the entire contents between `<style>` and `</style>` (lines 8–3262 of the HTML) into `app/globals.css`. **Do not** rewrite selectors, do not "tidy up", do not convert to CSS modules. The class names in the JSX are stable contracts.

One change: remove the `@import url('https://fonts.googleapis.com/css2?family=Geist…')` line. Load Geist + Geist Mono via `next/font/google` in `app/layout.js` and set their CSS variables on `<html>`:

```js
import { Geist, Geist_Mono } from 'next/font/google';
const geist = Geist({ subsets: ['latin'], variable: '--font-geist', weight: ['400','500','600','700'] });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', weight: ['400','500','600'] });
```

Then in `globals.css`, change the `--font` and `--mono` tokens to reference `var(--font-geist)` / `var(--font-geist-mono)`. Everything else stays.

Import `globals.css` once, at the top of `app/layout.js`.

---

## Step 4 — Mock data → services

Lift every `const MOCK_*`, `const *_USAGE`, `const *_BUDGETS`, `const *_HISTORY`, and the small lookup constants out of the HTML into the matching file under `services/mocks/`. **Copy values verbatim** — don't shorten arrays, don't drop fields, don't "demo-ize" amounts. The dashboard's visual state (filled rings, populated history, full pager) depends on the exact dataset.

The `iso()` helper and the `now` anchor go in `services/mocks/iso.js` and get re-exported where used. **Keep `now` fixed to `'2026-05-16T12:00:00Z'`** — many dates in the dataset are computed as offsets from it and the UI is tuned to that anchor.

`services/api.js` is a thin async layer over the mocks. Pattern:

```js
const delay = (ms = 180) => new Promise(r => setTimeout(r, ms));

export const api = {
  async fetchHeads() {
    await delay();
    return Object.values(MOCK_HEADS);
  },
  async fetchHead(id) {
    await delay();
    const h = MOCK_HEADS[id];
    if (!h) throw new Error('Head not found: ' + id);
    return h;
  },
  async fetchSubhead(id) { /* … */ },
  async fetchConfigure(id) { /* … */ },
  async fetchConfigureUsage(id) { /* … */ },
  async fetchCodeUsage(codeId) { /* … */ },
  async fetchHistory(type, id) { /* … */ },           // type: 'head' | 'subhead' | 'configure'
  async fetchBudget(scope, id) { /* … */ },           // scope: 'head' | 'subhead' | 'configure' | 'code'
  async createHead(payload) { /* mutate MOCK_HEADS in place, return the created entity */ },
  async updateHead(id, patch) { /* … */ },
  async createSubhead(parentId, payload) { /* … */ },
  async updateSubhead(id, patch) { /* … */ },
  async createConfigure(parentId, payload) { /* … */ },
  async updateConfigure(id, patch) { /* … */ },
  async createPromoCode(configureId, payload) { /* … */ },
  async createTrigger(configureId, payload) { /* … */ },
  async createEligibility(configureId, payload) { /* … */ },
  async updateBudget(scope, id, periods) { /* … */ },
  async createManualBonus(subheadId, payload) { /* … */ },
  async issueCodeBonus(payload) { /* … */ },
  async fetchSegments() { /* MANUAL_SEGMENTS */ },
  async createSegment(payload) { /* … */ },
  async fetchSegmentPlayers(segmentId, { page, search }) {
    // The HTML synthesizes players deterministically from PLAYER_FIRST_NAMES × PLAYER_LAST_NAMES etc.
    // Lift that generator out of SegmentPlayersList and put it here. Cap at PLAYERS_SEARCH_CAP, page by PLAYERS_PAGE_SIZE.
  },
};
```

Reads use `await delay()`; writes use `await delay(280)` to keep the "Saving…" state visible. Mutations mutate the imported mock objects in place — refreshing the page resets state, that's expected and matches the prototype.

---

## Step 5 — Redux slices and thunks

Each slice uses `createSlice` with an `extraReducers` builder for its thunks. Status flags per entity-table: `{ ids: [], entities: {}, status: 'idle' | 'loading' | 'succeeded' | 'failed', error: null }`.

### `headsSlice`
```js
export const fetchHeads = createAsyncThunk('heads/fetchAll',   () => api.fetchHeads());
export const fetchHead  = createAsyncThunk('heads/fetchOne',   (id) => api.fetchHead(id));
export const createHead = createAsyncThunk('heads/create',     (payload) => api.createHead(payload));
export const updateHead = createAsyncThunk('heads/update',     ({ id, patch }) => api.updateHead(id, patch));
```
Selectors: `selectAllHeads`, `selectHeadById(id)`.

### `subheadsSlice`, `configuresSlice`, `promoCodesSlice`
Same shape. `configuresSlice` also tracks `triggers` and `eligibilities` as nested arrays on each configure entity (the mocks already model them that way — preserve the shape).

### `budgetsSlice`
Keyed by `${scope}:${id}` (e.g. `'configure:111'`). `fetchBudget`, `updateBudget`. The `BudgetGrid` and `BudgetRing` components read from here.

### `usageSlice`
Two records: `configure` and `code`, each `{ [id]: usage }`. `fetchConfigureUsage`, `fetchCodeUsage`. `LifecycleBar` and `UsageBreakdown` read from here.

### `historySlice`
`{ head: {[id]: events[]}, subhead: {…}, configure: {…} }`. Single thunk `fetchHistory({type, id})`. `ChangeHistory` and `HistoryDrawer` read from here.

### `segmentsSlice`
Catalog + builder state (the `SegmentBuilder` form's rule list + name + product) + paginated players cache keyed by `${segmentId}:${page}:${search}`.

### `kpiSlice`
Live counters shown in `KpiStrip`: total released today, redeemed today, expired today, top configure, etc. The HTML computes these by aggregating mock data on mount — port that aggregation into a thunk `fetchKpiSnapshot` that produces the same numbers, then re-aggregates in real time when mutations succeed (subscribe to other thunks' `fulfilled` actions inside `extraReducers`).

### `treeSlice` (pure UI state)
```js
initialState = {
  expandedHeads: [2, 4],
  expandedSubheads: [25, 26, 41],
  loadingSubheads: [],
  selectedNode: { type: 'subhead', id: 26 },
};
```
Reducers: `toggleHead`, `toggleSubhead` (also dispatches a 220ms loading placeholder via a thunk — see below), `selectNode`, `expandAncestorsOf` (used by `selectNode` and by global search results to auto-expand the path to a node).

**Note:** `Set` is not serializable; Redux Toolkit will warn. Store these as **arrays** and convert to `Set` only at read time inside the component (`useMemo`).

Replicate the subhead "loading shimmer" with a tiny thunk:

```js
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
```

### `uiSlice`
```js
initialState = {
  sidebarActive: 'dashboard',
  selectedBrand: 'TR',
  drawerState: null,         // { type, id?, parentId?, scope? }
  historyDrawer: null,       // { type, id }
  contextMenu: null,         // { type, id, x, y }
  toast: '',
};
```
Reducers: `setSidebarActive`, `setSelectedBrand`, `openDrawer`, `closeDrawer`, `openHistoryDrawer`, `closeHistoryDrawer`, `openContextMenu`, `closeContextMenu`, `setToast`, `clearToast`.

A drawer "submit" dispatches the appropriate create/update thunk; on `fulfilled`, the UI slice listens (`extraReducers`) and sets the toast message to one of:
```
NEW_HEAD → 'Bonus head created'
EDIT_HEAD → 'Bonus head updated'
NEW_SUBHEAD → 'Subhead created'
EDIT_SUBHEAD → 'Subhead updated'
NEW_CONFIGURE → 'Configure created'
EDIT_CONFIGURE → 'Configure updated'
NEW_PROMOCODE → 'Promo code added'
NEW_ELIGIBILITY → 'Eligibility criterion added'
NEW_TRIGGER → 'Release trigger added'
EDIT_BUDGET → 'Budget updated'
NEW_MANUAL_BONUS → 'Manual bonus campaign created'
ISSUE_CODE_BONUS → 'Bonus issued to audience'
```

The 1.6s auto-dismiss currently in `Toast` stays in the component (`setTimeout` → `dispatch(clearToast())`).

### Store

```js
// store/index.js
import { configureStore } from '@reduxjs/toolkit';
export const store = configureStore({
  reducer: {
    ui: uiReducer,
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
```

`store/hooks.js` exports `useAppDispatch` and `useAppSelector` thin wrappers over `useDispatch` / `useSelector`.

`app/providers.js`:
```js
'use client';
import { Provider } from 'react-redux';
import { store } from '@/store';
export default function Providers({ children }) { return <Provider store={store}>{children}</Provider>; }
```

---

## Step 6 — Wire components to the store

The conversion rule: **every piece of state that the original `App()` held in `useState` becomes a Redux selector + dispatch in the same place**. Props that pass that state down stay as props OR get replaced with direct selectors in the child — whichever keeps the diff small. Component-local state that is *truly* local (form field draft values, hover index in `GlobalSearch`, the open/closed state of a popover within a row) stays as `useState`. Don't over-Redux.

For each detail panel:
1. On mount / on `selectedNode` change, dispatch the matching `fetch*` thunk if status is `idle`.
2. Read the entity from the slice.
3. Render exactly the same JSX as the source.

`KpiStrip` dispatches `fetchKpiSnapshot` on mount and reads the result; the animation hook (`CountUp`) stays unchanged.

`HierarchyTree`, `HeadNode`, `SubheadNodeFull`, `ConfigureNode`:
- `expandedHeads` / `expandedSubheads` / `loadingSubheads` come from `tree` slice, materialized to `Set` via `useMemo`.
- `selectedNode` comes from `tree` slice.
- `onSelectNode` → `dispatch(treeSlice.actions.selectNode(...))` + `dispatch(treeSlice.actions.expandAncestorsOf(...))`.
- Right-click → `dispatch(openContextMenu({...}))`.

`SlideDrawer` reads `ui.drawerState`. Each form, on submit, dispatches its thunk. The drawer closes on `fulfilled` (subscribe via `unwrap()` and call `dispatch(closeDrawer())` from the form's submit handler — same as the source's `handleSubmit`).

`HistoryDrawer` reads `ui.historyDrawer` and dispatches `fetchHistory` when it opens.

Everything that was previously a top-level callback in `App()` (`openDrawer`, `closeDrawer`, `handleSubmit`, `handleSelectNode`, `toggleHead`, `toggleSubhead`, brand change, etc.) becomes a dispatch.

---

## Step 7 — Top-level page

`app/page.js`:
```jsx
import BonusAdminApp from '@/components/BonusAdminApp';
export default function Page() { return <BonusAdminApp />; }
```

`BonusAdminApp.jsx` is marked `'use client'` (it's the App from the HTML, just dispatch-driven). The mock data, slices, and `SlideDrawer` portal mount under it. The root element gets `data-screen-label="Bonus Dashboard"` to match the source.

The body bg color from the HTML (`style="background-color: rgb(192, 200, 215)"`) goes on `<body>` in `app/layout.js` via a className or inline style.

---

## Step 8 — Icons

The HTML uses `lucide@latest` via a UMD CDN and a custom `Icon` component that resolves names to SVG strings. Replace this with `lucide-react`:

```jsx
// components/primitives/Icon.jsx
'use client';
import * as Lucide from 'lucide-react';
const ALIASES = { 'chevron-right': 'ChevronRight', 'plus-circle': 'PlusCircle', /* …match every name used in the source */ };
function toPascal(name) { return name.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join(''); }
export default function Icon({ name, size = 16, color, strokeWidth = 1.8, style = {} }) {
  const Cmp = Lucide[ALIASES[name] || toPascal(name)];
  if (!Cmp) return null;
  return <Cmp size={size} color={color} strokeWidth={strokeWidth} style={style} />;
}
```

Grep the source for every `<Icon name="…">` and confirm each name has a `lucide-react` export. Add missing entries to `ALIASES`.

---

## Step 9 — Logo

In the source, `WYNTA_LOGO` is a long base64 PNG data URI (line 8065). Extract that string, decode it to a real PNG at `public/wynta-logo.png`, and replace `<img src={WYNTA_LOGO}/>` with `<img src="/wynta-logo.png" alt="Wynta"/>` in `Sidebar` and `Topbar`. Don't use `next/image` here — the original uses a plain `<img>` and the CSS targets `.sidebar .brand-bar img` directly.

---

## Step 10 — Visual parity pass

When the build runs, open `/` side-by-side with `Bonus Dashboard.html` opened directly in a browser. Walk through:

1. Sidebar — width, brand bar, nav sections, active state, hover tint.
2. Topbar — logo, brand divider, brand switcher dropdown, global search input + result rows + keyboard nav.
3. KPI strip — five tiles, numbers animate from 0, deltas in green/red.
4. Three-zone layout — left tree, right detail.
5. Tree — head nodes expanded for ids 2 & 4 by default, subheads 25/26/41 expanded by default, subhead 26 selected on first load.
6. Detail panel for subhead 26 — header, owners, budget grid with three rings, lifecycle bar, usage breakdown, change history.
7. Right-click any tree node → context menu appears at cursor with the correct items per node type.
8. Click "+ Add Head" → drawer slides in from right.
9. Submit any form → drawer closes, toast appears bottom-center for ~1.6s.
10. Drag-scroll behavior on the hierarchy, hover backgrounds on rows, focus rings on inputs.

Anything that drifts: fix the CSS or the JSX, do not "improve" it. The bar is **identical**, not "similar".

---

## Step 11 — Sanity

```bash
npm run dev
```
Visit `http://localhost:3000`. Should render the dashboard with subhead 26 selected, KPI strip animating, mock data populated, no console errors, no hydration warnings (every component touching Redux or `useState` is `'use client'`).

```bash
npm run build && npm start
```
Production build must succeed.

---

## Non-negotiables

- **No TypeScript** unless you also port every prop type — leave it as JS.
- **No Tailwind, no Chakra, no MUI.** The existing CSS is the design system.
- **Don't refactor the JSX semantics.** Same class names, same DOM order, same inline styles.
- **Don't reduce the mock data.** Copy it whole.
- **Don't introduce a backend.** `services/api.js` is the only data source.
- **Don't add features.** The scope is "same app, different runtime + state container."
- **No `'use server'` actions, no server components for interactive parts.** The whole app tree under `BonusAdminApp` is client-side.

When in doubt, open `Bonus Dashboard.html` and match it.
