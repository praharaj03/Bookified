"use client";

import { useAuth } from "@clerk/nextjs";
import { PLANS, PLAN_LIMITS, PlanType } from "@/lib/subscription-constants";

export const useSubscription = () => {
  const { has, isLoaded: isAuthLoaded } = useAuth();
  const isLoaded = isAuthLoaded;

  if (!isLoaded) {
    return {
      plan: PLANS.FREE,
      limits: PLAN_LIMITS[PLANS.FREE],
      isLoaded: false,
    };
  }

  let plan: PlanType = PLANS.FREE;

  // 1. First Check: Clerk's `has` helper from useAuth
  if (has?.({ plan: "pro" })) {
    plan = PLANS.PRO;
  } else if (has?.({ plan: "standard" })) {
    plan = PLANS.STANDARD;
  }

  return {
    plan,
    limits: PLAN_LIMITS[plan],
    isLoaded: true,
  };
};
