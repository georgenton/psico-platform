import { Stack } from "expo-router";
import { Colors } from "@/theme";

export default function DiarioLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.warm[50] },
        headerTintColor: Colors.warm[800],
        headerTitleStyle: { fontWeight: "600", fontSize: 17 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: Colors.warm[50] },
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: "Diario", headerShown: false }}
      />
      <Stack.Screen name="[id]" options={{ title: "Entrada" }} />
    </Stack>
  );
}
