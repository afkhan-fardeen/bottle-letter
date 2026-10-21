# UI Plan: Bottles & Letters

**Direction:** light, calm, paper-like. Few elements, lots of space, one accent colour. It should feel like writing on a clean page, not using an app.

This replaces the dark midnight palette from the earlier PRD.

---

## 1. Look and feel

**Colours**

| Use | Colour |
| :--- | :--- |
| Background | `#FAF7F2` (warm paper) |
| Text | `#2B2A28` (soft black) |
| Secondary text | `#8A857C` |
| Lines / borders | `#E6E1D8` |
| Accent (buttons, focus, star) | `#3F7A80` (muted sea teal) |

**Type**
- Her message and headings: one serif (Newsreader or Lora), 20px+ in the writing box so it feels like a letter.
- Everything else: the system font stack. No extra font download.
- Max two sizes of text per screen.

**Shape**
- 12px corner radius on buttons and inputs, nothing bigger.
- No shadows except a faint one on the feed cards. No gradients, no glass blur, no glow.
- One icon style (simple line icons, 1.5px stroke), used sparingly.

## 2. Her screens

**A. First launch (once)**
Centered text on the plain page:
> What you leave here can be read by [Name].
> He won't reply here, and you won't see whether he's read it.

One button: **Okay**.

**B. Write screen (home, every time after)**
- Almost empty page. A top-left date in muted text. A top-right sound toggle (off by default).
- Large text box with the cursor already focused, placeholder: *"Write whatever you need to."*
- Below it, one row of small mood chips (optional, collapsed to a single "Add a mood" link until tapped).
- One button at the bottom: **Send**, disabled until she types something. A small muted line under it: *"[Name] can read this."*

**C. Sent state**
- Her text fades down while a small outlined bottle drifts out across a thin wavy line (SVG, about 1.5 seconds).
- Text: *"Carried by the tide."* then it returns to a blank write screen.
- With reduced-motion on, it's just a simple fade and the same text.

**D. Offline**
- Sending still works and shows the same state. No error messages, no "pending" label. It syncs quietly in the background.

## 3. His screens

**A. Login**
Email field and **Send me a link**. Nothing else.

**B. Feed (home)**
- Single column, newest first, grouped by day ("Today", "Yesterday", "21 Oct").
- Each message is a plain card: time, mood (if any), the text in the serif font, a star on the right.
- Long messages are clipped to about five lines with "Read more".
- Top bar: search field and a small menu with **Export backup**.
- Filters: just **All** and **Starred**.
- No compose box, no reply, no read indicators.

**C. Empty state**
*"Nothing yet. When she leaves something, it will show up here."*

## 4. Layout and usability

- Mobile first, single column, 640px max width on larger screens.
- 16px side padding, safe-area insets for notch and home bar.
- Tap targets at least 44px.
- Text contrast meets WCAG AA.
- Installable PWA with a simple icon: a plain bottle outline on the paper colour.

## 5. Avoiding the generic AI look

- No purple/blue gradients, glassmorphism, glowing borders or neon.
- No emoji in the interface. Mood chips are text only.
- No stock hero sections, feature cards or three-column layouts.
- No fake loading spinners or fancy transitions. Motion exists in one place (the bottle).
- Copy is short and human, never "Unleash", "Seamless" or exclamation marks.

## 6. Build order

1. Tokens (colours, type, spacing) and the write screen
2. Sent animation and sound toggle
3. His login and feed
4. Search, star, export
5. PWA install and offline queue