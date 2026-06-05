'use client';
import { useSelector } from 'react-redux';
import { selectBridgeToken } from 'wynta-react-common/store/slices/usersSlice';

/**
 * Blocks page rendering until DjHeaderSlot has parsed the X-Wynta-Bridge header
 * and stored the token in Redux. This ensures no downstream API call fires
 * before the auth token is available in the registry.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const bridgeToken = useSelector(selectBridgeToken);

  if (!bridgeToken) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="auth-gate-spinner" />
      </div>
    );
  }

  return <>{children}</>;
}
