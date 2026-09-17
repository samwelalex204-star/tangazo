# TANGAZO

**Your automated brand marketing department, running on your Windows desktop.**

One brief in — strategy, a 30-day calendar, ready-to-paste captions, image and video
prompts, ad sets, WhatsApp sequences, sales scripts and customer FAQs out. Multi-brand,
so you can run your own business and client businesses from the same app.

---

## 1. Getting it running

Unzip the folder anywhere (Desktop, Documents, a USB stick — it does not matter) and
double-click **TANGAZO.exe**. Nothing installs, nothing touches the registry.

Windows SmartScreen will warn you the first time, because the app is not code-signed.
Click **More info → Run anyway**. Code signing costs a few hundred dollars a year; if
you ever sell TANGAZO, that is the point to buy a certificate.

## 2. Add your API key

TANGAZO thinks using Claude. That needs an Anthropic API key, which is billed separately
from a Claude subscription.

1. Go to **console.anthropic.com → API Keys** and create one.
2. In TANGAZO, open **Settings**, paste it, press **Test connection**.

The key is stored on your machine only, encrypted by Windows where the OS allows it.
It is never sent anywhere except to Anthropic.

**What it costs:** a full 30-day campaign is roughly 60,000–120,000 tokens, which is a
few US dollars at current Sonnet pricing. A single agent run is cents.

## 3. Tune the Brand Brain

**Brand Brain** is the foundation. Every agent reads it before it writes a word — colours,
fonts, tone, banned words, products, personas, proof points, compliance rules.

Zora Holdings comes pre-loaded with everything already known about the business: the
product range, four buyer personas, the colour palette, voice rules and hashtag sets.
Go through it and correct anything that is wrong. **Preview what agents see** shows you
the exact brief the agents receive.

The single biggest lever on output quality is how specific this page is. "Quality products"
produces generic marketing. "Embossed steel, not printed finish — stocked in Dar, no 8-week
import wait" produces marketing that sells.

Add another brand any time from the dropdown at the top left. Each client gets their own brain.

## 4. Run a campaign

**New campaign** → write what is actually happening in the business:

> We have 400 embossed door panels arriving. Create a 30-day campaign targeting hardware
> shops, contractors and homeowners in Tanzania.

Six agents then run in sequence, each feeding the next:

```
Brand Brain
     |
Marketing Strategist  ──►  Campaign Manager
                                 |
        ┌───────────────┬────────┴────────┬──────────────┐
   Social Manager   Creative Director   Ad Agent   Persona Agent
   30-day calendar  image/video prompts  ad sets    messaging matrix
```

Takes three to six minutes. The calendar is generated ten days at a time so a long
campaign never gets cut off mid-generation.

## 5. The ten agents

Use them individually from the **Agents** page when you do not need a whole campaign.

| # | Agent | What it does |
|---|---|---|
| 1 | Marketing Strategist | Turns a business goal into positioning, angles and a plan |
| 2 | Campaign Manager | One brief → the whole campaign spine |
| 3 | Content Creator | The actual posts, captions and hooks per platform |
| 4 | Creative Director | Image, poster and video generation prompts, on brand |
| 5 | Social Media Manager | The posting calendar — what, where, when |
| 6 | Ad Agent | Meta / TikTok / Google ad concepts, headlines, targeting |
| 7 | Customer Persona Agent | Each buyer type and the message that moves them |
| 8 | Repurposing Agent | One photo or clip → 10–20 pieces of content |
| 9 | Competitor Monitor | Rival analysis and the gaps you can own |
| 10 | Analytics Agent | Reads your real numbers, says what to make next |

Everything they produce is saved to the **Library**.

## 6. Publishing

This is the part most "AI marketing tools" are dishonest about, so here it is straight.

Instagram, Facebook, TikTok and LinkedIn all require business verification and app review
before any software may post on your behalf. That takes weeks and can be refused. TANGAZO
does not pretend to hold those keys.

Instead it fires each scheduled post at **a webhook you control**. Make.com, Zapier and n8n
already hold approved connections to all four platforms. They do the posting; you keep control
and you are live today instead of in six weeks.

**Setup, once:**

1. In Make.com create a scenario starting with a **Custom Webhook** (Zapier: *Catch Hook*;
   n8n: *Webhook* node). Copy the URL.
