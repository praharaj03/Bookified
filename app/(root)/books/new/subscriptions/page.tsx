import { clerkClient } from "@clerk/nextjs/server";
import PricingPlans from "@/components/PricingPlans";
import { getUserPlan } from "@/lib/subscription.server";
import type { PricingPlan } from "@/lib/pricing";
import { PLANS } from "@/lib/subscription-constants";

export const metadata = { title: "Plans & Pricing | Bookified", description: "Compare Bookified Free, Standard, and Pro. Choose the right library size and voice conversation allowance for your reading routine." };

export default async function SubscriptionsPage() {
  const currentPlan = await getUserPlan();
  let plans: PricingPlan[] = Object.values(PLANS).map((key) => ({ key, id: null, monthlyCents: key === "free" ? 0 : null, annualCents: null, annualMonthlyCents: null, currency: "USD" }));
  let unavailable = false;
  try {
    const client = await clerkClient();
    const result = await client.billing.getPlanList({ payerType: "user", limit: 100 });
    plans = plans.map((plan) => {
      const configured = result.data.find((item) => item.publiclyVisible && (plan.key === "free" ? item.isDefault : item.slug === plan.key));
      if (!configured) return plan;
      return { key: plan.key, id: configured.id, monthlyCents: configured.fee.amount, annualCents: configured.annualFee?.amount ?? null, annualMonthlyCents: configured.annualMonthlyFee?.amount ?? null, currency: configured.fee.currency || "USD" };
    });
    unavailable = plans.some((plan) => plan.key !== "free" && !plan.id);
  } catch {
    unavailable = true;
  }
  return <PricingPlans plans={plans} currentPlan={currentPlan} unavailable={unavailable} />;
}
