import type { ButtonHTMLAttributes, ReactNode } from "react";

export type IconName =
  | "clock"
  | "calendar"
  | "pin"
  | "moon"
  | "play"
  | "hourglass"
  | "box"
  | "check"
  | "circle"
  | "sun"
  | "flag"
  | "arrow"
  | "slash"
  | "home"
  | "people"
  | "list"
  | "squares"
  | "cloud"
  | "gear"
  | "plus"
  | "print"
  | "file"
  | "sheet"
  | "star"
  | "pause"
  | "speaker"
  | "link";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="ico" viewBox="0 0 16 16" aria-hidden="true" {...stroke}>
      {glyph(name)}
    </svg>
  );
}

function glyph(name: IconName): ReactNode {
  switch (name) {
    case "clock":
      return (
        <>
          <circle cx="8" cy="8" r="5.2" />
          <path d="M8 5.1V8l2.1 1.3" />
        </>
      );
    case "calendar":
      return (
        <>
          <rect x="2.4" y="3.4" width="11.2" height="10" rx="1.4" />
          <path d="M2.4 6.6h11.2M5.4 2.2v2.4M10.6 2.2v2.4" />
        </>
      );
    case "pin":
      return (
        <>
          <path d="M6 2.4h4L9.2 6.4H6.8L6 2.4z" />
          <path d="M8 6.4v6.2M5.6 13.6h4.8" />
        </>
      );
    case "moon":
      return <path d="M10 2.6a5.2 5.2 0 1 0 0 10.6 4.1 4.1 0 0 1 0-10.6z" />;
    case "play":
      return <path d="M6 4.2 12 8 6 11.8V4.2z" />;
    case "hourglass":
      return <path d="M4.6 2.6h6.8M4.6 13.4h6.8M5.1 2.6 8 8l-2.9 5.4M10.9 2.6 8 8l2.9 5.4" />;
    case "box":
      return (
        <>
          <rect x="2.6" y="4.8" width="10.8" height="8.2" rx="1.2" />
          <path d="M2.6 8h10.8M6.4 4.8V3.2h3.2v1.6" />
        </>
      );
    case "check":
      return <path d="M3.4 8.3 6.4 11.2 12.6 4.6" />;
    case "circle":
      return <circle cx="8" cy="8" r="5" />;
    case "sun":
      return (
        <>
          <circle cx="8" cy="8" r="2.3" />
          <path d="M8 2.2v1.6M8 12.2v1.6M2.2 8h1.6M12.2 8h1.6M4 4l1.1 1.1M10.9 10.9 12 12M12 4l-1.1 1.1M5.1 10.9 4 12" />
        </>
      );
    case "flag":
      return <path d="M4.2 13.6V2.6h6.6L9.2 5.6l1.6 3H4.2" />;
    case "arrow":
      return <path d="M3 8h10M9.2 4.4 12.8 8 9.2 11.6" />;
    case "slash":
      return (
        <>
          <circle cx="8" cy="8" r="5.2" />
          <path d="M5.4 10.6 10.6 5.4" />
        </>
      );
    case "home":
      return <path d="M2.8 7.2 8 2.8l5.2 4.4V13H9.6V9.2H6.4V13H2.8V7.2z" />;
    case "people":
      return (
        <>
          <circle cx="6" cy="5.2" r="1.7" />
          <path d="M3.1 12.6c.2-2 1.4-3.1 2.9-3.1s2.7 1.1 2.9 3.1" />
          <circle cx="11.1" cy="5.6" r="1.3" />
          <path d="M10.2 12.6c.1-1.4.8-2.3 1.9-2.3 1 0 1.7.8 1.8 2.3" />
        </>
      );
    case "list":
      return <path d="M3 4.5h10M3 8h10M3 11.5h6.5" />;
    case "squares":
      return (
        <>
          <rect x="2.4" y="2.4" width="4.6" height="4.6" rx="0.8" />
          <rect x="9" y="2.4" width="4.6" height="4.6" rx="0.8" />
          <rect x="2.4" y="9" width="4.6" height="4.6" rx="0.8" />
          <rect x="9" y="9" width="4.6" height="4.6" rx="0.8" />
        </>
      );
    case "cloud":
      return <path d="M5 12.2h6.2a2.6 2.6 0 0 0 .4-5.2 3.3 3.3 0 0 0-6.3.8A2.2 2.2 0 0 0 5 12.2z" />;
    case "gear":
      return (
        <>
          <circle cx="8" cy="8" r="2.1" />
          <path d="M8 2.3v1.8M8 11.9v1.8M2.3 8h1.8M11.9 8h1.8M4 4l1.3 1.3M10.7 10.7 12 12M12 4 10.7 5.3M5.3 10.7 4 12" />
        </>
      );
    case "plus":
      return <path d="M8 3.2v9.6M3.2 8h9.6" />;
    case "print":
      return (
        <>
          <path d="M4.5 6V3.2h7V6" />
          <rect x="3" y="6" width="10" height="5.2" rx="1" />
          <path d="M5 11.2h6V14H5v-2.8z" />
        </>
      );
    case "file":
      return <path d="M5 2.4h4.2L12 5.2V13.6H5V2.4zM9.2 2.6V5.4H12" />;
    case "sheet":
      return (
        <>
          <rect x="2.6" y="2.6" width="10.8" height="10.8" rx="1.2" />
          <path d="M2.6 6.2h10.8M2.6 9.8h10.8M6.4 2.6v10.8" />
        </>
      );
    case "star":
      return <path d="m8 2.4 1.5 3.2 3.5.4-2.6 2.3.7 3.4L8 10.2 4.9 11.7l.7-3.4L3 6l3.5-.4L8 2.4z" />;
    case "pause":
      return <path d="M5.2 3.4v9.2M10.8 3.4v9.2" />;
    case "speaker":
      return <path d="M3.4 6.4h2.2L8.2 4v8L5.6 9.6H3.4V6.4zM10.2 6.2a2.6 2.6 0 0 1 0 3.6" />;
    case "link":
      return <path d="M6.6 9.4 5.2 10.8a2.2 2.2 0 0 1-3.1-3.1L3.5 6.3M9.4 6.6l1.4-1.4a2.2 2.2 0 0 1 3.1 3.1L12.5 9.7M6.2 9.8l3.6-3.6" />;
    default:
      return null;
  }
}

export function ChipButton({
  icon,
  tone,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; tone: string }) {
  return (
    <button type="button" {...props} className={`chip tone-${tone}${className ? ` ${className}` : ""}`}>
      <Icon name={icon} />
      {children}
    </button>
  );
}
