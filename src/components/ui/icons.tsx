import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 20) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true });

const paths: Record<string, React.ReactNode> = {
  wifi: <><path d="M2 8.5a15 15 0 0 1 20 0" /><path d="M5 12a10.5 10.5 0 0 1 14 0" /><path d="M8.5 15.5a5.5 5.5 0 0 1 7 0" /><circle cx="12" cy="19" r="0.8" fill="currentColor" /></>,
  restaurant: <><path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5M7 8H5M7 8h2" /><path d="M17 21V3c-2 1-3 4-3 7s1 3 3 3" /></>,
  parking: <><path d="M5 17h14v-5l-2-5H7l-2 5v5Z" /><path d="M5 12h14" /><circle cx="8" cy="15" r="1" /><circle cx="16" cy="15" r="1" /><path d="M6 17v2M18 17v2" /></>,
  support: <><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="13" width="4" height="6" rx="1.5" /><rect x="17" y="13" width="4" height="6" rx="1.5" /><path d="M19 19c0 1.5-2 2.5-5 2.5" /></>,
  bell: <><path d="M4 17h16" /><path d="M6 17a6 6 0 0 1 12 0" /><path d="M12 9V7M10 7h4" /><path d="M3 20h18" /></>,
  laundry: <><rect x="4" y="3" width="16" height="18" rx="2" /><circle cx="12" cy="13" r="4.5" /><path d="M7 6.5h.01M10 6.5h.01" /></>,
  travel: <><rect x="5" y="7" width="14" height="12" rx="2" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M9 19v2M15 19v2" /></>,
  check: <path d="m5 12 4 4 10-10" />,
  phone: <path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  pin: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  bed: <><path d="M3 18V7M21 18v-5a3 3 0 0 0-3-3h-7v8M3 14h18M3 18h18" /><circle cx="7" cy="11" r="1.5" /></>,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  expand: <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />,
  chat: <><path d="M4 5h16v11H9l-5 4V5Z" /><path d="M8 9h8M8 12h5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" /></>,
  facebook: <path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H7v4h3v7h4v-7h3l1-4h-4V8Z" />,
  linkedin: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 10v7M7 7h.01M11 17v-4a2 2 0 0 1 4 0v4M11 10v7" /></>,
  whatsapp: <><path d="M4 20l1.3-4A8 8 0 1 1 8 18.7L4 20Z" /><path d="M9 8.5c0 3 2.5 6 6 6.5l1-1.5-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2L9 8.5Z" /></>,
  leaf: <path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15Zm0 0 8-8" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  quote: <path d="M7 17c-2 0-3-1.5-3-3.5C4 10 6 7 9 6l.5 1.2C7.8 8 7 9.4 7 11h2v6H7Zm9 0c-2 0-3-1.5-3-3.5 0-3.5 2-6.5 5-7.5l.5 1.2C16.8 8 16 9.4 16 11h2v6h-2Z" fill="currentColor" stroke="none" />,
};

export type IconName = keyof typeof paths;

export function Icon({ name, size, ...rest }: P & { name: string }) {
  return <svg {...base(size)} {...rest}>{paths[name] ?? paths.check}</svg>;
}
