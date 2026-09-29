import { Pressable, ScrollView, Text } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { Hero } from '@/lib/Hero';
import { C, ui } from '@/lib/theme';

/** Path-lab partner area. Sample pickups and reports arrive with the lab module. */
export default function LabHome() {
  const { session, logout } = useAuth();
  if (!session) return <Redirect href="/login" />;
  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Hero tone={C.sky} eyebrow="PATH LAB PARTNER" title={`Welcome, ${session.name.split(' ')[0]}`}
        subtitle="Sample pickups, report uploads and lab orders will appear here with the lab-tests module." />
      <Text style={ui.muted}>You&apos;re signed in to the lab partner portal ({session.role}).</Text>
      <Pressable style={ui.btnOutline} onPress={logout}><Text style={ui.btnOutlineText}>Log out</Text></Pressable>
    </ScrollView>
  );
}
