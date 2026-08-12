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
      {/* The canonical reader: a book and a chapter's stable identity. */}
      <Stack.Screen
        name="[slug]/lector/[kind]/[id]"
        options={{ title: "Lector", headerBackTitle: "Volver" }}
      />
      {/* The positional route old links still use. It redirects rather than
          renders, so it never shows a header of its own. */}
      <Stack.Screen
        name="[slug]/lector/[chapterOrder]"
        options={{ headerShown: false }}
      />
    </Stack>
  );
}
