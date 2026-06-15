'use client';

interface UpgradeCTAProps {
  href?: string;
  classPrefix?: string;
}

export default function UpgradeCTA({
  href = 'https://wynta.com/pricing/',
  classPrefix = 'crm',
}: UpgradeCTAProps) {
  return (
    <div className={`${classPrefix}-nav-cta`}>
      <a href={href} target="_blank" rel="noopener noreferrer" className={`${classPrefix}-btn-upgrade`}>
        <svg width="14" height="14" viewBox="-1.229 -0.563 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path fill="#FFFFFF" stroke="#FFFFFF" strokeWidth="0.25" strokeMiterlimit="10" d="M12.097,14.759H5.446c-0.734,0-1.33,0.596-1.33,1.33v1.33c0,0.735,0.596,1.33,1.33,1.33h6.651c0.736,0,1.331-0.595,1.331-1.33v-1.33C13.428,15.354,12.833,14.759,12.097,14.759z M12.097,17.419H5.446v-1.33h6.651V17.419z"/>
          <path fill="#FFFFFF" stroke="#FFFFFF" strokeWidth="0.25" strokeMiterlimit="10" d="M17.224,8.302L9.243,0.32c-0.26-0.26-0.681-0.26-0.941,0L0.319,8.302c-0.259,0.26-0.259,0.681,0,0.941c0.125,0.125,0.294,0.195,0.47,0.195h3.326v2.66c0.001,0.734,0.596,1.33,1.33,1.33h6.651c0.736,0,1.331-0.596,1.331-1.33v-2.66h3.326c0.367-0.001,0.664-0.298,0.664-0.666C17.418,8.596,17.349,8.427,17.224,8.302z M12.097,8.107v3.99H5.446v-3.99h-3.05l6.376-6.376l6.375,6.376H12.097z"/>
        </svg>
        Upgrade
      </a>
    </div>
  );
}
