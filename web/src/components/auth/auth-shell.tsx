import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { HexagonBackground } from "@/components/ui/hexagon-background";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { HiLogoMark } from "@/components/brand/hi-logo";

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

/** Shared frame for the login pages: background, Hi微连 mark, card, footer. */
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <HexagonBackground className="opacity-20" hexagonSize={60} hexagonMargin={4} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,hsl(var(--background))_100%)]" />

      <div className="relative z-10 w-full max-w-[420px] animate-in fade-in zoom-in-95 duration-500">
        <div className="mb-8 text-center space-y-2">
          <HiLogoMark className="mx-auto size-14 mb-4 drop-shadow-lg" />
          <h1 className="text-3xl font-extrabold tracking-tight">Hi微连</h1>
          <p className="text-sm text-muted-foreground font-medium">{subtitle}</p>
        </div>

        <Card className="border-border/50 shadow-2xl backdrop-blur-md bg-card/80">
          <CardContent className="pt-8 pb-6">{children}</CardContent>
          <CardFooter className="border-t bg-muted/30 pt-4 pb-4 rounded-b-xl justify-center">
            <p className="text-[10px] text-center text-muted-foreground/60 leading-relaxed px-6">
              登录即代表您同意我们的{" "}
              <Link to="#" className="underline">
                服务条款
              </Link>{" "}
              和{" "}
              <Link to="#" className="underline">
                隐私政策
              </Link>
              。
            </p>
          </CardFooter>
        </Card>

        {below}

        <footer className="mt-8 text-center text-[11px] text-muted-foreground/50 font-medium">
          &copy; 2026 Hi微连 保留所有权利。
        </footer>
      </div>
    </div>
  );
}
