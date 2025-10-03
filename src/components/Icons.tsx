import React from 'react';

type IconProps = {
  size?: number;
  className?: string;
  strokeWidth?: number;
};

const createIcon = (paths: React.ReactNode) => {
  const Icon: React.FC<IconProps> = ({ size = 18, className, strokeWidth = 1.8 }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {paths}
    </svg>
  );
  return Icon;
};

export const IconBox = createIcon(
  <>
    <path d="M21 8.5l-9 4-9-4 9-4 9 4z" />
    <path d="M3 8.5V16l9 4 9-4V8.5" />
  </>
);

export const IconClipboard = createIcon(
  <>
    <rect x="8" y="4" width="8" height="4" rx="1" />
    <rect x="6" y="8" width="12" height="12" rx="2" />
  </>
);

export const IconUsers = createIcon(
  <>
    <path d="M7 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
    <path d="M17 13a3 3 0 1 0-2.999-3A3 3 0 0 0 17 13z" />
    <path d="M3 20a6 6 0 0 1 8-5.5" />
    <path d="M21 20a6 6 0 0 0-7-5.5" />
  </>
);

export const IconCart = createIcon(
  <>
    <circle cx="9" cy="20" r="1" />
    <circle cx="17" cy="20" r="1" />
    <path d="M3 4h2l2.4 10.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 8H7" />
  </>
);

export const IconUser = createIcon(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M20 20a8 8 0 1 0-16 0" />
  </>
);

export const IconChart = createIcon(
  <>
    <path d="M3 3v18h18" />
    <rect x="7" y="10" width="3" height="6" rx="1" />
    <rect x="12" y="6" width="3" height="10" rx="1" />
    <rect x="17" y="13" width="3" height="3" rx="1" />
  </>
);

export const IconSun = createIcon(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </>
);

export const IconMoon = createIcon(
  <>
    <path d="M21 12.5A8.5 8.5 0 1 1 11.5 3 6.5 6.5 0 0 0 21 12.5z" />
  </>
);

export const IconEdit = createIcon(
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5z" />
  </>
);

export const IconTrash = createIcon(
  <>
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
  </>
);

export const IconLogout = createIcon(
  <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </>
);

export const IconTrendingUp = createIcon(
  <>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </>
);

export const IconTrendingDown = createIcon(
  <>
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
    <polyline points="17 18 23 18 23 12" />
  </>
);

export const IconDollarSign = createIcon(
  <>
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </>
);

export const IconProfit = createIcon(
  <>
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
    <path d="M16 8l4 2-4 2" />
  </>
);

export const IconBell = createIcon(
  <>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </>
);

export const IconAlertTriangle = createIcon(
  <>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </>
);

export const IconClock = createIcon(
  <>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12,6 12,12 16,14" />
  </>
);

export const IconPackage = createIcon(
  <>
    <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27,6.96 12,12.01 20.73,6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </>
);

export const IconShield = createIcon(
  <>
    <path d="M12 2l7 3v6c0 5-3.5 9-7 11-3.5-2-7-6-7-11V5l7-3z" />
    <path d="M9 12l2 2 4-4" />
  </>
);

export const IconCreditCard = createIcon(
  <>
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
    <line x1="1" y1="10" x2="23" y2="10" />
  </>
);

export const IconX = createIcon(
  <>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </>
);

export const IconCheck = createIcon(
  <>
    <polyline points="20,6 9,17 4,12" />
  </>
);

export const IconReceipt = createIcon(
  <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14,2 14,8 20,8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10,9 9,9 8,9" />
  </>
);

export const IconPlus = createIcon(
  <>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </>
);

export default {};


