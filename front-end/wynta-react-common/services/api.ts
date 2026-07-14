import type { AuthResponse, Brand, SystemUser, UserSettings } from "../types";

const BONUS_API =
  (process.env.NEXT_PUBLIC_BONUS_API_URL || "http://3.7.48.14:8006") +
  "/api/v1/system";
import { getToken } from "./tokenRegistry";

const AUTH_API =
  (process.env.NEXT_PUBLIC_AUTH_API_URL || "http://3.7.48.14:8002") +
  "/api/v1/system";

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const api = {
  async fetchUsers(siteId: number): Promise<SystemUser[]> {
    const res = await fetch(`${AUTH_API}/users?site_id=${siteId}`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Failed to fetch users");
    return res.json();
  },
  async fetchBrands(): Promise<Brand[]> {
    const res = await fetch(`${AUTH_API}/brands`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Failed to fetch brands");
    return res.json();
  },
  async authenticateWithBridgeToken(credentials: {
    token: string;
  }): Promise<AuthResponse> {
    const res = await fetch(`${AUTH_API}/exchange_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });
    if (!res.ok) throw new Error("Authentication failed");
    return res.json();
  },
  async fetchMySettings(): Promise<UserSettings> {
    const res = await fetch(`${AUTH_API}/users/me/settings`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Failed to fetch settings");
    return res.json();
  },
};
