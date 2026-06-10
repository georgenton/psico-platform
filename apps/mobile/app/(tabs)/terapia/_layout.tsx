import { Stack } from "expo-router";
import { Colors } from "@/theme";

export default function TerapiaLayout() {
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
      <Stack.Screen name="index" options={{ title: "Terapia" }} />
      <Stack.Screen
        name="terapeutas/index"
        options={{ title: "Terapeutas", headerBackTitle: "Atrás" }}
      />
      <Stack.Screen
        name="terapeutas/[id]"
        options={{ title: "Terapeuta", headerBackTitle: "Atrás" }}
      />
      <Stack.Screen
        name="sesiones/index"
        options={{ title: "Mis sesiones", headerBackTitle: "Atrás" }}
      />
      <Stack.Screen
        name="sesiones/[id]"
        options={{ title: "Sesión", headerBackTitle: "Atrás" }}
      />
      <Stack.Screen
        name="crisis"
        options={{ title: "Apoyo inmediato", headerBackTitle: "Atrás" }}
      />
    </Stack>
  );
}
