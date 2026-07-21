'use client';
import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import CopilotPanel from 'wynta-react-common/components/copilot/CopilotPanel';
import { openCopilot } from 'wynta-react-common/store/slices/copilotSlice';
import { useCommonSelector } from 'wynta-react-common/store/hooks';
import { selectIsLoggedIn } from 'wynta-react-common/store/slices/usersSlice';

export default function CopilotPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatch = useDispatch<any>();

  // Don't mount CopilotPanel (and thus allow chat messages) until the bridge
  // token exchange has actually registered a real auth token in redux —
  // otherwise a message sent before that round-trip finishes goes out with no
  // Authorization header. Reading redux directly (rather than polling the
  // tokenRegistry singleton) means this flips immediately/synchronously the
  // moment authenticateWithBridgeToken resolves, and correctly starts `true`
  // on mount if the token was already exchanged earlier in this session.
  const ready = useCommonSelector(selectIsLoggedIn);

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
