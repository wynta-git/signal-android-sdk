import type { Brand, SystemUser } from "../types";

const BONUS_API =
  (process.env.NEXT_PUBLIC_BONUS_API_URL || "http://localhost:8006") +
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
};
