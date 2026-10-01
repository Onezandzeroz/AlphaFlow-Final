'use client';

/**
 * PostingGuideAssistant — AlphaFlows bogføringsguide og konteringsvejledning.
 *
 * Tre lag af vejledning (opfylder Bilag 2, 5, a–c / krav 39–41):
 *
 * 1. Indbygget søgbar bogføringsguide (Krav 39) — POSTING_RULES med T-diagram
 * 2. Links til officiel 3.-partskonteringsvejledning (Krav 40) — SKAT guides,
 *    Erhvervsstyrelsen, Retsinformation. Arrangeret efter relevans: guides først,
 *    tunge lov-links bagefter.
 * 3. Brugerdefineret konteringsvejledning pr. konto (Krav 41) — fritekstfelt
 *    på hver konto i Kontoplan.
 *
 * Layout: overskueligt og brugervenligt med kategorier, T-diagrammer og
 * beskrivende forklaringer.
 */

import { useState, useCallback, useMemo } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { toast } from '@/lib/hermes-toast';
import { useAccessErrorHandler } from '@/hooks/use-access-error-handler';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BookOpen,
  Lightbulb,
  ChevronRight,
  ExternalLink,
  Search,
  FileText,
  HelpCircle,
  ArrowUpRight,
  GraduationCap,
  Scale,
  Building2,
  Calculator,
} from 'lucide-react';
import { PUBLIC_STANDARD_CHART } from '@/lib/standard-chart-of-accounts';

// ─── Posting Guide Rules (built-in konteringsvejledning) ────────────────

interface PostingRule {
  category: string;
  categoryDa: string;
  icon: string; // icon name
  rules: Array<{
    title: string;
    titleEn: string;
    debitAccount: string;
    debitAccountName: string;
    creditAccount: string;
    creditAccountName: string;
    description: string;
    descriptionEn: string;
  }>;
}

