import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';

/** English / Hindi. Keys fall back to English when a Hindi string is missing. */
export type Lang = 'en' | 'hi';

const EN = {
  // Welcome & sign-in
  'welcome.kicker': 'Jaipur · home healthcare',
  'welcome.title': 'Care that\ncomes home.',
  'welcome.sub': 'Verified nurses at your door in minutes. Medicines from pharmacies near you.',
  'welcome.phone': 'Continue with phone',
  'welcome.google': 'Continue with Google',
  'welcome.email': 'Sign in with email',
  'welcome.explore': 'Explore first',
  'welcome.partner': 'Nurse, pharmacy or lab?',
  'welcome.partnerCta': 'Join Nabz Partner',
  'welcome.terms': 'By continuing you agree to the Terms and Privacy Policy.',
  'phone.title': 'Your mobile number',
  'phone.sub': 'We’ll send a 6-digit code by SMS.',
  'phone.send': 'Send code',
  'phone.codeTitle': 'Enter the code',
  'phone.codeSub': 'Sent to +91 {phone}',
  'phone.verify': 'Verify',
  'phone.resend': 'Resend code',
  'phone.resendIn': 'Resend in {s}s',
  'profile.title': 'Almost there',
  'profile.sub': 'Tell us who we’re caring for.',
  'profile.name': 'Full name',
  'profile.email': 'Email (for receipts)',
  'profile.done': 'Start using Nabz',
  // Home
  'home.hi': 'Hi {name}',
  'home.careAt': 'Care at',
  'home.live': 'Live location',
  'home.search': 'Search injections, dressing, physio…',
  'home.online': '{n} verified staff online near you',
  'home.offline': 'No staff online nearby. Schedule and we’ll assign one.',
  'home.bookNow': 'Book now',
  'home.schedule': 'Schedule',
  'home.upcoming': 'Your visit',
  'home.track': 'Track',
  'home.bookAgain': 'Book again',
  'home.packages': 'Care packages',
  'home.popular': 'Popular in Jaipur',
  'home.book': 'Book {service}',
  'home.services': 'Services',
  // Matching & tracking
  'find.title': 'Finding your nurse',
  'find.sub': 'Asking the nearest verified professionals. Usually under a minute.',
  'find.attempt': 'Asked {n} nearby',
  'find.none': 'Everyone nearby is busy',
  'find.noneSub': 'Schedule a visit and we’ll assign the next available professional.',
  'match.title': '{name} is coming',
  'match.code': 'Visit code',
  'match.codeHint': 'Share only when they arrive. They need it to start.',
  'match.call': 'Call',
  'match.share': 'Share',
  'match.sos': 'SOS',
  'match.eta': 'ETA',
  'match.away': 'Away',
  'rate.title': 'How was your visit?',
  'rate.submit': 'Submit rating',
  'rate.thanks': 'Thank you. Your feedback helps us keep care safe.',
  // Tabs & account
  'tab.home': 'Home',
  'tab.pharmacy': 'Pharmacy',
  'tab.bookings': 'Bookings',
  'tab.account': 'Account',
  'account.language': 'Language',
  'account.languageDesc': 'English / हिन्दी',
  'common.cancel': 'Cancel',
  'common.continue': 'Continue',
  'common.back': 'Back'
};

type Key = keyof typeof EN;

