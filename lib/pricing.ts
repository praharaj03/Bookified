import type { PlanType } from "@/lib/subscription-constants";

export interface PricingPlan {
  key: PlanType;
  id: string | null;
  monthlyCents: number | null;
  annualCents: number | null;
  annualMonthlyCents: number | null;
  currency: string;
}
