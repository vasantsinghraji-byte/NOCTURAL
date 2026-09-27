# Prompts: PRD and investor pitch (Phase 1.1)

Paste a prompt into Claude or another assistant together with
[CODE_CONTEXT.md](CODE_CONTEXT.md) (and, for the PRD, `docs/AUDIT_2026-09-24_ALL_ROLES.md`).
Both prompts forbid invented numbers, because the outputs go to a team and to investors.

---

## 1. PRD prompt

```text
You are a senior product manager for Nabz, a home-healthcare-on-demand startup in Jaipur, India.
Attached: CODE_CONTEXT.md (what is built and live on staging) and the risk audit.

Write the Product Requirements Document for Phase 1.1. Phase 1.1 has two tracks.

HUMAN track (partner supply we are signing up now):
1. Pharma stores and path labs, plus freelance delivery riders.
2. Drug delivery live; 5 path labs onboarded on one common rate list (same price for a test at every partner lab).
3. Phlebotomists (home blood-sample collection for the labs).
4. PRP technicians.
5. Physiotherapists, hiring toward a 2 : 8 male : female ratio; customers can book a physio "from a distance" (for a parent or relative at another address, e.g. from another city).
6. Home care packages (multi-session physio, post-surgery, elderly care).
7. Hospital or nursing-home partners.

TECH track:
1. Demo of the Partner app and the customer app, with real-looking medication data.
2. Domain and hosting (move from default AWS URLs to our own domain).

For each item, write:
- Problem and who it is for (customer, partner, ops), with the user story.
- What already exists in the code (quote CODE_CONTEXT.md; say "not built" when it isn't).
- Requirements: must-have for this phase vs later, as numbered, testable statements.
- Edge cases and failure handling (no partner free, partner cancels, payment fails, sample
  damaged, wrong address, customer not home, disputes, refunds).
- Compliance and safety for India: licences to verify (drug licence, NABL/lab registration,
  council registration, police check), DPDP Act 2023 for health data, what a PRP technician may
  and may not do without a doctor (flag anything that needs a medical or legal decision
  instead of assuming).
- Success metrics with a target to be set by the team (write "target: TBD by team"; never invent numbers).
- Dependencies and open questions.

Then add:
- A release plan: what ships in Phase 1.1 vs 1.2, ordered by dependency.
- A table of partner types → onboarding documents → verification step → app/role.
- Risks, and what we will not do in this phase.

Rules: use only facts from the attachments and this prompt. Do not invent market sizes,
prices, partner names, customer counts or growth numbers; mark anything unknown as
"[to confirm]". Plain English, short sentences, tables where they help.
```

---

## 2. Investor pitch prompt

```text
You are helping the founders of Nabz prepare an investor pitch (pre-seed / seed).
Attached: CODE_CONTEXT.md (the product that is built and live on staging) and the Phase 1.1 plan.

Nabz in one line: home healthcare on demand in Jaipur: nurses, physiotherapists and
medicines at home, booked in minutes from an app, with verified professionals.

Produce two things.

A) A 12-slide deck outline, one slide per section, each with a title, 3 to 5 bullet points,
the visual to show, and speaker notes:
 1. Problem (families managing care at home; elderly parents living in another city).
 2. Solution and demo moment (book a verified female physio for a parent from another city;
    medicines from the nearest store with the brand in stock).
 3. Product today: what is live (use CODE_CONTEXT.md: two apps, website, live tracking,
    SOS, verification, pharmacy network, payments). Screenshots to capture.
 4. Why now.
 5. Market: TAM / SAM / SOM for home healthcare and e-pharmacy in India and Tier-2 cities.
 6. Business model: commission on visits and medicines, delivery fee, Nabz Plus membership,
    packages (see the revenue model in CODE_CONTEXT.md; percentages as placeholders).
 7. Supply and operations moat: verified partner network, common lab rate list, female-majority
    physio supply (2 : 8 M : F target), partner app with loud dispatch alerts.
 8. Go-to-market in Jaipur, then the next cities.
 9. Traction and pipeline.
10. Competition (home-care and e-pharmacy players in India) and how Nabz differs.
11. Team.
12. The ask: amount, use of funds, milestones for 18 months.

B) A one-page investor memo in prose (problem, solution, why us, model, ask).

Rules:
- Never invent numbers. Every market size, growth rate, competitor fact or price must either
  come with a named, checkable source (report title, publisher, year) or be written as
  "[number: source needed]". Traction and team sections are placeholders for the founders
  to fill: "[partners signed: __]", "[pilot bookings: __]".
- Be honest about stage: staging product, pilot in Jaipur.
- Flag regulatory items investors will ask about (pharmacy licences, DPDP Act, PRP needs a
  doctor) and how we handle them.
- Plain, confident language. No hype words.
```
