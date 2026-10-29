import type { ReactNode, SVGProps } from 'react';

function Icon({ children, ...rest }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const IconSelect = () => (
  <Icon>
    <path d="M6 3l12 9-5.5 1.2L15 20l-2.4 1-2.6-6.6L6 18z" />
  </Icon>
);
export const IconGlyph = () => (
  <Icon>
    <path d="M17 6c-1 6-5 9-10 9" />
    <path d="M12 3.5l1.6 1.6L12 6.7l-1.6-1.6z" fill="currentColor" />
    <rect x="3" y="12" width="5" height="5" rx="0.5" strokeDasharray="2 1.5" />
  </Icon>
);
export const IconHand = () => (
  <Icon>
    <path d="M8 13V5.5a1.5 1.5 0 013 0V12M11 11V4a1.5 1.5 0 013 0v7M14 11V5.5a1.5 1.5 0 013 0V14c0 4-2.5 7-6 7-2.5 0-4-1.3-5.3-3.4L4 14.6a1.4 1.4 0 012.3-1.5L8 15" />
  </Icon>
);
export const IconText = () => (
  <Icon>
    <path d="M19 7c-.5 5-3.5 8-9 8H5" />
    <path d="M14 4l1.5 1.5L14 7l-1.5-1.5z" fill="currentColor" />
    <path d="M5 19h14" opacity=".5" />
  </Icon>
);
export const IconMarks = () => (
  <Icon>
    <path d="M5 8.5l9-3" />
    <path d="M7.5 13.5c1.5-1 3-.5 2.6 1.1-.4 1.6-2.4 2.5-3.6 4.9" />
    <path d="M15.5 15l2.2-2.2 2.2 2.2-2.2 2.2z" fill="currentColor" />
  </Icon>
);
export const IconStretch = () => (
  <Icon>
    <path d="M20 9v4.5c0 1-.8 1.5-1.6 1.5H4" />
    <path d="M7 12l-3 3 3 3" />
    <path d="M20 5.5l1.2 1.2L20 7.9l-1.2-1.2z" fill="currentColor" />
  </Icon>
);
export const IconUndo = () => (
  <Icon>
    <path d="M15 7H9.5a5.5 5.5 0 000 11H17" transform="matrix(-1 0 0 1 24 0)" />
    <path d="M18 4l3 3-3 3" transform="matrix(-1 0 0 1 24 0)" />
  </Icon>
);
export const IconRedo = () => (
  <Icon>
    <path d="M15 7H9.5a5.5 5.5 0 000 11H17" />
    <path d="M18 4l3 3-3 3" />
  </Icon>
);
export const IconPlus = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const IconMinus = () => (
  <Icon>
    <path d="M5 12h14" />
  </Icon>
);
export const IconEye = ({ off }: { off?: boolean }) => (
  <Icon>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
    {off && <path d="M4 20L20 4" />}
  </Icon>
);
export const IconLock = ({ open }: { open?: boolean }) => (
  <Icon>
    <rect x="5" y="11" width="14" height="9" rx="1.5" />
    <path d={open ? 'M8 11V7.5a4 4 0 017.6-1.8' : 'M8 11V7.5a4 4 0 018 0V11'} />
  </Icon>
);
export const IconTrash = () => (
  <Icon>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Icon>
);
export const IconCopy = () => (
  <Icon>
    <rect x="8" y="8" width="12" height="12" rx="1.5" />
    <path d="M16 8V5.5A1.5 1.5 0 0014.5 4h-9A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16H8" />
  </Icon>
);
export const IconUp = () => (
  <Icon>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Icon>
);
export const IconDown = () => (
  <Icon>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Icon>
);
export const IconKeyboard = () => (
  <Icon>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
  </Icon>
);
export const IconFit = () => (
  <Icon>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Icon>
);
export const IconClose = () => (
  <Icon>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);
export const IconDownload = () => (
  <Icon>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </Icon>
);
