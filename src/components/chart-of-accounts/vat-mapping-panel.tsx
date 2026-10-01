'use client';

/**
 * VATMappingPanel — displays the full official VAT code chart (72 codes)
 * from SKATs Momskoder Bruttoliste (2026-01-01), grouped by category.
 *
 * Also lets users create custom VAT codes (brugerdefinerede momssatser)
 * and map them to official SKAT codes — same pattern as standardkonto-mapping.
 *
 * Features:
 *   - All 72 official codes with guidance from Excel
 *   - Custom VAT codes: create, edit, delete, map to official codes
 *   - Search by code, heading, guidance, or AlphaFlow internal code
 *   - Filter: All / Sales (output) / Purchases (input) / Mapped / Custom
 *   - Type badges and deductibility badges
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { toast } from '@/lib/hermes-toast';
import { useAccessErrorHandler } from '@/hooks/use-access-error-handler';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { StandardAccountCombobox } from '@/components/chart-of-accounts/standard-account-combobox';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Percent,
  Info,
  Search,
  CheckCircle2,
  ArrowRightLeft,
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
} from 'lucide-react';
import { SAFT_VAT_CODES, type SaftVatCode } from '@/lib/saft-vat-codes';

// ─── Types ────────────────────────────────────────────────────────────────

interface CustomVatCode {
  id: string;
  code: string;
  name: string;
  rate: number;
  direction: string; // "output" | "input"
  standardVatCode: string | null;
  description: string | null;
  isActive: boolean;
}

// Reserved codes that cannot be used as custom code names
const RESERVED_CODES = new Set(['S25', 'S12', 'S0', 'SEU', 'K25', 'K12', 'K0', 'KEU', 'KUF', 'NONE']);

// ─── Component ──────────────────────────────────────────────────────────

export function VATMappingPanel() {
  const { language } = useTranslation();
  const isDanish = language === 'da';
  const { handleMutationError } = useAccessErrorHandler();

  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<string>('ALL');

  // Custom VAT codes state
  const [customCodes, setCustomCodes] = useState<CustomVatCode[]>([]);
  const [isLoadingCustom, setIsLoadingCustom] = useState(true);
  const [editingCustom, setEditingCustom] = useState<CustomVatCode | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // New/edit form state
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formRate, setFormRate] = useState('25');
  const [formDirection, setFormDirection] = useState('output');
  const [formStandardCode, setFormStandardCode] = useState('UNMAPPED');
  const [formDescription, setFormDescription] = useState('');
  const [isSavingCustom, setIsSavingCustom] = useState(false);

  // ─── Fetch custom VAT codes ─────────────────────────────────────────
  const fetchCustomCodes = useCallback(async () => {
    setIsLoadingCustom(true);
    try {
      const res = await fetch('/api/vat-codes/custom');
      if (res.ok) {
        const data = await res.json();
        setCustomCodes(data.customVatCodes || []);
      }
    } catch (err) {
      console.error('Failed to fetch custom VAT codes:', err);
    } finally {
      setIsLoadingCustom(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomCodes();
  }, [fetchCustomCodes]);

  // ─── Create / Save custom VAT code ─────────────────────────────────
  const handleSaveCustom = useCallback(async () => {
    if (!formCode.trim() || !formName.trim()) {
      toast.error(isDanish ? 'Kode og navn er påkrævet' : 'Code and name are required');
      return;
    }

    const upperCode = formCode.toUpperCase().trim();
    if (RESERVED_CODES.has(upperCode)) {
      toast.error(isDanish ? `Koden "${upperCode}" er reserveret` : `Code "${upperCode}" is reserved`);
      return;
    }

    setIsSavingCustom(true);
    try {
      const isEditing = !!editingCustom;
      const body = {
        ...(isEditing ? { id: editingCustom!.id } : {}),
        code: upperCode,
        name: formName.trim(),
        rate: parseInt(formRate, 10) || 0,
        direction: formDirection,
        standardVatCode: formStandardCode === 'UNMAPPED' ? null : formStandardCode,
        description: formDescription.trim() || null,
      };

      const res = await fetch('/api/vat-codes/custom', {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const isAccess = await handleMutationError(res, isDanish ? 'Gem momskode' : 'Save VAT code');
        if (isAccess) { setIsSavingCustom(false); return; }
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save');
      }

      await fetchCustomCodes();
      toast.success(isDanish ? 'Momskode gemt!' : 'VAT code saved!');
      setShowCreateDialog(false);
      setEditingCustom(null);
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSavingCustom(false);
    }
  }, [formCode, formName, formRate, formDirection, formStandardCode, formDescription, editingCustom, fetchCustomCodes, isDanish, handleMutationError]);

  // ─── Delete custom VAT code ────────────────────────────────────────
  const handleDeleteCustom = useCallback(async (id: string) => {
    if (!confirm(isDanish ? 'Slet denne momskode?' : 'Delete this VAT code?')) return;
    try {
      const res = await fetch(`/api/vat-codes/custom?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      await fetchCustomCodes();
      toast.success(isDanish ? 'Momskode slettet' : 'VAT code deleted');
    } catch (err) {
      toast.error(isDanish ? 'Kunne ikke slette' : 'Failed to delete');
    }
  }, [fetchCustomCodes, isDanish]);

  // ─── Open edit dialog ──────────────────────────────────────────────
  const openEditDialog = (custom: CustomVatCode) => {
    setEditingCustom(custom);
    setFormCode(custom.code);
    setFormName(custom.name);
    setFormRate(String(custom.rate));
    setFormDirection(custom.direction);
    setFormStandardCode(custom.standardVatCode || 'UNMAPPED');
    setFormDescription(custom.description || '');
    setShowCreateDialog(true);
  };

  // ─── Open create dialog ────────────────────────────────────────────
  const openCreateDialog = () => {
    setEditingCustom(null);
    resetForm();
    setShowCreateDialog(true);
  };

  const resetForm = () => {
    setFormCode('');
    setFormName('');
    setFormRate('25');
    setFormDirection('output');
    setFormStandardCode('UNMAPPED');
    setFormDescription('');
  };

  // ─── Group official codes — ONLY show mapped (active) codes ────────
  // Unmapped/inactive official codes are hidden from the user. The full
  // list of 72 codes is still available in the "Mapping til officiel
  // momskode" dropdown in the create/edit dialog (with guidance tooltips).
  const groupedCodes = useMemo(() => {
    // Only show codes that have an alphaFlowCode mapping (i.e. the 7
    // built-in codes that AlphaFlow actually uses) PLUS any official
    // codes that custom codes are mapped to.
    const mappedOfficialCodes = new Set(
      customCodes
        .filter((c) => c.standardVatCode)
        .map((c) => c.standardVatCode!)
    );

    let codes = SAFT_VAT_CODES.filter(
      (c) => c.alphaFlowCode !== null || mappedOfficialCodes.has(c.standardCode)
    );

    if (filter === 'OUTPUT') {
      codes = codes.filter((c) => c.group.toLowerCase().includes('salg'));
    } else if (filter === 'INPUT') {
      codes = codes.filter((c) => c.group.toLowerCase().includes('køb') || c.group.toLowerCase().includes('kob'));
    } else if (filter === 'MAPPED') {
      codes = codes.filter((c) => c.alphaFlowCode !== null);
    } else if (filter === 'CUSTOM') {
      codes = []; // Custom codes are shown separately
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      codes = codes.filter(
        (c) =>
          c.standardCode.toLowerCase().includes(q) ||
          c.legacyCode.toLowerCase().includes(q) ||
          c.heading.toLowerCase().includes(q) ||
          c.codeRef.toLowerCase().includes(q) ||
          c.guidance.toLowerCase().includes(q) ||
          (c.alphaFlowCode?.toLowerCase().includes(q) ?? false),
      );
    }

    const groups: Record<string, SaftVatCode[]> = {};
    for (const code of codes) {
      if (!groups[code.group]) groups[code.group] = [];
      groups[code.group].push(code);
    }
    return groups;
  }, [searchQuery, filter, customCodes]);

  const mappedCount = SAFT_VAT_CODES.filter((c) => c.alphaFlowCode !== null).length;
  const activeOfficialCount = mappedCount + customCodes.filter(c => c.standardVatCode).length;

  const renderOfficialCode = (code: SaftVatCode) => {
    const isMapped = code.alphaFlowCode !== null;
    return (
      <div
        key={code.standardCode}
        className={`flex items-start gap-2 p-2.5 rounded-lg transition-colors ${
          isMapped
            ? 'bg-[#0d9488]/5 hover:bg-[#0d9488]/10'
            : 'bg-gray-50/50 dark:bg-white/[0.02] hover:bg-gray-50 dark:hover:bg-white/[0.04]'
        }`}
      >
        <Badge
          variant="outline"
          className={`shrink-0 font-mono text-xs min-w-[48px] justify-center ${
            isMapped
              ? 'bg-[#0d9488]/10 text-[#0d9488] border-[#0d9488]/30'
              : 'bg-gray-100 dark:bg-white/5 text-gray-500'
          }`}
        >
          {code.standardCode}
        </Badge>

        {isMapped ? (
          <div className="flex items-center gap-1 shrink-0">
            <ArrowRightLeft className="h-3 w-3 text-[#0d9488]" />
            <Badge variant="outline" className="shrink-0 font-mono text-xs min-w-[36px] justify-center bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/30">
              {code.alphaFlowCode}
            </Badge>
          </div>
        ) : (
          <div className="shrink-0 w-[52px]" />
        )}

        <div className="shrink-0 flex items-center gap-1 min-w-[44px]">
          <Percent className="h-3 w-3 text-gray-400" />
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            {code.rate > 0 ? `${code.rate}%` : '—'}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p className={`text-xs font-medium ${isMapped ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
            {code.heading}
          </p>
          {code.guidance && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-1 cursor-help">
                    {code.guidance}
                  </p>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-md">
                  <p className="text-xs">{code.guidance}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {code.deductible && (
          <Badge variant="outline" className="shrink-0 text-[9px] hidden sm:inline-flex">
            {code.deductible === '1' ? 'Fuld fradrag' : code.deductible === '0' ? 'Intet fradrag' : code.deductible}
          </Badge>
        )}

        {isMapped && <CheckCircle2 className="h-3.5 w-3.5 text-[#0d9488] shrink-0" />}
      </div>
    );
  };

  const renderCustomCode = (custom: CustomVatCode) => {
    const mappedOfficial = custom.standardVatCode
      ? SAFT_VAT_CODES.find((c) => c.standardCode === custom.standardVatCode)
      : null;

    return (
      <div
        key={custom.id}
        className={`flex items-start gap-2 p-2.5 rounded-lg transition-colors ${
          custom.isActive
            ? 'bg-purple-50/50 dark:bg-purple-900/10 hover:bg-purple-50 dark:hover:bg-purple-900/20'
            : 'bg-gray-50/30 dark:bg-white/[0.01] opacity-60'
        }`}
      >
        {/* Custom code badge */}
        <Badge variant="outline" className="shrink-0 font-mono text-xs min-w-[48px] justify-center bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800/30">
          {custom.code}
        </Badge>

        {/* Mapping arrow + official code */}
        {mappedOfficial ? (
          <div className="flex items-center gap-1 shrink-0">
            <ArrowRightLeft className="h-3 w-3 text-purple-500" />
            <Badge variant="outline" className="shrink-0 font-mono text-xs min-w-[48px] justify-center bg-[#0d9488]/10 text-[#0d9488] border-[#0d9488]/30">
              {mappedOfficial.standardCode}
            </Badge>
          </div>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            <ArrowRightLeft className="h-3 w-3 text-gray-300" />
            <Badge variant="outline" className="shrink-0 text-[9px] text-red-500 border-red-200 dark:border-red-800/30">
              {isDanish ? 'Ikke mappet' : 'Unmapped'}
            </Badge>
          </div>
        )}

        {/* Rate */}
        <div className="shrink-0 flex items-center gap-1 min-w-[44px]">
          <Percent className="h-3 w-3 text-gray-400" />
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            {custom.rate}%
          </span>
        </div>

        {/* Name + description */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-900 dark:text-white">
            {custom.name}
          </p>
          {custom.description && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-1">
              {custom.description}
            </p>
          )}
          {mappedOfficial && (
            <p className="text-[10px] text-[#0d9488] dark:text-[#2dd4bf] mt-0.5 line-clamp-1">
              {mappedOfficial.heading}
            </p>
          )}
        </div>

        {/* Direction badge */}
        <Badge variant="outline" className="shrink-0 text-[9px] hidden sm:inline-flex">
          {custom.direction === 'output' ? (isDanish ? 'Salg' : 'Sales') : (isDanish ? 'Køb' : 'Purchase')}
        </Badge>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => openEditDialog(custom)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-red-500 hover:text-red-600"
            onClick={() => handleDeleteCustom(custom.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Percent className="h-4 w-4 text-[#0d9488]" />
            {isDanish ? 'Momskode Mapping' : 'VAT Code Mapping'}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {isDanish
              ? `${activeOfficialCount} aktive momskoder + ${customCodes.length} brugerdefinerede`
              : `${activeOfficialCount} active VAT codes + ${customCodes.length} custom`}
          </p>
        </div>
        <Button
          size="sm"
          onClick={openCreateDialog}
          className="bg-[#0d9488] hover:bg-[#0d7c66] text-white"
        >
          <Plus className="h-4 w-4 mr-1" />
          {isDanish ? 'Tilføj momssats' : 'Add VAT rate'}
        </Button>
      </div>

      {/* Info */}
      <Card className="stat-card bg-[#0d9488]/5 border-[#0d9488]/20">
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-[#0d9488] shrink-0 mt-0.5" />
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {isDanish
                ? `Systemet konverterer automatisk interne momskoder til SKATs officielle momskoder ved e-invoicing og momsindberetning. Du kan tilføje egne momssatser (f.eks. 5% kunstneres førstegangssalg, 20% leasingbiler) og mappe dem til officielle koder. Vejledning fra Excel-arket vises som tooltip.`
                : `The system automatically converts internal VAT codes to SKAT's official VAT codes for e-invoicing and VAT reporting. You can add custom VAT rates (e.g. 5% artists' first sale, 20% leasing vehicles) and map them to official codes. Guidance from the Excel sheet is shown as tooltips.`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Search + Filter */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[140px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={isDanish ? 'Søg momskode, beskrivelse eller vejledning…' : 'Search VAT code, description or guidance…'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="shrink-0 w-auto min-w-[140px] bg-gray-50 dark:bg-white/[0.04] border-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-[#1a1f1e]">
            <SelectItem value="ALL">{isDanish ? 'Alle aktive' : 'All active'}</SelectItem>
            <SelectItem value="OUTPUT">{isDanish ? 'Salg (output)' : 'Sales (output)'}</SelectItem>
            <SelectItem value="INPUT">{isDanish ? 'Køb (input)' : 'Purchases (input)'}</SelectItem>
            <SelectItem value="CUSTOM">{isDanish ? 'Brugerdefinerede' : 'Custom codes'}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Custom VAT codes section */}
      {(filter === 'ALL' || filter === 'CUSTOM') && customCodes.length > 0 && (
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardContent className="p-4">
            <h4 className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-2 px-1 flex items-center gap-2">
              {isDanish ? 'Brugerdefinerede momssatser' : 'Custom VAT rates'}
              <Badge variant="outline" className="text-[9px] font-normal">
                {customCodes.length}
              </Badge>
            </h4>
            <div className="space-y-1.5">
              {customCodes.map(renderCustomCode)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Official code groups */}
      {filter !== 'CUSTOM' && (
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardContent className="p-4">
            <ScrollArea className="max-h-[600px] overflow-y-auto">
              <div className="space-y-4">
                {Object.entries(groupedCodes).length === 0 ? (
                  <div className="py-12 text-center">
                    <BookOpen className="h-10 w-10 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {isDanish ? 'Ingen momskoder fundet' : 'No VAT codes found'}
                    </p>
                  </div>
                ) : (
                  Object.entries(groupedCodes).map(([group, codes]) => (
                    <div key={group}>
                      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 px-1 flex items-center gap-2">
                        {group}
                        <Badge variant="outline" className="text-[9px] font-normal">
                          {codes.length}
                        </Badge>
                      </h4>
                      <div className="space-y-1.5">
                        {codes.map(renderOfficialCode)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => { setShowCreateDialog(open); if (!open) { setEditingCustom(null); resetForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingCustom
                ? (isDanish ? 'Rediger momssats' : 'Edit VAT rate')
                : (isDanish ? 'Tilføj brugerdefineret momssats' : 'Add custom VAT rate')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {/* Code + Rate row */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  {isDanish ? 'Kode' : 'Code'}
                </label>
                <Input
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  placeholder="f.eks. S5, K33"
                  className="mt-1 font-mono"
                  disabled={!!editingCustom}
                />
              </div>
              <div className="w-24">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  {isDanish ? 'Sats %' : 'Rate %'}
                </label>
                <Input
                  type="number"
                  value={formRate}
                  onChange={(e) => setFormRate(e.target.value)}
                  placeholder="25"
                  className="mt-1"
                  min={0}
                  max={100}
                />
              </div>
              <div className="w-32">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  {isDanish ? 'Type' : 'Type'}
                </label>
                <Select value={formDirection} onValueChange={setFormDirection}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="output">{isDanish ? 'Salg' : 'Sales'}</SelectItem>
                    <SelectItem value="input">{isDanish ? 'Køb' : 'Purchase'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                {isDanish ? 'Navn' : 'Name'}
              </label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={isDanish ? 'f.eks. Kunstneres førstegangssalg 5%' : 'e.g. Artists first sale 5%'}
                className="mt-1"
              />
            </div>

            {/* Mapping to official code */}
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                {isDanish ? 'Mapping til officiel momskode' : 'Map to official VAT code'}
              </label>
              <div className="mt-1">
                <Select value={formStandardCode} onValueChange={setFormStandardCode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    <SelectItem value="UNMAPPED" className="text-red-500">
                      {isDanish ? '— Ikke mappet —' : '— Unmapped —'}
                    </SelectItem>
                    {SAFT_VAT_CODES.map((code) => (
                      <TooltipProvider key={code.standardCode}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div>
                              <SelectItem value={code.standardCode}>
                                <span className="font-mono">{code.standardCode}</span>
                                <span className="mx-1.5 text-gray-300">—</span>
                                <span className="truncate">{code.heading}</span>
                                {code.rate > 0 && <span className="ml-2 text-gray-400 text-[10px]">{code.rate}%</span>}
                              </SelectItem>
                            </div>
                          </TooltipTrigger>
                          {code.guidance && (
                            <TooltipContent side="left" className="max-w-sm">
                              <p className="text-xs font-medium mb-1">{code.heading}</p>
                              <p className="text-xs text-gray-500">{code.guidance}</p>
                              {code.reportingRule && (
                                <p className="text-[10px] text-gray-400 mt-1">
                                  {isDanish ? 'Angivelse: ' : 'Reporting: '}{code.reportingRule}
                                </p>
                              )}
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                {isDanish ? 'Beskrivelse (valgfrit)' : 'Description (optional)'}
              </label>
              <Input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder={isDanish ? 'Beskriv hvornår denne kode anvendes' : 'Describe when to use this code'}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); setEditingCustom(null); resetForm(); }}>
              <X className="h-4 w-4 mr-1" />
              {isDanish ? 'Annuller' : 'Cancel'}
            </Button>
            <Button
              onClick={handleSaveCustom}
              disabled={isSavingCustom || !formCode.trim() || !formName.trim()}
              className="bg-[#0d9488] hover:bg-[#0d7c66] text-white"
            >
              {isSavingCustom ? (
                <span className="animate-pulse">{isDanish ? 'Gemmer…' : 'Saving…'}</span>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-1" />
                  {isDanish ? 'Gem' : 'Save'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
