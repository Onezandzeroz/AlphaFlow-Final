'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowRightLeft,
  Percent,
  Info,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ─── Types ────────────────────────────────────────────────────────────────

interface VATMappingEntry {
  internalCode: string;
  publicCode: string;
  publicName: string;
  rate: number;
  description: string;
}

// ─── Component ──────────────────────────────────────────────────────────

export function VATMappingPanel() {
  const { language } = useTranslation();
  const isDanish = language === 'da';

  const [mappings, setMappings] = useState<VATMappingEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadMappings() {
      try {
        const res = await fetch('/api/vat-codes/mapping');
        if (res.ok) {
          const data = await res.json();
          setMappings(Object.entries(data.mappings).map(([key, val]: [string, any]) => ({
            internalCode: key,
            ...val,
          })));
        }
      } catch (err) {
        console.error('Failed to fetch VAT mapping:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadMappings();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  // Split into output and input VAT
  const outputVAT = mappings.filter(m => m.internalCode.startsWith('S'));
  const inputVAT = mappings.filter(m => m.internalCode.startsWith('K'));
  const otherVAT = mappings.filter(m => m.internalCode === 'NONE');

  const renderGroup = (title: string, items: VATMappingEntry[]) => (
    <div key={title}>
      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 px-1">
        {title}
      </h4>
      <div className="space-y-1.5">
        {items.map((m) => (
          <div
            key={m.internalCode}
            className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-50/50 dark:bg-white/[0.03] hover:bg-gray-50 dark:hover:bg-white/[0.05] transition-colors"
          >
            {/* Internal code badge */}
            <Badge variant="outline" className="shrink-0 font-mono text-xs min-w-[44px] justify-center">
              {m.internalCode}
            </Badge>

            <ArrowRightLeft className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600 shrink-0" />

            {/* Public code badge */}
            <Badge variant="outline" className="shrink-0 font-mono text-xs min-w-[36px] justify-center bg-[#0d9488]/10 text-[#0d9488] border-[#0d9488]/30">
              {m.publicCode}
            </Badge>

            {/* Rate */}
            <div className="shrink-0 flex items-center gap-1">
              <Percent className="h-3 w-3 text-gray-400" />
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{m.rate}%</span>
            </div>

            {/* Description */}
            <p className="text-xs text-gray-600 dark:text-gray-400 flex-1 truncate">
              {isDanish ? m.description : m.publicName}
            </p>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Percent className="h-4 w-4 text-[#0d9488]" />
          {isDanish ? 'Momskode Mapping' : 'VAT Code Mapping'}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {isDanish
            ? 'Intern ↔ SKAT offentlig momskoder (Krav D13)'
            : 'Internal ↔ SKAT public VAT codes (Requirement D13)'}
        </p>
      </div>

      {/* Info */}
      <Card className="stat-card bg-[#0d9488]/5 border-[#0d9488]/20">
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-[#0d9488] shrink-0 mt-0.5" />
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {isDanish
                ? 'Systemet konverterer automatisk interne momskoder (S25, K25 osv.) til SKATs offentlige momskoder (U25, I25 osv.) ved e-invoicing (OIOUBL/Peppol) og momsindberetning. Mappingen er foruddefineret og kan ikke ændres.'
                : 'The system automatically converts internal VAT codes (S25, K25 etc.) to SKAT\'s public VAT codes (U25, I25 etc.) for e-invoicing (OIOUBL/Peppol) and VAT reporting. The mapping is predefined and cannot be changed.'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Mapping groups */}
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardContent className="p-4">
          <ScrollArea className="max-h-96 overflow-y-auto">
            <div className="space-y-4">
              {renderGroup(isDanish ? 'Udgående moms (Salg)' : 'Output VAT (Sales)', outputVAT)}
              <div className="border-t border-gray-100 dark:border-white/5 pt-4" />
              {renderGroup(isDanish ? 'Indgående moms (Køb)' : 'Input VAT (Purchases)', inputVAT)}
              {otherVAT.length > 0 && (
                <>
                  <div className="border-t border-gray-100 dark:border-white/5 pt-4" />
                  {renderGroup(isDanish ? 'Andet' : 'Other', otherVAT)}
                </>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
