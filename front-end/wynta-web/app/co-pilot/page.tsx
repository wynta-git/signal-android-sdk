'use client';
import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import CopilotPanel from 'wynta-react-common/components/copilot/CopilotPanel';
import { openCopilot } from 'wynta-react-common/store/slices/copilotSlice';

export default function CopilotPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatch = useDispatch<any>();

  useEffect(() => {
    console.log('[co-pilot] page mounted, opening panel');
    dispatch(openCopilot());

    console.log(
      '[co-pilot] posting pam_load_completed to parent',
      window.parent === window ? '(no parent iframe detected)' : '',
    );
    window.parent.postMessage({ event: 'load_completed' }, '*');
  }, [dispatch]);

  return <CopilotPanel />;
}
