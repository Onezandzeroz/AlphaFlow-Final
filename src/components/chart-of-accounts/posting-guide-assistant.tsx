'use client';

/**
 * PostingGuideAssistant — AlphaFlows bogføringsguide og konteringsvejledning.
 *
 * Design: Magazin/Guide layout — læsbart, overskueligt, beskrivende.
 * Konteringsregler præsenteres som læsbare artikler medinline konti,
 * ikke som tunge T-diagrammer.
 */

import { useState, useMemo } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  BookOpen,
  Lightbulb,
  Search,
  ExternalLink,
  HelpCircle,
  ArrowUpRight,
  GraduationCap,
  Scale,
  Building2,
  Calculator,
  ArrowRight,
  Banknote,
  CreditCard,
  Globe,
  Briefcase,
  Package,
  Users,
  Home,
  Truck,
  Receipt,
  Landmark,
  HandCoins,
  BookMarked,
  CalendarDays,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PUBLIC_STANDARD_CHART } from '@/lib/standard-chart-of-accounts';

// ─── Posting Guide Rules ────────────────────────────────────────────────

interface PostingRule {
  title: string;
  titleEn: string;
  debitAccount: string;
  debitAccountName: string;
  creditAccount: string;
  creditAccountName: string;
  intro: string;
  introEn: string;
  debitLabel: string;
  debitLabelEn: string;
  creditLabel: string;
  creditLabelEn: string;
  followUp?: string;
  followUpEn?: string;
  icon: string;
}

interface PostingCategory {
  category: string;
  categoryDa: string;
  rules: PostingRule[];
}

