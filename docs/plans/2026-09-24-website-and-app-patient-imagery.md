# Website & Mobile App Patient Imagery & UX Improvement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the Nabz web landing page and mobile welcome screen from text-only mockups into high-trust, human-centric experiences featuring authentic patient and caregiver photography, verified customer testimonials, and an interactive onboarding care carousel.

**Architecture:** 
1. Establish a high-fidelity image asset pipeline with responsive WebP and PNG assets for both web (`frontends/web/public/images/`) and mobile (`frontends/mobile/assets/images/`).
2. Upgrade `frontends/web/app/page.tsx` with a human-centered Hero featuring real patient care, a "Stories of Care" testimonial showcase, and a "Care in Action" visual gallery.
3. Upgrade `frontends/mobile/app/welcome.tsx` with an interactive, auto-advancing Care Story Carousel showcasing real patient care moments with contextual safety badges.

**Tech Stack:** Next.js 14 App Router, React 18, React Native (Expo Router), TypeScript, Lucide Icons, CSS Variables / Tailwind.

---

### Task 1: Generate & Organize Patient & Caregiver Image Assets

**Files:**
- Create: `frontends/web/public/images/patients/elderly-care.webp` (and `.png`)
- Create: `frontends/web/public/images/patients/physio-recovery.webp` (and `.png`)
- Create: `frontends/web/public/images/patients/mother-child-care.webp` (and `.png`)
- Create: `frontends/web/public/images/patients/vitals-home.webp` (and `.png`)
- Create: `frontends/web/public/images/testimonials/avatar-ramesh.webp` (and `.png`)
- Create: `frontends/web/public/images/testimonials/avatar-neha.webp` (and `.png`)
- Create: `frontends/web/public/images/testimonials/avatar-vikram.webp` (and `.png`)
- Create: `frontends/web/public/images/testimonials/avatar-sunita.webp` (and `.png`)
- Create: `frontends/web/public/images/staff/nurse-asha.webp` (and `.png`)
- Create: `frontends/mobile/assets/images/welcome/slide-elderly.png`
- Create: `frontends/mobile/assets/images/welcome/slide-physio.png`
- Create: `frontends/mobile/assets/images/welcome/slide-safety.png`
- Create: `scripts/generate-brand-assets.js`

**Step 1: Write asset generator script**
Generate authentic, warm Indian healthcare photographs using the image generation pipeline for four scenarios:
1. Senior smiling warmly while verified nurse checks blood pressure at home.
2. Physiotherapist guiding knee/arm mobility exercises for recovering patient.
3. Relieved mother with calm child during gentle home health checkup.
4. Close-up portrait of verified nurse Asha Verma with uniform and ID card.

**Step 2: Run asset generation script**
Run: `node scripts/generate-brand-assets.js`
Expected: High-resolution WebP and PNG assets saved to `frontends/web/public/images/` and `frontends/mobile/assets/images/`.

**Step 3: Verify image dimensions and aspect ratios**
Run: `node -e "const fs = require('fs'); ['frontends/web/public/images/patients', 'frontends/mobile/assets/images/welcome'].forEach(d => console.log(d, fs.readdirSync(d)));"`
Expected: All required files exist and are non-empty (>50KB each).

**Step 4: Commit assets**
```bash
git add frontends/web/public/images frontends/mobile/assets/images
git commit -m "assets: add high-fidelity patient and caregiver imagery for web and mobile"
```

---

### Task 2: Build Web Social Proof & Patient Stories Components

**Files:**
- Create: `frontends/web/app/_components/PatientStories.tsx`
- Create: `frontends/web/app/_components/TrustBadgeBar.tsx`
- Create: `frontends/web/app/_components/CareGallery.tsx`
- Test: `tests/unit/web/patient-stories.test.tsx`

**Step 1: Write unit test for PatientStories component**
```typescript
import { render, screen } from '@testing-library/react';
import { PatientStories } from '@/app/_components/PatientStories';

describe('PatientStories', () => {
  it('renders verified customer testimonials with ratings and location', () => {
    render(<PatientStories />);
    expect(screen.getByText(/Stories of Care/i)).toBeInTheDocument();
    expect(screen.getByText(/Ramesh Kumar/i)).toBeInTheDocument();
    expect(screen.getByText(/C-Scheme, Jaipur/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Verified Visit/i).length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**
Run: `npm --prefix frontends/web test -- tests/unit/web/patient-stories.test.tsx`
Expected: FAIL (module not found).

**Step 3: Implement `PatientStories.tsx`, `TrustBadgeBar.tsx`, and `CareGallery.tsx`**
- `TrustBadgeBar.tsx`:
  - 4 customer micro-avatars stacked with overlap.
  - "4.9/5 from 12,500+ visits in Jaipur".
  - Partner hospital / pharmacy trust seals.
- `PatientStories.tsx`:
  - 3 rich testimonial cards with customer photo, verified badge, quote, service badge ("Post-Op Nursing", "Elderly Care", "Physiotherapy"), and star rating.
- `CareGallery.tsx`:
  - 3-column photo grid highlighting "Care at Home", "Sterile Pharmacy Supplies", and "Doorstep Vitals Monitoring" with subtle hover zoom and warm typography.

**Step 4: Run test to verify it passes**
Run: `npm --prefix frontends/web test -- tests/unit/web/patient-stories.test.tsx`
Expected: PASS.

**Step 5: Commit**
```bash
git add frontends/web/app/_components/ tests/unit/web/
git commit -m "feat(web): add PatientStories, TrustBadgeBar and CareGallery components"
```

---

### Task 3: Upgrade Web Landing Page (`frontends/web/app/page.tsx`)

**Files:**
- Modify: `frontends/web/app/page.tsx`
- Modify: `frontends/web/app/globals.css`
- Test: `tests/unit/web/landing-page.test.tsx`

**Step 1: Write unit test for upgraded landing page**
```typescript
import { render, screen } from '@testing-library/react';
import Landing from '@/app/page';

