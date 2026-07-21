'use client';
import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import CopilotPanel from 'wynta-react-common/components/copilot/CopilotPanel';
import { openCopilot } from 'wynta-react-common/store/slices/copilotSlice';
import { getToken } from 'wynta-react-common/services/tokenRegistry';

export default function CopilotPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatch = useDispatch<any>();

  // Don't mount CopilotPanel (and thus allow chat messages) until the bridge
  // token exchange has actually registered a real token — otherwise a message
  // sent before that round-trip finishes goes out with an empty Authorization
  // header. Mirrors BonusAdminApp.tsx / CrmApp.tsx's ready-gate pattern.
  const [ready, setReady] = useState(() => !!getToken());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (ready) return;
    intervalRef.current = setInterval(() => {
      if (getToken()) {
        console.log('[co-pilot] auth token ready, mounting panel');
        setReady(true);
        clearInterval(intervalRef.current!);
      }
    }, 200);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [ready]);

  useEffect(() => {
    console.log('[co-pilot] page mounted, opening panel');
    dispatch(openCopilot());

    console.log(
      '[co-pilot] posting copilot_load_completed to parent',
      window.parent === window ? '(no parent iframe detected)' : '',
    );
    window.parent.postMessage({ event: 'copilot_load_completed'  }, '*');
  }, [dispatch]);

  if (!ready) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          width: '100vw',
          color: 'var(--g600)',
          fontSize: 13.5,
        }}
      >
        Connecting…
      </div>
    );
  }

  return <CopilotPanel />;
}
