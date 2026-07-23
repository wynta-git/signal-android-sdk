'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch } from 'react-redux';
import { setBridgeData, authenticateWithBridgeToken } from 'wynta-react-common/store/slices/usersSlice';
import { setBrandId, setCopilotModule } from 'wynta-react-common/store/slices/copilotSlice';

interface BridgeFields {
  token: string;
  site_id: number;
  module?: string;
  page?: string;
}

export default function CopilotBridgeAuth() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatch = useDispatch<any>();

  // Bridge tokens are single-use server-side (see setBridgeData's comment in
  // usersSlice.ts). If the parent re-posts WYNTA_BRIDGE with the SAME token
  // (retry, refocus, etc.), re-exchanging it gets rejected server-side and
  // authenticateWithBridgeToken.rejected nulls out the perfectly good
  // authToken from the first exchange. Dedupe by token VALUE rather than a
  // DjHeaderSlot-style one-time didInit boolean, since a genuinely new token
  // later (refresh, brand/page change) must still be honored.
  const exchangedTokensRef = useRef<Set<string>>(new Set());

  // /co-pilot only ever receives its auth/context data via a WYNTA_BRIDGE
  // postMessage from a parent frame — there is no other source. When the
  // page is opened outside an iframe (dev testing, QA, a broken embed) no
  // parent will ever send that message, so the popup below collects the same
  // fields manually.
  const [needsManualAuth, setNeedsManualAuth] = useState(false);

  // The manual-entry form's submit handler (in the component body below) is
  // defined outside the effect, so it reaches the effect's applyBridgeData
  // closure (and the dispatch/exchangedTokensRef it captures) through this
  // ref rather than re-creating the message listener on every render.
  const applyBridgeDataRef = useRef<(fields: BridgeFields) => void>(() => {});

  useEffect(() => {
    console.log('[co-pilot] CopilotBridgeAuth mounted, listening for WYNTA_BRIDGE messages');

    function applyBridgeData({ token, site_id, module, page }: BridgeFields) {
      console.log('[co-pilot] applying bridge data', token, { site_id, module, page });

      setBrandId(site_id);
      dispatch(setBridgeData({ token, site_id, page }));
      // `module` drives the /ask context ({ module, site_id }) built in
      // copilotSlice's sendMessage thunk. Real parents don't always send
      // `product` (seen in staging: only `page` came through) — fall back
      // to `page` so context isn't null either way.
      setCopilotModule(module ?? page ?? null);

      setNeedsManualAuth(false);

      if (exchangedTokensRef.current.has(token)) {
        console.log('[co-pilot] bridge token already exchanged this session, skipping duplicate authenticateWithBridgeToken dispatch', token);
        return;
      }
      exchangedTokensRef.current.add(token);

      console.log('[co-pilot] dispatching authenticateWithBridgeToken');
      dispatch(authenticateWithBridgeToken({ token }))
        .unwrap()
        .then((result: unknown) => console.log('[co-pilot] bridge auth succeeded', result))
        .catch((err: unknown) => {
          console.error('[co-pilot] bridge auth failed', err);
          exchangedTokensRef.current.delete(token);
          console.log('[co-pilot] removed failed token from exchanged set, retry allowed if re-posted', token);
        });
    }

    function handleMessage(event: MessageEvent) {
      const data = event.data;

      if (!data || typeof data !== 'object') return;
      console.log('[co-pilot] message received', { origin: event.origin, type: data.type }, event );

      if (data.type !== 'WYNTA_BRIDGE') return;
      if (!data.bridge_token) {
        console.warn('[co-pilot] WYNTA_BRIDGE message received with no bridge_token, ignoring');
        return;
      }

      console.log('[co-pilot] bridge token received', data.bridge_token, { module: data.module, page: data.page });

      applyBridgeData({
        token: data.bridge_token,
        site_id: data.site_id,
        module: data.module,
        page: data.page,
      });
    }

    window.addEventListener('message', handleMessage);

    const standalone = window.parent === window;
    if (standalone) {
      console.log('[co-pilot] no parent iframe detected, prompting for bridge data manually');
      setNeedsManualAuth(true);
    }

    // expose for the manual-entry form below (same effect scope, so it
    // closes over the same dispatch/exchangedTokensRef as the listener)
    applyBridgeDataRef.current = applyBridgeData;

    return () => window.removeEventListener('message', handleMessage);
  }, [dispatch]);

  return (
    <>
      {needsManualAuth && <ManualBridgePrompt onSubmit={fields => applyBridgeDataRef.current(fields)} />}
    </>
  );
}

function ManualBridgePrompt({ onSubmit }: { onSubmit: (fields: BridgeFields) => void }) {
  const [token, setToken] = useState('');
  const [siteId, setSiteId] = useState('');
  const [module, setModule] = useState('');
  const [page, setPage] = useState('');

  const valid = token.trim() !== '' && siteId.trim() !== '' && !Number.isNaN(Number(siteId));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    onSubmit({
      token: token.trim(),
      site_id: Number(siteId),
      module: module.trim() || undefined,
      page: page.trim() || undefined,
    });
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="cba-overlay">
      <div className="cba-modal">
        <h3 className="cba-modal__title">Co-pilot needs auth &amp; context</h3>
        <p className="cba-modal__subtitle">
          This page wasn&apos;t opened inside its usual embed, so it has no bridge token to authenticate with.
          Enter the values it would normally receive from the parent frame.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="cba-form-field">
            <label className="cba-form-label" htmlFor="cba-token">Bridge Token *</label>
            <input
              id="cba-token"
              type="text"
              className="cba-form-input"
              value={token}
              onChange={e => setToken(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="cba-form-field">
            <label className="cba-form-label" htmlFor="cba-site-id">Site ID *</label>
            <input
              id="cba-site-id"
              type="number"
              className="cba-form-input"
              value={siteId}
              onChange={e => setSiteId(e.target.value)}
              required
            />
          </div>

          <div className="cba-form-field">
            <label className="cba-form-label" htmlFor="cba-module">Module</label>
            <input
              id="cba-module"
              type="text"
              className="cba-form-input"
              placeholder="e.g. segments, campaigns"
              value={module}
              onChange={e => setModule(e.target.value)}
            />
            <span className="cba-form-hint">Drives the /ask context. Falls back to Page if left blank.</span>
          </div>

          <div className="cba-form-field">
            <label className="cba-form-label" htmlFor="cba-page">Page</label>
            <input
              id="cba-page"
              type="text"
              className="cba-form-input"
              value={page}
              onChange={e => setPage(e.target.value)}
            />
          </div>

          <div className="cba-modal__actions">
            <button type="submit" className="cba-btn" disabled={!valid}>
              Connect
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
