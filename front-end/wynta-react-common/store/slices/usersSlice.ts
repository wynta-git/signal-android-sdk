import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { api } from "../../services/api";
import { setRegisteredToken } from "../../services/tokenRegistry";
import type {
  AsyncStatus,
  AuthResponse,
  SystemUser,
  WyntaBridge,
} from "../../types";

// ── State ─────────────────────────────────────────────────────────────────────

interface UsersState {
  items: SystemUser[];
  status: AsyncStatus;
  error: string | null;
  // ── Auth ──────────────────────────────────────────────────────────────────
  authToken: string | null;
  authStatus: AsyncStatus;
  authError: string | null;
  // ── Bridge ────────────────────────────────────────────────────────────────
  bridgeToken: string | null;
  bridgeData: WyntaBridge | null;
}

const initialState: UsersState = {
  items: [],
  status: "idle",
  error: null,
  authToken: null,
  authStatus: "idle",
  authError: null,
  bridgeToken: null,
  bridgeData: null,
};

// ── Thunks ────────────────────────────────────────────────────────────────────

export const fetchUsers = createAsyncThunk<SystemUser[], number>("users/fetchAll", (siteId) =>
  api.fetchUsers(siteId),
);

export const authenticateWithBridgeToken = createAsyncThunk<
  AuthResponse,
  { token: string }
>("users/auth", (credentials) => api.authenticateWithBridgeToken(credentials));

// ── Slice ─────────────────────────────────────────────────────────────────────

const usersSlice = createSlice({
  name: "users",
  initialState,
  reducers: {
    /** Store a token that was injected by the server (e.g. Django header slot) */
    setAuthToken(state, action: { payload: string }) {
      state.authToken = action.payload;
      state.authStatus = "succeeded";
      state.authError = null;
      setRegisteredToken(action.payload);
    },
    /** Store the full bridge payload extracted from X-Wynta-Bridge header */
    setBridgeData(state, action: { payload: WyntaBridge }) {
      state.bridgeToken = action.payload.token ?? null;
      state.bridgeData = action.payload;
      // Bridge token is only valid for exchange_token — do NOT register it here.
      // The real auth token is registered in authenticateWithBridgeToken.fulfilled.
    },
    /** Clear all auth state on logout */
    logout(state) {
      state.authToken = null;
      state.authStatus = "idle";
      state.authError = null;
      state.bridgeToken = null;
      state.bridgeData = null;
    },
  },
  extraReducers(builder) {
    builder
      // ── fetchUsers ──────────────────────────────────────────────────────
      .addCase(fetchUsers.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.items = action.payload;
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? null;
      })

      // ── authenticateWithBridgeToken ──────────────────────────────────────
      .addCase(authenticateWithBridgeToken.pending, (state) => {
        state.authStatus = "loading";
        state.authError = null;
      })
      .addCase(authenticateWithBridgeToken.fulfilled, (state, action) => {
        // Extract portal token defensively — shape is { data: { token, refresh_interval } }
        const portalToken = action.payload?.data?.token ?? null;
        state.authStatus = "succeeded";
        state.authError = null;
        if (portalToken) {
          state.authToken = portalToken;
          // Replace bridge token in registry with the portal token — all subsequent
          // API calls (dashboard, segments, campaigns, events) use getToken() which
          // now returns this portal token.
          setRegisteredToken(portalToken);
        }
      })
      .addCase(authenticateWithBridgeToken.rejected, (state, action) => {
        state.authStatus = "failed";
        state.authError = action.error.message ?? null;
        state.authToken = null;
      });
  },
});

// ── Actions ───────────────────────────────────────────────────────────────────

export const { setAuthToken, setBridgeData, logout } = usersSlice.actions;

// ── Selectors ─────────────────────────────────────────────────────────────────

export const selectAllUsers = (state: { users: UsersState }) =>
  state.users.items;
export const selectUsersStatus = (state: { users: UsersState }) =>
  state.users.status;

export const selectAuthToken = (state: { users: UsersState }) =>
  state.users.authToken;
export const selectAuthStatus = (state: { users: UsersState }) =>
  state.users.authStatus;
export const selectAuthError = (state: { users: UsersState }) =>
  state.users.authError;
export const selectIsLoggedIn = (state: { users: UsersState }) =>
  state.users.authToken !== null;
export const selectBridgeToken = (state: { users: UsersState }) =>
  state.users.bridgeToken;
export const selectBridgeData = (state: { users: UsersState }) =>
  state.users.bridgeData;

export const selectProjectId = (state: { users: UsersState }): string | null => {
  const id = state.users.bridgeData?.user?.id;
  return id != null ? String(id) : null;
};
export const selectSiteId = (state: { users: UsersState }) =>
  state.users.bridgeData?.site_id ?? null;
export const selectBrand = (state: { users: UsersState }) =>
  state.users.bridgeData?.brand ?? null;
export const selectPage = (state: { users: UsersState }) =>
  state.users.bridgeData?.page ?? null;
export const selectIsAdmin = (state: { users: UsersState }) =>
  state.users.bridgeData?.is_admin ?? false;
export const selectAllowed = (state: { users: UsersState }) =>
  state.users.bridgeData?.allowed ?? [];
export const selectBridgeUser = (state: { users: UsersState }) =>
  state.users.bridgeData?.user ?? null;

export default usersSlice.reducer;
