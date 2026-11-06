#!/usr/bin/env node
/**
 * Sprint S47 — Generate a VAPID keypair for Web Push.
 *
 * Run once: `pnpm --filter @psico/api gen:vapid`
 *
 * Copy the values to the three Coolify applications on the OVH server
 * (FeelVerse runs there and nowhere else — ADR 0024):
 *   - API:    VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 *   - worker: the same three — it also sends push (the weekly digest).
 *   - web:    NEXT_PUBLIC_VAPID_PUBLIC_KEY = the public key.
 *
 * Deploy the three one at a time: three parallel builds exhaust the build
 * daemon and all three fail. See docs/deploy/coolify-runbook.md.
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
console.log("# Add these to the Coolify API + worker, and the public key to the web app.");
console.log("");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log("VAPID_SUBJECT=mailto:soporte@feelverse.app  # change to your real contact");
console.log("");
console.log("# web (Coolify):");
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`);
