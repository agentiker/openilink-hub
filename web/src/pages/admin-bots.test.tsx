// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const useAdminBots = vi.fn();
vi.mock("@/hooks/use-admin", () => ({ useAdminBots: () => useAdminBots() }));

import { AdminBotsPage } from "./admin-bots";

const bot = (over: any = {}) => ({
  id: "bf38077c-0f00",
  name: "Bot-bf38",
  display_name: "",
  provider: "ilink",
  status: "connected",
  msg_count: 5,
  created_at: 1795337822,
  owner: { id: "u1", username: "ilink_53c3508b", display_name: "", role: "member" },
  ilink_user_id: "ultraman01@im.wechat",
  contact_count: 1,
  ...over,
});

describe("AdminBotsPage", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("lists every bot with owner and WeChat user", () => {
    useAdminBots.mockReturnValue({
      isLoading: false,
      data: [
        bot(),
        bot({
          id: "a2",
          name: "Other",
          status: "session_expired",
          owner: { id: "u2", username: "hubadmin", display_name: "", role: "superadmin" },
          wechat: {
            nickname: "张三",
            openid: "o",
            app_id: "wx",
            ilink_user_id: "x",
            updated_at: 1,
          },
        }),
      ],
    });
    act(() => root.render(<AdminBotsPage />));
    const rows = container.querySelectorAll('[data-testid="admin-bot-row"]');
    expect(rows).toHaveLength(2);
    expect(container.textContent).toContain("2 个，在线 1 个");
    expect(rows[0].textContent).toContain("ilink_53c3508b");
    expect(rows[0].textContent).toContain("未绑定身份");
    expect(rows[0].textContent).toContain("ultraman01@im.wechat");
    expect(rows[1].textContent).toContain("张三");
    expect(rows[1].textContent).toContain("superadmin");
    expect(rows[1].textContent).toContain("已过期");
  });

  it("shows an empty state", () => {
    useAdminBots.mockReturnValue({ isLoading: false, data: [] });
    act(() => root.render(<AdminBotsPage />));
    expect(container.textContent).toContain("平台上还没有 Bot");
  });
});
