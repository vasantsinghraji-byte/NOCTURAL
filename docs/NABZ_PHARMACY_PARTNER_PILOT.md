# Nabz pharmacy partner pilot: financial model and onboarding offer (Jaipur)

**Status: PROPOSAL for discussion, 16 Nov 2026.** Not a price list, not a contract, not legal advice. Every number marked *(assumption)* is illustrative until checked against real SKU-level margins and operating costs from pilot stores. Nothing here changes the app: billing, commission and delivery-fee settings stay as they are until a separate, explicit decision.

---

## 1. Summary

- **Offer:** free onboarding, no fixed fee and no exclusivity for a 60–90 day pilot; Nabz charges only on **completed orders that came through Nabz**.
- **Fee:** start from **5% of the medicine subtotal**, capped at **₹60 per order** (hypothesis to test, with 3% and 7% options below). Delivery fees are separate and never taken from the pharmacy.
- **The real risk is delivery, not the fee.** With today's staging settings (free delivery from ₹249, rider paid ₹20 per drop + ₹5/km), Nabz loses money on almost every order at a 5% fee, and a pharmacy that delivers for free loses money on small baskets. The pilot must charge a delivery fee (about ₹30 below a threshold) or use a high free-delivery threshold.
- **Settlement:** weekly payouts during the pilot, with a daily statement; COD cash handled by the Nabz rider is deposited the same day.
- **Compliance:** the licensed pharmacy stays responsible for dispensing, prescription checks and registers. Several legal questions (section 6) need Indian pharmacy counsel before a paid commercial launch.

What the code does today (for reference only, not changed by this proposal): pharmacy commission `REVENUE_PHARMACY_COMMISSION_RATE` = **10%**; delivery fee ₹20 base for the first 2 km + ₹8/km, max ₹80, **free from ₹249** (`config/revenue.js`); rider pay ₹20 per drop + ₹5/km.

---

## 2. Recommended pilot offer

