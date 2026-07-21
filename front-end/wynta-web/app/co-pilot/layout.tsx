import './copilot.css';
import CopilotBridgeAuth from './CopilotBridgeAuth';

export default function CopilotLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="copilot-embed">
      <CopilotBridgeAuth />
      {children}
    </div>
  );
}
