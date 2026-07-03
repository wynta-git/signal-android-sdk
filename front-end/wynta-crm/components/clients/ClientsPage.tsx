'use client';
import { useState, useEffect } from 'react';
import Icon from 'wynta-react-common/components/Icon';
import './clients.css';
import type { ClientRecord, CreatedClient } from '../../services/clientApi';
import { getClients, deleteClient as apiDeleteClient } from '../../services/clientApi';
import CreateClientModal from './CreateClientModal';
import SecretRevealModal from './SecretRevealModal';
import DeleteClientModal from './DeleteClientModal';

interface Props {
  brandId?: number;
}

function typeBadgeClass(type: string): string {
  switch (type.toUpperCase()) {
    case 'APK': return 'cl-badge cl-badge--apk';
    case 'IOS': return 'cl-badge cl-badge--ios';
    case 'WEB': return 'cl-badge cl-badge--web';
    case 'S2S': return 'cl-badge cl-badge--s2s';
    default:    return 'cl-badge cl-badge--s2s';
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ClientsPage({ brandId }: Props) {
  const [clients, setClients]           = useState<ClientRecord[]>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const [showCreate, setShowCreate]     = useState(false);
  const [newClient, setNewClient]       = useState<CreatedClient | null>(null);
  const [toDelete, setToDelete]         = useState<ClientRecord | null>(null);
  const [deleting, setDeleting]         = useState(false);

  async function load() {
    if (!brandId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getClients(brandId);
      setClients(data);
    } catch {
      setError('Failed to load clients.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [brandId]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleCreated(created: CreatedClient) {
    setShowCreate(false);
    setNewClient(created);
    load();
  }

  async function handleDelete(client: ClientRecord) {
    setDeleting(true);
    try {
      await apiDeleteClient(client.client_id);
      setToDelete(null);
      setClients(prev => prev.filter(c => c.client_id !== client.client_id));
    } catch {
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="cl-page">
      <div className="cl-page-header">
        <div>
          <div className="cl-page-title">Clients</div>
          <div className="cl-page-subtitle">Manage API client credentials for this brand</div>
        </div>
        <div>
          <button
            type="button"
            className="seg-btn-primary"
            onClick={() => setShowCreate(true)}
            disabled={!brandId}
          >
            <Icon name="plus" size={14} strokeWidth={2.2} />
            Create Client
          </button>
        </div>
      </div>

      {!brandId ? (
        <div className="cl-empty">Select a brand to view its clients.</div>
      ) : (
        <div className="cl-table-section">
          <div className="cl-table-toolbar">
            <span className="cl-table-toolbar-title">
              {loading ? 'Loading…' : `${clients.length} client${clients.length !== 1 ? 's' : ''}`}
            </span>
          </div>

          {error ? (
            <div className="cl-empty">{error}</div>
          ) : loading ? (
            <div className="cl-loading">Loading…</div>
          ) : clients.length === 0 ? (
            <div className="cl-empty">No clients yet. Click "Create Client" to add one.</div>
          ) : (
            <div className="cl-table-scroll">
              <table className="cl-table">
                <thead>
                  <tr>
                    <th>Site ID</th>
                    <th>Client ID</th>
                    <th>Client Secret</th>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Active</th>
                    <th>Type</th>
                    <th>Created By</th>
                    <th>Created At</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map(c => (
                    <tr key={c.client_id}>
                      <td>{c.site_id}</td>
                      <td><span className="cl-client-id">{c.client_id}</span></td>
                      <td><span className="cl-secret-mask">••••••••</span></td>
                      <td><span className="cl-row-name">{c.name}</span></td>
                      <td>{c.description || <span style={{ color: 'var(--crm-fg4)' }}>—</span>}</td>
                      <td>
                        {c.active ? (
                          <span className="cl-active-badge">Active</span>
                        ) : (
                          <span style={{ color: 'var(--crm-fg4)', fontSize: 12 }}>Inactive</span>
                        )}
                      </td>
                      <td>
                        <span className={typeBadgeClass(c.client_type)}>{c.client_type}</span>
                      </td>
                      <td style={{ color: 'var(--crm-fg3)', fontSize: 12 }}>
                        {c.created_by || '—'}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: 'var(--crm-fg3)' }}>
                        {formatDate(c.created_at)}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="cl-btn-delete"
                          onClick={() => setToDelete(c)}
                        >
                          <Icon name="trash-2" size={13} strokeWidth={1.75} />
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showCreate && brandId && (
        <CreateClientModal
          siteId={brandId}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}

      {newClient && (
        <SecretRevealModal
          created={newClient}
          onClose={() => setNewClient(null)}
        />
      )}

      {toDelete && (
        <DeleteClientModal
          client={toDelete}
          deleting={deleting}
          onClose={() => setToDelete(null)}
          onConfirm={() => handleDelete(toDelete)}
        />
      )}
    </div>
  );
}
