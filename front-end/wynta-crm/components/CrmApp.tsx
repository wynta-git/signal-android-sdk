'use client';
import { useState, useEffect, useRef } from 'react';
import { Provider, useSelector, useDispatch } from 'react-redux';
import dynamic       from 'next/dynamic';
import { store }     from '../store';
import { getToken }  from 'wynta-react-common/services/tokenRegistry';
import { selectProjectId } from 'wynta-react-common/store/slices/usersSlice';
import { fetchBrands } from 'wynta-react-common/store/slices/brandsSlice';
import { fetchUserSettings } from 'wynta-react-common/store/slices/settingsSlice';
import { setSelectedBrand, setHeaderFragmentFound } from '../store/slices/uiSlice';

declare global {
  interface Window {
    __WYNTA_HEADER_FRAGMENT_FOUND__?: boolean;
  }
}
import { setCopilotModule } from 'wynta-react-common/store/slices/copilotSlice';
import BrandSwitcher from 'wynta-react-common/components/BrandSwitcher';
import CopilotPanel  from 'wynta-react-common/components/copilot/CopilotPanel';
import CrmSidebar    from './CrmSidebar';
import { listReports, createReport as createReportApi } from '../services/reportsApi';
import type { ReportFilters, CustomReport } from '../services/reportsApi';

