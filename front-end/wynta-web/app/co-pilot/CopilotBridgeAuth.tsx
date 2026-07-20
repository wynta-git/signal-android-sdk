'use client';
import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { setBridgeData, authenticateWithBridgeToken } from 'wynta-react-common/store/slices/usersSlice';
import { setBrandId } from 'wynta-react-common/services/tokenRegistry';

export default function CopilotBridgeAuth() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatch = useDispatch<any>();

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || data.type !== 'WYNTA_BRIDGE' || !data.bridge_token) return;

      const token: string = data.bridge_token;
      setBrandId(null);
      dispatch(setBridgeData({ token }));
      dispatch(authenticateWithBridgeToken({ token }));
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [dispatch]);

  return null;
}
