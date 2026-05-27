import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/theme";
import { useAuth } from "@/context/auth";
import { DiaryKeyProvider } from "@/crypto/diary-key-context";

type IconProps = {
  color: string;
  size: number;
};

/**
 * Tabs layout — Sprint S5-front-mobile.
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
 */
export default function TabsLayout() {
  const { user } = useAuth();
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
          name="diario"
          options={{
            title: "Diario",
            headerShown: false,
            tabBarIcon: ({ color, size }: IconProps) => (
              <Ionicons name="create" size={size} color={color} />
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
            href: null,
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
      </Tabs>
    </DiaryKeyProvider>
  );
}
