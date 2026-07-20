'use client';
import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import CopilotPanel from 'wynta-react-common/components/copilot/CopilotPanel';
import { openCopilot } from 'wynta-react-common/store/slices/copilotSlice';

export default function CopilotPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatch = useDispatch<any>();

  useEffect(() => {
    dispatch(openCopilot());
    window.parent.postMessage({ event: 'pam_load_completed' }, '*');
  }, [dispatch]);

  return <CopilotPanel />;
}
