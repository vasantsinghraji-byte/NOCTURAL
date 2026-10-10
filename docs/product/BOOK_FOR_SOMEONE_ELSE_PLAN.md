# Book for someone else: plan for every Nabz service

*28 Sep 2026. For the Nabz team: what exists, what is missing, and the build plan.*

Many Nabz customers book for someone else: a son in Bengaluru booking a nurse for his mother in Jaipur, a daughter ordering her father's medicines. The person who books and pays (the **booker**) is not the person who receives care (the **recipient**). Every service needs to handle that the same way, in the apps and on the website.

## Where we are today

| Service | Today | Gap |
|---|---|---|
| Home nurse / physio visit | "Me / Someone else" on web and app. Recipient name, age, gender. On-site contact name and phone. App picks from phone contacts and remembers recent people on the phone. Family tracking link. | **Bug fixed today:** the recipient's name, age and gender were not being saved, so the professional only saw the account holder. The visit code still only reaches the booker's app, so a parent in another city cannot give it to the nurse. |
| Physio packages | Same visit form in the app. The same professional comes each session. | Website package booking is not built yet. Progress notes are not shared with the booker. |
| Pharmacy | App: deliver to someone else with receiver name and phone. Website: a contact phone on checkout. | No "someone else" choice on the website. The delivery code goes to the booker only. A prescription is not checked against the recipient's name. |
| Lab tests | Not built on this branch (module is on `feature/medrush-core`). | Everything. |
| Doctor consult | Not built on this branch. | Everything. |
| Emergency | Not built on this branch. | Everything. |
| Nabz Plus | Covers the account holder only. | No family cover. |

## The design: saved people ("Family & friends")

One list of people per customer account, stored on the server, used by every service, and the same on app and website.

**A saved person has:**
- name, relation (mother, father, spouse, child, friend, other), age or date of birth, gender;
- phone number (optional; needed for codes and updates);
- one or more addresses;
- care notes the professional should know: allergies, conditions, mobility, language;
- consent record: when the booker confirmed they have the person's permission.

**Everywhere a service asks "Who is this for?":** Me, one of my saved people, or add someone new (from phone contacts in the app, typed on the website). Recent picks come first.

## How each service works

| Service | Who receives codes and updates | What the professional sees | Special rules |
|---|---|---|---|
| **Nurse / physio visit** | The visit code and live tracking link go by SMS to the on-site contact (usually the recipient). The booker gets every status update in the app. | Recipient name, age, gender, relation, care notes, on-site contact. | Booker pays and can cancel. The professional calls the on-site contact, not the booker. |
| **Physio package** | Same as a visit, for every session. | Same, plus notes from earlier sessions. | The package belongs to the recipient. Changing the professional needs the booker. Session notes are shared with the booker if the recipient agrees. |
| **Pharmacy** | The delivery code goes to the receiver by SMS. The booker gets order updates. | Receiver name and phone. | A prescription must be in the recipient's name; the pharmacist checks it. Prepaid by the booker, or cash on delivery from the receiver. |
| **Lab test** | Collection time and fasting instructions to the on-site contact. The report goes to the recipient's number, and to the booker's account only if the recipient agrees. | Recipient name, age, gender; collection address. | The phlebotomist confirms identity at collection (name and age; photo ID where the test needs it). |
| **Doctor consult** | The video link goes to the recipient (or on-site contact). The booker can join. | Recipient details and care notes. | The recipient must be present. The prescription is issued in the recipient's name. |
| **Emergency** | Help goes to the recipient's address. The booker gets live updates. | Recipient details, care notes, on-site contact. | No consent step: in an emergency, acting fast comes first. |
| **Nabz Plus** | Not applicable. | Not applicable. | A family plan covering up to 4 saved people. |

## Consent and privacy (DPDP Act 2023)

- **Booker's confirmation:** when adding an adult, the booker ticks "I have their permission to book care for them". For a child or a dependent adult, the booker confirms they are the guardian.
- **Recipient is told:** an adult with their own phone gets an SMS: "Rohit booked a Nabz nurse for you on 2 Oct, 10 am. Not you? Tap to cancel."
- **Health information stays with the recipient:** lab reports and session notes reach the booker only with the recipient's consent.
- **Easy to remove:** the booker can delete a saved person at any time; their bookings keep only what the law requires.
- **Only what is needed:** each service asks for the minimum it needs.

## Build plan

**Phase A: visits and pharmacy (about 3 days)**
1. Saved people on the server (API, app, website), replacing "recent people" stored on the phone.
2. "Who is this for?" on every booking and checkout, on the website as well as the app.
3. Visit and delivery codes plus the tracking link go to the on-site contact:
   - by SMS once an SMS provider is set up;
   - until then, a "Share with them" button sends the code and link over WhatsApp from the booker's phone.
4. The professional's view shows "For Kamla Devi (Mother, 72)" with care notes. (Name, age and gender work from today's fix.)

**Phase B: pharmacy checks and family plan (about 2 days)**
1. The pharmacist checks the prescription name against the recipient.
2. The delivery code goes to the receiver.
3. The Nabz Plus family plan.

**Phase C: labs, consults, emergency (with each module)**
1. Build "for someone else" into lab tests, consults and emergency as each module is ported from `feature/medrush-core`.

## Edge cases to handle

- **Same person saved twice:** match on phone number and offer to merge.
- **No phone number:** the booker must give an on-site contact, and codes go to that contact.
- **Visit cancelled on site:** if the recipient declines, the professional marks it "Patient declined" and the booker is told. Cancellation fees follow the normal rules.
- **Shared phone:** a husband and wife share one number. Allow one phone on several saved people.
- **Minors:** a guardian must be present at the visit; the professional confirms this on arrival.
- **Recipient later makes their own account:** offer to link their history, with their consent.

## Decisions needed

1. **SMS provider:** MSG91, Gupshup or Twilio India. In India, transactional SMS needs sender and template registration on the telecom DLT portal, which takes a few days.
2. **Limit on saved people:** we suggest 6 per account.
3. **Nabz Plus family plan price.**
4. **Report sharing:** should lab reports go to the booker by default when the recipient has no phone of their own?
