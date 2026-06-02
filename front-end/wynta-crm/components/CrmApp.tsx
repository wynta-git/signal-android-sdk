'use client';
import { useState } from 'react';
import CrmSidebar from './CrmSidebar';
import SegmentsPage from 'wynta-react-common/components/segments/SegmentsPage';

export default function CrmApp() {
  const [activeNav, setActiveNav] = useState('segments');

  return (
    <div className="crm-shell">
      <CrmSidebar activeNav={activeNav} onNavChange={setActiveNav} />

      <main className="crm-main">
        <div className="crm-content">
          {activeNav === 'segments' ? (
            <SegmentsPage />
          ) : (
            /* Dashboard and all other pages are empty shells for now */
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              minHeight: '60vh',
              color: 'var(--crm-fg4)',
              fontSize: 14,
            }} />
          )}
        </div>
      </main>
    </div>
  );
}
