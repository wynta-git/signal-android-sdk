import { getToken } from 'wynta-react-common/services/tokenRegistry';

const BASE = process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://3.7.48.14:8002';

function authHeader() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
  };
}

export interface ClientRecord {
  id: number;
  site_id: number;
  client_id: string;
  name: string;
  description: string | null;
  client_type: string;
  active: number;
  allowed_hosts: string[];
  configuration: Record<string, string>;
  site_name: string | null;
  project_id: number | null;
  project_name: string | null;
  project_key: string | null;
  created_by: string | null;
  created_at: string | null;
}

export interface CreatedClient {
  client_id: string;
  client_secret: string;
  site_id: number;
  name: string;
  description: string | null;
  client_type: string;
  role: Record<string, unknown>;
  created_by: string;
}

export interface CreateClientPayload {
  site_id: number;
  client_id?: string;
  name: string;
  description?: string;
  client_type: string;
}

export async function getClients(siteId: number): Promise<ClientRecord[]> {
  const res = await fetch(`${BASE}/api/v1/system/clients?site_id=${siteId}`, {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error(`Failed to fetch clients: ${res.status}`);
  return res.json();
}

export async function createClient(payload: CreateClientPayload): Promise<CreatedClient> {
  const res = await fetch(`${BASE}/api/v1/system/clients`, {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to create client: ${res.status}`);
  return res.json();
}

export async function deleteClient(clientId: string): Promise<void> {
  const res = await fetch(`${BASE}/api/v1/system/clients/${encodeURIComponent(clientId)}`, {
    method: 'DELETE',
    headers: authHeader(),
  });
  if (!res.ok) throw new Error(`Failed to delete client: ${res.status}`);
}
