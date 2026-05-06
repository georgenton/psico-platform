import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Colors } from "@/theme";

// Transient screen while AuthGate decides the initial route.
export default function Index() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.lavender[500]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.warm[50],
  },
});