| Term | Recommendation | Why |
|---|---|---|
| Length | 60–90 days, review at day 30, decision gate at the end | Long enough for repeat orders (most chronic refills are monthly) |
| Joining fee / monthly fee | None during the pilot | Removes risk for an independent store |
| Exclusivity | None. The store can keep any other app, its walk-ins and its own WhatsApp customers | Store keeps control; Nabz must earn the orders |
| What Nabz charges on | Only completed orders placed through the Nabz app/website and delivered | No fee on walk-ins, phone orders the store sourced itself, or cancelled/rejected orders |
| Fee | 5% of the medicine subtotal (price the customer paid for medicines, excluding delivery fee), capped at ₹60 per order | Hypothesis; see options in 3.4 |
| Pricing and stock | The store sets its own selling price (never above MRP) and stock; Nabz never forces discounts | Store keeps its margin and price control |
| Discounts | No pharmacy-funded discounts required. Nabz coupons are paid by Nabz | Keeps store contribution predictable |
| Delivery | Nabz rider by default; the customer pays the delivery fee to Nabz. If the store delivers itself, it keeps the customer's delivery fee | Store never silently absorbs a loss-making trip (see 3.3) |
| Settlement | Weekly (e.g. every Tuesday for the previous Monday–Sunday's delivered orders), daily statement in the app | Predictable cash for the store; time to settle COD and returns |
| Exit | Either side can leave with 7 days' notice; all dues settled in the next cycle | Low lock-in builds trust |
| Later paid add-ons (only after the pilot, optional) | Inventory/stock sync, H1 register export, refill reminders for the store's own customers, demand insights | Offered only once partners have seen order value |

### COD reconciliation and settlement cadence

1. **Nabz rider collects cash or UPI at the door** → deposits to Nabz the same day (UPI to the Nabz collection account by 10 pm; cash at a deposit point within 24 h). Unreconciled cash older than 48 h blocks new COD jobs for that rider.
2. **Daily statement** in the partner app: delivered orders, medicine subtotal, Nabz fee, refunds, tax deductions, amount due.
3. **Weekly payout** to the store's bank account: medicine subtotal of delivered orders − Nabz fee − GST TCS − income-tax TDS (both shown line by line; rates in section 6) ± adjustments (returns, substitutions).
4. **Store-delivered COD:** the store keeps the cash; Nabz's fee is netted from that week's online-paid orders, or invoiced weekly if there are none.
5. **Disputes:** raised within 7 days of the statement; resolved before the next payout.

---

## 3. Unit economics (illustrative)

### 3.1 Formulas

**Pharmacy contribution per order** = actual gross profit − Nabz fee − packaging − delivery paid by the pharmacy − pharmacy-funded discounts

- Gross profit = medicine subtotal × gross margin (selling price minus the store's purchase cost).

**Nabz contribution per order** = Nabz fee + delivery fee charged to the customer − rider cost − payment/collection cost − Nabz-funded discounts − support/ops cost − refund and cancellation losses

### 3.2 Assumptions (all to be validated)

| Item | Value | Note |
|---|---|---|
| Pharmacy gross margin | 12% / 18% / 25% | Branded-heavy / mixed / generic-heavy baskets *(assumption)* |
| Packaging | ₹5 per order | *(assumption)* |
| Pharmacy's own delivery cost | ₹35 per drop | Staff time + fuel *(assumption)* |
| Rider cost to Nabz | ₹35 per drop | Current config ₹20 + ₹5/km × 3 km average *(distance is an assumption)* |
| Support / ops | ₹4 per order | *(assumption)* |
| COD handling | ₹3 per order | Reconciliation effort *(assumption)*; online orders would carry a payment-gateway fee instead |
| Refund / cancellation loss | 1% of basket | *(assumption)* |
| Delivery fee to customer | ₹0 (free) or ₹30 | Policies compared below |

### 3.3 Worked example

Basket ₹600, gross margin 18%, fee 5%, Nabz rider, free delivery (basket over the threshold):

- **Pharmacy:** gross profit ₹108 − fee ₹30 − packaging ₹5 = **₹73**
- **Nabz:** fee ₹30 + delivery fee ₹0 − rider ₹35 − support ₹4 − COD ₹3 − refunds ₹6 = **−₹18**
- At today's 10% commission, the same order: pharmacy ₹43, Nabz ₹12. The higher fee moves the delivery loss onto the store's margin.

### 3.4 Sensitivity: pharmacy contribution per order (₹), Nabz rider delivers

| Basket | Margin | Fee 3% | Fee 5% | Fee 7% |
|---|---|---|---|---|
| ₹300 | 12% | 22 | 16 | 10 |
| ₹300 | 18% | 40 | 34 | 28 |
| ₹300 | 25% | 61 | 55 | 49 |
| ₹600 | 12% | 49 | 37 | 25 |
| ₹600 | 18% | 85 | 73 | 61 |
| ₹600 | 25% | 127 | 115 | 103 |
| ₹1,200 | 12% | 103 | 79 | 55 |
| ₹1,200 | 18% | 175 | 151 | 127 |
| ₹1,200 | 25% | 259 | 235 | 211 |

If the **store delivers itself and gets no delivery fee** (₹35 per drop, fee 5%): ₹300 basket gives −₹19 / −₹1 / +₹20 at 12% / 18% / 25% margin; ₹600 gives ₹2 / ₹38 / ₹80. Hence the rule: a store that delivers keeps the customer's delivery fee, or delivers only baskets above about ₹600.

### 3.5 Sensitivity: Nabz contribution per COD order (₹)

| Basket | Delivery policy | Fee 3% | Fee 5% | Fee 7% |
|---|---|---|---|---|
| ₹300 | Free delivery (today: free from ₹249) | −36 | −30 | −24 |
| ₹300 | ₹30 fee | −6 | 0 | 6 |
| ₹600 | Free delivery | −30 | −18 | −6 |
| ₹600 | ₹30 fee | 0 | 12 | 24 |
| ₹1,200 | Free delivery | −18 | 6 | 30 |
| ₹1,200 | ₹30 fee | 12 | 36 | 60 |

### 3.6 Minimum order and delivery-fee conditions

- **Nabz break-even basket with free delivery:** about ₹2,100 at 3%, ₹1,050 at 5%, ₹700 at 7%. Free delivery from ₹249 is therefore a customer-acquisition cost, not a sustainable default.
- **Nabz break-even basket with a ₹30 delivery fee:** about ₹600 at 3%, ₹300 at 5%, ₹200 at 7%.
- **Pharmacy break-even with a Nabz rider:** about ₹25–₹71 (it almost never loses).
- **Pharmacy break-even if it delivers free itself:** about ₹200 (25% margin) to ₹571 (12% margin).

**Recommendation for the pilot:** keep the store minimum order (₹99–₹199) and charge a delivery fee of about ₹30 to the customer. Make free delivery a Nabz Plus benefit, or set the free threshold at about ₹1,000 or more. Treat any lower threshold as a marketing spend budgeted by Nabz.

### 3.7 When to change the 5% fee

| Situation | Option |
|---|---|
| Low-margin, branded-heavy stores (≤12%) or chronic-care baskets | 3%, or 5% with the ₹60 cap (protects large monthly refills) |
| Small baskets dominate (≤₹300) | Flat ₹15–₹20 per order instead of a percentage (fairer to the store, covers Nabz support) |
| Nabz brings clearly net-new customers and provides the rider | 5–7%, only once data shows the store's contribution per order stays healthy |
| Store does its own delivery | Lower fee (3%) and it keeps the delivery fee |

---

## 4. Partner pitch and onboarding

### 4.1 Short pitch (to the pharmacy owner)

> "Nabz sends you extra orders from customers near your shop, mostly people who can't come to the counter: elderly patients, families ordering for parents, and home-care patients of Nabz nurses. You keep your prices, your stock and your own customers. There's no joining fee and no monthly fee during the pilot, and no exclusivity. We charge only on orders we bring that are delivered, and you see every rupee in a daily statement and a weekly payout. Our rider picks up and delivers, so you don't need a delivery boy. Your pharmacist checks every prescription in the app before packing, exactly as at your counter. Try it for 60 days; if the orders aren't worth it, stop with a week's notice."

What Nabz provides: incremental local demand; digital order handling (accept, pack, hand over in the app, with alerts); stock confirmation and "likely in stock" listings; prescription capture (photo/PDF) for the pharmacist; repeat-order reminders for the customers Nabz brings; transparent settlements; a basic weekly performance report (orders, acceptance, fill rate, contribution, repeat customers). Nabz does not promise a number of orders before demand is proven.

### 4.2 Onboarding checklist

1. Retail drug licence(s) (Form 20/21 or the state equivalent), with the licensed premises address, checked against the Rajasthan licensing authority's records.
2. Registered pharmacist on duty during Nabz hours: name and registration number (State Pharmacy Council).
3. GSTIN, PAN, bank account (cancelled cheque), FSSAI if it sells food/supplements.
4. Signed pilot terms: fee, settlement cadence, exit, data protection, and the dispensing responsibilities in section 6.
5. Store profile in Nabz: hours, service radius, minimum order, cold-storage yes/no, accepts prescription orders yes/no.
6. Catalogue upload (CSV import) with selling price ≤ MRP; batch and expiry for Schedule H1 and cold-chain items.
7. Partner app installed on the counter phone; alerts tested ("Test alert"); a staff member trained on accept → verify prescription → pack → handover code.
8. H1 register process agreed (the store keeps its statutory register; Nabz can export order data to help).
9. Two test orders end to end (one OTC, one with a prescription) before going live.
10. Day-1 check-in call; day-7 and day-30 reviews booked.

### 4.3 Pilot size and success criteria

- **Size:** 8–12 independent pharmacies across 3–4 Jaipur areas (e.g. C-Scheme, Malviya Nagar, Vaishali Nagar, Mansarovar), so each customer has at least 2 stores in range and stores aren't flooded or idle. Riders: 1 per area during peak hours.
- **Targets (to be confirmed at day 30):**

| KPI | Target |
|---|---|
| Order acceptance rate (within the 3-min window) | ≥ 90% |
| Median time to accept | ≤ 3 min |
| Line fill rate (items available as listed) | ≥ 95% |
| Median placed → ready for pickup | ≤ 15 min |
| Store-caused cancellations | ≤ 3% |
| Pharmacy contribution per order | ≥ ₹40 median *(assumption-based target)* |
| Nabz contribution per order | ≥ ₹0 by day 60 |
| 30-day repeat customers | ≥ 30% |
| Partner retention at day 90 | ≥ 80% |
| Prescription compliance (Rx orders verified before packing) | 100% |

- **Day-30 review:** real margins and costs replace the assumptions here; fee and delivery fee are tuned per segment; under-performing stores get a support plan.
- **End-of-pilot decision gate:** continue (and set commercial terms), extend the pilot with changes, or stop, using the KPIs above and partner feedback.

---

## 5. Data to collect during the pilot (to replace the assumptions)

SKU-level purchase cost and selling price per store (or margin by category); actual packaging cost; rider time and distance per drop; COD share and reconciliation effort; support contacts per order; cancellation and refund reasons; repeat rate by customer segment.

---

## 6. Compliance boundary

**Principles Nabz commits to:**

- Medicines are sold and dispensed only by the licensed pharmacy, from its licensed premises, under its registered pharmacist.
- Prescription medicines are dispensed only against a valid prescription, checked by the pharmacist, who keeps the statutory records (including the Schedule H1 register).
- Nabz never stocks medicines, never bypasses the prescription check, and never lists Schedule X, narcotic/psychotropic or banned products for online orders.

**Current position from official sources** (checked 16 Nov 2026; confirm before relying on it):

| Topic | Position | Source |
|---|---|---|
| Retail sale and dispensing | Retail sale needs a licence under the Drugs and Cosmetics Act/Drugs Rules, 1945; conditions of licence (Rule 65) cover sale under a registered pharmacist, prescription requirements and records | [CDSCO, Drugs Rules, 1945](https://cdsco.gov.in/opencms/en/Acts-and-rules/Drugs-Rules/) ([PDF](https://cdsco.gov.in/opencms/resources/UploadCDSCOWeb/2022/drug_rules/Drugs%20Rules,%201945.pdf)) |
| Who may dispense | Dispensing by a registered pharmacist on a registered medical practitioner's prescription | [PCI, Pharmacy Practice Regulations, 2015 (Gazette)](https://www.pci.nic.in/pdf/Pharmacy%20Practice%20Regulations.pdf); [PCI clarification](https://www.pci.nic.in/pdf/38.pdf) |
| E-pharmacy rules | GSR 817(E) of 28 Aug 2018 is a **draft**, not notified; the government said in 2019 the matter was sub judice | [PIB, Finalization of Draft Rules on Sale of Drugs by E-Pharmacies](https://pib.gov.in/pressreleaseshare.aspx?prid=1575553) |
| Court proceedings | Delhi High Court (W.P.(C) 11711/2018 and related contempt case): interim order of Dec 2018 against unlicensed online sale; the latest report found (Mar 2024) gave the Health Ministry a "last opportunity" to frame policy. **Current status not confirmed** | Reported by [Deccan Herald](https://www.deccanherald.com/india/delhi/union-govt-seeks-more-time-to-frame-policy-on-online-sale-of-medicines-delhi-hc-grants-last-opportunity-2940308) (news report, not an official source); check the Delhi HC case-status portal |
| Teleconsult prescriptions | Telemedicine Practice Guidelines, 2020 govern prescriptions issued over teleconsultation | MoHFW, [Telemedicine Practice Guidelines (25 Mar 2020)](https://www.mohfw.gov.in/pdf/Telemedicine.pdf) |
| Personal (health) data | DPDP Act, 2023 and DPDP Rules, 2025 (notified Nov 2025, phased: most obligations about 18 months later, around May 2027) | [PIB backgrounder on DPDP Rules, 2025](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf) |
| Marketplace duties | Consumer Protection (E-Commerce) Rules, 2020 (grievance officer, seller details, no dark patterns) | [Department of Consumer Affairs](https://consumeraffairs.nic.in/theconsumerprotection/consumer-protection-e-commerce-rules-2020) |
| GST on medicines | From 22 Sep 2025: most medicines 5% (from 12%); listed life-saving drugs nil | [PIB, 56th GST Council recommendations](https://www.pib.gov.in/PressReleseDetailm.aspx?PRID=2163555) |
| GST TCS by e-commerce operator | Reduced to 0.5% (0.25% CGST + 0.25% SGST / 0.5% IGST) from 10 Jul 2024 | [Notification 15/2024-Central Tax](https://gstcouncil.gov.in/sites/default/files/2024-09/central-tax-15-2024-11072024.pdf); [53rd GST Council](https://gstcouncil.gov.in/node/5061) |
| Income-tax TDS by e-commerce operator | Section 194-O rate cut from 1% to 0.1% from 1 Oct 2024 | [Finance (No. 2) Bill, 2024 memorandum](https://www.indiabudget.gov.in/budget2024-25/doc/memo.pdf); [Income Tax Dept highlights](https://www.incometaxindia.gov.in/documents/20117/14614766/Finance-Bill-2024-Highlights.pdf/20d7a2b6-1148-1dde-ac02-803fef334e4c?t=1767817023609) |
| Price ceilings | Drugs (Prices Control) Order, 2013 sets ceiling prices for scheduled formulations; selling price must not exceed MRP | [NPPA](https://nppaindia.nic.in/) |

**Questions for Indian pharmacy (and tax) counsel before a paid commercial launch:**

1. Is a marketplace that takes orders and delivers for licensed pharmacies lawful in Rajasthan while the e-pharmacy rules remain a draft and the Delhi High Court matter continues? Does the Dec 2018 interim order (against unlicensed sellers) affect this model?
2. Does delivery by a Nabz rider count as "sale from the licensed premises", and what are the handling rules in transit (cold chain, sealed packaging, Schedule H/H1)?
3. Are prescription photos/PDFs acceptable for H and H1 dispensing? Must the pharmacy keep the original or a copy, and in what form for H1 register purposes?
4. Can Nabz charge a percentage commission on prescription drug sales, and should the fee be structured as a platform/service fee (with GST on the fee)?
5. Who issues the customer invoice (pharmacy) and how are GST TCS and TDS deductions documented on payouts? Note that the Income-tax Act, 2025 replaced the 1961 Act from 1 Apr 2026, so section numbering (e.g. 194-O) needs confirming with a CA.
6. Collecting COD and online money on behalf of pharmacies: is a licensed payment aggregator / nodal escrow arrangement required for holding and settling merchant funds?
7. DPDP: roles (data fiduciary/processor) between Nabz and the pharmacy for prescriptions and health data, retention periods, and consent wording.
8. Advertising/promotions of medicines (coupons, "free delivery" on prescription drugs) under the Drugs and Magic Remedies Act and pharmacy codes.

Do not present the draft e-pharmacy rules, or any proposed amendment, as settled law in partner or customer material.
