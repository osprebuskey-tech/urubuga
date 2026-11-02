// A small set of outline icons (24x24, drawn with the current text colour). They are decoration only: the label beside each one names it.
const PATHS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  briefcase: 'M3 8h18v12H3zM8 8V5h8v3M3 13h18',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  bell: 'M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6zM10 19a2 2 0 004 0',
  cog: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
  document: 'M7 3h7l5 5v13H7zM14 3v5h5M9 13h7M9 17h7',
  plus: 'M12 5v14M5 12h14',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6',
  userplus: 'M10 11a4 4 0 100-8 4 4 0 000 8zM2 21c0-4 4-6 8-6s8 2 8 6M19 8v6M16 11h6',
  users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20c0-3.5 3.5-5 7-5s7 1.5 7 5M17 11a3 3 0 100-6M18 15c2.5.3 4 1.7 4 4',
  pencil: 'M14 6l4 4-9 9H5v-4zM12 8l4 4',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3l-5.5 2.9 1-6.2L3 9.6l6.2-.9z',
  building: 'M4 21V5l8-2v18M12 9h8v12M7 9h2M7 13h2M7 17h2M15 13h2M15 17h2',
  shield: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6zM9 12l2 2 4-4',
  card: 'M3 6h18v12H3zM3 10h18M7 15h4',
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2',
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 8.5h.01',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5',
  logout: 'M10 4H5v16h5M15 8l4 4-4 4M19 12H9',
  chevron: 'M6 9l6 6 6-6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5 9-10',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  terminal: 'M3 5h18v14H3zM7 10l3 2-3 2M12 15h5',
  camera: 'M4 8h4l2-3h4l2 3h4v11H4zM12 11a3.5 3.5 0 100 7 3.5 3.5 0 000-7z',
  sofa: 'M5 11V8a2 2 0 012-2h10a2 2 0 012 2v3M3 13a2 2 0 014 0v2h10v-2a2 2 0 014 0v5H3zM6 18v2M18 18v2',
};

export default function Icon({ name, className = 'h-5 w-5' }) {
  return (
    <svg className={`${className} shrink-0`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name] ?? PATHS.grid} />
    </svg>
  );
}
