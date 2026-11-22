// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const navigate = vi.fn();
let search = "";
vi.mock("react-router-dom", () => ({
  Link: ({ children, to, ...p }: any) => (
    <a href={to} {...p}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
  useSearchParams: () => [new URLSearchParams(search)],
}));
vi.mock("@/hooks/use-auth", () => ({ useInfo: () => ({ data: { registration_enabled: true } }) }));
vi.mock("@/hooks/use-settings", () => ({ useOAuthProviders: () => ({ data: [] }) }));
vi.mock("@/components/ui/hexagon-background", () => ({ HexagonBackground: () => null }));
vi.mock("qrcode", () => ({ default: { toCanvas: vi.fn() } }));
const login = vi.fn();
vi.mock("@/lib/api", () => ({ api: { login: (...a: any[]) => login(...a) } }));
vi.mock("../lib/api", () => ({ api: { login: (...a: any[]) => login(...a) } }));

import { LoginPage } from "./login";
import { AdminLoginPage } from "./admin-login";

describe("login entry points", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    // Scan login fetches a QR session on mount; keep it pending.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    navigate.mockReset();
    login.mockReset();
    search = "";
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("/login offers WeChat scan only", async () => {
    await act(async () => root.render(<LoginPage />));
    expect(container.querySelector('[data-testid="scan-login"]')).not.toBeNull();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.textContent).not.toContain("通行密钥");
    expect(container.textContent).not.toContain("账号密码");
    expect(container.textContent).toContain("Hi微连");
    // The admin entry is deliberately not advertised on public pages.
    expect(container.querySelector('a[href="/admin/login"]')).toBeNull();
    // Two-stage guidance: register by camera scan, bind identity, then one-tap /m.
    const steps = container.querySelector('[data-testid="onboarding-steps"]')!.textContent!;
    expect(steps).toContain("扫码注册");
    expect(steps).toContain("身份绑定");
    expect(steps).toContain("一键登录");
    expect(container.textContent).toContain("长按识别无效");
    expect(container.querySelector('[data-testid="mobile-entry"]')!.textContent).toContain("/m");
  });

  it("/login inside WeChat offers one-tap login instead of an unscannable QR", async () => {
    vi.resetModules();
    const ua = vi
      .spyOn(window.navigator, "userAgent", "get")
      .mockReturnValue("Mozilla/5.0 (iPhone) MicroMessenger/8.0.50");
    const { LoginPage: WeChatLogin } = await import("./login");
    await act(async () => root.render(<WeChatLogin />));
    ua.mockRestore();
    expect(container.querySelector('[data-testid="scan-login"]')).toBeNull();
    expect(container.querySelector('a[href="/m"]')?.textContent).toContain("微信一键登录");
    expect(container.textContent).toContain("在电脑上打开");
  });

  it("login pages release a stale overlay lock on <body> (logout from an open menu)", async () => {
    document.body.style.pointerEvents = "none";
    document.body.style.overflow = "hidden";
    document.body.setAttribute("data-scroll-locked", "1");
    await act(async () => root.render(<LoginPage />));
    expect(document.body.style.pointerEvents).toBe("");
    expect(document.body.style.overflow).toBe("");
    expect(document.body.hasAttribute("data-scroll-locked")).toBe(false);
  });

  it("/admin/login has password + passkey and no QR", async () => {
    (window as any).PublicKeyCredential = function () {};
    await act(async () => root.render(<AdminLoginPage />));
    expect(container.querySelector('[data-testid="scan-login"]')).toBeNull();
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
    expect(container.textContent).toContain("使用通行密钥登录");
    expect(container.textContent).toContain("管理员登录");
    delete (window as any).PublicKeyCredential;
  });

  it("/admin/login shows the scan-only hint for member accounts", async () => {
    login.mockRejectedValue(new Error("普通用户请使用微信扫码登录"));
    await act(async () => root.render(<AdminLoginPage />));
    const [user, pass] = Array.from(container.querySelectorAll("input"));
    const set = (el: HTMLInputElement, v: string) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    await act(async () => {
      set(user as HTMLInputElement, "member1");
      set(pass as HTMLInputElement, "password123");
    });
    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(login).toHaveBeenCalledWith("member1", "password123");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("微信扫码登录");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("/admin/login explains ?error=admin_only from OAuth", async () => {
    search = "error=admin_only";
    await act(async () => root.render(<AdminLoginPage />));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("不是管理员");
  });
});
