import type { AuthResponse, Brand, SystemUser } from "../types";
import { getToken } from "./tokenRegistry";

const AUTH_API =
  (process.env.NEXT_PUBLIC_AUTH_API_URL || "http://localhost:8002") +
  "/api/v1/system";

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const api = {
  async fetchUsers(): Promise<SystemUser[]> {
    const res = await fetch(`${AUTH_API}/users`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Failed to fetch users");
    return res.json();
  },
  async fetchBrands(userId: number = 1): Promise<Brand[]> {
    const res = await fetch(`${AUTH_API}/brands?user_id=${userId}`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Failed to fetch brands");
    return res.json();
  },
  async authenticateWithBridgeToken(credentials: { token: string; }): Promise<AuthResponse> {
    const res = await fetch(`${AUTH_API}/exchange_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });
    if (!res.ok) throw new Error("Authentication failed");
    return res.json();
  },
};
