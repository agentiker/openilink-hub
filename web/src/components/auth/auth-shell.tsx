import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { HiLogo } from "@/components/brand/hi-logo";

/**
 * Radix modal overlays (dialog/sheet/dropdown) lock the page with
 * pointer-events:none and overflow:hidden on <body>. If one is unmounted while
 * open (e.g. a client-side redirect to login), the lock can survive and make
 * every control on the login page dead until a reload. Clear it defensively.
 */
export function releaseStaleBodyLock() {
  const s = document.body.style;
  if (s.pointerEvents === "none") s.pointerEvents = "";
  if (s.overflow === "hidden") s.overflow = "";
  document.body.removeAttribute("data-scroll-locked");
}

/**
 * Shared frame for the login pages: a quiet white page, the wordmark at the
 * top, one bordered panel in the middle, and a footer line. Canon, played
 * straight (Vercel / Linear / OpenAI sign-in pages).
 */
export function AuthShell({
  subtitle,
  children,
  below,
}: {
  subtitle: string;
  children: ReactNode;
  below?: ReactNode;
}) {
  useEffect(() => {
    releaseStaleBodyLock();
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="flex h-16 items-center px-6">
        <Link to="/" aria-label="Hi微连 首页">
          <HiLogo className="text-[15px]" markClassName="size-7" />
        </Link>
      </header>

      <main className="flex flex-1 items-start justify-center px-5 pt-[6vh] pb-16 sm:items-center sm:pt-0">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-semibold tracking-[-0.025em]">Hi微连</h1>
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(16,24,20,.04),0_12px_32px_-20px_rgba(16,24,20,.18)] sm:p-8">
            {children}
          </div>
          {below}
        </div>
      </main>

      <footer className="px-6 pb-8 text-center text-xs text-muted-foreground">
        登录即表示同意服务条款与隐私政策 · &copy; 2026 Hi微连
      </footer>
    </div>
  );
}