const POSTING_RULES: PostingCategory[] = [
  {
    category: 'salg',
    categoryDa: 'Salg og indtægter',
    rules: [
      {
        title: 'Kontantsalg (25% moms)',
        titleEn: 'Cash sale (25% VAT)',
        debitAccount: '1100',
        debitAccountName: 'Bankkonto',
        creditAccount: '4000',
        creditAccountName: 'Salg af varer',
        intro: 'Når du sælger varer eller ydelser og modtager betaling med det samme (kontant, MobilePay, kreditkort):',
        introEn: 'When selling goods/services and receiving payment immediately:',
        debitLabel: 'Bank — du modtager det fulde beløb inkl. moms',
        debitLabelEn: 'Bank — you receive the full amount incl. VAT',
        creditLabel: 'Salgsindtægt (excl. moms) + udgående moms 25%',
        creditLabelEn: 'Sales revenue (excl. VAT) + output VAT 25%',
        icon: 'Banknote',
      },
      {
        title: 'Salg på kredit (25% moms)',
        titleEn: 'Credit sale (25% VAT)',
        debitAccount: '1200',
        debitAccountName: 'Tilgodehavender fra salg',
        creditAccount: '4000',
        creditAccountName: 'Salg af varer',
        intro: 'Når du sælger varer eller ydelser på kredit med en faktura og betalingsfrist:',
        introEn: 'When selling goods/services on credit with an invoice:',
        debitLabel: 'Tilgodehavender — kunden skylder dig',
        debitLabelEn: 'Receivables — customer owes you',
        creditLabel: 'Salgsindtægt (excl. moms) + udgående moms 25%',
        creditLabelEn: 'Sales revenue (excl. VAT) + output VAT 25%',
        followUp: 'Når kunden betaler: Debet bank, kredit tilgodehavender',
        followUpEn: 'When customer pays: Debit bank, credit receivables',
        icon: 'CreditCard',
      },
      {
        title: 'EU-salg af varer (IGS, 0% moms)',
        titleEn: 'EU sale of goods (reverse charge)',
        debitAccount: '1200',
        debitAccountName: 'Tilgodehavender fra salg',
        creditAccount: '4200',
        creditAccountName: 'Salg af varer EU',
        intro: 'Salg af varer til en momsregistreret virksomhed i et andet EU-land:',
        introEn: 'Sale of goods to a VAT-registered business in another EU country:',
        debitLabel: 'Tilgodehavender — kunden skylder dig (uden moms)',
        debitLabelEn: 'Receivables — customer owes you (no VAT)',
        creditLabel: 'EU-salg (0% moms) — brug momskode SEU',
        creditLabelEn: 'EU sale (0% VAT) — use VAT code SEU',
        followUp: 'Køberen skal oplyse gyldigt udenlandsk CVR/VAT-nummer',
        followUpEn: 'Buyer must provide valid foreign VAT number',
        icon: 'Globe',
      },
      {
        title: 'Salg af tjenesteydelser',
        titleEn: 'Service revenue',
        debitAccount: '1200',
        debitAccountName: 'Tilgodehavender fra salg',
        creditAccount: '4100',
        creditAccountName: 'Salg af tjenesteydelser',
        intro: 'Salg af konsulentydelser, rådgivning, håndværkerarbejde etc.:',
        introEn: 'Sale of consulting, advisory, craft services:',
        debitLabel: 'Tilgodehavender — kunden skylder dig',
        debitLabelEn: 'Receivables — customer owes you',
        creditLabel: 'Salgsindtægt + udgående moms (hvis momspligtig)',
        creditLabelEn: 'Sales revenue + output VAT (if VAT-liable)',
        icon: 'Briefcase',
      },
    ],
  },
  {
    category: 'indkob',
    categoryDa: 'Indkøb og udgifter',
    rules: [
      {
        title: 'Indkøb af varer (25% moms)',
        titleEn: 'Purchase of goods (25% VAT)',
        debitAccount: '6100',
        debitAccountName: 'Indkøb af varer',
        creditAccount: '2000',
        creditAccountName: 'Leverandørgæld',
        intro: 'Når du køber varer til videresalg eller drift:',
        introEn: 'When purchasing goods for resale or operations:',
        debitLabel: 'Vareforbrug (excl. moms) + indgående moms 25%',
        debitLabelEn: 'Cost of goods (excl. VAT) + input VAT 25%',
        creditLabel: 'Leverandørgæld (inkl. moms)',
        creditLabelEn: 'Accounts payable (incl. VAT)',
        followUp: 'Når du betaler: Debet leverandørgæld, kredit bank',
        followUpEn: 'When paying: Debit payables, credit bank',
        icon: 'Package',
      },
      {
        title: 'Lønudbetaling',
        titleEn: 'Salary payment',
        debitAccount: '7000',
        debitAccountName: 'Lønninger',
        creditAccount: '1100',
        creditAccountName: 'Bankkonto',
        intro: 'Udbetaling af løn til ansatte:',
        introEn: 'Paying salaries to employees:',
        debitLabel: 'Lønomkostning (bruttoløn)',
        debitLabelEn: 'Salary expense (gross salary)',
        creditLabel: 'Bank (nettoudbetaling) + personalegæld (A-skat, AM-bidrag, ATP, feriepenge)',
        creditLabelEn: 'Bank (net pay) + payroll liabilities (tax, AM, ATP, holiday pay)',
        followUp: 'Husk også at bogføre arbejdsgiverbidrag (ATP, pension)',
        followUpEn: 'Remember to also post employer contributions (ATP, pension)',
        icon: 'Users',
      },
      {
        title: 'Husleje',
        titleEn: 'Rent payment',
        debitAccount: '8000',
        debitAccountName: 'Husleje',
        creditAccount: '1100',
        creditAccountName: 'Bankkonto',
        intro: 'Månedlig husleje for erhvervslokaler:',
        introEn: 'Monthly rent for business premises:',
        debitLabel: 'Husleje',
        debitLabelEn: 'Rent expense',
        creditLabel: 'Bank',
        creditLabelEn: 'Bank',
        followUp: 'Husleje er momsfritaget hvis udlejer er momsregistreret',
        followUpEn: 'Rent is VAT-exempt if landlord is VAT-registered',
        icon: 'Home',
      },
      {
        title: 'EU-indkøb (omvendt betalingspligt)',
        titleEn: 'EU purchase (reverse charge)',
        debitAccount: '6100',
        debitAccountName: 'Indkøb af varer',
        creditAccount: '2000',
        creditAccountName: 'Leverandørgæld',
        intro: 'Indkøb fra en momsregistreret virksomhed i et andet EU-land:',
        introEn: 'Purchase from a VAT-registered business in another EU country:',
        debitLabel: 'Vareforbrug (excl. moms) + indgående moms 25%',
        debitLabelEn: 'Cost of goods (excl. VAT) + input VAT 25%',
        creditLabel: 'Leverandørgæld (uden moms) + udgående moms 25%',
        creditLabelEn: 'Accounts payable (no VAT) + output VAT 25%',
        followUp: 'Leverandøren fakturerer uden moms — du beregner selv dansk moms (KEU)',
        followUpEn: 'Supplier invoices without VAT — you self-assess Danish VAT (KEU)',
        icon: 'Truck',
      },
      {
        title: 'Kontorartikler og drift',
        titleEn: 'Office supplies and operations',
        debitAccount: '8700',
        debitAccountName: 'Kontorartikler',
        creditAccount: '1100',
        creditAccountName: 'Bankkonto',
        intro: 'Køb af kontorartikler, telefon, internet, forsikring etc.:',
        introEn: 'Purchase of office supplies, phone, internet, insurance:',
        debitLabel: 'Den relevante omkostningskonto (f.eks. 8600 Telefon, 8400 Forsikring) + indgående moms 25%',
        debitLabelEn: 'The relevant expense account + input VAT 25%',
        creditLabel: 'Bank',
        creditLabelEn: 'Bank',
        icon: 'Receipt',
      },
    ],
  },
  {
    category: 'moms',
    categoryDa: 'Momsafregning',
    rules: [
      {
        title: 'Momsafregning — du skal betale',
        titleEn: 'VAT settlement — net payable',
        debitAccount: '2200',
        debitAccountName: 'Momsgæld',
        creditAccount: '1100',
        creditAccountName: 'Bankkonto',
        intro: 'Hver kvartal (eller måned) afregner du moms med Skattestyrelsen:',
        introEn: 'Every quarter (or month) you settle VAT with SKAT:',
        debitLabel: 'Momsgæld — nulstil udgående og indgående moms',
        debitLabelEn: 'VAT payable — clear output and input VAT accounts',
        creditLabel: 'Bank — betal det skyldige beløb',
        creditLabelEn: 'Bank — pay the due amount',
        followUp: 'Gælder når udgående moms (salgsmoms) > indgående moms (købsmoms)',
        followUpEn: 'Applies when output VAT > input VAT',
        icon: 'Landmark',
      },
      {
        title: 'Momsafregning — du får refusion',
        titleEn: 'VAT settlement — refund',
        debitAccount: '1100',
        debitAccountName: 'Bankkonto',
        creditAccount: '2200',
        creditAccountName: 'Momsgæld',
        intro: 'Når indgående moms > udgående moms — typisk ved store investeringer eller opstart:',
        introEn: 'When input VAT > output VAT — typically during large investments or startup:',
        debitLabel: 'Bank — du får moms tilbage fra Skattestyrelsen',
        debitLabelEn: 'Bank — you receive VAT refund from SKAT',
        creditLabel: 'Momsgæld — nulstil udgående og indgående moms',
        creditLabelEn: 'VAT payable — clear output and input VAT accounts',
        icon: 'HandCoins',
      },
    ],
  },
  {
    category: 'period',
    categoryDa: 'Årsafslutning',
    rules: [
      {
        title: 'Lukning af resultatopgørelse',
        titleEn: 'Closing income statement',
        debitAccount: '3300',
        debitAccountName: 'Årets resultat',
        creditAccount: '—',
        creditAccountName: 'Alle indtægts-/omkostningskonti',
        intro: 'Ved årsafslutning lukkes alle indtægts- og omkostningskonti:',
        introEn: 'At year-end, all revenue and expense accounts are closed:',
        debitLabel: 'Årets resultat — samler årets overskud/underskud',
        debitLabelEn: 'Net income — accumulates the year\'s profit/loss',
        creditLabel: 'Alle indtægtskonti (4000-4999) og omkostningskonti (6000-8999) nulstilles',
        creditLabelEn: 'All revenue (4000-4999) and expense accounts (6000-8999) are zeroed',
        icon: 'BookMarked',
      },
      {
        title: 'Overførsel til overført resultat',
        titleEn: 'Transfer to retained earnings',
        debitAccount: '3300',
        debitAccountName: 'Årets resultat',
        creditAccount: '3400',
        creditAccountName: 'Overført resultat',
        intro: 'Efter årets resultat er opgjort, overføres beløbet:',
        introEn: 'After net income is determined, the amount is transferred:',
        debitLabel: 'Årets resultat — lukkes (nulstilles)',
        debitLabelEn: 'Net income — closed (zeroed)',
        creditLabel: 'Overført resultat — årets overskud/underskud føres videre',
        creditLabelEn: 'Retained earnings — the year\'s profit/loss is carried forward',
        followUp: 'Dette forbereder den nye regnskabsperiode',
        followUpEn: 'This prepares the new accounting period',
        icon: 'CalendarDays',
      },
    ],
  },
];

