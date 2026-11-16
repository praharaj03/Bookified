"use client";

import { useState } from "react";
import Link from "next/link";
import { Show, SignInButton, useAuth } from "@clerk/nextjs";
import { CheckoutButton } from "@clerk/nextjs/experimental";
import { ArrowLeft, ArrowRight, BookOpen, Check, Headphones, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLAN_LIMITS, type PlanType } from "@/lib/subscription-constants";
import type { PricingPlan } from "@/lib/pricing";
import { cn } from "@/lib/utils";

const descriptions = {
  free: { title: "Free", eyebrow: "A little curiosity goes a long way", description: "Get to know your first book in a whole new way.", audience: "For trying Bookified" },
  standard: { title: "Standard", eyebrow: "Build a reading habit", description: "Room for your reading list and everyday conversations.", audience: "For regular readers" },
  pro: { title: "Pro", eyebrow: "Go deeper, for longer", description: "A bigger library and more time to follow your curiosity.", audience: "For dedicated readers" },
};

const faqs = [
  { question: "Can I try Bookified before choosing a plan?", answer: "Yes. The demo library has two complete classics you can read, listen to with browser read-aloud, and explore with a few AI questions without signing in. Create a free account when you're ready to upload your own PDF." },
  { question: "What counts as a voice session?", answer: "A live conversation starts when you connect to the AI voice companion. Asking follow-up questions during that conversation stays within the same session. Written summaries, typed book questions, and browser read-aloud do not use your live voice session allowance." },
  { question: "When do my limits reset?", answer: "Voice session allowances reset at the start of each calendar month. The book limit is the number of uploaded books stored in your library at one time. Deleting one of your books frees a space." },
  { question: "Which book files can I upload?", answer: "Bookified supports text-based PDFs up to 50 MB. You can add your own cover, or use the first page of the PDF. Scanned books need selectable text or OCR before they can be summarized or searched." },
  { question: "How do yearly billing and cancellation work?", answer: "Yearly plans are paid once per year; the monthly equivalent is shown to make comparison easier. Checkout shows the exact total before you confirm. You can manage your subscription from your account's billing settings." },
];

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

