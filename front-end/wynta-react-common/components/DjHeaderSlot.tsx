'use client';
import { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { setBridgeData, authenticateWithBridgeToken } from '../store/slices/usersSlice';
import type { WyntaBridge } from '../types';

declare global {
  interface Window {
    __WYNTA_BRIDGE__?: WyntaBridge;
    __fireBrandChange__?: (brandId: number) => void;
    __WYNTA_HEADER_FRAGMENT_FOUND__?: boolean;
  }
}

// Cross-app-boundary signal: DjHeaderSlot may be rendered by a host layout
// (e.g. wynta-web's root layout) that doesn't know about consumer-specific
// props, so — like __fireBrandChange__/wynta:brand-changed — we report the
// header-fragment fetch outcome via a window global + CustomEvent instead of
// a prop callback, so any embedded app can pick it up regardless of who
// actually rendered this component.
function reportFragmentStatus(found: boolean) {
  window.__WYNTA_HEADER_FRAGMENT_FOUND__ = found;
  window.dispatchEvent(new CustomEvent('wynta:header-fragment-status', { detail: { found } }));
}

interface Props {
  onBrandChange?: (brandId: number) => void;
}

export default function DjHeaderSlot({ onBrandChange }: Props) {
  const dispatch = useDispatch<any>();
  const didInit  = useRef(false);
  const onBrandChangeRef = useRef(onBrandChange);
  onBrandChangeRef.current = onBrandChange;

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    function fireBrandChange(brandId: number) {
      if (onBrandChangeRef.current) onBrandChangeRef.current(brandId);
      window.dispatchEvent(new CustomEvent('wynta:brand-changed', { detail: { brandId } }));
    }
    window.__fireBrandChange__ = fireBrandChange;

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
        reportFragmentStatus(response.ok);

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
        reportFragmentStatus(false);
        promptForToken();
      });
  }, [dispatch]);

  return <div id="dj-header-placeholder" suppressHydrationWarning />;
}