2. TANGAZO → **Settings** → paste it into *Webhook URL*, set *Auto-publish* to On, save.
3. Press **Send test to webhook** — the test message appears in Make within seconds.
4. In Make, add a **Router** after the webhook and branch on the `channel` field, then
   connect each branch to the Instagram / Facebook / TikTok / LinkedIn module.
5. Map `text` to the post body and `mediaUrl` to the image.

TANGAZO sends this JSON at each post's scheduled minute:

```json
{
  "id": "que_xxx",
  "source": "TANGAZO",
  "brand": "Zora Holdings",
  "campaign": "Panel Drop",
  "channel": "instagram",
  "format": "carousel",
  "scheduledAt": "2026-09-21T09:00:00.000Z",
  "caption": "…",
  "hashtags": ["#Tanzania", "#Milango"],
  "text": "caption + hashtags, ready to post",
  "mediaUrl": "",
  "cta": "WhatsApp us for today's price",
  "visualBrief": "Gold panel, hard raking light"
}
```

If you set a shared secret, each request is signed as `x-tangazo-signature`
(HMAC-SHA256 of the raw body) so your endpoint can verify it really came from TANGAZO.

**Posts only fire while TANGAZO is open.** Leave it running on the machine that does your
marketing, or use the CSV export route below with a cloud scheduler instead.

### Or skip the webhook entirely

From any campaign calendar, **Export…** gives you:

| Export | Use it for |
|---|---|
| Publer bulk schedule (CSV) | Bulk-upload 30 posts to Publer in one go |
| Buffer / Hootsuite (CSV) | Same, for Buffer or Hootsuite |
| Metricool bulk upload (CSV) | Same, for Metricool |
| Calendar file (ICS) | Drop the whole campaign into Google Calendar or Outlook |
| Full campaign pack (Markdown) | The entire campaign as one readable document |
| WhatsApp messages (TXT) | Copy-paste blocks for broadcasts |
| Full working sheet (CSV) | Everything, to review or edit in Excel |
| Everything (JSON) | Raw data, if you want to build on it |

## 7. Images and video

TANGAZO writes the **prompts**, it does not generate the pictures. The Creative Director
gives you a full generation prompt, a negative prompt, aspect ratio, headline text and a
layout brief for every visual — paste them into whatever you already use, or hand the
layout brief to a designer in Canva.

## 8. Your data

Everything lives in plain JSON on your machine — no cloud account, no subscription,
nothing shared. **Settings → Open data folder** shows you exactly where.

- **Back up everything** writes a single JSON file you can keep or move to another PC.
- **Restore from backup** brings it all back.

## 9. Honest limits

- Posts fire only while the app is running. It is a desktop app, not a server.
- The agents cannot browse. The Competitor Monitor reasons from what you tell it and
  labels every inference as an inference — it does not pretend to have checked.
- The agents never invent a price, a phone number or a stock figure. Where one is needed
  and was not supplied you get `[price]` in square brackets. Fill those in before posting.
- Analytics works on numbers you paste in. Nothing reads your accounts automatically.
- **Check every price, stock claim and delivery promise before it goes out.** The app is
  built to avoid inventing facts, but you are the one whose name is on the post.

---

## For developers

Zero runtime dependencies — just Electron and the standard library.

```
main.js                  Electron main process: owns the data, the key, all network calls
preload.js               The only bridge to the renderer (context-isolated)
src/core/store.js        Atomic JSON persistence, corruption recovery
src/core/brands.js       Brand Brain schema, the Zora seed, brief rendering
src/core/agents.js       The ten agents: system prompts and JSON contracts
src/core/claude.js       API client, retry/backoff, JSON repair for truncated replies
src/core/pipeline.js     Multi-agent campaign orchestration, chunked calendar generation
src/core/exporters.js    CSV / ICS / Markdown exports
src/core/publisher.js    Webhook scheduler, HMAC signing, retry
src/renderer/            The UI
```

```bash
npm install
npm start          # run it
npm test           # 49 checks: store, brand brain, agents, exports, publisher, full pipeline
npm run smoke      # boots the real app headlessly, verifies every view renders
npm run dist       # build a Windows installer + portable exe (run on Windows)
```

`npm test` runs against a mock model, so it needs no API key and no network.
