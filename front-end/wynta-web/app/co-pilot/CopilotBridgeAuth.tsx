'use client';
import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { setBridgeData, authenticateWithBridgeToken } from 'wynta-react-common/store/slices/usersSlice';
import { setBrandId } from 'wynta-react-common/services/tokenRegistry';

export default function CopilotBridgeAuth() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatch = useDispatch<any>();

  useEffect(() => {
    console.log('[co-pilot] CopilotBridgeAuth mounted, listening for WYNTA_BRIDGE messages');

    function handleMessage(event: MessageEvent) {
      const data = event.data;

      if (!data || typeof data !== 'object') return;
      console.log('[co-pilot] message received', { origin: event.origin, type: data.type }, event );

      if (data.type !== 'WYNTA_BRIDGE') return;
      if (!data.bridge_token) {
        console.warn('[co-pilot] WYNTA_BRIDGE message received with no bridge_token, ignoring');
        return;
      }

      const token: string = data.bridge_token;
      const brand: string | undefined = data.product;
      const page: string | undefined = data.page;
      console.log('[co-pilot] bridge token received', token, { brand, page });

      setBrandId(null);
      dispatch(setBridgeData({ token, brand, page }));

      console.log('[co-pilot] dispatching authenticateWithBridgeToken');
      dispatch(authenticateWithBridgeToken({ token }))
        .unwrap()
        .then((result: unknown) => console.log('[co-pilot] bridge auth succeeded', result))
        .catch((err: unknown) => console.error('[co-pilot] bridge auth failed', err));
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [dispatch]);

  return null;
}
