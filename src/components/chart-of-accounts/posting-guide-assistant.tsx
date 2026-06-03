'use client';

import { useState, useCallback } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { toast } from 'sonner';
import { useAccessErrorHandler } from '@/hooks/use-access-error-handler';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  BookOpen,
  Lightbulb,
  Save,
  Loader2,
  ChevronRight,
  ExternalLink,
  Search,
  RefreshCw,
  FileText,
  HelpCircle,
  ArrowUpRight,
} from 'lucide-react';
import { PUBLIC_STANDARD_CHART } from '@/lib/standard-chart-of-accounts';

// ─── Posting Guide Rules (built-in konteringsvejledning) ────────────────

interface PostingRule {
  category: string;
  categoryDa: string;
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
    rules: [
      {
        title: 'Kontantsalg (25% moms)',
        titleEn: 'Cash sale (25% VAT)',
        debitAccount: '1100',
        debitAccountName: 'Bankkonto',
        creditAccount: '1100',
        creditAccountName: 'Salg af varer',
        description: 'Ved salg af varer kontant. Debet bank, kredit salgsindtægt + udgående moms.',
        descriptionEn: 'When selling goods for cash. Debit bank, credit sales revenue + output VAT.',
      },
      {
        title: 'Salg på kredit (25% moms)',
        titleEn: 'Credit sale (25% VAT)',
        debitAccount: '1200',
        debitAccountName: 'Tilgodehavender fra salg',
        creditAccount: '1100',
        creditAccountName: 'Salg af varer',
        description: 'Ved salg på kredit. Debet tilgodehavender, kredit salgsindtægt + udgående moms.',
        descriptionEn: 'When selling on credit. Debit receivables, credit sales revenue + output VAT.',
      },
      {
        title: 'EU-salg (IGS, 0% moms)',
        titleEn: 'EU sale (reverse charge)',
        debitAccount: '1200',
        debitAccountName: 'Tilgodehavender fra salg',
        creditAccount: '4200',
        creditAccountName: 'Salg af varer EU',
        description: 'Salg til EU-land med CVR. Udgående EU (SEU). Ingen dansk moms.',
        descriptionEn: 'Sale to EU country with VAT. Output EU (SEU). No Danish VAT.',
      },
      {
        title: 'Tjenesteydelsessalg',
        titleEn: 'Service revenue',
        debitAccount: '1200',
        debitAccountName: 'Tilgodehavender fra salg',
        creditAccount: '4100',
        creditAccountName: 'Salg af tjenesteydelser',
        description: 'Salg af konsulentydelser, rådgivning etc.',
        descriptionEn: 'Sale of consulting, advisory services etc.',
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
        description: 'Indkøb af varer til videresalg. Debet vareforbrug, kredit leverandørgæld.',
        descriptionEn: 'Purchase goods for resale. Debit purchases, credit payables.',
      },
      {
        title: 'Lønudbetaling',
        titleEn: 'Salary payment',
        debitAccount: '7000',
        debitAccountName: 'Lønninger',
        creditAccount: '1100',
        creditAccountName: 'Bankkonto',
        description: 'Udbetaling af løn. Debet lønomkostning, kredit bank.',
        descriptionEn: 'Payment of salary. Debit salary expense, credit bank.',
      },
      {
        title: 'Husleje',
        titleEn: 'Rent payment',
        debitAccount: '8000',
        debitAccountName: 'Husleje',
        creditAccount: '1100',
        creditAccountName: 'Bankkonto',
        description: 'Månedlig husleje betaling.',
        descriptionEn: 'Monthly rent payment.',
      },
      {
        title: 'EU-indkøb (omvendt betalingspligt)',
        titleEn: 'EU purchase (reverse charge)',
        debitAccount: '6100',
        debitAccountName: 'Indkøb af varer',
        creditAccount: '2000',
        creditAccountName: 'Leverandørgæld',
        description: 'Indkøb fra EU.registreret virksomhed. Købsmoms = udgående moms (omvendt betalingspligt).',
        descriptionEn: 'Purchase from EU-registered business. Input VAT = output VAT (reverse charge).',
      },
    ],
  },
  {
    category: 'moms',
    categoryDa: 'Momsafregning',
    rules: [
      {
        title: 'Momsafregning — netto til betaling',
        titleEn: 'VAT settlement — net payable',
        debitAccount: '2200',
        debitAccountName: 'Momsgæld',
        creditAccount: '1100',
        creditAccountName: 'Bankkonto',
        description: 'Når udgående moms > indgående moms. Betal skyldig moms til Skattestyrelsen.',
        descriptionEn: 'When output VAT > input VAT. Pay due VAT to SKAT.',
      },
      {
        title: 'Momsafregning — refusion',
        titleEn: 'VAT settlement — refund',
        debitAccount: '1100',
        debitAccountName: 'Bankkonto',
        creditAccount: '2200',
        creditAccountName: 'Momsgæld',
        description: 'Når indgående moms > udgående moms. Skattestyrelsen refunderer.',
        descriptionEn: 'When input VAT > output VAT. SKAT refunds the difference.',
      },
    ],
  },
  {
    category: 'period',
    categoryDa: 'Årsafslutning',
    rules: [
      {
        title: 'Årsafslutning — resultat',
        titleEn: 'Year-end — net income',
        debitAccount: '1100',
        debitAccountName: 'Salg af varer/tjenesteydelser',
        creditAccount: '3300',
        creditAccountName: 'Årets resultat',
        description: 'Alle indtægts- og omkostningskonti lukkes mod "Årets resultat".',
        descriptionEn: 'All revenue and expense accounts are closed against "Net Income for the Year".',
      },
      {
        title: 'Årets resultat → Overført resultat',
        titleEn: 'Net income → Retained earnings',
        debitAccount: '3300',
        debitAccountName: 'Årets resultat',
        creditAccount: '3400',
        creditAccountName: 'Overført resultat',
        description: 'Årets resultat overføres til overskud/underskud.',
        descriptionEn: 'Net income transferred to retained earnings.',
      },
    ],
  },
];

