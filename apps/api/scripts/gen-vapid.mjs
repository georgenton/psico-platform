#!/usr/bin/env node
/**
 * Sprint S47 — Generate a VAPID keypair for Web Push.
 *
 * Run once: `pnpm --filter @psico/api gen:vapid`
 *
 * Copy the values to:
 *   - Railway API service: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 *   - Railway worker service: same three (the worker also sends push).
 *   - Vercel web project: NEXT_PUBLIC_VAPID_PUBLIC_KEY = the public key.
 *
 * NEVER commit the private key to git. NEVER share it in a PR/issue.
 * Treat it like a signing key: rotation invalidates every existing
 * browser subscription, so users have to re-grant permission.
 *
 * The subject is your contact URL or mailto: — push services (Mozilla,
 * Google) sometimes contact ops when a subscription misbehaves.
 */
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();

console.log("# Sprint S47 — fresh VAPID keypair generated.");
console.log("# Add these to Railway (API + worker) and the public key to Vercel.");
console.log("");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log("VAPID_SUBJECT=mailto:ops@psico.app  # change to your real contact");
console.log("");
console.log("# Vercel (web):");
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`);
