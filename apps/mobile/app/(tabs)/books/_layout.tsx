import { Stack } from "expo-router";
import { Colors } from "@/theme";

export default function BooksLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.lavender[50] },
        headerTintColor: Colors.warm[800],
        headerTitleStyle: { fontWeight: "600", fontSize: 17 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: Colors.warm[50] },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Biblioteca" }} />
      <Stack.Screen name="[slug]" options={{ title: "Libro" }} />
    </Stack>
  );
}
