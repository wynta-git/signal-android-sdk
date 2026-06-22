'use client';

interface MobileAppCTAProps {
  classPrefix?: string;
}

export default function MobileAppCTA({ classPrefix = 'crm' }: MobileAppCTAProps) {
  return (
    <div className={`${classPrefix}-mobile-cta`}>
      <p className={`${classPrefix}-mobile-cta__caption`}>Get the Wynta app on your phone</p>
      <div className={`${classPrefix}-mobile-cta__badges`}>
        <a
          className={`${classPrefix}-app-badge`}
          href="https://apps.apple.com/us/app/wynta-ai/id6758648683"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Download on the App Store"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
          </svg>
          <span className={`${classPrefix}-app-badge__text`}>
            <small>Download on the</small>
            <b>App Store</b>
          </span>
        </a>
        <a
          className={`${classPrefix}-app-badge`}
          href="https://play.google.com/store/apps/details?id=com.wynta&hl=en_IN&pli=1"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Get it on Google Play"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3.6 1.9c-.4.2-.6.6-.6 1.2v18c0 .5.2.9.6 1.1l10.6-10.2L3.6 1.9z" fill="#00CCBC" />
            <path d="M14.2 12L3.6 22.2c.2.1.4.1.6.1.3 0 .6-.1.9-.3l12.4-7.1L14.2 12z" fill="#FF3C2D" />
            <path d="M17.5 14.9l3.6-2c.6-.3.9-.8.9-1.3 0-.5-.3-1-.9-1.3l-3.6-2.1L14.2 12l3.3 2.9z" fill="#FFC107" />
            <path d="M3.6 1.9L14.2 12 17.5 8.2 5.1 1.1c-.3-.2-.6-.3-.9-.3-.2 0-.4.1-.6.1z" fill="#00E676" />
          </svg>
          <span className={`${classPrefix}-app-badge__text`}>
            <small>GET IT ON</small>
            <b>Google Play</b>
          </span>
        </a>
      </div>
    </div>
  );
}
