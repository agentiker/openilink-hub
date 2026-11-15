// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { QuotaBanner } from "./console-page";
import type { SendQuota } from "@/lib/api";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const base: SendQuota = {
  recipient: "u",
  limit: 10,
  used: 0,
  remaining: 10,
  pending: 0,
  reset_at: 0,
};

describe("QuotaBanner", () => {
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

  const render = (quota: SendQuota, notice = "") => {
    act(() => root.render(<QuotaBanner quota={quota} notice={notice} />));
    return container.textContent ?? "";
  };

  it("shows remaining allowance", () => {
    expect(render({ ...base, used: 3, remaining: 7 })).toContain("还可接收 7/10 条");
  });

  it("warns that the last message will ask for a reply", () => {
    expect(render({ ...base, used: 9, remaining: 1 })).toContain("最后一条会提醒对方回复");
  });

  it("explains queueing when exhausted", () => {
    const text = render({ ...base, used: 10, remaining: 0, pending: 2 });
    expect(text).toContain("额度已用完");
    expect(text).toContain("待送达 2 条");
  });

  it("prefixes the queued notice", () => {
    const text = render({ ...base, used: 10, remaining: 0, pending: 1 }, "消息已排队");
    expect(text.startsWith("消息已排队 · ")).toBe(true);
  });
});
