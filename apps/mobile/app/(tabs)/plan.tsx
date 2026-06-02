import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ApiError, billingApi } from "@psico/api-client";
import type { BillingInterval } from "@psico/api-client";
import type {
  InvoiceListResponse,
  PlanInfo,
  Subscription,
  UsageResponse,
  UserPlan,
} from "@psico/types";
import { useAuth } from "@/context/auth";
import { InvoicesList } from "@/components/dashboard/plan/InvoicesList";
import { SubscriptionActions } from "@/components/dashboard/plan/SubscriptionActions";
import { UsageCards } from "@/components/dashboard/plan/UsageCards";
import { Colors, Radius, Spacing } from "@/theme";

// These URLs must pass IsUrl() validation on the server.
// Stripe redirects here after checkout; actual subscription activation
// happens via webhook on the backend.
const SUCCESS_URL = "https://psico.app/upgrade/success";
const CANCEL_URL = "https://psico.app/upgrade/cancel";

const PLAN_RANK: Record<UserPlan, number> = {
  FREE: 0,
  PRO: 1,
  ANNUAL: 2,
  B2B: 3,
};

type CheckoutOption = {
  label: string;
  price: string;
  billingPlan: BillingInterval;
  highlight?: string;
};

function getCheckoutOptions(plan: PlanInfo): CheckoutOption[] {
  const options: CheckoutOption[] = [];
  if (plan.plan === "PRO") {
    if (plan.prices.monthly) {
      options.push({
        label: "Mensual",
        price: `$${plan.prices.monthly} USD/mes`,
        billingPlan: "PRO_MONTHLY",
      });
    }
    if (plan.prices.yearly) {
      options.push({
        label: "Anual",
        price: `$${plan.prices.yearly} USD/año`,
        billingPlan: "PRO_YEARLY",
        highlight: "2 meses gratis",
      });
    }
  }
  if (plan.plan === "ANNUAL" && plan.prices.yearly) {
    options.push({
      label: "Anual",
      price: `$${plan.prices.yearly} USD/año`,
      billingPlan: "PRO_YEARLY",
      highlight: "$4.92/mes",
    });
  }
  if (plan.plan === "B2B" && plan.prices.monthly) {
    options.push({
      label: "Mensual",
      price: `$${plan.prices.monthly} USD/mes`,
      billingPlan: "B2B",
    });
  }
  return options;
}

