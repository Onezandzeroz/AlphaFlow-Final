'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { useAuthStore } from '@/lib/auth-store';
import { tierToFrontendPlanId, type PlanTier } from '@/lib/plan-features';
import { useSubscriptionPlansStore } from '@/lib/subscription-plans-store';
import { useAccessCacheStore } from '@/hooks/use-write-access-guard';
import { hasAccess } from '@/lib/tokenpay';
import {
  X,
  ArrowRight,
  ShieldCheck,
  Lock,
  Check,
  Zap,
  Gift,
  Star,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { openFrisbiiOverlay, isMockSession } from '@/lib/frisbii-checkout';
import { MockCheckoutDialog } from '@/components/payment/mock-checkout-dialog';
import { toast } from 'sonner';

// ─── Plan definitions ──────────────────────────────────────────────────

interface PlanFeature {
  da: string;
  en: string;
}

interface Plan {
  id: string;
  name: string;
  priceDa: string;
  priceEn: string;
  priceUnitDa?: string;
  priceUnitEn?: string;
  savingsDa?: string;
  savingsEn?: string;
  descDa: string;
  descEn: string;
  features: PlanFeature[];
  /** Small label shown above the features list (e.g. "Basis funktioner", "Udover Gratis"). */
  includesLabelDa?: string;
  includesLabelEn?: string;
  limitDa?: string;
  limitEn?: string;
  bindDa: string;
  bindEn: string;
  ctaDa: string;
  ctaEn: string;
  isFree?: boolean;
}

const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Gratis',
    priceDa: '0 kr.',
    priceEn: '0 kr.',
    priceUnitDa: 'Årlig omsætning < 50.000 kr.',
    priceUnitEn: 'Annual revenue < 50,000 DKK',
    descDa: 'Kom i gang — ingen omkostninger',
    descEn: 'Get started — no cost',
    includesLabelDa: 'Basis funktioner',
    includesLabelEn: 'Basic features',
    features: [
      { da: 'Alle grundlæggende regnskabsfunktioner', en: 'All basic accounting functions' },
      { da: 'E-fakturering (manuel XML-download)', en: 'E-invoicing (manual XML download)' },
      { da: 'Bankintegration (demo-tilstand)', en: 'Bank integration (demo mode)' },
    ],
    limitDa: '',
    limitEn: '',
    bindDa: 'Ingen binding',
    bindEn: 'No commitment',
    ctaDa: 'Prøv gratis nu',
    ctaEn: 'Try free now',
    isFree: true,
  },
  {
    id: 'monthly',
    name: 'Månedlig',
    priceDa: '199 kr./md.',
    priceEn: '199 kr./mo.',
    priceUnitDa: 'Ingen omsætningsgrænse',
    priceUnitEn: 'No revenue limit',
    descDa: 'Fleksibelt — ingen binding',
    descEn: 'Flexible — no commitment',
    includesLabelDa: 'Udover Gratis',
    includesLabelEn: 'In addition to Free',
    features: [
      { da: 'Ubegrænset omsætning', en: 'Unlimited revenue' },
      { da: 'Avancerede rapporter (cash flow, aldersopdeling, budget vs. actual)', en: 'Advanced reports (cash flow, aging, budget vs. actual)' },
      { da: 'Eksport af alle data (CSV, PDF)', en: 'Export all data (CSV, PDF)' },
    ],
    bindDa: 'Ingen binding',
    bindEn: 'No commitment',
    ctaDa: 'Vælg månedlig',
    ctaEn: 'Choose monthly',
  },
  {
    id: 'annual',
    name: 'Pro',
    priceDa: '169 kr./md.',
    priceEn: '169 kr./mo.',
    priceUnitDa: '2.028 kr./år',
    priceUnitEn: '2,028 DKK/yr',
    savingsDa: 'Spar 360 kr./år',
    savingsEn: 'Save 360 DKK/yr',
    descDa: 'AI-rådgivning & stabil pris',
    descEn: 'AI advisory & stable price',
    includesLabelDa: 'Udover Månedlig',
    includesLabelEn: 'In addition to Monthly',
    features: [
      { da: 'Hermes AI-rådgivning', en: 'Hermes AI advisory' },
      { da: 'Prioriteret support', en: 'Priority support' },
      { da: 'Stabil pris i 12 måneder', en: 'Fixed price for 12 months' },
    ],
    bindDa: '12 måneders binding',
    bindEn: '12-month commitment',
    ctaDa: 'Vælg Pro',
    ctaEn: 'Choose Pro',
  },
  {
    id: '2year',
    name: 'Business',
    priceDa: '149 kr./md.',
    priceEn: '149 kr./mo.',
    priceUnitDa: '3.576 kr./24 md.',
    priceUnitEn: '3,576 DKK/24 mo.',
    savingsDa: 'Spar 1.200 kr.',
    savingsEn: 'Save 1,200 DKK',
    descDa: 'Til etablerede virksomheder',
    descEn: 'For established businesses',
    includesLabelDa: 'Udover Pro',
    includesLabelEn: 'In addition to Pro',
    features: [
      { da: 'Auto e-faktura (Peppol / NemHandel)', en: 'Auto e-invoice (Peppol / NemHandel)' },
      { da: 'Årsrapport (iXBRL for Erhvervsstyrelsen)', en: 'Annual report (iXBRL for the Danish Business Authority)' },
      { da: 'Ubegrænsede teammedlemmer', en: 'Unlimited team members' },
    ],
    bindDa: '24 måneders binding',
    bindEn: '24-month commitment',
    ctaDa: 'Vælg Business',
    ctaEn: 'Choose Business',
  },
  {
    id: '3year',
    name: 'Business Extended',
    priceDa: '145 kr./md.',
    priceEn: '145 kr./mo.',
    priceUnitDa: '5.220 kr./36 md.',
    priceUnitEn: '5,220 DKK/36 mo.',
    savingsDa: 'Spar 1.944 kr.',
    savingsEn: 'Save 1,944 DKK',
    descDa: 'Fuld pakke — maksimal rabat',
    descEn: 'Full package — maximum discount',
    includesLabelDa: 'Udover Business',
    includesLabelEn: 'In addition to Business',
    features: [
      { da: 'Projektregnskab', en: 'Project accounting' },
      { da: 'Højeste prioritet på support', en: 'Highest priority support' },
      { da: 'Nye funktioner først', en: 'New features first' },
    ],
    bindDa: '36 måneders binding',
    bindEn: '36-month commitment',
    ctaDa: 'Vælg Business Extended',
    ctaEn: 'Choose Business Extended',
  },
];

