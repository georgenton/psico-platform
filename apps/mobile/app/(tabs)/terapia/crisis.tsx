import { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { terapiaApi } from "@psico/api-client";
import {
  CRISIS_COUNTRIES,
  CRISIS_COUNTRY_NAMES,
  CRISIS_DEFAULT_COUNTRY,
  crisisCheckedOn,
  crisisDirectory,
  dialableHotline,
  getCrisisFor,
  isCrisisCountry,
  type CrisisCountry,
  type CrisisLine,
  type CrisisResponse,
  type CrisisSource,
} from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * Ayuda inmediata (móvil). Sale del catálogo compartido, así que se ve al
 * instante y sin red. La respuesta de la API la sustituye si llega: es la que
 * se puede corregir sin publicar otra versión de la aplicación.
 *
 * Sólo se acepta si cada línea trae su fuente. Una API anterior a la fuente
 * común no la manda, y lo que servía son los números que se retiraron.
 */
function utilizable(res: CrisisResponse, pais: CrisisCountry): boolean {
  return res.country === pais && res.lines.every((l) => l.source);
}

export default function CrisisScreen() {
  const params = useLocalSearchParams<{ pais?: string }>();
  const [pais, setPais] = useState<CrisisCountry>(
    isCrisisCountry(params.pais) ? params.pais : CRISIS_DEFAULT_COUNTRY,
  );
  const [servida, setServida] = useState<CrisisResponse | null>(null);

  // Una pestaña sigue montada: si se vuelve a ella con otro país, manda ése.
  useEffect(() => {
    if (isCrisisCountry(params.pais)) setPais(params.pais);
  }, [params.pais]);

  useEffect(() => {
    let cancelled = false;
    setServida(null);
    terapiaApi
      .getCrisis(pais)
      .then((res) => {
        if (!cancelled && utilizable(res, pais)) setServida(res);
      })
      .catch(() => {
        // Sin red se queda la del paquete, que ya está en pantalla.
      });
    return () => {
      cancelled = true;
    };
  }, [pais]);

  const data = servida ?? getCrisisFor(pais);
  const directorio = crisisDirectory();

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.intro}>
        <Text style={styles.h1} accessibilityRole="header">
          Ayuda inmediata
        </Text>
        <Text style={styles.introBody}>
          Buscar ayuda está bien. Aquí tienes recursos por país, con la fuente
          de cada uno.
        </Text>
        <Text style={[styles.introBody, styles.introAviso]}>
          FeelVerse no es un servicio de emergencias. Si tú u otra persona están
          en peligro inmediato, llama ahora al número de emergencias de tu país.
        </Text>
      </View>

      <Text style={styles.sectionLabel}>
        Líneas en {CRISIS_COUNTRY_NAMES[pais]}
      </Text>
      <View style={styles.paises}>
        {CRISIS_COUNTRIES.map((codigo) => (
          <Pressable
            key={codigo}
            onPress={() => setPais(codigo)}
            accessibilityRole="button"
            accessibilityState={{ selected: codigo === pais }}
            style={[styles.pais, codigo === pais && styles.paisActivo]}
          >
            <Text style={styles.paisTexto}>
              {codigo === pais ? "✓ " : ""}
              {CRISIS_COUNTRY_NAMES[codigo]}
            </Text>
          </Pressable>
        ))}
      </View>

      {data.lines.length > 0 ? (
        data.lines.map((linea) => <Linea key={linea.id} linea={linea} />)
      ) : (
        <Text style={styles.bulletText}>
          Ahora no tenemos una línea comprobada en {CRISIS_COUNTRY_NAMES[pais]}.
        </Text>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Mientras tanto</Text>
        {data.safetyTipsShort.map((t, i) => (
          <View key={i} style={styles.bulletRow}>
            <Text style={styles.bulletDot}>•</Text>
            <Text style={styles.bulletText}>{t}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Próximos pasos</Text>
        {data.nextSteps.map((t, i) => (
          <View key={i} style={styles.bulletRow}>
            <Text style={styles.bulletDot}>{i + 1}.</Text>
            <Text style={styles.bulletText}>{t}</Text>
          </View>
        ))}
      </View>

      {directorio ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Si estás en otro país</Text>
          <Text style={styles.bulletText}>
            Puedes buscar una línea cercana aquí. {directorio.note}
          </Text>
          <Pressable
            onPress={() => void Linking.openURL(directorio.url)}
            accessibilityRole="link"
            style={styles.enlace}
          >
            <Text style={styles.enlaceTexto}>{directorio.name}</Text>
          </Pressable>
          <Fuente fuente={directorio.source} />
        </View>
      ) : null}
    </ScrollView>
  );
}

async function llamar(marcable: string) {
  const url = `tel:${marcable}`;
  const can = await Linking.canOpenURL(url);
  if (!can) {
    Alert.alert("No disponible", "Tu dispositivo no puede hacer llamadas.");
    return;
  }
  await Linking.openURL(url);
}

async function abrirWhatsApp(num: string) {
  await Linking.openURL(`https://wa.me/${num.replace(/[^0-9]/g, "")}`);
}

function Linea({ linea }: { linea: CrisisLine }) {
  // Con el mismo criterio que la Web y los avisos de Eco: quitar a mano lo que
  // no sea dígito junta una opción o una mnemotecnia con el número.
  const marcable = dialableHotline(linea.phone);

  return (
    <View style={styles.lineCard}>
      <Text style={styles.lineName}>{linea.name}</Text>
      <Text style={styles.lineMeta}>
        {linea.availability} · {linea.languages.join(", ")}
      </Text>
      {linea.notes?.map((nota) => (
        <Text key={nota} style={styles.lineMeta}>
          {nota}
        </Text>
      ))}
      <View style={styles.ctaRow}>
        {marcable ? (
          <Pressable
            onPress={() => void llamar(marcable)}
            accessibilityRole="button"
            style={styles.callButton}
          >
            <Ionicons name="call" size={16} color={Colors.white} />
            <Text style={styles.callButtonText}>Llamar {linea.phone}</Text>
          </Pressable>
        ) : (
          // Sin forma marcable no se finge un botón que marca.
          <Text style={styles.lineName}>Llama al {linea.phone}</Text>
        )}
        {linea.whatsapp ? (
          <Pressable
            onPress={() => void abrirWhatsApp(linea.whatsapp!)}
            style={styles.outlineButton}
          >
            <Ionicons name="logo-whatsapp" size={14} color={Colors.sage[700]} />
            <Text style={styles.outlineButtonText}>WhatsApp</Text>
          </Pressable>
        ) : null}
      </View>
      {linea.source ? <Fuente fuente={linea.source} /> : null}
    </View>
  );
}

function Fuente({ fuente }: { fuente: CrisisSource }) {
  return (
    <Text style={styles.fuente}>
      Fuente:{" "}
      <Text
        onPress={() => void Linking.openURL(fuente.url)}
        accessibilityRole="link"
        style={styles.fuenteEnlace}
      >
        {fuente.label}
      </Text>{" "}
      · comprobado el {crisisCheckedOn(fuente)}
    </Text>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl * 2,
    backgroundColor: Colors.warm[50],
  },
  intro: {
    backgroundColor: Colors.rose[50],
    borderColor: Colors.rose[200],
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  h1: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.rose[700],
    marginBottom: Spacing.xs,
  },
  introBody: {
    fontSize: 14,
    color: Colors.rose[700],
    lineHeight: 20,
  },
  introAviso: { marginTop: Spacing.sm, fontWeight: "600" },
  paises: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  pais: {
    minHeight: 44,
    justifyContent: "center",
    backgroundColor: Colors.white,
    borderColor: Colors.warm[200],
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
  },
  paisActivo: { borderColor: Colors.rose[600] },
  paisTexto: { fontSize: 14, fontWeight: "600", color: Colors.warm[900] },
  fuente: { fontSize: 12, color: Colors.warm[600], marginTop: Spacing.sm },
  fuenteEnlace: { textDecorationLine: "underline" },
  enlace: { minHeight: 44, justifyContent: "center" },
  enlaceTexto: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.lavender[700],
    textDecorationLine: "underline",
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: Colors.warm[500],
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  lineCard: {
    backgroundColor: Colors.white,
    borderColor: Colors.warm[200],
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  lineName: { fontSize: 15, fontWeight: "600", color: Colors.warm[900] },
  lineMeta: {
    fontSize: 12,
    color: Colors.warm[500],
    marginTop: 2,
  },
  ctaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  callButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.rose[600],
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  callButtonText: { fontSize: 13, color: Colors.white, fontWeight: "600" },
  outlineButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    borderColor: Colors.sage[300],
    borderWidth: 1.5,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  outlineButtonText: {
    fontSize: 12,
    color: Colors.sage[700],
    fontWeight: "600",
  },
  section: {
    backgroundColor: Colors.white,
    borderColor: Colors.warm[200],
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  bulletRow: {
    flexDirection: "row",
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  bulletDot: { fontSize: 13, color: Colors.warm[500], width: 20 },
  bulletText: {
    flex: 1,
    fontSize: 13,
    color: Colors.warm[700],
    lineHeight: 20,
  },
});
