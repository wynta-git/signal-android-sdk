'use client';
import { useState, useEffect } from 'react';
import Icon from 'wynta-react-common/components/Icon';
import { useCommonSelector } from 'wynta-react-common/store/hooks';
import { selectProjectId } from 'wynta-react-common/store/slices/usersSlice';
import '../clients/clients.css';
import type { ScreenCatalogEntry } from '../../services/campaignApi';
import { fetchScreenCatalogDetailed, createScreen, deleteScreen } from '../../services/campaignApi';
import CreateScreenModal from './CreateScreenModal';

interface Props {
  brandId?: number;
}

// The backend's ScreenCatalogEntry.brand_id is a string (Mongo/backend
// convention); createScreen/deleteScreen take a number (matching the
// wizard's brandId convention) — convert at the boundary.
function toBrandId(brandId: string | null): number | undefined {
  return brandId ? Number(brandId) : undefined;
}

export default function ScreenCatalogPage({ brandId }: Props) {
  const projectId = useCommonSelector(selectProjectId) ?? process.env.NEXT_PUBLIC_PROJECT_ID ?? 'proj_demo';

  const [entries, setEntries] = useState<ScreenCatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);

  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue]     = useState('');
  const [editSaving, setEditSaving]   = useState(false);
  const [editError, setEditError]     = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchScreenCatalogDetailed(projectId, brandId);
      setEntries(data);
    } catch {
      setError('Failed to load screen catalog.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [projectId, brandId]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleCreated() {
    setShowCreate(false);
    load();
  }

  function startEdit(entry: ScreenCatalogEntry) {
    setEditingName(entry.screen_name);
    setEditValue(entry.screen_name);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingName(null);
    setEditValue('');
    setEditError(null);
  }

  async function saveEdit(entry: ScreenCatalogEntry) {
    const newName = editValue.trim();
    if (!newName || newName === entry.screen_name) { cancelEdit(); return; }
    setEditSaving(true);
    setEditError(null);
    try {
      // A catalog entry's identity is its name — "renaming" is delete-old +
      // create-new against the same two endpoints used elsewhere, not a
      // separate rename API.
      await deleteScreen(projectId, entry.screen_name, toBrandId(entry.brand_id));
      await createScreen(projectId, newName, toBrandId(entry.brand_id));
      cancelEdit();
      await load();
    } catch {
      setEditError('Could not rename screen. Please try again.');
      setEditSaving(false);
    }
  }

  async function handleDelete(entry: ScreenCatalogEntry) {
    if (!window.confirm(`Remove "${entry.screen_name}" from the screen catalog?`)) return;
    try {
      await deleteScreen(projectId, entry.screen_name, toBrandId(entry.brand_id));
      setEntries(prev => prev.filter(e => !(e.screen_name === entry.screen_name && e.brand_id === entry.brand_id)));
    } catch {
      setError('Could not delete screen. Please try again.');
    }
  }

  return (
    <div className="cl-page">
      <div className="cl-page-header">
        <div>
          <div className="cl-page-title">Screen Catalog</div>
          <div className="cl-page-subtitle">Screen names available for in-app campaigns' "On screen load" targeting</div>
        </div>
        <div>
          <button type="button" className="seg-btn-primary" onClick={() => setShowCreate(true)}>
            <Icon name="plus" size={14} strokeWidth={2.2} />
            Add Screen
          </button>
        </div>
      </div>

      <div className="cl-table-section">
        <div className="cl-table-toolbar">
          <span className="cl-table-toolbar-title">
            {loading ? 'Loading…' : `${entries.length} screen${entries.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {error ? (
          <div className="cl-empty">{error}</div>
        ) : loading ? (
          <div className="cl-loading">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="cl-empty">No screens yet. Click "Add Screen" to add one.</div>
        ) : (
          <div className="cl-table-scroll">
            <table className="cl-table" style={{ minWidth: 480 }}>
              <thead>
                <tr>
                  <th>Screen name</th>
                  <th>Scope</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => {
                  const key = `${entry.brand_id ?? 'all'}:${entry.screen_name}`;
                  const isEditing = editingName === entry.screen_name;
                  return (
                    <tr key={key}>
                      <td>
                        {isEditing ? (
                          <>
                            <input
                              className="cwiz-input"
                              type="text"
                              value={editValue}
                              disabled={editSaving}
                              autoFocus
                              onChange={e => setEditValue(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(entry); } }}
                            />
                            {editError && <span className="cwiz-field-error">{editError}</span>}
                          </>
                        ) : (
                          <span className="cl-row-name">{entry.screen_name}</span>
                        )}
                      </td>
                      <td>
                        {entry.brand_id ? (
                          <span style={{ fontSize: 12, color: 'var(--crm-fg3)' }}>This brand</span>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--crm-fg4)' }}>Project-wide</span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button type="button" className="seg-btn-primary" style={{ height: 28, padding: '0 10px' }}
                              disabled={editSaving} onClick={() => saveEdit(entry)}>
                              {editSaving ? 'Saving…' : 'Save'}
                            </button>
                            <button type="button" className="seg-btn-secondary" style={{ height: 28, padding: '0 10px' }}
                              disabled={editSaving} onClick={cancelEdit}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button type="button" className="seg-btn-secondary" style={{ height: 28, padding: '0 10px' }}
                              onClick={() => startEdit(entry)}>
                              <Icon name="pencil" size={13} strokeWidth={1.75} />
                              Edit
                            </button>
                            <button type="button" className="cl-btn-delete" onClick={() => handleDelete(entry)}>
                              <Icon name="trash-2" size={13} strokeWidth={1.75} />
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateScreenModal
          projectId={projectId}
          brandId={brandId}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