// ─── Reference Links ────────────────────────────────────────────────────

interface ReferenceLink {
  title: string;
  url: string;
  description: string;
  descriptionEn: string;
  type: 'guide' | 'authority' | 'law';
  icon: typeof GraduationCap;
}

const REFERENCE_LINKS: ReferenceLink[] = [
  {
    title: 'SKATs Bogføringsguide',
    url: 'https://xn--bogfringsguide-tqb.skat.dk/#/',
    description: 'Skattestyrelsens interaktive bogføringsguide — praktisk guide til bogføring med eksempler og forklaringer.',
    descriptionEn: 'SKAT interactive bookkeeping guide with examples.',
    type: 'guide',
    icon: GraduationCap,
  },
  {
    title: 'SKATs Bogføringsguide — Erhvervsdrivende uden moms',
    url: 'https://xn--bogfringsguide-tqb.skat.dk/#/EMV',
    description: 'Specifik guide til virksomheder der ikke er momsregistreret (eller kun har momsfri aktivitet).',
    descriptionEn: 'Guide for businesses without VAT registration.',
    type: 'guide',
    icon: GraduationCap,
  },
  {
    title: 'SKATs Bogføringsguide — Personer med momspligtig virksomhed',
    url: 'https://xn--bogfringsguide-tqb.skat.dk/#/PMV',
    description: 'Specifik guide til momsregistrerede virksomheder — bogføring af moms, køb, salg og momsafregning.',
    descriptionEn: 'Guide for VAT-registered businesses.',
    type: 'guide',
    icon: GraduationCap,
  },
  {
    title: 'SKAT — Guide til start-ups: Bogføring for selskaber',
    url: 'https://skat.dk/erhverv/guides-og-webinarer-til-start-ups/start-up-med-skat/for-selskaber/bogfoering',
    description: 'Skattestyrelsens guide til bogføring specielt for nystartede selskaber (ApS, A/S). Indeholder også webinarer.',
    descriptionEn: 'SKAT guide to bookkeeping for start-up companies.',
    type: 'guide',
    icon: GraduationCap,
  },
  {
    title: 'SKAT — Bogføring, regnskab og oplysningsskema',
    url: 'https://skat.dk/erhverv/egen-virksomhed/bogfoering-regnskab-og-oplysningsskema',
    description: 'Skattestyrelsens hovedside om bogføring og regnskab — krav til regnskab, opbevaring, digitale systemer og indberetninger.',
    descriptionEn: 'SKAT main page on bookkeeping and accounting requirements.',
    type: 'guide',
    icon: GraduationCap,
  },
  {
    title: 'SKAT — Moms',
    url: 'https://skat.dk/moms',
    description: 'Skattestyrelsens samlede vejledning om moms — registrering, afregning, satser, angivelse og refusion.',
    descriptionEn: 'SKAT comprehensive VAT guide.',
    type: 'guide',
    icon: Calculator,
  },
  {
    title: 'Fællesoffentlig Standardkontoplan',
    url: 'https://erhvervsstyrelsen.dk/standardkontoplan-saf-t',
    description: 'Erhvervsstyrelsens officielle fællesoffentlige standardkontoplan — bruges til SAF-T-indberetning. AlphaFlow har alle 603 konti indbygget.',
    descriptionEn: 'Danish Business Authority official standard chart of accounts for SAF-T.',
    type: 'authority',
    icon: Building2,
  },
  {
    title: 'Bogføringsloven (Lov nr. 700 af 2022)',
    url: 'https://www.retsinformation.dk/eli/lta/2022/700',
    description: 'Lov om bogføring — den fulde lovtekst på Retsinformation. Fastlægger krav til bogføring, opbevaring og arkivering.',
    descriptionEn: 'Danish Bookkeeping Act — full legal text.',
    type: 'law',
    icon: Scale,
  },
  {
    title: 'Kravbekendtgørelsen (BEK nr. 97 af 2023)',
    url: 'https://www.retsinformation.dk/eli/lta/2023/97',
    description: 'Bekendtgørelse om krav til digitale standard bogføringssystemer — fastlægger de tekniske krav som AlphaFlow skal opfylde.',
    descriptionEn: 'Executive Order on requirements for digital standard bookkeeping systems.',
    type: 'law',
    icon: Scale,
  },
];

