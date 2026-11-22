// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let params: Record<string, string> = {};
vi.mock("react-router-dom", () => ({
  Navigate: ({ to }: any) => <span data-testid="redirect">{to}</span>,
  useParams: () => params,
}));

import { AdminOnly } from "./admin-only";
import { useAuthStore } from "@/stores/auth-store";

describe("AdminOnly", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    params = {};
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  const render = () =>
    act(() =>
      root.render(
        <AdminOnly>
          <p>console</p>
        </AdminOnly>,
      ),
    );

  it("renders admin pages for administrators", () => {
    useAuthStore.setState({ user: { role: "admin" } as any });
    render();
    expect(container.textContent).toBe("console");
  });

  it("sends members back to the bot page", () => {
    useAuthStore.setState({ user: { role: "member" } as any });
    params = { id: "bot-1" };
    render();
    expect(container.querySelector('[data-testid="redirect"]')!.textContent).toBe(
      "/dashboard/accounts/bot-1",
    );
  });

  it("sends members to the overview for non-bot admin pages", () => {
    useAuthStore.setState({ user: { role: "member" } as any });
    render();
    expect(container.querySelector('[data-testid="redirect"]')!.textContent).toBe(
      "/dashboard/overview",
    );
  });
});