const POSTING_RULES: PostingRule[] = [
  {
    category: 'salg',
    categoryDa: 'Salg og indtægter',
    icon: 'trending-up',
    rules: [
      {
        title: 'Kontantsalg (25% moms)',
        titleEn: 'Cash sale (25% VAT)',
        debitAccount: '1100',
        debitAccountName: 'Bankkonto',
        creditAccount: '4000',
        creditAccountName: 'Salg af varer',
        description: 'Når du sælger varer eller ydelser og modtager betaling med det samme (kontant, MobilePay, kreditkort). Bogfør beløbet inkl. moms. Debet bank (du modtager penge), kredit salgsindtægt (excl. moms) + udgående moms 25%.',
        descriptionEn: 'When selling goods/services and receiving payment immediately. Debit bank, credit sales revenue + output VAT.',
      },
      {
        title: 'Salg på kredit (25% moms)',
        titleEn: 'Credit sale (25% VAT)',
        debitAccount: '1200',
        debitAccountName: 'Tilgodehavender fra salg',
        creditAccount: '4000',
        creditAccountName: 'Salg af varer',
        description: 'Når du sælger varer eller ydelser på kredit (faktura med betalingsfrist). Debet tilgodehavender (kunden skylder dig), kredit salgsindtægt + udgående moms. Når kunden betaler: debet bank, kredit tilgodehavender.',
        descriptionEn: 'When selling on credit. Debit receivables, credit sales revenue + output VAT.',
      },
      {
        title: 'EU-salg af varer (IGS, 0% moms)',
        titleEn: 'EU sale of goods (reverse charge)',
        debitAccount: '1200',
        debitAccountName: 'Tilgodehavender fra salg',
        creditAccount: '4200',
        creditAccountName: 'Salg af varer EU',
        description: 'Salg af varer til en momsregistreret virksomhed i et andet EU-land. Der faktureres uden dansk moms (0%). Køberen skal oplyse gyldigt udenlandsk CVR/VAT-nummer. Bogføres som EU-salg (SEU). Debet tilgodehavender, kredit EU-salg.',
        descriptionEn: 'Sale of goods to VAT-registered business in another EU country. 0% VAT. Debit receivables, credit EU sales.',
      },
      {
        title: 'Salg af tjenesteydelser',
        titleEn: 'Service revenue',
        debitAccount: '1200',
        debitAccountName: 'Tilgodehavender fra salg',
        creditAccount: '4100',
        creditAccountName: 'Salg af tjenesteydelser',
        description: 'Salg af konsulentydelser, rådgivning, håndværkerarbejde etc. Debet tilgodehavender, kredit salgsindtægt + udgående moms (hvis momspligtig).',
        descriptionEn: 'Sale of consulting, advisory, craft services. Debit receivables, credit revenue + VAT.',
      },
    ],
  },
  {
    category: 'indkob',
    categoryDa: 'Indkøb og udgifter',
    icon: 'shopping-cart',
    rules: [
      {
        title: 'Indkøb af varer (25% moms)',
        titleEn: 'Purchase of goods (25% VAT)',
        debitAccount: '6100',
        debitAccountName: 'Indkøb af varer',
        creditAccount: '2000',
        creditAccountName: 'Leverandørgæld',
        description: 'Når du køber varer til videresalg eller drift. Du modtager en leverandørfaktura med moms. Debet vareforbrug (excl. moms) + indgående moms (momsbeløbet), kredit leverandørgæld (inkl. moms). Når du betaler: debet leverandørgæld, kredit bank.',
        descriptionEn: 'Purchase goods for resale. Debit purchases + input VAT, credit payables. On payment: debit payables, credit bank.',
      },
      {
        title: 'Lønudbetaling',
        titleEn: 'Salary payment',
        debitAccount: '7000',
        debitAccountName: 'Lønninger',
        creditAccount: '1100',
        creditAccountName: 'Bankkonto',
        description: 'Udbetaling af løn til ansatte. Debet lønomkostning (bruttoløn), kredit bank (nettoudbetaling) + personalegæld (A-skat, AM-bidrag, ATP, feriepenge). Husk også at bogføre arbejdsgiverbidrag (ATP, pension) som omkostning.',
        descriptionEn: 'Payment of salary. Debit salary expense, credit bank + payroll liabilities.',
      },
      {
        title: 'Husleje',
        titleEn: 'Rent payment',
        debitAccount: '8000',
        debitAccountName: 'Husleje',
        creditAccount: '1100',
        creditAccountName: 'Bankkonto',
        description: 'Månedlig husleje for erhvervslokaler. Husleje er momsfritaget hvis udlejer er momsregistreret — ellers er der moms. Debet husleje, kredit bank.',
        descriptionEn: 'Monthly rent for business premises. Debit rent expense, credit bank.',
      },
      {
        title: 'EU-indkøb (omvendt betalingspligt)',
        titleEn: 'EU purchase (reverse charge)',
        debitAccount: '6100',
        debitAccountName: 'Indkøb af varer',
        creditAccount: '2000',
        creditAccountName: 'Leverandørgæld',
        description: 'Indkøb af varer fra en momsregistreret virksomhed i et andet EU-land. Leverandøren fakturerer uden moms. Du beregner selv dansk moms (både udgående og indgående = omvendt betalingspligt). Debet vareforbrug + indgående moms, kredit leverandørgæld + udgående moms. Brug momskode KEU.',
        descriptionEn: 'Purchase from EU-registered business. Self-assess VAT (reverse charge). Debit purchases + input VAT, credit payables + output VAT.',
      },
      {
        title: 'Kontorartikler og drift',
        titleEn: 'Office supplies and operations',
        debitAccount: '8700',
        debitAccountName: 'Kontorartikler',
        creditAccount: '1100',
        creditAccountName: 'Bankkonto',
        description: 'Køb af kontorartikler, telefon, internet, forsikring etc. Debet den relevante omkostningskonto (f.eks. 8600 Telefon, 8400 Forsikring), kredit bank + indgående moms 25%.',
        descriptionEn: 'Purchase of office supplies, phone, internet, insurance. Debit expense account, credit bank + input VAT.',
      },
    ],
  },
  {
    category: 'moms',
    categoryDa: 'Momsafregning',
    icon: 'calculator',
    rules: [
      {
        title: 'Momsafregning — du skal betale',
        titleEn: 'VAT settlement — net payable',
        debitAccount: '2200',
        debitAccountName: 'Momsgæld',
        creditAccount: '1100',
        creditAccountName: 'Bankkonto',
        description: 'Hver kvartal (eller måned) skal du afregne moms med Skattestyrelsen. Når udgående moms (salgsmoms) > indgående moms (købsmoms), skal du betale differencen. Nulstil momskontiene: debet udgående moms + debet indgående moms, kredit momsgæld. Betal: debet momsgæld, kredit bank.',
        descriptionEn: 'When output VAT > input VAT. Pay the difference to SKAT.',
      },
      {
        title: 'Momsafregning — du får refusion',
        titleEn: 'VAT settlement — refund',
        debitAccount: '1100',
        debitAccountName: 'Bankkonto',
        creditAccount: '2200',
        creditAccountName: 'Momsgæld',
        description: 'Når indgående moms (købsmoms) > udgående moms (salgsmoms) — typisk ved store investeringer eller opstart — får du moms tilbage. Skattestyrelsen refunderer differencen. Debet bank, kredit momsgæld.',
        descriptionEn: 'When input VAT > output VAT. SKAT refunds the difference.',
      },
    ],
  },
  {
    category: 'period',
    categoryDa: 'Årsafslutning',
    icon: 'calendar',
    rules: [
      {
        title: 'Lukning af resultatopgørelse',
        titleEn: 'Closing income statement',
        debitAccount: '3300',
        debitAccountName: 'Årets resultat',
        creditAccount: '—',
        creditAccountName: 'Alle indtægts-/omkostningskonti',
        description: 'Ved årsafslutning lukkes alle indtægtskonti (4000-4999) og omkostningskonti (6000-8999) mod "Årets resultat" (konto 3300). Indtægter: debet indtægt, kredit årets resultat. Omkostninger: debet årets resultat, kredit omkostning. Resultatet viser årets overskud/underskud.',
        descriptionEn: 'At year-end, all revenue and expense accounts are closed against "Net Income for the Year".',
      },
      {
        title: 'Overførsel til overført resultat',
        titleEn: 'Transfer to retained earnings',
        debitAccount: '3300',
        debitAccountName: 'Årets resultat',
        creditAccount: '3400',
        creditAccountName: 'Overført resultat',
        description: 'Efter at årets resultat er opgjort, overføres beløbet fra "Årets resultat" (3300) til "Overført resultat" (3400). Dette lukker årets resultat-konto og forbereder den nye regnskabsperiode. Debet årets resultat (ved overskud), kredit overført resultat.',
        descriptionEn: 'Net income transferred to retained earnings.',
      },
    ],
  },
];