// ─── Storage key prefixes ──────────────────────────────────────────────
const DISMISSED_PREFIX = 'alphaflow-plan-prompt-dismissed-';
const EVER_LOGGED_PREFIX = 'alphaflow-ever-logged-';

// ─── Plan Card Component ───────────────────────────────────────────────

function PlanCard({
  plan,
  isDa,
  onSelect,
  isActiveSlide,
  isMobile,
  startingTrial,
  isCurrentPlan,
  t,
}: {
  plan: Plan;
  isDa: boolean;
  onSelect: (plan: Plan) => void;
  isActiveSlide?: boolean;
  isMobile?: boolean;
  startingTrial: boolean;
  isCurrentPlan?: boolean;
  t: (da: string, en: string) => string;
}) {
  const isFree = plan.isFree;
  const isLoading = isFree && startingTrial;
  // On mobile, the highlight follows the centered card.
  const isActiveMobile = isMobile && isActiveSlide;

  return (
    <div
      className={`
        relative flex flex-col rounded-2xl text-center
        transition-all duration-300 ease-out group shrink-0
        ${isMobile
          ? `w-[85vw] max-w-[340px] p-5 ${isActiveSlide
            ? 'scale-100 opacity-100'
            : 'scale-[0.88] opacity-40 blur-[1px]'
          }`
          : 'p-3 sm:p-3.5 lg:p-4 hover:scale-[1.02] hover:shadow-lg'
        }
        ${isLoading ? 'opacity-70 cursor-wait' : 'cursor-pointer'}
        ${isActiveMobile
          // Dynamic orange highlight for the currently centered mobile card
          ? 'bg-[#112240]/90 border-2 border-[#f59e0b]/90 dark:border-[#f59e0b]/70 ring-2 ring-[#f59e0b]/20 shadow-lg shadow-[#f59e0b]/10'
          : isFree
            ? 'bg-[#0a1628]/60 border border-[#1e3a5f]/50 dark:border-[#1a2d4d]/30'
            : 'bg-[#0e1f3d]/80 border border-[#1e3a5f]/60 dark:border-[#1a2d4d]/40'
        }
        ${!isMobile
          // Desktop: orange highlight follows the hovered card.
          // No plan is statically recommended — the highlight jumps to
          // whichever card the mouse is over.
          ? 'hover:border-[#f59e0b]/80 dark:hover:border-[#f59e0b]/60 hover:ring-1 hover:ring-[#f59e0b]/20 hover:shadow-[#f59e0b]/10'
          : ''
        }
      `}
      onClick={() => onSelect(plan)}
      role="button"
      tabIndex={isLoading ? -1 : 0}
      onKeyDown={(e) => { if (e.key === 'Enter' && !isLoading) onSelect(plan); }}
    >
      {/* Active-slide badge (mobile) — shows on the centered card */}
      {isActiveMobile && isFree && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider bg-[#f59e0b] text-white shadow-sm shadow-[#f59e0b]/30 whitespace-nowrap text-[11px]">
            <Star className="h-3 w-3" />
            {isDa ? 'GRATIS' : 'FREE'}
          </span>
        </div>
      )}

      {/* Plan name */}
      <p className={`font-bold uppercase tracking-wider
        ${isMobile ? 'text-sm mt-1' : 'text-xs sm:text-sm lg:text-base'}
        ${isActiveMobile
          ? 'text-[#f59e0b]'
          : isFree
            ? 'text-[#2dd4bf]/70'
            : 'text-[#2dd4bf]'
        }
      `}>
        {plan.name}
      </p>

      {/* Price block — fixed height so the price line aligns across all cards. */}
      <div className={isMobile ? 'mt-3' : 'mt-1.5 sm:mt-2'}>
        <p className={`font-bold text-white tracking-tight leading-none
          ${isMobile ? 'text-3xl' : 'text-xl sm:text-2xl lg:text-3xl'}
        `}>
          {isDa ? plan.priceDa : plan.priceEn}
        </p>
        {/* Reserve the priceUnit line even when absent so subsequent
            sections align across cards. */}
        <p className={`text-white/35 mt-0.5 ${isMobile ? 'text-xs h-4' : 'text-[10px] sm:text-xs lg:text-sm h-[18px] sm:h-[20px]'}`}>
          {plan.priceUnitDa ? (isDa ? plan.priceUnitDa : plan.priceUnitEn) : ''}
        </p>
      </div>

      {/* Badge row — single fixed-height row that holds EITHER the trial
          badge (Free) OR the savings badge (Pro / Business / Business Extended)
          OR nothing (Månedlig). */}
      <div className={`${isMobile ? 'mt-2 h-7' : 'mt-1.5 sm:mt-2 h-[22px] sm:h-[26px]'} flex items-center justify-center`}>
        {isFree ? (
          <div className="inline-flex items-center justify-center gap-1.5 mx-auto px-3 py-1 rounded-full bg-[#0d9488]/20 border border-[#0d9488]/30">
            <Gift className={`text-[#2dd4bf] ${isMobile ? 'h-3.5 w-3.5' : 'h-3 w-3 sm:h-3.5 sm:w-3.5'}`} />
            <span className={`font-semibold text-[#2dd4bf] tracking-wide leading-tight ${isMobile ? 'text-[10px]' : 'text-[9px] sm:text-[10px]'}`}>
              {t('GRATIS · FULD ADGANG', 'FREE · FULL ACCESS')}
            </span>
          </div>
        ) : plan.savingsDa ? (
          <span className={`font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full ${isMobile ? 'text-xs' : 'text-[10px] sm:text-xs'}`}>
            {isDa ? plan.savingsDa : plan.savingsEn}
          </span>
        ) : null}
      </div>

      {/* Description — fixed height (2 lines) so the features list aligns
          across cards regardless of description length. */}
      <p className={`${isMobile ? 'mt-2.5 text-xs' : 'mt-2 sm:mt-2.5 text-[10px] sm:text-xs lg:text-sm'} text-white/45 leading-relaxed line-clamp-2 min-h-[2.5em] sm:min-h-[2.8em]`}>
        {isDa ? plan.descDa : plan.descEn}
      </p>

      {/* Includes label — small uppercase label above the features list */}
      {plan.includesLabelDa && (
        <p className={`${isMobile ? 'mt-3 text-[10px]' : 'mt-2.5 sm:mt-3 text-[9px] sm:text-[10px]'} font-semibold uppercase tracking-wide text-white/40 text-left`}>
          {isDa ? plan.includesLabelDa : plan.includesLabelEn}
        </p>
      )}

      {/* Features list — fixed minimum height so the binding row aligns
          across cards regardless of how many features each plan has. */}
      <ul className={`flex-1 text-left ${isMobile ? 'mt-2 space-y-2 min-h-[7rem]' : 'mt-1.5 sm:mt-2 space-y-1.5 sm:space-y-2 min-h-[6rem] sm:min-h-[7rem] lg:min-h-[8rem]'}`}>
        {plan.features.map((feat, i) => (
          <li key={i} className="flex items-start gap-2">
            <Check className={`shrink-0 mt-0.5 ${isMobile ? 'h-4 w-4' : 'h-3.5 w-3.5 sm:h-4 sm:w-4'}
              ${isActiveMobile
                ? 'text-[#f59e0b]/90'
                : isFree
                  ? 'text-[#2dd4bf]/60'
                  : 'text-[#2dd4bf]/80'
              }`}
            />
            <span className={`text-white/55 leading-snug ${isMobile ? 'text-xs' : 'text-[10px] sm:text-xs lg:text-sm'}`}>
              {isDa ? feat.da : feat.en}
            </span>
          </li>
        ))}
      </ul>

      {/* Binding / Limitation */}
      <div className={`${isMobile ? 'mt-3 pt-2 pb-3' : 'mt-2 sm:mt-2.5 pt-1.5 sm:pt-2 pb-2 sm:pb-2.5'} border-t border-white/[0.06]`}>
        <p className={`text-white/30 ${isMobile ? 'text-xs' : 'text-[10px] sm:text-xs'}`}>
          {isDa ? `Binding: ${plan.bindDa}` : `Commitment: ${plan.bindEn}`}
        </p>
      </div>

      {/* CTA button */}
      <button
        type="button"
        disabled={isLoading || isCurrentPlan}
        className={`
          mt-auto w-full flex items-center justify-center gap-2
          rounded-xl font-semibold
          transition-all duration-200 hover:shadow-md active:scale-[0.97]
          ${isMobile ? 'h-12 text-sm mt-4' : 'h-9 sm:h-10 lg:h-11 px-2 sm:px-3 text-xs sm:text-sm lg:text-base'}
          ${isLoading ? 'opacity-60 cursor-wait' : ''}
          ${isCurrentPlan
            ? 'bg-white/10 text-white/50 border border-white/10 cursor-default'
            : isFree
              ? 'bg-[#0d9488]/60 hover:bg-[#0d9488]/80 text-white/80 hover:text-white border border-[#0d9488]/30'
              : 'bg-[#0d9488]/80 hover:bg-[#0d9488] text-white/90 hover:text-white border border-[#0d9488]/40'
          }
        `}
      >
        <span>{isCurrentPlan
          ? (isDa ? 'Aktuel plan' : 'Current plan')
          : isLoading
            ? (isDa ? 'Starter prøveperiode...' : 'Starting trial...')
            : (isDa ? plan.ctaDa : plan.ctaEn)
        }</span>
        {!isLoading && !isCurrentPlan && (
          <ArrowRight className={`opacity-60 group-hover:opacity-100 transition-opacity ${isMobile ? 'h-4 w-4' : 'h-3.5 w-3.5 sm:h-4 sm:w-4'}`} />
        )}
      </button>
    </div>
  );
}