export default function PlanScreen() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [invoices, setInvoices] = useState<InvoiceListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  /**
   * Loads everything Mi Plan needs in one shot. The promises are kept
   * independent so a transient failure on /invoices doesn't blank the
   * /usage card, etc. Each catch clause swallows + sets null.
   */
  const loadAll = useCallback(async () => {
    // Sprint S11: single envolvente request — replaces the 4 parallel fetches
    // the previous screen issued (plans + me + usage + invoices). The
    // backend parallelises the same reads server-side, so the wall-clock
    // budget is identical with one quarter of the request volume + one
    // quarter of the auth round-trips.
    try {
      const plan = await billingApi.getPlan();
      setPlans(plan.plans);
      setSubscription(plan.subscription);
      setUsage(plan.usage);
      setInvoices({ invoices: plan.invoices });
    } catch {
      // Don't blank existing state on a transient failure — the user
      // probably still has the latest snapshot from the previous load.
      // The "pull to refresh" handler surfaces the error if it persists.
    }
  }, []);

  useEffect(() => {
    void loadAll().finally(() => setLoading(false));
  }, [loadAll]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadAll();
    } finally {
      setRefreshing(false);
    }
  }, [loadAll]);

  const handleUpgrade = async (billingPlan: BillingInterval) => {
    setCheckoutLoading(billingPlan);
    try {
      const session = await billingApi.createCheckoutSession(
        billingPlan,
        SUCCESS_URL,
        CANCEL_URL,
      );
      await Linking.openURL(session.url);
    } catch (err) {
      Alert.alert(
        "Error al iniciar pago",
        err instanceof ApiError
          ? err.message
          : "No se pudo conectar con el servicio de pagos.",
      );
    } finally {
      setCheckoutLoading(null);
    }
  };

  if (!user) return null;

  const userPlanRank = PLAN_RANK[user.plan];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={Colors.lavender[500]}
        />
      }
    >
      {/* Current plan banner */}
      <View style={styles.currentPlan}>
        <View style={styles.currentPlanRow}>
          <Ionicons name="diamond" size={20} color={Colors.lavender[500]} />
          <Text style={styles.currentPlanLabel}>Tu plan actual</Text>
        </View>
        <Text style={styles.currentPlanName}>
          {plans.find((p) => p.plan === user.plan)?.name ?? user.plan}
        </Text>
        <Text style={styles.currentPlanDesc}>
          {plans.find((p) => p.plan === user.plan)?.description ?? ""}
        </Text>
      </View>

      {/* Active subscription actions (cancel / reactivate / portal) */}
      {subscription ? (
        <SubscriptionActions
          subscription={subscription}
          onChanged={() => {
            void loadAll();
          }}
        />
      ) : null}

      {/* Usage cards — visible to FREE users too as a preview */}
      <UsageCards usage={usage} />

      {/* Invoices — only when sub exists; FREE has none */}
      {subscription ? <InvoicesList invoices={invoices} /> : null}

      {loading ? (
        <ActivityIndicator
          color={Colors.lavender[500]}
          style={{ marginTop: Spacing.lg }}
        />
      ) : (
        <View style={styles.planList}>
          {plans
            .filter((p) => PLAN_RANK[p.plan] > userPlanRank)
            .map((plan) => {
              const options = getCheckoutOptions(plan);
              return (
                <View key={plan.plan} style={styles.planCard}>
                  <View style={styles.planHeader}>
                    <Text style={styles.planName}>{plan.name}</Text>
                    {plan.prices.monthly ? (
                      <Text style={styles.planPrice}>
                        desde ${plan.prices.monthly}/mes
                      </Text>
                    ) : null}
                  </View>

                  <Text style={styles.planDesc}>{plan.description}</Text>

                  {/* Features */}
                  <View style={styles.features}>
                    {plan.features.map((f) => (
                      <View key={f} style={styles.featureRow}>
                        <Ionicons
                          name="checkmark"
                          size={14}
                          color={Colors.sage[500]}
                        />
                        <Text style={styles.featureText}>{f}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Checkout options */}
                  {options.length > 0 ? (
                    <View style={styles.checkoutOptions}>
                      {options.map((opt) => (
                        <Pressable
                          key={opt.billingPlan}
                          style={[
                            styles.checkoutBtn,
                            checkoutLoading === opt.billingPlan &&
                              styles.checkoutBtnLoading,
                          ]}
                          onPress={() => handleUpgrade(opt.billingPlan)}
                          disabled={checkoutLoading !== null}
                        >
                          {checkoutLoading === opt.billingPlan ? (
                            <ActivityIndicator
                              size="small"
                              color={Colors.white}
                            />
                          ) : (
                            <View style={styles.checkoutBtnInner}>
                              <View>
                                <Text style={styles.checkoutBtnLabel}>
                                  {opt.label}
                                </Text>
                                <Text style={styles.checkoutBtnPrice}>
                                  {opt.price}
                                </Text>
                              </View>
                              {opt.highlight ? (
                                <View style={styles.highlightBadge}>
                                  <Text style={styles.highlightText}>
                                    {opt.highlight}
                                  </Text>
                                </View>
                              ) : null}
                              <Ionicons
                                name="arrow-forward"
                                size={16}
                                color={Colors.white}
                              />
                            </View>
                          )}
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}

          {/* Already on best plan */}
          {plans.filter((p) => PLAN_RANK[p.plan] > userPlanRank).length ===
          0 ? (
            <View style={styles.topPlan}>
              <Ionicons name="star" size={32} color={Colors.lavender[500]} />
              <Text style={styles.topPlanTitle}>
                Estás en el mejor plan disponible
              </Text>
              <Text style={styles.topPlanSub}>
                Tienes acceso completo a todo el contenido.
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.warm[50],
  },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  currentPlan: {
    backgroundColor: Colors.lavender[500],
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  currentPlanRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  currentPlanLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.lavender[100],
  },
  currentPlanName: {
    fontSize: 26,
    fontWeight: "700",
    color: Colors.white,
  },
  currentPlanDesc: {
    fontSize: 13,
    color: Colors.lavender[200],
    lineHeight: 18,
  },
  planList: {
    gap: Spacing.md,
  },
  planCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
    shadowColor: Colors.warm[900],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  planHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  planName: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.warm[800],
  },
  planPrice: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.lavender[500],
  },
  planDesc: {
    fontSize: 14,
    color: Colors.warm[600],
    lineHeight: 20,
  },
  features: {
    gap: Spacing.xs,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.xs,
  },
  featureText: {
    flex: 1,
    fontSize: 13,
    color: Colors.warm[700],
    lineHeight: 18,
  },
  checkoutOptions: {
    gap: Spacing.sm,
  },
  checkoutBtn: {
    backgroundColor: Colors.lavender[500],
    borderRadius: Radius.md,
    padding: Spacing.md,
    minHeight: 52,
    justifyContent: "center",
  },
  checkoutBtnLoading: {
    opacity: 0.6,
  },
  checkoutBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  checkoutBtnLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.white,
  },
  checkoutBtnPrice: {
    fontSize: 12,
    color: Colors.lavender[200],
    marginTop: 2,
  },
  highlightBadge: {
    backgroundColor: Colors.sage[400],
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  highlightText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.white,
  },
  topPlan: {
    alignItems: "center",
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  topPlanTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.warm[800],
    textAlign: "center",
  },
  topPlanSub: {
    fontSize: 14,
    color: Colors.warm[500],
    textAlign: "center",
  },
});
