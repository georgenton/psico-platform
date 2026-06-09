"use client";

import Script from "next/script";
import { useEffect, useRef, useState, useTransition } from "react";

import { loginWithGoogleAction } from "@/actions/auth";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            element: HTMLElement,
            config: {
              type?: "standard" | "icon";
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "small" | "medium" | "large";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              shape?: "rectangular" | "pill" | "circle" | "square";
              logo_alignment?: "left" | "center";
              width?: number | string;
              locale?: string;
            },
          ) => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

/**
 * GoogleSignInButton — Sprint S58.
 *
 * Renders the official Google Sign-In button via Google Identity Services
 * (GIS), the modern, frame-less SDK that emits a JWT id_token directly to
 * the page. We forward the token to the backend via the
 * `loginWithGoogleAction` server action, which verifies the signature with
 * Google's public keys and issues our own AuthResponse (same as the
 * email/password flow).
 *
 * Configuration required:
 *   - NEXT_PUBLIC_GOOGLE_CLIENT_ID env (the .apps.googleusercontent.com ID).
 *   - The deployed origin (e.g. https://psico-platform-web.vercel.app)
 *     must be listed under "Authorized JavaScript origins" in Google
 *     Cloud Console → OAuth consent screen → Credentials.
 *
 * If the env is unset, the button is hidden — we don't want to render a
 * broken control in dev environments.
 */
export function GoogleSignInButton({
  text = "continue_with",
  from,
}: {
  text?: "signin_with" | "signup_with" | "continue_with";
  from?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!scriptLoaded || !containerRef.current || !clientId) return;
    if (!window.google?.accounts?.id) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: ({ credential }) => {
        setError(null);
        startTransition(async () => {
          const res = await loginWithGoogleAction(credential, from);
          // On success, the action calls redirect() — code below won't run.
          if (res?.error) setError(res.error);
        });
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    window.google.accounts.id.renderButton(containerRef.current, {
      theme: "outline",
      size: "large",
      text,
      shape: "pill",
      logo_alignment: "left",
      width: 320,
    });
  }, [scriptLoaded, clientId, text, from]);

  if (!clientId) {
    // Hide the button in environments without the env var (dev, preview
    // deploys that don't have it). Email/password remains functional.
    return null;
  }

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
      />
      <div className="flex flex-col items-center gap-2">
        <div ref={containerRef} data-testid="google-signin-container" />
        {error ? (
          <p
            className="text-xs"
            style={{ color: "var(--color-rose-600)" }}
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
    </>
  );
}
