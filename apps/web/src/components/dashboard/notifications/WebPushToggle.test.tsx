import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the web-push helper module so we control the support / subscription state.
vi.mock("@/lib/web-push", () => ({
  detectWebPushSupport: vi.fn(),
  subscribeWebPush: vi.fn(),
  unsubscribeWebPush: vi.fn(),
}));

import {
  detectWebPushSupport,
  subscribeWebPush,
  unsubscribeWebPush,
} from "@/lib/web-push";
import { WebPushToggle } from "./WebPushToggle";

function stubServiceWorker(hasExistingSub: boolean) {
  const fakeReg = {
    pushManager: {
      getSubscription: vi
        .fn()
        .mockResolvedValue(hasExistingSub ? { endpoint: "x" } : null),
    },
  };
  // jsdom doesn't ship a ServiceWorker registration; stub minimally.
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: vi.fn().mockResolvedValue(fakeReg),
    },
  });
}

describe("WebPushToggle", () => {
  beforeEach(() => {
    vi.mocked(detectWebPushSupport).mockReset();
    vi.mocked(subscribeWebPush).mockReset();
    vi.mocked(unsubscribeWebPush).mockReset();
  });

  it("renders the 'unsupported' phase when feature detection fails", async () => {
    vi.mocked(detectWebPushSupport).mockReturnValue({
      supported: false,
      reason: "insecure-context",
    });
    render(<WebPushToggle apiBase="/api" accessToken="tok" />);
    await waitFor(() => {
      expect(screen.getByText(/disponible|no disponible/i)).toBeInTheDocument();
    });
  });

  it("renders the 'blocked' phase when permission is denied", async () => {
    vi.mocked(detectWebPushSupport).mockReturnValue({
      supported: true,
      permission: "denied",
    });
    render(<WebPushToggle apiBase="/api" accessToken="tok" />);
    await waitFor(() => {
      expect(screen.getByText(/Negaste el permiso/i)).toBeInTheDocument();
    });
  });

  it("renders the 'off' phase when supported and no existing subscription", async () => {
    vi.mocked(detectWebPushSupport).mockReturnValue({
      supported: true,
      permission: "default",
    });
    stubServiceWorker(false);
    render(<WebPushToggle apiBase="/api" accessToken="tok" />);
    await waitFor(() => {
      expect(screen.getByRole("button")).toBeEnabled();
    });
  });

  it("subscribes and flips to 'on' when the user clicks the button", async () => {
    vi.mocked(detectWebPushSupport).mockReturnValue({
      supported: true,
      permission: "default",
    });
    vi.mocked(subscribeWebPush).mockResolvedValue({ id: "dt-1" });
    stubServiceWorker(false);
    const user = userEvent.setup();
    render(<WebPushToggle apiBase="/api" accessToken="tok" />);
    await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
    await user.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(subscribeWebPush).toHaveBeenCalledWith("/api", "tok");
    });
    await waitFor(() => {
      expect(screen.getByText(/Activadas/i)).toBeInTheDocument();
    });
  });

  it("surfaces a friendly error when subscribe fails with no-vapid-key", async () => {
    vi.mocked(detectWebPushSupport).mockReturnValue({
      supported: true,
      permission: "default",
    });
    vi.mocked(subscribeWebPush).mockRejectedValue(new Error("no-vapid-key"));
    stubServiceWorker(false);
    const user = userEvent.setup();
    render(<WebPushToggle apiBase="/api" accessToken="tok" />);
    await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
    await user.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByText(/VAPID/i)).toBeInTheDocument();
    });
  });

  it("unsubscribes and flips back to 'off' when the user clicks Desactivar", async () => {
    // Cold-start state: feature supported, permission already granted,
    // a subscription already exists on the SW registration (so the
    // initial effect resolves to phase "on" without going through
    // subscribe). This mirrors the typical session: the user opted in
    // last time, comes back, sees the toggle as Activated, and clicks
    // Desactivar to opt out.
    vi.mocked(detectWebPushSupport).mockReturnValue({
      supported: true,
      permission: "granted",
    });
    vi.mocked(unsubscribeWebPush).mockResolvedValue(undefined);
    stubServiceWorker(true);
    const user = userEvent.setup();
    render(<WebPushToggle apiBase="/api" accessToken="tok" />);
    // Wait for the cold-start effect to flip to phase "on" — the button
    // label switches to "Desactivar".
    const desactivar = await screen.findByRole("button", {
      name: /desactivar/i,
    });
    await user.click(desactivar);
    await waitFor(() => {
      expect(unsubscribeWebPush).toHaveBeenCalledWith("/api", "tok", "");
    });
    // After the unsubscribe resolves the toggle returns to the off state,
    // which exposes the "Activar" CTA instead.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /activar/i }),
      ).toBeInTheDocument();
    });
  });
});