// ─── Active Plan Label (replaces dot indicators on mobile) ───────

function ActivePlanLabel({
  plans,
  activeIndex,
  isDa,
  onSelect,
}: {
  plans: Plan[];
  activeIndex: number;
  isDa: boolean;
  onSelect: (index: number) => void;
}) {
  const active = plans[activeIndex];
  if (!active) return null;

  const isFree = active.isFree;

  // Build a short label for the active plan.
  const label = isFree
    ? (isDa ? 'Gratis' : 'Free')
    : active.name;

  // Sub-text: price for paid plans, duration for free.
  const sub = isFree
    ? (isDa ? '0 kr. · Fuld adgang' : '0 kr. · Full access')
    : (isDa ? active.priceDa : active.priceEn);

  return (
    <div className="flex flex-col items-center gap-1.5 py-3">
      {/* Label row */}
      <p className="text-sm font-semibold text-white/90 tracking-wide">
        {isFree && <Gift className="inline h-3.5 w-3.5 mr-1 -mt-0.5 text-[#2dd4bf]" />}
        {label}
      </p>
      {/* Sub-label */}
      <p className="text-xs text-white/40">
        {sub}
      </p>
      {/* Mini-dots for quick jumping */}
      <div className="flex items-center gap-2 mt-0.5">
        {plans.map((plan, i) => (
          <button
            key={plan.id}
            type="button"
            onClick={() => onSelect(i)}
            className={`
              transition-all duration-300 rounded-full
              ${i === activeIndex
                ? 'w-6 h-2 bg-[#f59e0b]/90 shadow-sm shadow-[#f59e0b]/20'
                : 'w-2 h-2 bg-white/20 hover:bg-white/40'
              }
            `}
            aria-label={`Go to plan ${i + 1}: ${plan.name}`}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Mobile Carousel Component ─────────────────────────────────────────

function MobileCarousel({
  plans,
  isDa,
  onSelect,
  startingTrial,
  currentPlanId,
  t,
}: {
  plans: Plan[];
  isDa: boolean;
  onSelect: (plan: Plan) => void;
  startingTrial: boolean;
  currentPlanId: string | null;
  t: (da: string, en: string) => string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Set initial scroll position via ref callback (no setState in effect)
  const setScrollRef = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    scrollContainerRef.current = node;
    if (node && node.children.length > 0) {
      const child = node.children[0] as HTMLElement;
      const containerWidth = node.offsetWidth;
      const childLeft = child.offsetLeft;
      const childWidth = child.offsetWidth;
      const scrollLeft = childLeft - (containerWidth - childWidth) / 2;
      node.scrollTo({ left: scrollLeft });
    }
  }, []);

  const scrollToSlide = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, plans.length - 1));
    setActiveIndex(clamped);
    if (scrollRef.current) {
      const child = scrollRef.current.children[clamped] as HTMLElement;
      if (child) {
        const containerWidth = scrollRef.current.offsetWidth;
        const childLeft = child.offsetLeft;
        const childWidth = child.offsetWidth;
        const scrollLeft = childLeft - (containerWidth - childWidth) / 2;
        scrollRef.current.scrollTo({ left: scrollLeft, behavior: 'smooth' });
      }
    }
  }, [plans.length]);

  // Handle scroll to update active index
  const handleScroll = useCallback(() => {
    if (!scrollRef.current || isDragging.current) return;
    const container = scrollRef.current;
    const scrollLeft = container.scrollLeft;
    const containerWidth = container.offsetWidth;
    const center = scrollLeft + containerWidth / 2;

    let closestIndex = 0;
    let closestDistance = Infinity;
    for (let i = 0; i < container.children.length; i++) {
      const child = container.children[i] as HTMLElement;
      const childCenter = child.offsetLeft + child.offsetWidth / 2;
      const distance = Math.abs(center - childCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = i;
      }
    }
    setActiveIndex(closestIndex);
  }, []);

  // Touch/swipe handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    isDragging.current = true;
    startX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(() => {
    isDragging.current = false;
    handleScroll();
  }, [handleScroll]);

  const handleNext = useCallback(() => scrollToSlide(activeIndex + 1), [activeIndex, scrollToSlide]);
  const handlePrev = useCallback(() => scrollToSlide(activeIndex - 1), [activeIndex, scrollToSlide]);

  return (
    <div className="flex flex-col">
      {/* Carousel */}
      <div className="relative">
        {/* Prev button */}
        {activeIndex > 0 && (
          <button
            type="button"
            onClick={handlePrev}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-[#0e1f3d]/90 border border-white/10 text-white/70 hover:text-white hover:bg-[#0e1f3d] backdrop-blur-sm transition-all shadow-lg"
            aria-label="Previous plan"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        {/* Scroll container */}
        <div
          ref={setScrollRef}
          onScroll={handleScroll}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth py-3
            scrollbar-hide"
          style={{
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            // Generous edge padding so cards snap cleanly to center
            // and never sit at the very edge of the screen.
            paddingLeft: 'calc(50% - 170px)',  // half of max-w-[340px]
            paddingRight: 'calc(50% - 170px)',
          }}
        >
          {plans.map((plan, i) => (
            <div key={plan.id} className="snap-center shrink-0 flex items-center">
              <PlanCard
                plan={plan}
                isDa={isDa}
                onSelect={onSelect}
                isActiveSlide={i === activeIndex}
                isMobile
                startingTrial={startingTrial}
                isCurrentPlan={currentPlanId === plan.id}
                t={t}
              />
            </div>
          ))}
        </div>

        {/* Next button */}
        {activeIndex < plans.length - 1 && (
          <button
            type="button"
            onClick={handleNext}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-[#0e1f3d]/90 border border-white/10 text-white/70 hover:text-white hover:bg-[#0e1f3d] backdrop-blur-sm transition-all shadow-lg"
            aria-label="Next plan"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Active plan label + mini navigation dots */}
      <ActivePlanLabel
        plans={plans}
        activeIndex={activeIndex}
        isDa={isDa}
        onSelect={scrollToSlide}
      />
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────

export function SubscriptionPlansPrompt() {
  const user = useAuthStore((s) => s.user);
  const { language } = useTranslation();
  const isDa = language === 'da';

  // Current plan tier from the user's active company (FASE 5).
  // Used to show "Aktuel" badge on the matching plan card.
  const currentPlanId = user?.planTier
    ? tierToFrontendPlanId(user.planTier as PlanTier)
    : null;

  const [visible, setVisible] = useState(false);
  const [animatingIn, setAnimatingIn] = useState(false);
  const [animatingOut, setAnimatingOut] = useState(false);
  const [startingTrial, setStartingTrial] = useState(false);
  // Mock checkout dialog state (only used when FLATPAY_API_KEY is not set).
  // The `paymentId` is captured so the success handler can trigger
  // plan activation via the callback endpoint.
  const [mockCheckout, setMockCheckout] = useState<{
    open: boolean;
    planDescription: string;
    amountOre: number;
    currency: string;
    paymentId: string;
  } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const hasScheduled = useRef(false);

  // Subscribe to external trigger store changes
  useEffect(() => {
    const unsub = useSubscriptionPlansStore.subscribe((state) => {
      if (state.isOpen) {
        setAnimatingIn(true);
        setVisible(true);
      }
    });
    return unsub;
  }, []);

  // ── First-login / new-device prompt logic ──────────────────────
  //
  // Goals:
  //   1. Show the subscription plans prompt on a new device for users
  //      who do NOT have a paid .tbkey proof.
  //   2. Silently SKIP the prompt for users who already have an active
  //      .tbkey proof (paid customers) — even on a brand-new device.
  //   3. NEVER skip for trial-only users — they should still see the
  //      plans so they can upgrade before the trial ends.
  //   4. Fail-safe: if the TokenPay service is unreachable, show the
  //      prompt after a timeout.  The backend still enforces access.
  //
  // How it works:
  //   • We use the lightweight /api/access/{userId} endpoint first to
  //     wait for the cache to settle (avoids the original race condition).
  //   • If the user has read_write, we then call the heavier /status
  //     endpoint to check for an activeProof (tbkey).  Only a tbkey
  //     proof holder gets the prompt skipped.
  //   • A 5-second timeout ensures the prompt always appears if the
  //     service is down.

  const accessResult = useAccessCacheStore((s) => s.result);
  const accessIsLoading = useAccessCacheStore((s) => s.isLoading);
  const accessIsOwner = useAccessCacheStore((s) => s.isOwner);
  const fetchAccess = useAccessCacheStore((s) => s.fetch);

  const fetchAttempted = useRef(false);
  const showTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const proofCheckDone = useRef(false);

  // Reset all refs when the user changes.
  useEffect(() => {
    fetchAttempted.current = false;
    proofCheckDone.current = false;
    if (showTimeout.current) { clearTimeout(showTimeout.current); showTimeout.current = null; }
  }, [user?.id]);

  // Cleanup timeout on unmount.
  useEffect(() => {
    return () => { if (showTimeout.current) clearTimeout(showTimeout.current); };
  }, []);

  useEffect(() => {
    if (!user || hasScheduled.current) return;
    if (user.isSuperDev) return;
    if (user.isDemoCompany) return;
    if (typeof window === 'undefined') return;

    const dismissedKey = `${DISMISSED_PREFIX}${user.id}`;
    const everLoggedKey = `${EVER_LOGGED_PREFIX}${user.id}`;
    if (localStorage.getItem(dismissedKey) === 'true') return;
    if (localStorage.getItem(everLoggedKey) === 'true') return;

    // Wait while the access cache is loading.
    if (accessIsLoading) return;

    // No access result yet — kick off the basic access check ourselves
    // and wait.  Also start a safety timeout so we don't hang forever
    // if the TokenPay service is unreachable.
    if (!accessResult) {
      if (!fetchAttempted.current) {
        fetchAttempted.current = true;
        fetchAccess(user.id);

        // Fail-safe: after 5 seconds without a result, show the prompt.
        showTimeout.current = setTimeout(() => {
          if (hasScheduled.current) return;
          // Double-check the store one more time.
          const latest = useAccessCacheStore.getState();
          if (latest.result && hasAccess(latest.result) && !proofCheckDone.current) {
            // Got access while timeout was pending — kick off proof check.
            checkForTbkeyProof(user.id);
            return;
          }
          // Still no result or no access — show the prompt.
          hasScheduled.current = true;
          localStorage.setItem(everLoggedKey, 'true');
          setAnimatingIn(true);
          setVisible(true);
        }, 5000);
      }
      return;
    }

    // We have an access result.  Clear the safety timeout.
    if (showTimeout.current) { clearTimeout(showTimeout.current); showTimeout.current = null; }

    // Owner always skips.
    if (accessIsOwner) {
      localStorage.setItem(everLoggedKey, 'true');
      localStorage.setItem(dismissedKey, 'true');
      hasScheduled.current = true;
      return;
    }

    // User has read_write access (could be tbkey or trial).
    // We need to distinguish: only skip for tbkey proof holders.
    if (hasAccess(accessResult) && !proofCheckDone.current) {
      proofCheckDone.current = true;
      checkForTbkeyProof(user.id);
      return;
    }

    // User has read_only or proof check said no active proof → show prompt.
    if (!proofCheckDone.current || !hasAccess(accessResult)) {
      localStorage.setItem(everLoggedKey, 'true');
      hasScheduled.current = true;
      const timer = setTimeout(() => {
        setAnimatingIn(true);
        setVisible(true);
      }, 800);
      return;
    }
  }, [user, accessResult, accessIsLoading, accessIsOwner, fetchAccess]);

  // ── Separate function to check for active tbkey proof ───────────
  // Calls the /status endpoint which returns activeProof info.
  // Sets the appropriate localStorage flags based on whether a
  // paid proof is found.
  const checkForTbkeyProof = useCallback(
    (userId: string) => {
      fetch(`/api/access/${encodeURIComponent(userId)}/status`)
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (hasScheduled.current) return;
          const everLoggedKey = `${EVER_LOGGED_PREFIX}${userId}`;
          const dismissedKey = `${DISMISSED_PREFIX}${userId}`;

          // If there is an active .tbkey proof, the user is a paying
          // customer — silently skip the prompt on this device forever.
          if (data?.activeProof) {
            localStorage.setItem(everLoggedKey, 'true');
            localStorage.setItem(dismissedKey, 'true');
            hasScheduled.current = true;
            return;
          }

          // Trial-only or no active proof — show the prompt so the user
          // can see the plans and upgrade.
          localStorage.setItem(everLoggedKey, 'true');
          hasScheduled.current = true;
          setAnimatingIn(true);
          setVisible(true);
        })
        .catch(() => {
          // Status check failed — fail-safe: show the prompt.
          if (hasScheduled.current) return;
          localStorage.setItem(`${EVER_LOGGED_PREFIX}${userId}`, 'true');
          hasScheduled.current = true;
          setAnimatingIn(true);
          setVisible(true);
        });
    },
    [],
  );

  const dismiss = useCallback(() => {
    setAnimatingOut(true);
    setTimeout(() => {
      setVisible(false);
      setAnimatingIn(false);
      setAnimatingOut(false);
      if (user?.id) {
        localStorage.setItem(`${DISMISSED_PREFIX}${user.id}`, 'true');
      }
      useSubscriptionPlansStore.getState().dismiss();
    }, 300);
  }, [user]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) dismiss();
    },
    [dismiss],
  );

  const handleSelectPlan = useCallback(
    (plan: Plan) => {
      if (plan.isFree) {
        // ── Free plan: activate immediately via /api/trial/start ──
        setStartingTrial(true);
        fetch('/api/trial/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId: plan.id }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success) {
              dismiss();
              window.dispatchEvent(new CustomEvent('access:refresh'));
            } else if (data.alreadyClaimed) {
              dismiss();
            }
          })
          .catch(() => {})
          .finally(() => {
            setStartingTrial(false);
          });
        return;
      }

      // ── Paid plan: create a Frisbii charge session ──
      // In mock mode → show MockCheckoutDialog (visible test checkout)
      // In production → open Frisbii Overlay Checkout (real payment)
      setStartingTrial(true);
      fetch('/api/subscription/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id }),
      })
        .then((res) => res.json())
        .then(async (data) => {
          if (!data.sessionId) {
            // Error creating the payment session — show a message
            setStartingTrial(false);
            toast.error(language === 'da' ? 'Kunne ikke starte betaling' : 'Could not start payment');
            return;
          }

          // Shared success handler — used by both mock dialog and real overlay
          const handleSuccess = () => {
            dismiss();
            toast.success(
              language === 'da' ? 'Betaling gennemført!' : 'Payment successful!',
              {
                description:
                  language === 'da'
                    ? 'Dit abonnement aktiveres nu.'
                    : 'Your subscription is being activated.',
              }
            );
            // Trigger plan activation via the callback endpoint.
            // In mock mode this auto-succeeds; in production it verifies
            // the session via the Frisbii API. Both idempotent — the
            // webhook is still the authoritative source in production.
            fetch(
              `/api/subscription/payment-callback?payment_id=${encodeURIComponent(data.paymentId)}`
            )
              .catch(() => {})
              .finally(() => {
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('auth:refresh'));
                  window.dispatchEvent(new CustomEvent('access:refresh'));
                }, 600);
              });
          };

          const handleCancel = () => {
            setStartingTrial(false);
            toast(
              language === 'da' ? 'Betaling annulleret' : 'Payment cancelled',
              {
                description:
                  language === 'da'
                    ? 'Du har annulleret betalingen.'
                    : 'You cancelled the payment.',
              }
            );
          };

          const handleError = () => {
            setStartingTrial(false);
            toast.error(
              language === 'da' ? 'Betaling mislykkedes' : 'Payment failed',
              {
                description:
                  language === 'da'
                    ? 'Der opstod en fejl. Prøv igen senere.'
                    : 'An error occurred. Please try again later.',
              }
            );
          };

          // ── Mock mode: show visible MockCheckoutDialog ──
          if (isMockSession(data.sessionId)) {
            setStartingTrial(false);
            setMockCheckout({
              open: true,
              planDescription: language === 'da' ? plan.descDa : plan.descEn,
              amountOre: data.amount,
              currency: data.currency || 'DKK',
              paymentId: data.paymentId,
            });
            return;
          }

          // ── Production mode: open real Frisbii Overlay Checkout ──
          try {
            await openFrisbiiOverlay(data.sessionId, {
              onSuccess: handleSuccess,
              onCancel: handleCancel,
              onError: handleError,
            });
          } catch {
            // SDK failed to load — fall back to redirect checkout
            setStartingTrial(false);
            if (data.checkoutUrl) {
              window.location.href = data.checkoutUrl;
            } else {
              toast.error(
                language === 'da' ? 'Betaling kunne ikke startes' : 'Payment could not be started'
              );
            }
          }
        })
        .catch(() => {
          setStartingTrial(false);
          toast.error(
            language === 'da' ? 'Netværksfejl' : 'Network error',
            {
              description:
                language === 'da'
                  ? 'Kunne ikke kontakte serveren. Prøv igen.'
                  : 'Could not reach the server. Please try again.',
            }
          );
        });
    },
    [dismiss, language],
  );

  // ── Mock checkout dialog handlers ──
  // These fire when the user interacts with the MockCheckoutDialog
  // (mock mode only). They mirror the real Frisbii overlay callbacks.
  const handleMockSuccess = useCallback(() => {
    if (!mockCheckout) return;
    const paymentId = mockCheckout.paymentId;
    setMockCheckout((prev) => (prev ? { ...prev, open: false } : null));
    dismiss();
    toast.success(
      language === 'da' ? 'Betaling gennemført!' : 'Payment successful!',
      {
        description:
          language === 'da'
            ? 'Dit abonnement aktiveres nu.'
            : 'Your subscription is being activated.',
      }
    );
    // Trigger plan activation via the callback endpoint (auto-succeeds in mock mode)
    fetch(`/api/subscription/payment-callback?payment_id=${encodeURIComponent(paymentId)}`)
      .catch(() => {})
      .finally(() => {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('auth:refresh'));
          window.dispatchEvent(new CustomEvent('access:refresh'));
        }, 600);
      });
  }, [mockCheckout, dismiss, language]);

  const handleMockCancel = useCallback(() => {
    setMockCheckout(null);
    setStartingTrial(false);
    toast(
      language === 'da' ? 'Betaling annulleret' : 'Payment cancelled',
      {
        description:
          language === 'da'
            ? 'Du har annulleret betalingen.'
            : 'You cancelled the payment.',
      }
    );
  }, [language]);

  const handleMockError = useCallback(() => {
    setMockCheckout(null);
    setStartingTrial(false);
    toast.error(
      language === 'da' ? 'Betaling mislykkedes' : 'Payment failed',
      {
        description:
          language === 'da'
            ? 'Der opstod en fejl. Prøv igen senere.'
            : 'An error occurred. Please try again later.',
      }
    );
  }, [language]);

  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible, dismiss]);

  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  if (!visible) return null;

  const t = (da: string, en: string) => (isDa ? da : en);

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className={`fixed inset-0 z-[200] flex sm:items-center justify-center
        bg-black/70 dark:bg-black/85 backdrop-blur-sm
        transition-opacity duration-300
        ${animatingIn && !animatingOut ? 'opacity-100' : animatingOut ? 'opacity-0' : 'opacity-0'}
      `}
    >
      {/* ── Card container ── */}
      <div
        className={`
          relative w-full
          /* Mobile: full screen height; Desktop: 16:9 ratio */
          h-full sm:h-auto sm:aspect-[16/9] sm:max-w-[1280px] sm:max-h-[95vh]
          rounded-t-3xl sm:rounded-2xl
          overflow-y-auto overflow-x-hidden
          transition-all duration-300
          ${animatingIn && !animatingOut ? 'translate-y-0 sm:scale-100 opacity-100' : animatingOut ? 'translate-y-full sm:scale-95 opacity-0' : 'translate-y-full sm:scale-95 opacity-0'}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Inner card ── */}
        <div className="relative flex flex-col h-full sm:h-auto overflow-hidden bg-[#0c1a33] dark:bg-[#091325] border border-[#1a2d4d]/60 dark:border-[#152240]/80 sm:rounded-2xl rounded-t-3xl">
          {/* Background dot grid */}
          <div
            className="absolute inset-0 opacity-[0.08] pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />

          {/* Decorative glow orbs */}
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-[#0d9488]/[0.06] blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-[#2dd4bf]/[0.04] blur-3xl pointer-events-none" />
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] rounded-full bg-[#f59e0b]/[0.025] blur-3xl pointer-events-none" />

          {/* ── Mobile drag handle ── */}
          <div className="sm:hidden flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>

          {/* ── Header ── */}
          <div className="relative shrink-0 pt-2 sm:pt-5 md:pt-6 pb-3 sm:pb-4 px-5 sm:px-8 text-center">
            {/* Close button — large touch target on mobile */}
            <button
              type="button"
              onClick={dismiss}
              className="absolute top-4 right-4 sm:top-4 sm:right-4
                w-11 h-11 sm:w-9 sm:h-9
                flex items-center justify-center
                rounded-xl sm:rounded-lg bg-white/10 hover:bg-white/20
                text-white/60 hover:text-white transition-colors cursor-pointer"
              aria-label={t('Luk', 'Close')}
            >
              <X className="h-5 w-5 sm:h-5 sm:w-5" />
            </button>

            <h2 className="text-2xl sm:text-2xl lg:text-[1.65rem] font-bold text-white tracking-tight leading-tight">
              {t('Velkommen til AlphaFlow', 'Welcome to AlphaFlow')}
            </h2>
            <p className="mt-2 sm:mt-1.5 text-sm sm:text-sm lg:text-base text-white/50 max-w-2xl mx-auto leading-relaxed">
              {t(
                'Start bogføringen af din Start-Up eller SMV på få minutter. Find den plan, der passer bedst til din virksomhed, og fortsæt ubesværet efter prøveperioden.',
                'Start bookkeeping for your Start-Up or SME in minutes. Find the plan that best suits your business and continue seamlessly after the trial period.',
              )}
            </p>
          </div>

          {/* ── Plans section ── */}
          <div className="relative flex-1 min-h-0 px-2 sm:px-5 lg:px-6 pb-2 sm:pb-4 flex flex-col">
            {/* Mobile: Carousel layout */}
            <div className="sm:hidden flex flex-col flex-1 min-h-0 justify-center">
              <MobileCarousel
                plans={PLANS}
                isDa={isDa}
                onSelect={handleSelectPlan}
                startingTrial={startingTrial}
                currentPlanId={currentPlanId}
                t={t}
              />
            </div>

            {/* Tablet & Desktop: Grid layout */}
            <div className="hidden sm:flex flex-col flex-1 min-h-0">
              <div className="grid grid-cols-3 lg:grid-cols-5 gap-2.5 lg:gap-3 flex-1 min-h-0">
                {PLANS.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    isDa={isDa}
                    onSelect={handleSelectPlan}
                    startingTrial={startingTrial}
                    isCurrentPlan={currentPlanId === plan.id}
                    t={t}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ── Bottom bar ── */}
          <div className="relative shrink-0 border-t border-white/[0.06] px-5 sm:px-8 py-4 sm:py-4">
            {/* Mobile: stacked features */}
            <div className="sm:hidden space-y-2.5">
              <div className="flex items-center justify-center gap-2 text-white/35 text-xs">
                <ShieldCheck className="h-4 w-4 text-[#2dd4bf]/70" />
                <span>{t('Fuld adgang', 'Full access')}</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-white/35 text-xs">
                <Zap className="h-4 w-4 text-[#2dd4bf]/70" />
                <span>{t('Ingen binding på prøve', 'No trial commitment')}</span>
              </div>
            </div>

            {/* Desktop: inline features row */}
            <div className="hidden sm:flex items-center justify-center gap-3 sm:gap-5 lg:gap-6 text-white/35 text-[10px] sm:text-xs lg:text-sm">
              <div className="flex items-center gap-1">
                <ShieldCheck className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-[#2dd4bf]/70" />
                <span>{t('Fuld adgang', 'Full access')}</span>
              </div>
              <div className="flex items-center gap-1">
                <Zap className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-[#2dd4bf]/70" />
                <span>{t('Ingen binding på prøve', 'No trial commitment')}</span>
              </div>
            </div>

            {/* Bottom branding */}
            <div className="mt-3 sm:mt-2.5 flex items-center justify-center gap-2 text-white/15 text-[10px] sm:text-xs tracking-widest">
              <Lock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              <span>WEB ACCESS PROOF &middot; .TBKEY</span>
              <Lock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
            </div>
          </div>
        </div>
      </div>

      {/* Mock checkout dialog — only shown in mock mode (no FLATPAY_API_KEY) */}
      {mockCheckout && (
        <MockCheckoutDialog
          open={mockCheckout.open}
          planDescription={mockCheckout.planDescription}
          amountOre={mockCheckout.amountOre}
          currency={mockCheckout.currency}
          onSuccess={handleMockSuccess}
          onCancel={handleMockCancel}
          onError={handleMockError}
        />
      )}
    </div>
  );
}