const SegmentsPage       = dynamic(() => import('wynta-react-common/components/segments/SegmentsPage'), { ssr: false });
const CampaignsPage      = dynamic(() => import('./campaigns/CampaignsPage'), { ssr: false });
const EventsPage         = dynamic(() => import('wynta-react-common/components/events/EventsPage'), { ssr: false });
const DashboardPage      = dynamic(() => import('./dashboard/DashboardPage'), { ssr: false });
const IntegrationsPage   = dynamic(() => import('./integrations/IntegrationsPage'), { ssr: false });
const WorkspaceSettingsPage   = dynamic(() => import('wynta-react-common/workspace-settings/WorkspaceSettingsPage'), { ssr: false });
const BillingPricingPage      = dynamic(() => import('wynta-react-common/billing-pricing/BillingPricingPage'),       { ssr: false });
const ReportsPage           = dynamic(() => import('./reports/ReportsPage'), { ssr: false });
const CampaignStatsReport     = dynamic(() => import('./reports/CampaignStatsReport'), { ssr: false });
const SegmentAnalysisReport   = dynamic(() => import('./reports/SegmentAnalysisReport'), { ssr: false });
const ChannelDeliveryReport   = dynamic(() => import('./reports/ChannelDeliveryReport'), { ssr: false });
const PlayerLifecycleReport   = dynamic(() => import('./reports/PlayerLifecycleReport'), { ssr: false });
const ChurnRetentionReport    = dynamic(() => import('./reports/ChurnRetentionReport'), { ssr: false });
const CustomReportBuilder     = dynamic(() => import('./reports/CustomReportBuilder'), { ssr: false });
const CustomReportView        = dynamic(() => import('./reports/CustomReportView'), { ssr: false });
const ClientsPage             = dynamic(() => import('./clients/ClientsPage'),      { ssr: false });
const ChatPage                = dynamic(() => import('wynta-react-common/components/chat/ChatPage'), { ssr: false });

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
  const dispatch = useDispatch<any>();
  const projectId    = useSelector(selectProjectId) ?? process.env.NEXT_PUBLIC_PROJECT_ID ?? 'proj_demo';
  const selectedBrand = useSelector((s: any) => s.ui?.selectedBrand as number | null);
  const headerFragmentFound = useSelector((s: any) => s.ui?.headerFragmentFound as boolean | null);
  const [activeNav,       setActiveNav]       = useState('dashboard');
  const [campaignAutoAdd, setCampaignAutoAdd] = useState(false);
  const [customReports,   setCustomReports]   = useState<CustomReport[]>([]);
  const [creating,        setCreating]        = useState(false);
  const [createError,     setCreateError]     = useState<string | null>(null);

  useEffect(() => { dispatch(fetchBrands()); }, [dispatch]);
  useEffect(() => { dispatch(fetchUserSettings()); }, [dispatch]);

  useEffect(() => {
    dispatch(setCopilotModule('crm'));
  }, [dispatch]);

  useEffect(() => {
    // DjHeaderSlot may be rendered by a host layout (e.g. wynta-web's root
    // layout) that has no knowledge of this app's Redux store, so it reports
    // the header-fragment fetch outcome via a window global + CustomEvent
    // rather than a prop/dispatch — pick that signal up here instead.
    if (typeof window.__WYNTA_HEADER_FRAGMENT_FOUND__ === 'boolean') {
      dispatch(setHeaderFragmentFound(window.__WYNTA_HEADER_FRAGMENT_FOUND__));
    }
    function onStatus(e: Event) {
      const found = (e as CustomEvent<{ found: boolean }>).detail?.found;
      if (typeof found === 'boolean') dispatch(setHeaderFragmentFound(found));
    }
    window.addEventListener('wynta:header-fragment-status', onStatus);
    return () => window.removeEventListener('wynta:header-fragment-status', onStatus);
  }, [dispatch]);

  useEffect(() => { refreshCustomReports(); }, [selectedBrand]); // eslint-disable-line react-hooks/exhaustive-deps

  async function refreshCustomReports() {
    try {
      const list = await listReports(projectId);
      setCustomReports(list);
    } catch {}
  }

  function handleNavChange(nav: string) {
    setCreateError(null);
    if (nav === 'campaigns:add') {
      setCampaignAutoAdd(true);
      setActiveNav('campaigns');
    } else {
      setCampaignAutoAdd(false);
      setActiveNav(nav);
    }
  }

  async function handleCreate(name: string, metrics: string[], filters: ReportFilters) {
    setCreating(true);
    setCreateError(null);
    try {
      const { report_id } = await createReportApi(projectId, { name, metrics, filters });
      await refreshCustomReports();
      setActiveNav(`reports:cr:${report_id}`);
    } catch {
      setCreateError('Failed to create report. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  const reportId = activeNav.startsWith('reports:cr:') ? activeNav.slice('reports:cr:'.length) : null;

  const brandId = selectedBrand ?? undefined;

  return (
    <div className="crm-shell">
      <CrmSidebar
        activeNav={activeNav}
        onNavChange={handleNavChange}
        customReportItems={customReports}
      />

      <main className="crm-main">
        {headerFragmentFound === false && (
          <div className="crm-topbar">
          <BrandSwitcher
            value={selectedBrand}
            onChange={(id) => {
              dispatch(setSelectedBrand(id));
              window.__fireBrandChange__?.(id);
            }}
            compact
          />
          <div style={{ flex: 1 }} />
        </div>
        )}
        <div className="crm-content">
          {activeNav === 'dashboard'        ? <DashboardPage onNavChange={handleNavChange} brandId={brandId} /> :
           activeNav === 'segments'         ? <SegmentsPage brandId={brandId} /> :
           activeNav === 'campaigns'        ? <CampaignsPage autoOpenAdd={campaignAutoAdd} brandId={brandId} /> :
           activeNav === 'events'           ? <EventsPage brandId={brandId} /> :
           activeNav === 'integrations'     ? <IntegrationsPage /> :
           activeNav === 'clients'          ? <ClientsPage brandId={brandId} /> :
           activeNav === 'chat'             ? <ChatPage /> :
           activeNav === 'workspace-settings' ? <WorkspaceSettingsPage /> :
           activeNav === 'billing'            ? <BillingPricingPage />      :
           activeNav === 'reports:campaign' ? <CampaignStatsReport   onOpenBuilder={() => handleNavChange('reports:create')} brandId={brandId} /> :
           activeNav === 'reports:segment'  ? <SegmentAnalysisReport onOpenBuilder={() => handleNavChange('reports:create')} brandId={brandId} /> :
           activeNav === 'reports:channel'  ? <ChannelDeliveryReport   onOpenBuilder={() => handleNavChange('reports:create')} brandId={brandId} /> :
           activeNav === 'reports:lifecycle'? <PlayerLifecycleReport  onOpenBuilder={() => handleNavChange('reports:create')} brandId={brandId} /> :
           activeNav === 'reports:churn'    ? <ChurnRetentionReport  onOpenBuilder={() => handleNavChange('reports:create')} brandId={brandId} /> :
           activeNav === 'reports:create'   ? (
             <CustomReportBuilder
               onSave={handleCreate}
               onCancel={() => handleNavChange('reports:churn')}
               saving={creating}
               error={createError}
               brandId={brandId}
             />
           ) :
           reportId ? (
             <CustomReportView
               reportId={reportId}
               onBack={() => handleNavChange('reports:churn')}
               onCreateNew={() => handleNavChange('reports:create')}
               onDeleted={refreshCustomReports}
             />
           ) : (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', minHeight:'60vh', color:'var(--crm-fg4)', fontSize:14 }} />
          )}
        </div>
      </main>
      <CopilotPanel />
    </div>
  );
}