export default function PricingPlans({ plans, currentPlan, unavailable }: { plans: PricingPlan[]; currentPlan: PlanType; unavailable: boolean }) {
  const [period, setPeriod] = useState<"month" | "annual">("month");
  const { isSignedIn, isLoaded } = useAuth();
  const hasAnnual = plans.some((plan) => plan.key !== "free" && plan.annualCents !== null && plan.annualCents > 0);
  const savings = Math.max(0, ...plans.map((plan) => plan.monthlyCents && plan.annualMonthlyCents ? Math.round((1 - plan.annualMonthlyCents / plan.monthlyCents) * 100) : 0));

  return <main className="wrapper min-h-screen pt-28 pb-20 sm:pt-32">
    <Link href="/" className="inline-flex items-center gap-2 text-sm text-[#3d485e] hover:text-[#212a3b]"><ArrowLeft className="size-4" /> Back to the library</Link>

    <section className="mx-auto mt-10 max-w-3xl text-center sm:mt-14">
      <span className="inline-flex items-center gap-2 rounded-full border border-[#212a3b]/15 bg-white/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em]"><BookOpen className="size-3.5" /> Plans for every reading rhythm</span>
      <h1 className="mt-6 font-serif text-4xl font-semibold leading-tight tracking-tight text-[#212a3b] sm:text-6xl">Your next chapter,<br /><span className="text-[#816142]">on your terms.</span></h1>
      <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-[#3d485e] sm:text-lg">Start with one book. Build a library. Make space for the conversations that help it all stay with you.</p>
      <Link href="/#demo-library" className="mt-4 inline-flex items-center gap-1 text-sm font-medium underline underline-offset-4">Explore the free demo library <ArrowRight className="size-3.5" /></Link>
    </section>

    {hasAnnual && <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
      <div className="inline-flex rounded-full border border-[#212a3b]/15 bg-[#eee7db] p-1" role="group" aria-label="Billing period">
        {(["month", "annual"] as const).map((value) => <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)} className={cn("rounded-full px-6 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2", period === value ? "bg-[#212a3b] text-white shadow-sm" : "text-[#3d485e] hover:bg-white/50")}>{value === "month" ? "Monthly" : "Yearly"}</button>)}
      </div>
      {savings > 0 && <span className="rounded-full bg-[#e3ecdf] px-3 py-1.5 text-xs font-semibold text-[#3e6040]">Save up to {savings}% yearly</span>}
    </div>}

    {unavailable && <p role="status" className="mx-auto mt-6 max-w-xl rounded-xl border border-[#212a3b]/15 bg-white p-4 text-center text-sm">Some subscription prices are temporarily unavailable. You can still start free; refresh this page to try loading paid plans again.</p>}

    <section className="mt-12 grid gap-6 lg:grid-cols-3 lg:items-stretch" aria-label="Subscription plans">
      {plans.map((plan) => {
        const copy = descriptions[plan.key];
        const limits = PLAN_LIMITS[plan.key];
        const recommended = plan.key === "standard";
        const active = isSignedIn && currentPlan === plan.key;
        const annual = period === "annual" && plan.key !== "free" && plan.annualCents !== null && plan.annualCents > 0;
        const cents = annual ? plan.annualMonthlyCents : plan.monthlyCents;
        const available = !!plan.id && cents !== null;
        return <article key={plan.key} className={cn("relative flex flex-col rounded-3xl border bg-white p-7 sm:p-8", recommended ? "border-[#212a3b] ring-1 ring-[#212a3b] shadow-[0_12px_35px_rgba(33,42,59,0.09)]" : "border-[#212a3b]/15")}>
          {recommended && <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#212a3b] px-4 py-1.5 text-xs font-semibold tracking-wide text-white">A great fit for regular readers</span>}
          <div className="flex items-center justify-between gap-2"><h2 className="font-serif text-2xl font-semibold text-[#212a3b]">{copy.title}</h2>{active && <span className="rounded-full bg-[#e8eee4] px-3 py-1 text-xs font-medium text-[#3e6040]">Your plan</span>}</div>
          <p className="mt-1 text-xs font-medium uppercase tracking-wider text-[#816142]">{copy.audience}</p>
          <p className="mt-4 min-h-12 text-sm leading-6 text-[#5a6271]">{copy.description}</p>
          <div className="mt-6 flex items-baseline gap-1.5"><span className="text-5xl font-semibold tracking-tight text-[#212a3b]">{cents === null ? "—" : money(cents, plan.currency)}</span><span className="text-sm text-[#5a6271]">/ month</span></div>
          <p className="mt-2 min-h-10 text-xs leading-5 text-[#5a6271]">{plan.key === "free" ? "Free to start. No payment details needed." : annual && plan.annualCents !== null ? `${money(plan.annualCents, plan.currency)} billed once per year.` : cents === null ? "Price is temporarily unavailable." : "Billed monthly."}</p>
          <div className="mt-5">
            {plan.key === "free" ? <Button asChild variant="outline" className="h-12 w-full rounded-xl border-[#212a3b]/25 bg-transparent font-semibold"><Link href={isSignedIn ? "/" : "/sign-up"}>{isSignedIn ? "Open your library" : "Start reading for free"}<ArrowRight className="size-4" /></Link></Button> : <>
              <Show when="signed-out"><SignInButton mode="modal" fallbackRedirectUrl="/subscriptions"><Button disabled={!isLoaded || !available} variant={recommended ? "default" : "outline"} className="h-12 w-full rounded-xl font-semibold">Choose {copy.title}<ArrowRight className="size-4" /></Button></SignInButton></Show>
              <Show when="signed-in">{active ? <Button disabled variant="outline" className="h-12 w-full rounded-xl">Current plan</Button> : available && plan.id ? <CheckoutButton planId={plan.id} planPeriod={annual ? "annual" : "month"} newSubscriptionRedirectUrl="/books/new" checkoutProps={{ appearance: { variables: { colorPrimary: "#212a3b", borderRadius: "0.75rem" } } }}><Button variant={recommended ? "default" : "outline"} className="h-12 w-full rounded-xl font-semibold">Choose {copy.title}<ArrowRight className="size-4" /></Button></CheckoutButton> : <Button disabled className="h-12 w-full rounded-xl">Currently unavailable</Button>}</Show>
            </>}
          </div>
          <div className="my-7 h-px bg-[#212a3b]/10" />
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#816142]">Your reading allowance</p>
          <ul className="mt-5 space-y-4 text-sm text-[#3d485e]">
            {[`${limits.maxBooks} ${limits.maxBooks === 1 ? "book" : "books"} in your personal library`, `${Number.isFinite(limits.maxSessionsPerMonth) ? limits.maxSessionsPerMonth : "Unlimited"} voice sessions per month`, `Up to ${limits.maxDurationPerSession} minutes per voice session`].map((feature) => <li key={feature} className="flex items-start gap-3"><Check className="mt-0.5 size-4 shrink-0 text-[#53744f]" /><span>{feature}</span></li>)}
          </ul>
          <p className="mt-7 text-xs leading-5 text-[#5a6271]">Includes AI summaries, book questions, and a reader with read-aloud controls.</p>
        </article>;
      })}
    </section>

    <section className="mt-10 rounded-2xl border border-[#212a3b]/10 bg-[#eee7db]/60 px-6 py-7" aria-label="Included with every plan">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-[#816142]">A better way to spend time with your books</p>
      <div className="mt-6 grid gap-5 text-sm font-medium text-[#3d485e] sm:grid-cols-2 lg:grid-cols-4">
        {[{ icon: Sparkles, text: "Summaries & book questions" }, { icon: BookOpen, text: "PDF uploads up to 50 MB" }, { icon: Headphones, text: "Read & listen at your pace" }, { icon: ShieldCheck, text: "A private personal library" }].map(({ icon: Icon, text }) => <div key={text} className="flex items-center justify-center gap-2.5"><Icon className="size-5 shrink-0 text-[#816142]" /><span>{text}</span></div>)}
      </div>
    </section>

    <section className="mx-auto mt-20 max-w-3xl" aria-label="Frequently asked questions">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-[#816142]">A few useful answers</p>
      <h2 className="mt-3 text-center font-serif text-3xl font-semibold text-[#212a3b] sm:text-4xl">Before you turn the page.</h2>
      <div className="mt-9 divide-y divide-[#212a3b]/15 border-y border-[#212a3b]/15">{faqs.map((faq) => <details key={faq.question} className="group py-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-5 rounded-sm text-sm font-semibold text-[#212a3b] outline-offset-4 sm:text-base [&::-webkit-details-marker]:hidden">{faq.question}<Plus className="size-4 shrink-0 transition-transform group-open:rotate-45" /></summary><p className="mt-4 pr-7 text-sm leading-7 text-[#5a6271]">{faq.answer}</p></details>)}</div>
    </section>

    <p className="mx-auto mt-12 max-w-xl text-center text-xs leading-6 text-[#5a6271]">Plan prices and billing totals are confirmed at checkout. Live voice and natural narration are subject to service availability. Your demo library is always available to explore.</p>
  </main>;
}
