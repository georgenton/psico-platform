import { useEffect, useState } from "react";
import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { apiClient } from "@psico/api-client";
import type { UserMeResponse } from "@psico/types";
import { Colors } from "@/theme";
import { useAuth } from "@/context/auth";
import { DiaryKeyProvider } from "@/crypto/diary-key-context";
import { TourOverlay } from "@/components/TourOverlay";

type IconProps = {
  color: string;
  size: number;
};

/**
 * Tabs layout — Sprint S5-front-mobile + S4-front-onboarding.
 *
 * Sidebar parity with web: Inicio · Biblioteca · Diario · Mi plan.
 * The profile + security screens exist but are hidden from the tabbar;
 * deep links keep working.
 *
 * Sprint seed-and-password-rekey: DiaryKeyProvider is mounted here (above
 * the diario screen) so the unlock state survives navigation across tabs.
 * The security screen specifically needs the in-memory master key to
 * perform the password-change-with-rekey, and we don't want to force the
 * user to lock+unlock just to get there.
 *
 * Sprint S4-front-onboarding: gate on the user's onboarding state. We hit
 * /api/user/me on mount and redirect to /onboarding if neither
 * `completedAt` nor `skippedAt` is set. We render a loading spinner
 * during the network call so the user never sees the tabbar before the
 * decision is made.
 */
export default function TabsLayout() {
  const { user } = useAuth();
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  // Sprint S37: mirrors the web logic — show the tour overlay once for
  // users who finished onboarding but never saw it.
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiClient
      .get<UserMeResponse>("/user/me")
      .then((me) => {
        if (cancelled) return;
        const s = me.onboardingState;
        setOnboardingDone(Boolean(s?.completedAt || s?.skippedAt));
        setShowTour(Boolean(s?.completedAt && !s?.tourCompletedAt));
      })
      .catch(() => {
        // Network failure — assume done so the user isn't trapped.
        // The next /user/me fetch (any other screen) will correct it.
        if (!cancelled) {
          setOnboardingDone(true);
          setShowTour(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (onboardingDone === null) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: Colors.warm[50],
        }}
      >
        <ActivityIndicator color={Colors.lavender[500]} />
      </View>
    );
  }

  if (!onboardingDone) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <DiaryKeyProvider cryptoSalt={user?.cryptoSalt ?? null}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: Colors.lavender[500],
          tabBarInactiveTintColor: Colors.warm[400],
          tabBarStyle: {
            backgroundColor: Colors.white,
            borderTopColor: Colors.warm[200],
            borderTopWidth: 1,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "600",
          },
          headerStyle: {
            backgroundColor: Colors.warm[50],
          },
          headerTintColor: Colors.warm[800],
          headerTitleStyle: {
            fontWeight: "600",
            fontSize: 17,
          },
          headerShadowVisible: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Inicio",
            headerShown: false,
            tabBarIcon: ({ color, size }: IconProps) => (
              <Ionicons name="home" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="books"
          options={{
            title: "Libros",
            headerShown: false,
            tabBarIcon: ({ color, size }: IconProps) => (
              <Ionicons name="library" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="reflexiones"
          options={{
            title: "Reflexiones",
            headerShown: false,
            tabBarIcon: ({ color, size }: IconProps) => (
              <Ionicons name="create" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="eco"
          options={{
            title: "Eco",
            headerShown: false,
            tabBarIcon: ({ color, size }: IconProps) => (
              <Ionicons name="leaf" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="terapia"
          options={{
            title: "Terapia",
            headerShown: false,
            tabBarIcon: ({ color, size }: IconProps) => (
              <Ionicons name="chatbubbles" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="patrones"
          options={{
            title: "Patrones",
            tabBarIcon: ({ color, size }: IconProps) => (
              <Ionicons name="stats-chart" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="plan"
          options={{
            title: "Mi plan",
            tabBarIcon: ({ color, size }: IconProps) => (
              <Ionicons name="diamond" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Perfil",
            tabBarIcon: ({ color, size }: IconProps) => (
              <Ionicons name="person" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="security"
          options={{
            href: null,
            title: "Seguridad",
            tabBarIcon: ({ color, size }: IconProps) => (
              <Ionicons name="shield" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="notifications"
          options={{
            href: null,
            title: "Notificaciones",
            tabBarIcon: ({ color, size }: IconProps) => (
              <Ionicons name="notifications" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="voz"
          options={{
            href: null,
            title: "Voz",
            tabBarIcon: ({ color, size }: IconProps) => (
              <Ionicons name="mic" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="mapa"
          options={{
            href: null,
            title: "Mi Mapa Emocional",
            tabBarIcon: ({ color, size }: IconProps) => (
              <Ionicons name="compass" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="evolucion"
          options={{
            href: null,
            title: "Mi Evolución",
            tabBarIcon: ({ color, size }: IconProps) => (
              <Ionicons name="trending-up" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="exploraciones"
          options={{
            href: null,
            title: "Exploraciones",
            tabBarIcon: ({ color, size }: IconProps) => (
              <Ionicons name="compass" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
      {showTour ? <TourOverlay onClose={() => setShowTour(false)} /> : null}
    </DiaryKeyProvider>
  );
}
