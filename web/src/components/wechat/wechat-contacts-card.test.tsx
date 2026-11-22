// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const botContacts = vi.fn();
const wechatBindLink = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    botContacts: (...a: any[]) => botContacts(...a),
    wechatBindLink: (...a: any[]) => wechatBindLink(...a),
    wechatUnbind: vi.fn(),
  },
}));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
let role = "superadmin";
vi.mock("@/stores/auth-store", () => ({
  isAdminRole: (r?: string) => r === "admin" || r === "superadmin",
  useAuthStore: (sel: any) => sel({ user: { role } }),
}));

import { WeChatContactsCard, contactName } from "./wechat-contacts-card";

describe("WeChatContactsCard", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    botContacts.mockReset();
    wechatBindLink.mockReset();
    toast.mockReset();
    role = "superadmin";
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function render() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <WeChatContactsCard botId="bot-1" />
        </QueryClientProvider>,
      );
    });
    await act(async () => {});
  }

  it("shows bound nickname and offers a bind link for unbound contacts", async () => {
    botContacts.mockResolvedValue([
      {
        user_id: "a@im.wechat",
        last_msg_at: 1,
        msg_count: 2,
        wechat: {
          ilink_user_id: "a@im.wechat",
          app_id: "wx",
          openid: "o1",
          unionid: "un1",
          nickname: "张三",
          updated_at: 1,
        },
      },
      { user_id: "b@im.wechat", last_msg_at: 1, msg_count: 1 },
    ]);
    await render();
    await vi.waitFor(() =>
      expect(container.querySelectorAll('[data-testid="wechat-contact"]')).toHaveLength(2),
    );
    const rows = container.querySelectorAll('[data-testid="wechat-contact"]');
    expect(rows[0].textContent).toContain("张三");
    expect(rows[0].textContent).toContain("unionid un1");
    expect(rows[0].textContent).toContain("解绑");
    expect(rows[1].textContent).toContain("b@im.wechat");

    wechatBindLink.mockResolvedValue({
      url: "u",
      sent: true,
      recipient: "b@im.wechat",
      expires_at: 0,
    });
    const btn = Array.from(rows[1].querySelectorAll("button")).find((b) =>
      b.textContent?.includes("发送绑定链接"),
    )!;
    await act(async () => btn.click());
    expect(wechatBindLink).toHaveBeenCalledWith("bot-1", { recipient: "b@im.wechat", send: true });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "绑定链接已发送" }));
  });

  it("hides bind and unbind for regular members", async () => {
    role = "member";
    botContacts.mockResolvedValue([
      {
        user_id: "a@im.wechat",
        last_msg_at: 1,
        msg_count: 2,
        wechat: {
          ilink_user_id: "a@im.wechat",
          app_id: "wx",
          openid: "o1",
          nickname: "张三",
          updated_at: 1,
        },
      },
      { user_id: "b@im.wechat", last_msg_at: 1, msg_count: 1 },
    ]);
    await render();
    await vi.waitFor(() =>
      expect(container.querySelectorAll('[data-testid="wechat-contact"]')).toHaveLength(2),
    );
    expect(container.textContent).toContain("张三");
    expect(container.textContent).not.toContain("发送绑定链接");
    expect(container.textContent).not.toContain("解绑");
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("contactName falls back to the iLink id", () => {
    expect(contactName({ user_id: "x" })).toBe("x");
  });
});
