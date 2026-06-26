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

interface Props {
  onBrandChange?: (brandId: number) => void;
}

export default function DjHeaderSlot({ onBrandChange }: Props) {
  const dispatch = useDispatch<any>();
  const didInit  = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    function fireBrandChange(brandId: number) {
      console.log('[DjHeaderSlot] brand changed:', brandId);
      if (onBrandChange) onBrandChange(brandId);
      window.dispatchEvent(new CustomEvent('wynta:brand-changed', { detail: { brandId } }));
    }

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
        const frag = document.createRange().createContextualFragment(html);
        const placeholder = document.getElementById('dj-header-placeholder');
        placeholder?.appendChild(frag);

        // fire for the default active brand on load
        const active = document.querySelector<HTMLElement>('.brand-switch-item.active');
        if (active?.dataset.siteId) fireBrandChange(Number(active.dataset.siteId));

        // watch for class changes — when Django adds 'active' to a brand item, fire
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.attributeName === 'class') {
              const el = mutation.target as HTMLElement;
              if (el.classList.contains('brand-switch-item') && el.classList.contains('active')) {
                if (el.dataset.siteId) fireBrandChange(Number(el.dataset.siteId));
              }
            }
          }
        });
        observer.observe(document.body, {
          attributes: true,
          attributeFilter: ['class'],
          subtree: true,
        });
      })
      .catch(err => {
        console.error('[DjHeaderSlot] Failed to load header fragment:', err);
        promptForToken();
      });
  }, [dispatch, onBrandChange]);

  return <div id="dj-header-placeholder" suppressHydrationWarning />;
}
