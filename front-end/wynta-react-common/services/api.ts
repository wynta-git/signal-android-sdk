import type { AuthResponse, Brand, SystemUser } from "../types";

const BONUS_API =
  (process.env.NEXT_PUBLIC_BONUS_API_URL || "http://3.7.48.14:8006") +
  "/api/v1/system";

const AUTH_API =
  (process.env.NEXT_PUBLIC_AUTH_API_URL || "http://3.7.48.14:8002") +
  "/api/v1/system";

export const api = {
  async fetchUsers(): Promise<SystemUser[]> {
    const res = await fetch(`${BONUS_API}/users`);
    if (!res.ok) throw new Error("Failed to fetch users");
    return res.json();
  },
  async fetchBrands(userId: number = 1): Promise<Brand[]> {
    const res = await fetch(`${BONUS_API}/brands?user_id=${userId}`);
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
