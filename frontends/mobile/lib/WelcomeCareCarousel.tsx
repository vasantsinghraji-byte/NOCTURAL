import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { BadgeCheck, Clock3, Heart, ShieldCheck } from 'lucide-react-native';
import { C, F } from './theme';
import { tap } from './motion';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CAROUSEL_WIDTH = Math.min(SCREEN_WIDTH - 44, 400);

export interface CareSlide {
  id: string;
  image: any;
  title: string;
  subtitle: string;
  tag: string;
  badge1: { icon: any; text: string; color: string };
  badge2: { icon: any; text: string; color: string };
}

const SLIDES: CareSlide[] = [
  {
    id: 'elderly',
    image: require('../assets/images/welcome/slide-elderly.jpg'),
    title: 'Elderly care at home',
    subtitle: 'Gentle nursing and vitals checks for your parents',
    tag: 'Home Nursing',
    badge1: { icon: Clock3, text: 'Book now or schedule', color: C.mint },
    badge2: { icon: BadgeCheck, text: 'Pay after the visit', color: C.gold }
  },
  {
    id: 'physio',
    image: require('../assets/images/welcome/slide-physio.jpg'),
    title: 'Guided rehabilitation',
    subtitle: 'Recover joint mobility comfortably without hospital visits',
    tag: 'Physiotherapy',
    badge1: { icon: Heart, text: 'Pain relief & mobility', color: C.rose },
    badge2: { icon: ShieldCheck, text: 'Qualified physios', color: C.gold }
  },
  {
    id: 'safety',
    image: require('../assets/images/welcome/slide-safety.jpg'),
    title: 'Verified professionals',
    subtitle: 'ID, council and police checked before their first visit',
    tag: 'Safety Verified',
    badge1: { icon: ShieldCheck, text: 'Police verified', color: C.mint },
    badge2: { icon: BadgeCheck, text: '4-digit visit code', color: C.gold }
  }
];

export function WelcomeCareCarousel() {
  const [index, setIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const isInteracting = useRef(false);

  // Auto-advance slides every 4 seconds unless interacting
  useEffect(() => {
    const timer = setInterval(() => {
      if (isInteracting.current) return;
      goToSlide((index + 1) % SLIDES.length);
    }, 4200);

    return () => clearInterval(timer);
  }, [index]);

  function goToSlide(nextIndex: number) {
    Animated.timing(fadeAnim, {
      toValue: 0.15,
      duration: 160,
      useNativeDriver: true
    }).start(() => {
      setIndex(nextIndex);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 240,
        useNativeDriver: true
      }).start();
    });
  }

  function handleNext() {
    tap();
    goToSlide((index + 1) % SLIDES.length);
  }

  function handlePrev() {
    tap();
    goToSlide((index - 1 + SLIDES.length) % SLIDES.length);
  }

  const slide = SLIDES[index];
  const Badge1Icon = slide.badge1.icon;
  const Badge2Icon = slide.badge2.icon;

  return (
    <View style={styles.container}>
      <Pressable
        onPressIn={() => {
          isInteracting.current = true;
        }}
        onPressOut={() => {
          isInteracting.current = false;
        }}
        onPress={handleNext}
        style={styles.card}
      >
        <Animated.View style={[styles.imageWrap, { opacity: fadeAnim }]}>
          <Image source={slide.image} style={styles.image} resizeMode="cover" />

          {/* Dark gradient overlay for text readability */}
          <View style={styles.overlay} />

          {/* Service Tag */}
          <View style={styles.tag}>
            <Text style={styles.tagText}>{slide.tag}</Text>
          </View>

          {/* Floating Badge 1 (Top Right) */}
          <View style={[styles.floatBadge, styles.floatTop]}>
            <View style={styles.badgeIconWrap}>
              <Badge1Icon size={13} color={slide.badge1.color} />
            </View>
            <Text style={styles.badgeText}>{slide.badge1.text}</Text>
          </View>

          {/* Floating Badge 2 (Bottom Right) */}
          <View style={[styles.floatBadge, styles.floatBottom]}>
            <View style={styles.badgeIconWrap}>
              <Badge2Icon size={13} color={slide.badge2.color} />
            </View>
            <Text style={styles.badgeText}>{slide.badge2.text}</Text>
          </View>

          {/* Slide Captions */}
          <View style={styles.captionArea}>
            <Text style={styles.slideTitle}>{slide.title}</Text>
            <Text style={styles.slideSub}>{slide.subtitle}</Text>
          </View>
        </Animated.View>
      </Pressable>

      {/* Pagination Indicator Pills */}
      <View style={styles.pagination}>
        {SLIDES.map((s, i) => (
          <Pressable
            key={s.id}
            hitSlop={8}
            onPress={() => {
              tap();
              goToSlide(i);
            }}
            style={[styles.dot, i === index ? styles.dotActive : styles.dotInactive]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 8
  },
  card: {
    width: CAROUSEL_WIDTH,
    height: 236,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 8
  },
  imageWrap: {
    width: '100%',
    height: '100%',
    position: 'relative'
  },
  image: {
    width: '100%',
    height: '100%'
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 12, 18, 0.42)'
  },
  tag: {
    position: 'absolute',
    top: 12,
    left: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)'
  },
  tagText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: F.bold,
    letterSpacing: 0.3
  },
  floatBadge: {
    position: 'absolute',
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(20, 16, 24, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)'
  },
  floatTop: {
    top: 12
  },
  floatBottom: {
    bottom: 58
  },
  badgeIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  badgeText: {
    color: C.onNight,
    fontFamily: F.bold,
    fontSize: 11
  },
  captionArea: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12
  },
  slideTitle: {
    color: '#ffffff',
    fontFamily: F.display,
    fontSize: 22,
    lineHeight: 25,
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3
  },
  slideSub: {
    color: 'rgba(255, 255, 255, 0.88)',
    fontFamily: F.medium,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10
  },
  dot: {
    height: 5,
    borderRadius: 3
  },
  dotActive: {
    width: 22,
    backgroundColor: C.gold
  },
  dotInactive: {
    width: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.22)'
  }
});