// ─── SKAT Reference Links ────────────────────────────────────────────────

const SKAT_REFERENCES = [
  {
    title: 'Bogføringsloven (Bek. 1331)',
    url: 'https://www.retsinformation.dk/eli/lta/2023/1331',
    description: 'Lov om bogføring af certain erhvervsdrivende',
    descriptionEn: 'Danish Bookkeeping Act',
  },
  {
    title: 'Bekendtgørelse om standard bogføringssystemer (BEK 98)',
    url: 'https://www.retsinformation.dk/eli/lta/2023/98',
    description: 'Krav til godkendelse af standard bogføringssystemer',
    descriptionEn: 'Requirements for standard bookkeeping system approval',
  },
  {
    title: 'SKAT — Moms',
    url: 'https://skat.dk/moms',
    description: 'Skattestyrelsens momsguide',
    descriptionEn: 'SKAT VAT guide',
  },
  {
    title: 'Fællesoffentlig Standardkontoplan',
    url: 'https://www.oesta.dk/standardkontoplan',
    description: 'Økonomistyrelsens standardkontoplan for den offentlige sektor',
    descriptionEn: 'Standard chart of accounts for the Danish public sector',
  },
];

// ─── PostingGuideAssistant Component ──────────────────────────────────────

interface PostingGuideAssistantProps {
  user: User;
}

