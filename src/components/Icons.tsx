/** Line icons from the mockups. Decorative: each sits next to text that says the same thing. */

type IconProps = { size?: number; className?: string; strokeWidth?: number };

function Svg({ size = 18, className, strokeWidth = 1.8, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export const BoxIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" />
    <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
  </Svg>
);

export const ClipboardIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="4.5" width="14" height="17" rx="2" />
    <path d="M9 3h6v3H9zM8.5 11h7M8.5 15h5" />
  </Svg>
);

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.4-4.4" />
  </Svg>
);

export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
);

export const PinIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg strokeWidth={2.6} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);

export const XIcon = (p: IconProps) => (
  <Svg strokeWidth={2.4} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const AlertIcon = (p: IconProps) => (
  <Svg strokeWidth={2.2} {...p}>
    <path d="M12 4 2.8 19.5h18.4z" />
    <path d="M12 10v4M12 17h.01" />
  </Svg>
);

export const InfoIcon = (p: IconProps) => (
  <Svg strokeWidth={2} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 8h.01" />
  </Svg>
);

export const BackIcon = (p: IconProps) => (
  <Svg strokeWidth={2} {...p}>
    <path d="m15 5-7 7 7 7" />
  </Svg>
);

export const NextIcon = (p: IconProps) => (
  <Svg strokeWidth={2} {...p}>
    <path d="m9 5 7 7-7 7" />
  </Svg>
);

export const CameraIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z" />
    <circle cx="12" cy="13.2" r="3.4" />
  </Svg>
);

export const PhotoIcon = (p: IconProps) => (
  <Svg strokeWidth={1.6} {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="10" r="1.8" />
    <path d="m20.5 16-5-5-8.5 8.5" />
  </Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg strokeWidth={2.2} {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const MinusIcon = (p: IconProps) => (
  <Svg strokeWidth={2.2} {...p}>
    <path d="M5 12h14" />
  </Svg>
);
