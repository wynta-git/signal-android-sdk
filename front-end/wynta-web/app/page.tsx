export default function Home() {
  return (
    <div style={{ padding: 40, fontFamily: 'var(--font)' }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--g900)', marginBottom: 24 }}>Wynta Platform</h1>
      <div className="app-nav">
        <a className="app-card" href="/bonus">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
          </svg>
          Bonus Admin
        </a>
        <a className="app-card" href="/crm">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          CRM
        </a>
      </div>
    </div>
  );
}
