'use client';
import { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { setBridgeData, authenticateWithBridgeToken } from '../store/slices/usersSlice';
import type { WyntaBridge } from '../types';

declare global {
  interface Window {
    __WYNTA_BRIDGE__?: WyntaBridge;
  }
}

export default function DjHeaderSlot() {
  const dispatch = useDispatch<any>();
  const didInit  = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    function dispatchToken(token: string) {
      const bridge: WyntaBridge = { token };
      window.__WYNTA_BRIDGE__ = bridge;
      dispatch(setBridgeData(bridge));
      dispatch(authenticateWithBridgeToken({ token }));
    }

    function promptForToken() {
      const input = prompt('No auth token found. Please enter your bridge token:');
      if (input) dispatchToken(input);
    }

    fetch('/admin/header-fragment/', { credentials: 'include' })
      .then(response => {
        const bridge: WyntaBridge = JSON.parse(response.headers.get('X-Wynta-Bridge') || '{}');
        window.__WYNTA_BRIDGE__ = bridge;
        dispatch(setBridgeData(bridge));
        if (bridge.token) {
          dispatch(authenticateWithBridgeToken({ token: bridge.token }));
          return response.text();
        } else {
          promptForToken();
        }
        return "";
        
      })
      .then(html => {
        // html = "<h2>Testing header</h2>"
        const frag = document.createRange().createContextualFragment(html);
        document.getElementById('dj-header-placeholder')?.appendChild(frag);
      })
      .catch(err => {
        console.error('[DjHeaderSlot] Failed to load header fragment:', err);
        promptForToken();
      });
  }, [dispatch]);

  return <div id="dj-header-placeholder" suppressHydrationWarning />;
}