describe('Landing Page UX & Imagery', () => {
  it('renders social proof avatar bar and patient stories section', () => {
    render(<Landing />);
    expect(screen.getByText(/Trusted by 12,000\+ families/i)).toBeInTheDocument();
    expect(screen.getByText(/Real stories from real visits/i)).toBeInTheDocument();
    expect(screen.getByAltText(/Asha Verma/i)).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**
Run: `npm --prefix frontends/web test -- tests/unit/web/landing-page.test.tsx`
Expected: FAIL.

**Step 3: Update `page.tsx` and `globals.css`**
- In Hero:
  - Add `<TrustBadgeBar />` below the CTA buttons.
  - Replace abstract mockup avatar with realistic image of nurse Asha Verma (`/images/staff/nurse-asha.webp`).
  - Add photo background overlay to hero preview card showing real patient checkup moment.
- In Body:
  - Insert `<CareGallery />` right after the Service Grid.
  - Insert `<PatientStories />` right after "How It Works".
- In `globals.css`:
  - Add modern card styles, smooth hover transitions, glassmorphic badges, and avatar group CSS.

**Step 4: Run test to verify it passes**
Run: `npm --prefix frontends/web test -- tests/unit/web/landing-page.test.tsx`
Expected: PASS.

**Step 5: Commit**
```bash
git add frontends/web/app/page.tsx frontends/web/app/globals.css
git commit -m "feat(web): integrate patient photos, social proof bar and stories into landing page"
```

---

### Task 4: Build Mobile App Care Carousel (`frontends/mobile/app/welcome.tsx`)

**Files:**
- Create: `frontends/mobile/lib/WelcomeCareCarousel.tsx`
- Modify: `frontends/mobile/app/welcome.tsx`
- Modify: `frontends/mobile/lib/i18n.ts` (add Hindi & English slide strings)
- Test: `tests/unit/mobile/welcome-carousel.test.tsx`

**Step 1: Write test for WelcomeCareCarousel**
```typescript
import { render } from '@testing-library/react-native';
import { WelcomeCareCarousel } from '@/lib/WelcomeCareCarousel';

describe('WelcomeCareCarousel', () => {
  it('renders 3 care slides with patient imagery and badges', () => {
    const { getByText } = render(<WelcomeCareCarousel />);
    expect(getByText(/Elderly Care at Home/i)).toBeTruthy();
    expect(getByText(/Police verified/i)).toBeTruthy();
  });
});
```

**Step 2: Run test to verify it fails**
Run: `npm --prefix frontends/mobile test -- tests/unit/mobile/welcome-carousel.test.tsx`
Expected: FAIL.

**Step 3: Implement `WelcomeCareCarousel.tsx` and integrate into `welcome.tsx`**
- Features:
  - 3 rich slides with patient imagery:
    1. *Elderly Care*: Photo of grandmother with nurse + "Gentle nursing & vitals monitoring at home".
    2. *Rehabilitation*: Photo of physiotherapy session + "Recover comfortably without hospital visits".
    3. *Verified Safety*: Photo of nurse with ID badge + "100% Police & nursing council verified".
  - Animated pagination indicator pills with smooth width transition.
  - Auto-advance every 4.5s with user drag/touch detection to pause.
  - Floating trust pills with backdrop blur (`4.9 ★ 15,000+ visits`, `Arrives in 15 min`).
- In `welcome.tsx`:
  - Replace the static circle halo in `stage` with `<WelcomeCareCarousel />`.
  - Maintain the phone/Google/Email login buttons and exploration CTA below.

**Step 4: Run test to verify it passes**
Run: `npm --prefix frontends/mobile test -- tests/unit/mobile/welcome-carousel.test.tsx`
Expected: PASS.

**Step 5: Commit**
```bash
git add frontends/mobile/lib/WelcomeCareCarousel.tsx frontends/mobile/app/welcome.tsx frontends/mobile/lib/i18n.ts
git commit -m "feat(mobile): add animated patient care photo carousel to welcome screen"
```

---

### Task 5: End-to-End Build & Visual Regression Verification

**Files:**
- Test: `tests/e2e/landing-page-visual.spec.ts`

**Step 1: Type check Web and Mobile applications**
Run:
```bash
npm --prefix frontends/web run lint
npx --prefix frontends/web tsc --noEmit
npx --prefix frontends/mobile tsc --noEmit
```
Expected: 0 errors.

**Step 2: Run Next.js production build**
Run: `npm --prefix frontends/web run build`
Expected: Successful build with static page generation.

**Step 3: Visual inspection via browser subagent**
Capture full-page screenshot of:
- Desktop Web Landing Page (`http://localhost:3000`)
- Mobile Web Viewport (`390x844`)
- Confirm patient images load with high resolution, zero layout shift (CLS < 0.05), and correct contrast.

**Step 4: Commit and finalize**
```bash
git add .
git commit -m "chore: verify web and mobile patient imagery enhancements"
```