// Icon lookup table — maps string names to Lucide components
const Icons = {
  Banknote, CreditCard, Globe, Briefcase, Package, Users, Home,
  Truck, Receipt, Landmark, HandCoins, BookMarked, CalendarDays,
};

// ─── Component ───────────────────────────────────────────────────────────

interface PostingGuideAssistantProps {
  user: User;
}

export function PostingGuideAssistant({ user }: PostingGuideAssistantProps) {
  const { language } = useTranslation();
  const isDanish = language === 'da';

  const [activeCategory, setActiveCategory] = useState<string>('salg');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRules = useMemo(() =>
    POSTING_RULES.map(cat => ({
      ...cat,
      rules: cat.rules.filter(r =>
        searchQuery.trim() === '' ||
        r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.titleEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.intro.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.debitLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.creditLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.followUp?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
        r.debitAccountName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.creditAccountName.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    })).filter(cat => cat.rules.length > 0),
  [searchQuery]);

  const guideLinks = REFERENCE_LINKS.filter(l => l.type === 'guide');
  const authorityLinks = REFERENCE_LINKS.filter(l => l.type === 'authority');
  const lawLinks = REFERENCE_LINKS.filter(l => l.type === 'law');

  const renderReferenceLink = (ref: ReferenceLink) => {
    const Icon = ref.icon;
    return (
      <a
        key={ref.title}
        href={ref.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors group"
      >
        <div className="h-7 w-7 rounded-md bg-[#0d9488]/10 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-[#0d9488]/20 transition-colors">
          <Icon className="h-3.5 w-3.5 text-[#0d9488]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-[#0d9488] dark:group-hover:text-[#2dd4bf] transition-colors">
            {isDanish ? ref.title : ref.descriptionEn}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
            {isDanish ? ref.description : ref.descriptionEn}
          </p>
        </div>
        <ArrowUpRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-[#0d9488] shrink-0 mt-1 transition-colors" />
      </a>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-[#0d9488]" />
          {isDanish ? 'Bogføringsguide' : 'Posting Guide'}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {isDanish
            ? 'Praktisk hjælp til korrekt bogføring og kontering med forklaringer og officielle links.'
            : 'Practical help with correct bookkeeping and account selection with official links.'}
        </p>
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-2">
        {POSTING_RULES.map((cat) => (
          <button
            key={cat.category}
            onClick={() => { setActiveCategory(cat.category); setSearchQuery(''); }}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeCategory === cat.category
                ? 'bg-[#0d9488] text-white'
                : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10'
            }`}
          >
            {isDanish ? cat.categoryDa : cat.category}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder={isDanish ? 'Søg i bogføringsregler...' : 'Search posting rules...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 bg-gray-50 dark:bg-white/[0.04] border-0 h-10"
        />
      </div>

      {/* Rules — grid layout (3 per row on desktop, 2 on tablet, 1 on mobile) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredRules
          .filter(cat => {
            // When searching, show results from ALL categories
            if (searchQuery.trim() !== '') return cat.rules.length > 0;
            // When not searching, show only the active category
            return cat.category === activeCategory;
          })
          .flatMap(cat => cat.rules.map((rule, idx) => {
            const Icon = (Icons as Record<string, LucideIcon>)[rule.icon] ?? BookOpen;
            return (
              <Card key={`${cat.category}-${idx}`} className="stat-card border shadow-sm dark:border dark:border-white/5 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                {/* Icon + title header */}
                <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
                  <div className="h-9 w-9 rounded-lg bg-[#0d9488]/10 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-[#0d9488]" />
                  </div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">
                    {isDanish ? rule.title : rule.titleEn}
                  </h4>
                </div>

                {/* Structured body */}
                <div className="px-4 pb-3 flex-1 space-y-1.5">
                  {/* Intro */}
                  <p className="text-[13px] leading-relaxed text-gray-700 dark:text-gray-300 font-medium">
                    {isDanish ? rule.intro : rule.introEn}
                  </p>

                  {/* Debet line */}
                  <div className="text-[12px] leading-relaxed text-gray-600 dark:text-gray-400 pl-2 border-l-2 border-gray-200 dark:border-gray-700">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">Debet</span>
                    <span className="mx-1 text-gray-400">—</span>
                    {isDanish ? rule.debitLabel : rule.debitLabelEn}
                  </div>

                  {/* Kredit line */}
                  <div className="text-[12px] leading-relaxed text-gray-600 dark:text-gray-400 pl-2 border-l-2 border-gray-200 dark:border-gray-700">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">Kredit</span>
                    <span className="mx-1 text-gray-400">—</span>
                    {isDanish ? rule.creditLabel : rule.creditLabelEn}
                  </div>

                  {/* Follow-up (optional) */}
                  {rule.followUp && (
                    <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-500 italic pt-0.5">
                      {isDanish ? rule.followUp : rule.followUpEn}
                    </p>
                  )}
                </div>

                {/* Inline accounts — subtle */}
                <div className="px-4 pb-3 pt-1 border-t border-gray-50 dark:border-white/5">
                  <div className="flex items-center gap-1.5 text-[11px] flex-wrap pt-2">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 font-mono">
                      {rule.debitAccount}
                      <span className="font-sans text-gray-500 dark:text-gray-500 hidden sm:inline">{rule.debitAccountName}</span>
                    </span>
                    <ArrowRight className="h-3 w-3 text-gray-300 dark:text-gray-600 shrink-0" />
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 font-mono">
                      {rule.creditAccount}
                      <span className="font-sans text-gray-500 dark:text-gray-500 hidden sm:inline">{rule.creditAccountName}</span>
                    </span>
                  </div>
                </div>
              </Card>
            );
          }))
        }
      </div>
      {filteredRules.flatMap(cat => cat.rules).length === 0 && (
        <p className="text-sm text-gray-400 text-center py-8">
          {isDanish ? 'Ingen regler fundet for din søgning' : 'No rules found for your search'}
        </p>
      )}

      {/* External links */}
      <Card className="stat-card border-0 shadow-sm dark:border dark:border-white/5">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-[#0d9488]" />
            {isDanish ? 'Officiel konteringsvejledning' : 'Official posting guide'}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="space-y-3">
            {guideLinks.length > 0 && (
              <div>
                <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                  {isDanish ? 'Guider og vejledninger' : 'Guides and tutorials'}
                </h5>
                <div className="space-y-0.5">
                  {guideLinks.map(renderReferenceLink)}
                </div>
              </div>
            )}
            {authorityLinks.length > 0 && (
              <div>
                <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                  {isDanish ? 'Standarder og myndigheder' : 'Standards and authorities'}
                </h5>
                <div className="space-y-0.5">
                  {authorityLinks.map(renderReferenceLink)}
                </div>
              </div>
            )}
            {lawLinks.length > 0 && (
              <div>
                <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                  {isDanish ? 'Lovgivning' : 'Legislation'}
                </h5>
                <div className="space-y-0.5">
                  {lawLinks.map(renderReferenceLink)}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Custom guide note */}
      <Card className="stat-card bg-[#0d9488]/5 border-[#0d9488]/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-[#0d9488]/10 flex items-center justify-center shrink-0 mt-0.5">
              <HelpCircle className="h-4 w-4 text-[#0d9488]" />
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
              <p className="font-medium text-[#0d9488] dark:text-[#2dd4bf]">
                {isDanish ? 'Tilføj din egen konteringsvejledning' : 'Add your own posting guide'}
              </p>
              <p>
                {isDanish
                  ? 'Du kan tilføje en personlig konteringsvejledning direkte på hver konto i Kontoplan. Vælg en konto → "Konteringsvejledning" feltet.'
                  : 'Add a custom posting guide directly on each account in the Chart of Accounts.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
