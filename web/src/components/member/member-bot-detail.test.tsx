// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-router-dom", () => ({
  Link: ({ children, to, ...p }: any) => (
    <a href={to} {...p}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/ws", () => ({ useBotPush: () => {}, usePushListener: () => {} }));
const messages = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { messages: (...a: any[]) => messages(...a) },
  botDisplayName: (b: any) => b.display_name || b.name,
}));
vi.mock("@/hooks/use-bots", () => ({
  useBot: () => ({
    isLoading: false,
    data: {
      id: "bot-1234567890ab",
      name: "Bot-1",
      display_name: "",
      status: "connected",
      msg_count: 3,
      created_at: 1795337822,
      last_msg_at: 1795340000,
    },
  }),
  useBotWeChatUser: () => ({
    data: { ilink_user_id: "o9cq807yn@im.wechat", wechat: { nickname: "方瑾曜", avatar_url: "" } },
  }),
}));

import { MemberBotDetail } from "./member-bot-detail";

describe("MemberBotDetail", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    messages.mockReset();
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows basic info with the WeChat user and read-only history", async () => {
    messages.mockResolvedValue({
      messages: [
        {
          id: 2,
          direction: "outbound",
          item_list: [{ type: "text", text: "回复你好" }],
          created_at: 1795340001,
        },
        {
          id: 1,
          direction: "inbound",
          item_list: [{ type: "text", text: "你好" }],
          created_at: 1795340000,
        },
      ],
      next_cursor: "c1",
      has_more: true,
    });
    await act(async () => root.render(<MemberBotDetail id="bot-1234567890ab" />));
    await vi.waitFor(() =>
      expect(container.querySelectorAll('[data-testid="history-message"]')).toHaveLength(2),
    );
    expect(container.querySelector('[data-testid="bot-wechat-user"]')!.textContent).toContain(
      "方瑾曜",
    );
    expect(container.textContent).toContain("o9cq807yn@im.wechat");
    expect(container.textContent).toContain("你好");
    expect(container.textContent).toContain("加载更早的消息");
    // Read-only: no composer, no admin tools.
    expect(container.querySelector("textarea, input")).toBeNull();
    for (const t of ["消息控制台", "消息追踪", "AI 回复", "应用市场", "已安装的应用"]) {
      expect(container.textContent).not.toContain(t);
    }

    messages.mockResolvedValue({
      messages: [
        {
          id: 0,
          direction: "inbound",
          item_list: [{ type: "text", text: "更早的" }],
          created_at: 1795330000,
        },
      ],
      next_cursor: "",
      has_more: false,
    });
    const more = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("加载更早"),
    )!;
    await act(async () => more.click());
    expect(messages).toHaveBeenLastCalledWith("bot-1234567890ab", 30, "c1");
    expect(container.querySelectorAll('[data-testid="history-message"]')).toHaveLength(3);
    expect(container.textContent).not.toContain("加载更早的消息");
  });

  it("explains how to get messages when the history is empty", async () => {
    messages.mockResolvedValue({ messages: [], next_cursor: "", has_more: false });
    await act(async () => root.render(<MemberBotDetail id="bot-1234567890ab" />));
    await vi.waitFor(() => expect(container.textContent).toContain("暂无消息"));
  });
});
