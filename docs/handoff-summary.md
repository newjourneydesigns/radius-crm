# RADIUS — Cost & Handoff Summary

## What is RADIUS?
An internal web app built for Valley Creek Church to help ACPDs and directors track Circle Leaders, run weekly check-ins, manage follow-ups, prep for meetings, and pull attendance data from Church Community Builder (CCB). It includes a kanban board for projects, a calendar of circle visits, AI-assisted note summaries, and a daily digest email.

It is currently in active use and runs on a modern, well-supported tech stack.

---

## The bottom line for decision-making

| Scenario | Monthly cost | Annual cost |
|---|---|---|
| **Take it as-is today** (everything still on free tiers) | **$0** | **$0** |
| **Realistic Year 1** (database outgrows free tier) | **~$25** | **~$300** |
| **Steady-state Year 2+** (database + email volume) | **~$50** | **~$600** |
| **With ongoing development support** *(optional, see below)* | **+$220** | **+$2,640** |

**Translation:** The app itself is essentially free to run today, will likely cost about the price of a streaming service per month within a year, and may grow to roughly a single staff lunch per month at steady state. The bigger question is not the infrastructure cost — it is whether the church wants to fund ongoing development.

---

## Infrastructure costs (services that keep the app running)

| Service | What it does | Current | Realistic future |
|---|---|---|---|
| **Supabase** | Database, login, real-time updates | Free | $25/mo (Pro tier within ~12 months) |
| **Netlify** | Hosting & background jobs | Free | Likely stays free |
| **Resend** | Daily email digest | Free | $0–20/mo depending on recipient count |
| **Google Gemini AI** | Note summaries, meeting prep | Free | $0–10/mo (very low usage cost) |
| **Groq AI** | Backup AI if Google is down | Free | Free |
| **CCB API** | Pulls attendance data | **Already paid** | No new cost |
| **Domain name** | Web address | $0–15/yr | $0–15/yr |
| **GitHub** | Code storage | Free | Free |

**Why the increases happen, in plain terms:**
- *Supabase Pro ($25/mo)* — The free tier includes 500 MB of storage. Every leader note, meeting summary, and weekly check-in adds data. Most churches running an app like this exceed the free limit within 12 months. Pro also adds daily automatic backups, which is important for a system the church depends on.
- *Resend Pro ($20/mo)* — Only triggers if the daily digest goes to more than ~100 people per day.
- *AI costs* — Pay-per-use, billed in fractions of a cent. Realistic worst case is single-digit dollars per month.

---

## Development tooling (what is used to build and maintain it)

These are **separate from infrastructure** — they are the tools used to write and debug the code. The church only needs these if they want continued development beyond the current feature set.

| Tool | Purpose | Cost |
|---|---|---|
| **Claude Code Pro** | AI pair-programmer for feature work | **$20/mo** |
| **ChatGPT Pro (Codex)** | AI assistant for backend maintenance and refactoring | **$200/mo** |

**Combined: $220/mo, $2,640/yr**

**Important context:**
- The app **does not need these tools to keep running.** If the church takes it as-is and does not change anything, these costs are $0.
- These are *developer productivity tools*, not app infrastructure. They are only relevant if the church wants someone to keep building features, fixing bugs, or adapting the app over time.
- A church staff member with technical skills could use lower tiers (Claude Pro at $20/mo, ChatGPT Plus at $20/mo = **$40/mo combined**) and still maintain the app effectively. The higher-tier subscriptions reflect heavier usage for active feature development.

---

## What the church needs to decide

1. **Do they want to keep the app running?**
   Cost: ~$0 today, ~$25/mo within a year, ~$50/mo at steady state.

2. **Do they want continued development?**
   If yes, who owns it?
   - *Current developer continues maintaining it*: church reimburses tooling costs (full $220/mo) or a portion of them.
   - *In-house staff or volunteer maintains it*: scale down developer tooling to ~$40/mo.
   - *Freeze the app where it is*: $0 in tooling costs; only pay infrastructure.

3. **Do they want full ownership transfer?**
   This involves moving accounts (Supabase, Netlify, Resend, AI keys, GitHub repo, domain) into church-owned logins. This is a one-time effort — no recurring cost — but it must happen before the church is truly independent. Plan for a few hours of focused work to do it cleanly.

---

## Risk picture (honest assessment)

**Low risk:**
- The tech stack is mainstream and well-documented. Any modern web developer could pick it up.
- All vendors used are reputable and have generous free tiers.
- The app data is owned by the church and exportable at any time.

**Medium risk:**
- **Single point of failure on the developer side** — currently one person holds all the institutional knowledge. If the church wants long-term independence, they should plan a knowledge handoff or identify a future maintainer.
- **AI quota** — if a billing account is left attached to the AI key and usage spikes, it could generate an unexpected bill (likely small, but worth setting a hard cap).

**Reversible:**
- If the church decides in a year that they do not want the app, the data exports cleanly to a spreadsheet or another CRM. No lock-in.

---

## Recommendation framing

If RADIUS is being used and providing value to ACPDs today, the infrastructure cost (~$25–50/mo at steady state) is a small line item for a tool that replaces what would otherwise be tracked in spreadsheets, separate emails, and CCB alone.

The **real decision** is not "is the app worth $50/mo" — it is "do we want to fund ongoing development, and if so, at what level?" That is a staffing/strategy question more than a software cost question.