export function PostingGuideAssistant({ user }: PostingGuideAssistantProps) {
  const { language } = useTranslation();
  const isDanish = language === 'da';

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRules = POSTING_RULES.map(cat => ({
    ...cat,
    rules: cat.rules.filter(r =>
      searchQuery.trim() === '' ||
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.titleEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.debitAccountName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.creditAccountName.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter(cat => cat.rules.length > 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-[#0d9488]" />
          {isDanish ? 'Bogføringsguide & Konteringsvejledning' : 'Posting Guide & Chart of Accounts Guide'}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {isDanish
            ? 'Hjælp til korrekt bogføring og kontering (Krav D14, N17, N18)'
            : 'Help with correct bookkeeping and posting (Requirements D14, N17, N18)'}
        </p>
      </div>

      {/* Search */}
      <Card className="stat-card">
        <CardContent className="p-4 pb-2 lg:pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder={isDanish ? 'Søg i bogføringsregler (f.eks. "salg", "moms", "løn")...' : 'Search posting rules (e.g. "sale", "VAT", "salary")...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-gray-50 dark:bg-white/[0.04] border-0"
            />
          </div>
        </CardContent>
      </Card>

      {/* Posting Rules by Category */}
      <div className="space-y-3">
        {filteredRules.map((category) => (
          <Card key={category.category} className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
            <CardContent className="p-0">
              <button
                className="w-full"
                onClick={() => setActiveCategory(activeCategory === category.category ? null : category.category)}
              >
                <div className="flex items-center justify-between p-4 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-[#0d9488]/10 flex items-center justify-center">
                      <BookOpen className="h-4 w-4 text-[#0d9488]" />
                    </div>
                    <div className="text-left">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                        {isDanish ? category.categoryDa : category.category}
                      </h4>
                      <p className="text-xs text-gray-400">
                        {category.rules.length} {isDanish ? 'regler' : 'rules'}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className={`h-5 w-5 text-gray-400 transition-transform ${activeCategory === category.category ? 'rotate-90' : ''}`} />
                </div>
              </button>

              {activeCategory === category.category && (
                <div className="border-t border-gray-100/50 dark:border-white/5">
                  <div className="divide-y divide-gray-50 dark:divide-white/5">
                    {category.rules.map((rule, idx) => (
                      <div key={idx} className="p-4 hover:bg-gray-50/30 dark:hover:bg-white/[0.02] transition-colors">
                        <h5 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                          {isDanish ? rule.title : rule.titleEn}
                        </h5>

                        {/* T-diagram */}
                        <div className="flex items-center gap-3 mb-2">
                          {/* Debit */}
                          <div className="flex-1 bg-green-50 dark:bg-green-500/5 rounded-lg p-2.5 border border-green-200 dark:border-green-500/20">
                            <p className="text-[10px] font-semibold text-green-600 dark:text-green-400 uppercase mb-1">
                              {isDanish ? 'Debet' : 'Debit'}
                            </p>
                            <p className="text-xs font-mono font-bold text-green-700 dark:text-green-300">
                              {rule.debitAccount}
                            </p>
                            <p className="text-xs text-green-600 dark:text-green-400">
                              {rule.debitAccountName}
                            </p>
                          </div>

                          {/* Credit */}
                          <div className="flex-1 bg-red-50 dark:bg-red-500/5 rounded-lg p-2.5 border border-red-200 dark:border-red-500/20">
                            <p className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase mb-1">
                              {isDanish ? 'Kredit' : 'Credit'}
                            </p>
                            <p className="text-xs font-mono font-bold text-red-700 dark:text-red-300">
                              {rule.creditAccount}
                            </p>
                            <p className="text-xs text-red-600 dark:text-red-400">
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
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* SKAT Reference Links (N17 — 3. part konteringsvejledning) */}
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#0d9488]" />
            {isDanish ? 'Officiel konteringsvejledning (3. part)' : 'Official posting guide (3rd party)'}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            {isDanish
              ? 'Reference til officielle danske konteringsvejledninger og standarder. Disse links åbner i en ny fane.'
              : 'References to official Danish posting guides and standards. These links open in a new tab.'}
          </p>
          <div className="space-y-2">
            {SKAT_REFERENCES.map((ref) => (
              <a
                key={ref.title}
                href={ref.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors group"
              >
                <div className="h-8 w-8 rounded-lg bg-[#0d9488]/10 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-[#0d9488]/20 transition-colors">
                  <ExternalLink className="h-3.5 w-3.5 text-[#0d9488]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 dark:text-white group-hover:text-[#0d9488] dark:group-hover:text-[#2dd4bf] transition-colors">
                    {isDanish ? ref.title : ref.descriptionEn}
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                    {isDanish ? ref.description : ref.descriptionEn}
                  </p>
                </div>
                <ArrowUpRight className="h-3 w-3 text-gray-300 group-hover:text-[#0d9488] shrink-0 mt-1 transition-colors" />
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Standardkontoplan Reference */}
      <Card className="stat-card bg-[#0d9488]/5 border-[#0d9488]/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-[#0d9488]/10 flex items-center justify-center shrink-0 mt-0.5">
              <HelpCircle className="h-4 w-4 text-[#0d9488]" />
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
              <p className="font-medium text-[#0d9488] dark:text-[#2dd4bf]">
                {isDanish ? 'Om bogføringsguiden' : 'About the posting guide'}
              </p>
              <p>
                {isDanish
                  ? 'Denne guide indeholder de mest almindelige bogføringsregler for dansk regnskab. Den er baseret på Bogføringsloven (BEK 1331) og standard dansk regnskabspraksis. Hvert regelsæt viser dekontokonto og kreditkonto med forklaring.'
                  : 'This guide contains the most common posting rules for Danish accounting. It is based on the Danish Bookkeeping Act (BEK 1331) and standard Danish accounting practice. Each rule set shows debit and credit accounts with explanation.'}
              </p>
              <p>
                {isDanish
                  ? 'Brugervejledningen (krav N17) refererer til SKATs officielle vejledninger. Den brugerdefinerede konteringsvejledning (krav N18) kan tilføjes direkte på hver konto i Kontoplan under "Konteringsvejledning".'
                  : 'The user guide (requirement N17) references SKAT\'s official guides. Custom posting guides (requirement N18) can be added directly to each account in the Chart of Accounts under "Posting Guide".'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
