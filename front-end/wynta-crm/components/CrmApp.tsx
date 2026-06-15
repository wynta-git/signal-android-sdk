'use client';
import { useState, useEffect, useRef } from 'react';
import { Provider }  from 'react-redux';
import dynamic       from 'next/dynamic';
import { store }     from '../store';
import { getToken }  from 'wynta-react-common/services/tokenRegistry';
import CrmSidebar    from './CrmSidebar';

const SegmentsPage            = dynamic(() => import('wynta-react-common/components/segments/SegmentsPage'), { ssr: false });
const CampaignsPage           = dynamic(() => import('./campaigns/CampaignsPage'), { ssr: false });
const EventsPage              = dynamic(() => import('./events/EventsPage'), { ssr: false });
const DashboardPage           = dynamic(() => import('./dashboard/DashboardPage'), { ssr: false });
const IntegrationsPage        = dynamic(() => import('./integrations/IntegrationsPage'), { ssr: false });
const WorkspaceSettingsPage   = dynamic(() => import('wynta-react-common/workspace-settings/WorkspaceSettingsPage'), { ssr: false });
const BillingPricingPage      = dynamic(() => import('wynta-react-common/billing-pricing/BillingPricingPage'),       { ssr: false });

/**
 * CrmApp wraps itself in the wynta-crm store Provider.
 * This guarantees the campaigns (and all CRM) state is available regardless
 * of whether the app is running standalone (wynta-crm) or embedded inside
 * wynta-web (which uses wynta-bonus/store that has no campaigns reducer).
 */
export default function CrmApp() {
  // Check synchronously first — token may already be set if DjHeaderSlot ran earlier
  const [ready, setReady] = useState(() => !!getToken());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (ready) return;
    // Poll tokenRegistry until DjHeaderSlot registers a token (bridge or portal)
    intervalRef.current = setInterval(() => {
      if (getToken()) {
        setReady(true);
        clearInterval(intervalRef.current!);
      }
    }, 200);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [ready]);

  if (!ready) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100vh', gap: 16,
        background: 'var(--crm-bg, #f7f8fa)',
      }}>
        <span style={{
          width: 34, height: 34, borderRadius: '50%',
          border: '3px solid var(--crm-border-md, #e5e7eb)',
          borderTopColor: 'var(--crm-blue, #3b82f6)',
          animation: 'crm-spin 0.75s linear infinite',
          display: 'inline-block',
        }} />
        <span style={{ color: 'var(--crm-fg4, #9ca3af)', fontSize: 13 }}>Connecting…</span>
      </div>
    );
  }

  return (
    <Provider store={store}>
      <CrmShell />
    </Provider>
  );
}

function CrmShell() {
  const [activeNav, setActiveNav]           = useState('dashboard');
  const [campaignAutoAdd, setCampaignAutoAdd] = useState(false);

  function handleNavChange(nav: string) {
    if (nav === 'campaigns:add') {
      setCampaignAutoAdd(true);
      setActiveNav('campaigns');
    } else {
      setCampaignAutoAdd(false);
      setActiveNav(nav);
    }
  }

  return (
    <div className="crm-shell">
      <CrmSidebar activeNav={activeNav} onNavChange={handleNavChange} />

      <main className="crm-main">
        <div className="crm-content">
          {activeNav === 'dashboard'  ? <DashboardPage onNavChange={handleNavChange} /> :
           activeNav === 'segments'     ? <SegmentsPage     /> :
           activeNav === 'campaigns'    ? <CampaignsPage autoOpenAdd={campaignAutoAdd} /> :
           activeNav === 'events'       ? <EventsPage       /> :
           activeNav === 'integrations'       ? <IntegrationsPage /> :
           activeNav === 'workspace-settings' ? <WorkspaceSettingsPage /> :
           activeNav === 'billing'            ? <BillingPricingPage />      : (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', minHeight:'60vh', color:'var(--crm-fg4)', fontSize:14 }} />
          )}
        </div>
      </main>
    </div>
  );
}
