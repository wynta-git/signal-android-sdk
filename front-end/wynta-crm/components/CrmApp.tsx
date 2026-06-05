'use client';
import { useState }  from 'react';
import { Provider }  from 'react-redux';
import { store }     from '../store';
import CrmSidebar    from './CrmSidebar';
import SegmentsPage  from 'wynta-react-common/components/segments/SegmentsPage';
import CampaignsPage from './campaigns/CampaignsPage';
import DashboardPage from './dashboard/DashboardPage';

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
          {activeNav === 'dashboard'  ? <DashboardPage /> :
           activeNav === 'segments'  ? <SegmentsPage  /> :
           activeNav === 'campaigns' ? <CampaignsPage /> : (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', minHeight:'60vh', color:'var(--crm-fg4)', fontSize:14 }} />
          )}
        </div>
      </main>
    </div>
  );
}
