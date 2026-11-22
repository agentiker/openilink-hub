/**
 * Hi微连 logo mark.
 *
 * Inspired by WeChat's two overlapping chat bubbles (green squircle, white
 * bubbles), reinterpreted: the back bubble carries the "Hi" greeting, the
 * front bubble is a connection node — three dots joined by a link, for
 * "微连" (connecting WeChat with apps). Original artwork, not the WeChat mark.
 */
export const HI_GREEN = "#07C160";

export function HiLogoMark({
  className = "size-8",
  title = "Hi微连",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <rect width="64" height="64" rx="15" fill={HI_GREEN} />
      {/* back bubble: "Hi" */}
      <path
        d="M24.5 12C14.3 12 7 18.7 7 26.9c0 4.6 2.3 8.6 6 11.3l-1.6 5.3 6.3-3.3c2.1.6 4.4.9 6.8.9 10.2 0 17.5-6.7 17.5-14.2S34.7 12 24.5 12Z"
        fill="#fff"
      />
      <path
        d="M15.6 20.4v12.4M15.6 26.6h7.4M23 20.4v12.4"
        stroke={HI_GREEN}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="29" cy="21.2" r="1.9" fill={HI_GREEN} />
      <path d="M29 25.8v7" stroke={HI_GREEN} strokeWidth="3" strokeLinecap="round" />
      {/* front bubble: connection */}
      <path
        d="M43.5 27.5c-8 0-14 5.4-14 11.9 0 6.6 6 11.9 14 11.9 1.9 0 3.7-.3 5.4-.8l5 2.6-1.2-4.3c2.9-2.2 4.8-5.5 4.8-9.4 0-6.5-6-11.9-14-11.9Z"
        fill="#fff"
        stroke={HI_GREEN}
        strokeWidth="2.4"
      />
      <path d="M37.4 39.6h12.2" stroke={HI_GREEN} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="37.4" cy="39.6" r="2.6" fill={HI_GREEN} />
      <circle cx="43.5" cy="39.6" r="2.6" fill={HI_GREEN} />
      <circle cx="49.6" cy="39.6" r="2.6" fill={HI_GREEN} />
    </svg>
  );
}

/** Mark + product name. */
export function HiLogo({
  className = "",
  markClassName = "size-7",
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <HiLogoMark className={markClassName} />
      <span className="font-bold tracking-tight text-[1.05em]">Hi微连</span>
    </span>
  );
}