const HI: Partial<Record<Key, string>> = {
  'welcome.kicker': 'जयपुर · घर पर स्वास्थ्य सेवा',
  'welcome.title': 'देखभाल,\nआपके घर तक।',
  'welcome.sub': 'मिनटों में सत्यापित नर्स आपके दरवाज़े पर। पास की फ़ार्मेसी से दवाइयाँ।',
  'welcome.phone': 'फ़ोन नंबर से जारी रखें',
  'welcome.google': 'Google से जारी रखें',
  'welcome.email': 'ईमेल से साइन इन करें',
  'welcome.explore': 'पहले देखें',
  'welcome.partner': 'नर्स, फ़ार्मेसी या लैब?',
  'welcome.partnerCta': 'Nabz Partner से जुड़ें',
  'welcome.terms': 'जारी रखकर आप नियम और गोपनीयता नीति से सहमत होते हैं।',
  'phone.title': 'आपका मोबाइल नंबर',
  'phone.sub': 'हम SMS से 6 अंकों का कोड भेजेंगे।',
  'phone.send': 'कोड भेजें',
  'phone.codeTitle': 'कोड दर्ज करें',
  'phone.codeSub': '+91 {phone} पर भेजा गया',
  'phone.verify': 'सत्यापित करें',
  'phone.resend': 'कोड फिर भेजें',
  'phone.resendIn': '{s} सेकंड में फिर भेजें',
  'profile.title': 'बस एक कदम',
  'profile.sub': 'बताइए हम किसकी देखभाल कर रहे हैं।',
  'profile.name': 'पूरा नाम',
  'profile.email': 'ईमेल (रसीद के लिए)',
  'profile.done': 'Nabz शुरू करें',
  'home.hi': 'नमस्ते {name}',
  'home.careAt': 'देखभाल का पता',
  'home.live': 'लाइव लोकेशन',
  'home.search': 'इंजेक्शन, ड्रेसिंग, फ़िज़ियो खोजें…',
  'home.online': 'आपके पास {n} सत्यापित स्टाफ़ ऑनलाइन',
  'home.offline': 'अभी पास में कोई ऑनलाइन नहीं। समय तय करें, हम स्टाफ़ भेजेंगे।',
  'home.bookNow': 'अभी बुक करें',
  'home.schedule': 'समय तय करें',
  'home.upcoming': 'आपकी विज़िट',
  'home.track': 'ट्रैक करें',
  'home.bookAgain': 'फिर से बुक करें',
  'home.packages': 'केयर पैकेज',
  'home.popular': 'जयपुर में लोकप्रिय',
  'home.book': '{service} बुक करें',
  'home.services': 'सेवाएँ',
  'find.title': 'आपकी नर्स ढूँढ रहे हैं',
  'find.sub': 'पास के सत्यापित प्रोफ़ेशनल से पूछ रहे हैं। आमतौर पर एक मिनट से कम।',
  'find.attempt': 'पास के {n} से पूछा',
  'find.none': 'पास के सभी व्यस्त हैं',
  'find.noneSub': 'विज़िट का समय तय करें, हम अगला उपलब्ध प्रोफ़ेशनल भेजेंगे।',
  'match.title': '{name} आ रही हैं',
  'match.code': 'विज़िट कोड',
  'match.codeHint': 'पहुँचने पर ही बताएँ। शुरू करने के लिए ज़रूरी है।',
  'match.call': 'कॉल',
  'match.share': 'शेयर',
  'match.sos': 'SOS',
  'match.eta': 'पहुँचने का समय',
  'match.away': 'दूरी',
  'rate.title': 'विज़िट कैसी रही?',
  'rate.submit': 'रेटिंग भेजें',
  'rate.thanks': 'धन्यवाद। आपकी राय से देखभाल सुरक्षित रहती है।',
  'tab.home': 'होम',
  'tab.pharmacy': 'फ़ार्मेसी',
  'tab.bookings': 'बुकिंग',
  'tab.account': 'खाता',
  'account.language': 'भाषा',
  'account.languageDesc': 'English / हिन्दी',
  'common.cancel': 'रद्द करें',
  'common.continue': 'जारी रखें',
  'common.back': 'वापस'
};

const LANG_KEY = 'nabz.lang';

interface LangState { lang: Lang; setLang: (l: Lang) => void; t: (key: Key, vars?: Record<string, string | number>) => string }
const LangContext = createContext<LangState | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  useEffect(() => {
    SecureStore.getItemAsync(LANG_KEY).then((v) => { if (v === 'hi' || v === 'en') setLangState(v); }).catch(() => undefined);
  }, []);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    SecureStore.setItemAsync(LANG_KEY, l).catch(() => undefined);
  }, []);
  const t = useCallback((key: Key, vars?: Record<string, string | number>) => {
    let s = (lang === 'hi' && HI[key]) || EN[key] || key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  }, [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useT() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useT must be used inside <LangProvider>');
  return ctx;
}
