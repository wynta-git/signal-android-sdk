import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { DrawerState, HistoryDrawerState, ContextMenuState } from '../../types';
import { fetchBrands } from 'wynta-react-common/store/slices/brandsSlice';
import { createHead, updateHead } from './headsSlice';
import { createSubhead, updateSubhead } from './subheadsSlice';
import { createConfigure, updateConfigure, createPromoCode, createEligibility, createTrigger } from './configuresSlice';
import { updateBudget } from './budgetsSlice';
import { updateOwners } from './ownersSlice';
import { createManualBonus } from './subheadsSlice';
import { issueCodeBonus } from './subheadsSlice';

const TOAST_MESSAGES: Record<string, string> = {
  NEW_HEAD: 'Bonus head created',
  EDIT_HEAD: 'Bonus head updated',
  NEW_SUBHEAD: 'Subhead created',
  EDIT_SUBHEAD: 'Subhead updated',
  NEW_CONFIGURE: 'Configure created',
  EDIT_CONFIGURE: 'Configure updated',
  NEW_PROMOCODE: 'Promo code added',
  NEW_ELIGIBILITY: 'Eligibility criterion added',
  NEW_TRIGGER: 'Release trigger added',
  EDIT_BUDGET: 'Budget updated',
  EDIT_OWNERS: 'Owners updated',
  NEW_MANUAL_BONUS: 'Manual bonus campaign created',
  ISSUE_CODE_BONUS: 'Bonus issued to audience',
};

interface UiState {
  sidebarActive: string;
  selectedBrand: number | null;
  drawerState: DrawerState | null;
  historyDrawer: HistoryDrawerState | null;
  contextMenu: ContextMenuState | null;
  toast: string;
}

const initialState: UiState = {
  sidebarActive: 'dashboard',
  selectedBrand: null,
  drawerState: null,
  historyDrawer: null,
  contextMenu: null,
  toast: '',
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setSidebarActive(state, action: PayloadAction<string>) { state.sidebarActive = action.payload; },
    setSelectedBrand(state, action: PayloadAction<number | null>) { state.selectedBrand = action.payload; },
    openDrawer(state, action: PayloadAction<DrawerState>) { state.drawerState = action.payload; },
    closeDrawer(state) { state.drawerState = null; },
    openHistoryDrawer(state, action: PayloadAction<HistoryDrawerState>) { state.historyDrawer = action.payload; },
    closeHistoryDrawer(state) { state.historyDrawer = null; },
    openContextMenu(state, action: PayloadAction<ContextMenuState>) { state.contextMenu = action.payload; },
    closeContextMenu(state) { state.contextMenu = null; },
    setToast(state, action: PayloadAction<string>) { state.toast = action.payload; },
    clearToast(state) { state.toast = ''; },
  },
  extraReducers(builder) {
    builder
      .addCase(fetchBrands.fulfilled, (state, action) => {
        if (state.selectedBrand === null && action.payload.length > 0) {
          state.selectedBrand = action.payload[0].site_id;
        }
      })
      .addCase(createHead.fulfilled, (state) => { state.toast = TOAST_MESSAGES.NEW_HEAD; state.drawerState = null; })
      .addCase(updateHead.fulfilled, (state) => { state.toast = TOAST_MESSAGES.EDIT_HEAD; state.drawerState = null; })
      .addCase(createSubhead.fulfilled, (state) => { state.toast = TOAST_MESSAGES.NEW_SUBHEAD; state.drawerState = null; })
      .addCase(updateSubhead.fulfilled, (state) => { state.toast = TOAST_MESSAGES.EDIT_SUBHEAD; state.drawerState = null; })
      .addCase(createConfigure.fulfilled, (state) => { state.toast = TOAST_MESSAGES.NEW_CONFIGURE; state.drawerState = null; })
      .addCase(updateConfigure.fulfilled, (state) => { state.toast = TOAST_MESSAGES.EDIT_CONFIGURE; state.drawerState = null; })
      .addCase(createPromoCode.fulfilled, (state) => { state.toast = TOAST_MESSAGES.NEW_PROMOCODE; state.drawerState = null; })
      .addCase(createEligibility.fulfilled, (state) => { state.toast = TOAST_MESSAGES.NEW_ELIGIBILITY; state.drawerState = null; })
      .addCase(createTrigger.fulfilled, (state) => { state.toast = TOAST_MESSAGES.NEW_TRIGGER; state.drawerState = null; })
      .addCase(updateBudget.fulfilled, (state) => { state.toast = TOAST_MESSAGES.EDIT_BUDGET; state.drawerState = null; })
      .addCase(updateOwners.fulfilled, (state) => { state.toast = TOAST_MESSAGES.EDIT_OWNERS; state.drawerState = null; })
      .addCase(createManualBonus.fulfilled, (state) => { state.toast = TOAST_MESSAGES.NEW_MANUAL_BONUS; state.drawerState = null; })
      .addCase(issueCodeBonus.fulfilled, (state) => { state.toast = TOAST_MESSAGES.ISSUE_CODE_BONUS; state.drawerState = null; });
  },
});

export const {
  setSidebarActive, setSelectedBrand,
  openDrawer, closeDrawer,
  openHistoryDrawer, closeHistoryDrawer,
  openContextMenu, closeContextMenu,
  setToast, clearToast,
} = uiSlice.actions;

export default uiSlice.reducer;
