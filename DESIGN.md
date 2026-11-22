---
name: Hi微连
description: 把个人微信连成 Bot —— 一个安静、可信、像海外 AI 产品一样精确的消息中枢
colors:
  ink: "oklch(0.17 0.004 150)"
  paper: "oklch(1 0 0)"
  mist: "oklch(0.975 0.002 150)"
  pencil: "oklch(0.52 0.008 150)"
  hairline: "oklch(0.92 0.003 150)"
  weixin-green: "#07C160"
  live-green: "oklch(0.6 0.15 152)"
  live-green-soft: "oklch(0.96 0.035 152)"
  alarm-red: "oklch(0.577 0.215 27)"
typography:
  display:
    fontFamily: "Geist Variable, PingFang SC, Hiragino Sans GB, sans-serif"
    fontSize: "4.5rem"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.045em"
  headline:
    fontFamily: "Geist Variable, PingFang SC, Hiragino Sans GB, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Geist Variable, PingFang SC, Hiragino Sans GB, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Geist Variable, PingFang SC, Hiragino Sans GB, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "Geist Variable, PingFang SC, Hiragino Sans GB, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  pill: "9999px"
spacing:
  section: "112px"
  card: "28px"
  row: "20px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    height: "40px"
    padding: "0 20px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "40px"
    padding: "0 20px"
  status-pill-live:
    backgroundColor: "{colors.live-green-soft}"
    textColor: "{colors.live-green}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  status-pill-idle:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.pencil}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "40px"
---

# Design System: Hi微连

## Overview

**Creative North Star: "The Quiet Switchboard"**

Hi微连 sits in the same visual family as Vercel, Linear and OpenAI: a white page, precise sans-serif type, one centred statement, and the working product shown as itself. Nothing performs. The interface is a switchboard that routes messages calmly, and the only colour that speaks is the WeChat green, which appears when something is actually live.

Density stays moderate. Marketing surfaces give the headline air and let the console preview carry the proof. Console surfaces are compact and hairline-ruled, built for reading state rather than for decoration. Dark mode is the same system inverted (ink becomes the ground; primary becomes near-white), not a separate mood.

**Key Characteristics:**
- White ground, near-black ink; ink also fills every primary action.
- Hairline borders (1px) and an 8px radius family instead of shadows and colour blocks.
- Green is reserved for the logo mark and live / delivered / running state.
- Real product UI as illustration, always labelled when its data is a demo.
- CJK headings break on words (`word-break: keep-all`) and balance.

## Colors

A monochrome system with one earned hue.

### Primary
- **Ink** (`ink`): text, headings, primary buttons, outbound message bubbles, active nav. Dark theme flips it to near-white.

### Secondary
- **WeChat Green** (`weixin-green`): the logo mark and favicon only; never a button fill.
- **Live Green** (`live-green` on `live-green-soft`): the status pill and dot for connected / running / delivered, and the focus ring.

### Neutral
- **Paper** (`paper`): page and card ground.
- **Mist** (`mist`): muted panels, idle pill, icon tiles, the quota section ground.
- **Pencil** (`pencil`): secondary text, captions, meta lines.
- **Hairline** (`hairline`): every border and divider.
- **Alarm Red** (`alarm-red`): errors and the session-expired notice, used at 5–10% tint for boxes.

### Named Rules
**The Earned Green Rule.** Green means "this is live right now". A connected bot, a delivered message, a running app. Decorative green, green buttons, green headings: never.

**The One Ink Rule.** Primary actions are ink, not brand colour. One ink button per view; everything else is bordered or ghost.

## Typography

**Display / Body Font:** Geist Variable, self-hosted (with PingFang SC, Hiragino Sans GB, Microsoft YaHei for CJK)

**Character:** a neutral, engineered grotesk with CJK that matches its weight; tight negative tracking on headings carries the "precise" voice.

### Hierarchy
- **Display** (600, 4.5rem desktop / 2.75rem mobile, 1.05): the single home headline.
- **Headline** (600, 2.25rem desktop / 1.75rem mobile, 1.2, −0.03em): section heads and the closing CTA.
- **Title** (600, 1.125rem): card and step titles, page titles in the console.
- **Body** (400, 0.875–1rem, 1.65): descriptions; subcopy capped near 36em.
- **Label** (500, 0.75rem): field labels, captions, message meta (`tabular-nums`).

### Named Rules
**The Tabular Rule.** Every time, count, quota and ID renders with tabular numerals so columns and live updates never jitter.

**The No-Eyebrow Rule.** Headings carry their own weight; no kicker or eyebrow label above them.

## Layout

Marketing pages use a centred column (max 72rem) with 112px between sections; the hero is centred and the product preview crosses the fold. Two-column sections pair a heading with a ruled list. The console is a left sidebar plus a 56px hairline header with breadcrumbs, and content in a single scrolling column. Below `md` everything collapses to one column; the console sidebar becomes a sheet.

## Elevation & Depth

Flat by default; depth comes from hairlines and tonal grounds (paper over mist). The one lifted object is the console preview frame on the home page (a soft, wide ambient shadow) and the auth card, so the product reads as a screen sitting on the page.

**The Hairline-First Rule.** Separate with a 1px hairline before reaching for a shadow; shadows never carry state.

## Shapes

Gently rounded: 8px for buttons, inputs and cards, 12px for large framed panels, full pills only for status. Grids of items are built as one bordered box divided by hairlines (`gap-px` over a hairline ground), not as separate floating cards.

## Components

### Buttons
- **Shape:** gently rounded (8px), 40px tall (46px on `/m` mobile pages).
- **Primary:** ink fill, paper text, medium weight; optional trailing arrow.
- **Secondary:** paper fill, hairline border, ink text; hover shifts to mist.
- **Focus:** live-green ring.

### Status pill
- **Style:** pill with a 6px dot. Live: live-green on live-green-soft. Everything else (stopped, expired, error): pencil on mist; errors may use alarm red.

### Cards / Containers
- **Corner Style:** 8–12px. **Background:** paper. **Border:** hairline. **Shadow:** none in the console. **Internal Padding:** 20–28px.

### Inputs / Fields
- **Style:** hairline border, paper ground, 8px radius, 40px, visible label above (never icon-only).
- **Focus:** live-green ring. **Error:** alarm-red tinted box beneath the form.

### Navigation
- Home: sticky, translucent paper with a bottom hairline; wordmark left, text links centre-left, ink CTA right.
- Console: sidebar with ink-on-mist active item; header breadcrumbs in pencil, current page in ink.

### Message thread
- Inbound: paper bubble with hairline border, left. Outbound: ink bubble, right. Queued: outbound at reduced opacity with a "排队中" meta line. Meta is 11px, tabular.

## Do's and Don'ts

### Do:
- **Do** show the real console with labelled demo data ("示例界面，数据为演示") instead of illustrations.
- **Do** keep green for live state and the logo mark only.
- **Do** give every list row an icon that means something, or no icon at all.

### Don't:
- **Don't** fill a button with brand green or use green for headings or decoration.
- **Don't** use coloured icon tiles (blue/violet/orange) for stats; tiles are mist with ink icons.
- **Don't** add gradients, glows, glass, or dark-neon AI-category heroes.
- **Don't** claim customers, pricing or metrics that do not exist.
