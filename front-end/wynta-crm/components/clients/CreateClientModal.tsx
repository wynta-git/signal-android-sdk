'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { CreatedClient } from '../../services/clientApi';
import { createClient } from '../../services/clientApi';

interface Props {
  siteId: number;
  onClose: () => void;
  onCreated: (client: CreatedClient) => void;
}

const CLIENT_TYPES = ['APK', 'IOS', 'WEB', 'S2S'];

export default function CreateClientModal({ siteId, onClose, onCreated }: Props) {
  const [siteIdVal, setSiteIdVal]   = useState(String(siteId));
  const [clientId, setClientId]     = useState('');
  const [name, setName]             = useState('');
  const [description, setDesc]      = useState('');
  const [clientType, setClientType] = useState('S2S');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !siteIdVal.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createClient({
        site_id: parseInt(siteIdVal, 10),
        client_id: clientId.trim() || undefined,
        name: name.trim(),
        description: description.trim() || undefined,
        client_type: clientType,
      });
      onCreated(created);
    } catch {
      setError('Failed to create client. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="asm-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cl-modal">
        <h3 className="cl-modal__title">Create Client</h3>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="cl-form-field" style={{ marginBottom: 0 }}>
              <label className="cl-form-label" htmlFor="cl-site-id">Site ID *</label>
              <input
                id="cl-site-id"
                type="number"
                className="cl-form-input"
                placeholder="e.g. 1"
                value={siteIdVal}
                onChange={e => setSiteIdVal(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="cl-form-field" style={{ marginBottom: 0 }}>
              <label className="cl-form-label" htmlFor="cl-client-id">
                Client ID <span style={{ color: 'var(--crm-fg4)', fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                id="cl-client-id"
                type="text"
                className="cl-form-input"
                placeholder="Auto-generated if empty"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
              />
            </div>
          </div>

          <div className="cl-form-field" style={{ marginTop: 12 }}>
            <label className="cl-form-label" htmlFor="cl-name">Name *</label>
            <input
              id="cl-name"
              type="text"
              className="cl-form-input"
              placeholder="e.g. My Mobile App"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>

          <div className="cl-form-field">
            <label className="cl-form-label" htmlFor="cl-desc">Description</label>
            <textarea
              id="cl-desc"
              className="cl-form-textarea"
              placeholder="Optional description"
              value={description}
              onChange={e => setDesc(e.target.value)}
            />
          </div>

          <div className="cl-form-field">
            <label className="cl-form-label" htmlFor="cl-type">Client Type *</label>
            <select
              id="cl-type"
              className="cl-form-select"
              value={clientType}
              onChange={e => setClientType(e.target.value)}
            >
              {CLIENT_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {error && <div className="cl-modal__error">{error}</div>}

          <div className="cl-modal__actions">
            <button type="button" className="asm-btn asm-btn--secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button
              type="submit"
              className="asm-btn"
              disabled={submitting || !name.trim() || !siteIdVal.trim()}
              style={{ background: 'var(--crm-blue)', color: '#fff', borderColor: 'var(--crm-blue)' }}
            >
              {submitting ? 'Creating…' : 'Create Client'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