// ─── Reference Links — arranged by relevance (guides first, law last) ────

interface ReferenceLink {
  title: string;
  url: string;
  description: string;
  descriptionEn: string;
  type: 'guide' | 'authority' | 'law';
  icon: typeof GraduationCap;
}

const REFERENCE_LINKS: ReferenceLink[] = [
  // ─── Guides og vejledninger (mest relevante først) ──────────────────
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

  // ─── Myndigheder og standarder ──────────────────────────────────────
  {
    title: 'Fællesoffentlig Standardkontoplan',
    url: 'https://erhvervsstyrelsen.dk/standardkontoplan-saf-t',
    description: 'Erhvervsstyrelsens officielle fællesoffentlige standardkontoplan — bruges til SAF-T-indberetning. AlphaFlow har alle 603 konti indbygget.',
    descriptionEn: 'Danish Business Authority official standard chart of accounts for SAF-T.',
    type: 'authority',
    icon: Building2,
  },

  // ─── Lovgivning (tunge links sidst) ─────────────────────────────────
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

// ─── Component ───────────────────────────────────────────────────────────

interface PostingGuideAssistantProps {
  user: User;
}

export function PostingGuideAssistant({ user }: PostingGuideAssistantProps) {
  const { language } = useTranslation();
  const isDanish = language === 'da';

  const [activeCategory, setActiveCategory] = useState<string | null>('salg');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRules = useMemo(() =>
    POSTING_RULES.map(cat => ({
      ...cat,
      rules: cat.rules.filter(r =>
        searchQuery.trim() === '' ||
        r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.titleEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.debitAccountName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.creditAccountName.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    })).filter(cat => cat.rules.length > 0),
  [searchQuery]);

  // Group reference links by type
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
        className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors group border border-transparent hover:border-[#0d9488]/20"
      >
        <div className="h-9 w-9 rounded-lg bg-[#0d9488]/10 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-[#0d9488]/20 transition-colors">
          <Icon className="h-4 w-4 text-[#0d9488]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-[#0d9488] dark:group-hover:text-[#2dd4bf] transition-colors">
            {isDanish ? ref.title : ref.descriptionEn}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
            {isDanish ? ref.description : ref.descriptionEn}
          </p>
        </div>
        <ArrowUpRight className="h-4 w-4 text-gray-300 group-hover:text-[#0d9488] shrink-0 mt-1 transition-colors" />
      </a>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-[#0d9488]" />
          {isDanish ? 'Bogføringsguide & Konteringsvejledning' : 'Posting Guide & Chart of Accounts Guide'}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {isDanish
            ? 'Praktisk hjælp til korrekt bogføring, kontering og valg af den rette konto. Inkluderer officielle links til SKAT og Erhvervsstyrelsen.'
            : 'Practical help with correct bookkeeping and account selection. Includes official links to SKAT and the Danish Business Authority.'}
        </p>
      </div>

      {/* ─── Section 1: Søgbar bogføringsguide (Krav 39) ─────────────── */}
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[#0d9488]" />
            {isDanish ? 'Indbygget bogføringsguide' : 'Built-in posting guide'}
            <Badge variant="outline" className="text-[9px] ml-1">Krav 39</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            {isDanish
              ? 'De mest almindelige danske bogføringsregler med T-diagram (debet/kredit) og forklaring. Klik på en kategori for at se reglerne.'
              : 'Most common Danish posting rules with T-diagram and explanation. Click a category to see rules.'}
          </p>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder={isDanish ? 'Søg i bogføringsregler (f.eks. "salg", "moms", "løn")...' : 'Search posting rules...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-gray-50 dark:bg-white/[0.04] border-0"
            />
          </div>

          {/* Categories with rules */}
          <div className="space-y-2">
            {filteredRules.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">
                {isDanish ? 'Ingen regler fundet for din søgning' : 'No rules found for your search'}
              </p>
            ) : (
              filteredRules.map((category) => (
                <div key={category.category} className="rounded-lg border border-gray-100 dark:border-white/5 overflow-hidden">
                  <button
                    className="w-full text-left"
                    onClick={() => setActiveCategory(activeCategory === category.category ? null : category.category)}
                  >
                    <div className="flex items-center justify-between p-3 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-md bg-[#0d9488]/10 flex items-center justify-center">
                          <BookOpen className="h-3.5 w-3.5 text-[#0d9488]" />
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                            {isDanish ? category.categoryDa : category.category}
                          </h4>
                          <p className="text-[10px] text-gray-400">
                            {category.rules.length} {isDanish ? 'regler' : 'rules'}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform ${activeCategory === category.category ? 'rotate-90' : ''}`} />
                    </div>
                  </button>

                  {activeCategory === category.category && (
                    <div className="border-t border-gray-100/50 dark:border-white/5 bg-gray-50/30 dark:bg-white/[0.01]">
                      {category.rules.map((rule, idx) => (
                        <div key={idx} className="p-3 border-b border-gray-100/30 dark:border-white/5 last:border-0">
                          <h5 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                            {isDanish ? rule.title : rule.titleEn}
                          </h5>

                          {/* T-diagram */}
                          <div className="flex items-center gap-2 mb-2">
                            <div className="flex-1 bg-green-50 dark:bg-green-500/5 rounded-lg p-2.5 border border-green-200 dark:border-green-500/20">
                              <p className="text-[9px] font-bold text-green-600 dark:text-green-400 uppercase mb-0.5">
                                {isDanish ? 'Debet' : 'Debit'}
                              </p>
                              <p className="text-xs font-mono font-bold text-green-700 dark:text-green-300">
                                {rule.debitAccount}
                              </p>
                              <p className="text-[11px] text-green-600 dark:text-green-400">
                                {rule.debitAccountName}
                              </p>
                            </div>

                            <div className="flex-1 bg-red-50 dark:bg-red-500/5 rounded-lg p-2.5 border border-red-200 dark:border-red-500/20">
                              <p className="text-[9px] font-bold text-red-600 dark:text-red-400 uppercase mb-0.5">
                                {isDanish ? 'Kredit' : 'Credit'}
                              </p>
                              <p className="text-xs font-mono font-bold text-red-700 dark:text-red-300">
                                {rule.creditAccount}
                              </p>
                              <p className="text-[11px] text-red-600 dark:text-red-400">
                                {rule.creditAccountName}
                              </p>
                            </div>
                          </div>

                          {/* Description */}
                          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                            {isDanish ? rule.description : rule.descriptionEn}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─── Section 2: Officiel konteringsvejledning (Krav 40) ──────── */}
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-[#0d9488]" />
            {isDanish ? 'Officiel konteringsvejledning (3. part)' : 'Official posting guide (3rd party)'}
            <Badge variant="outline" className="text-[9px] ml-1">Krav 40</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            {isDanish
              ? 'Links til officielle danske konteringsvejledninger, guider og lovgrundlag. Arrangeret efter relevans — guider først, lovgivning bagefter. Links åbner i en ny fane.'
              : 'Links to official Danish posting guides and legislation. Arranged by relevance — guides first, laws last. Links open in a new tab.'}
          </p>

          {/* Guides (most relevant) */}
          {guideLinks.length > 0 && (
            <div className="mb-3">
              <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <GraduationCap className="h-3 w-3" />
                {isDanish ? 'Guider og vejledninger' : 'Guides and tutorials'}
              </h5>
              <div className="space-y-1.5">
                {guideLinks.map(renderReferenceLink)}
              </div>
            </div>
          )}

          {/* Authority standards */}
          {authorityLinks.length > 0 && (
            <div className="mb-3">
              <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Building2 className="h-3 w-3" />
                {isDanish ? 'Standarder og myndigheder' : 'Standards and authorities'}
              </h5>
              <div className="space-y-1.5">
                {authorityLinks.map(renderReferenceLink)}
              </div>
            </div>
          )}

          {/* Legislation (heaviest, last) */}
          {lawLinks.length > 0 && (
            <div>
              <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Scale className="h-3 w-3" />
                {isDanish ? 'Lovgivning' : 'Legislation'}
              </h5>
              <div className="space-y-1.5">
                {lawLinks.map(renderReferenceLink)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Section 3: Brugerdefineret konteringsvejledning (Krav 41) ── */}
      <Card className="stat-card bg-[#0d9488]/5 border-[#0d9488]/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-[#0d9488]/10 flex items-center justify-center shrink-0 mt-0.5">
              <HelpCircle className="h-4 w-4 text-[#0d9488]" />
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1.5">
              <p className="font-medium text-[#0d9488] dark:text-[#2dd4bf] flex items-center gap-2">
                {isDanish ? 'Brugerdefineret konteringsvejledning pr. konto' : 'Custom posting guide per account'}
                <Badge variant="outline" className="text-[9px]">Krav 41</Badge>
              </p>
              <p>
                {isDanish
                  ? 'Du kan tilføje en personlig konteringsvejledning direkte på hver konto i Kontoplan. Gå til Kontoplan → vælg en konto → "Konteringsvejledning" feltet. Dette giver dig mulighed for at dokumentere virksomhedsspecifikke bogføringsregler, f.eks. "Konto 8100 bruges kun til el-regninger for lageret".'
                  : 'You can add a custom posting guide directly on each account in the Chart of Accounts. Go to Chart of Accounts → select an account → "Posting Guide" field. This lets you document company-specific rules.'}
              </p>
              <p>
                {isDanish
                  ? 'Standardkonto-mapping (se fanen "Standard mapping") kobler automatisk dine konti til den officielle Fællesoffentlige Standardkontoplan, som hver især har en indbygget beskrivelse.'
                  : 'Standard account mapping (see the "Standard mapping" tab) automatically links your accounts to the official Standard Chart of Accounts, each with a built-in description.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
