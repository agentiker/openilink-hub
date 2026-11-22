# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Members (public, anyone).** Anyone can sign up. They connect their personal WeChat as a Bot by scanning the ClawBot QR code, then come back mostly from inside mobile WeChat to see their Bot and its message history. Low technical context; many arrive on a phone.
- **Administrators.** Platform operators who sign in at `/admin/login` with password or passkey, mainly on desktop. They manage every Bot on the platform: message console, tracing, AI replies, apps, users, and the 服务号 (WeChat official account) configuration.

## Product Purpose

Hi微连 turns a personal WeChat account into a programmable Bot through ClawBot (Tencent iLink): receive and send messages, forward them over WebSocket/HTTP/Webhook, reply with AI, and extend with apps. Success for a member is "my WeChat is connected and I can see what it's doing" with as few steps as possible; for an administrator, it's reliable operation and visibility across every Bot.

## Positioning

A hosted control plane for WeChat ClawBot bots that hides iLink's quirks: the 10-messages-per-inbound send allowance (nudge, queue, auto-delivery), in-band error codes, and identity. It also links the anonymous iLink user to a real WeChat identity through 服务号网页授权, so members get one-tap login inside WeChat.

## Operating Context

- Two-stage onboarding, verified on real phones: (1) register by scanning the ClawBot QR shown on another screen with the phone camera (tapping or long-pressing the QR inside WeChat does not work); (2) open the identity-binding link the Bot sends, after which `/m` logs the member in with one tap inside WeChat.
- Member surfaces are often viewed inside the WeChat in-app browser on a phone. Admin surfaces are desktop-first.
- Production: https://hub.xdimspace.cn, single host, Chinese UI.

## Capabilities and Constraints

- Members: WeChat scan login only (no password, passkey or OAuth). Their console shows bot basic info (including the WeChat user behind the bot) and read-only message history.
- Admins: full console (bots, users, message console, traces, AI, apps/marketplace, developer apps, 服务号 config, quotas).
- Surfaces in scope for design: public home page (`/`), member login (`/login`) and mobile one-tap pages (`/m`), member console, admin login (`/admin/login`) and admin console.
- UI language: Simplified Chinese.
- iLink limits: 10 outbound messages per inbound user message; ClawBot binding QR expires in about 2.5 minutes and must be camera-scanned.

## Brand Commitments

- Name: **Hi微连**.
- Logo: green squircle with two chat bubbles ("Hi" and three linked nodes), green `#07C160`, in `web/src/components/brand/hi-logo.tsx`. The user confirmed it stays.
- Visual direction (chosen 2026-11-22 over three distinctive directions): **the category standard of overseas AI products, executed at full craft**. Convention is the commitment: white ground, precise sans-serif, centred headline plus the real product interface, restrained colour with the logo green as the only brand hue. Reference products set the quality bar (to be confirmed by the user).

## Evidence on Hand

- No customers, testimonials, usage numbers or press exist. Do not invent them.
- Real, demonstrable facts: the two-stage onboarding, the send-allowance handling, and identity binding are working in production.

## Product Principles

1. Members do almost nothing: scan once, then tap. Every extra concept on the member side is a cost.
2. Management power lives in the admin console; the member side stays simple and read-mostly.
3. Be honest about WeChat/iLink limits (allowance, QR expiry) and tell people what to do next instead of failing silently.
4. Works first-class inside the WeChat in-app browser on a phone.
