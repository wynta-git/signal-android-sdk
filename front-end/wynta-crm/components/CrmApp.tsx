'use client';
import { useState }  from 'react';
import { Provider }  from 'react-redux';
import dynamic       from 'next/dynamic';
import { store }     from '../store';
import CrmSidebar    from './CrmSidebar';

const SegmentsPage  = dynamic(() => import('wynta-react-common/components/segments/SegmentsPage'), { ssr: false });
const CampaignsPage = dynamic(() => import('./campaigns/CampaignsPage'), { ssr: false });
const EventsPage    = dynamic(() => import('./events/EventsPage'), { ssr: false });

/**
 * CrmApp wraps itself in the wynta-crm store Provider.
 * This guarantees the campaigns (and all CRM) state is available regardless
 * of whether the app is running standalone (wynta-crm) or embedded inside
 * wynta-web (which uses wynta-bonus/store that has no campaigns reducer).
 */
export default function CrmApp() {
  return (
    <Provider store={store}>
      <CrmShell />
    </Provider>
  );
}

function CrmShell() {
  const [activeNav, setActiveNav] = useState('dashboard');

  return (
    <div className="crm-shell">
      <CrmSidebar activeNav={activeNav} onNavChange={setActiveNav} />

      <main className="crm-main">
        <div className="crm-content">
          {activeNav === 'segments'  ? <SegmentsPage  /> :
           activeNav === 'campaigns' ? <CampaignsPage /> :
           activeNav === 'events'    ? <EventsPage    /> : (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', minHeight:'60vh', color:'var(--crm-fg4)', fontSize:14 }} />
          )}
        </div>
      </main>
    </div>
  );
}
