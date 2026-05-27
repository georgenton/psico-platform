import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/theme";

type IconProps = {
  color: string;
  size: number;
};

/**
 * Tabs layout — Sprint S5-front-mobile.
 *
 * Sidebar parity with web: Inicio · Biblioteca · Diario · Mi plan.
 * The profile screen still exists but is hidden from the tabbar until the
 * Users UI lands; deep links to `/profile` keep working.
 */
export default function TabsLayout() {
  return (
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
    </Tabs>
  );
}
