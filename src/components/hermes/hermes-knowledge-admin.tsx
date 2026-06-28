'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  BookOpen,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  FileText,
  AlertCircle,
  CheckCircle2,
  Globe,
  Building2,
  Search,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

interface KnowledgeDoc {
  id: string;
  title: string;
  category: string;
  tenantId: string | null;
  description: string | null;
  source: string;
  chunkCount: number;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface KnowledgeDocFull extends KnowledgeDoc {
  content: string;
}

// ── Component ──────────────────────────────────────────────────────

export function HermesKnowledgeAdmin() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editTarget, setEditTarget] = useState<KnowledgeDocFull | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeDoc | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Editor form state
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formCategory, setFormCategory] = useState('manual');
  const [formTenantId, setFormTenantId] = useState('global');
  const [formDescription, setFormDescription] = useState('');

  // ── Fetch documents ──
  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch('/api/hermes/knowledge');
      if (res.ok) {
        const data = await res.json();
        setDocs(data.documents ?? []);
      } else {
        toast.error('Kunne ikke hente vidensbase-dokumenter.');
      }
    } catch (err) {
      console.error('Failed to fetch knowledge docs:', err);
      toast.error('Kunne ikke hente vidensbase-dokumenter.');
    }
  }, []);

  useEffect(() => {
    fetchDocs().finally(() => setIsLoading(false));
  }, [fetchDocs]);

  // ── Refresh ──
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchDocs();
    setIsRefreshing(false);
  }, [fetchDocs]);

  // ── Open editor for new document ──
  const openNewEditor = useCallback(() => {
    setEditTarget(null);
    setFormTitle('');
    setFormContent('');
    setFormCategory('manual');
    setFormTenantId('global');
    setFormDescription('');
    setIsEditorOpen(true);
  }, []);

  // ── Open editor for existing document ──
  const openEditEditor = useCallback(async (doc: KnowledgeDoc) => {
    try {
      const res = await fetch(`/api/hermes/knowledge/${doc.id}`);
      if (res.ok) {
        const data = await res.json();
        const full = data.document as KnowledgeDocFull;
        setEditTarget(full);
        setFormTitle(full.title);
        setFormContent(full.content);
        setFormCategory(full.category);
        setFormTenantId(full.tenantId ?? 'global');
        setFormDescription(full.description ?? '');
        setIsEditorOpen(true);
      } else {
        toast.error('Kunne ikke hente dokumentet.');
      }
    } catch (err) {
      toast.error('Kunne ikke hente dokumentet.');
    }
  }, []);

  // ── Save (create or update) ──
  const handleSave = useCallback(async () => {
    if (!formTitle.trim() || !formContent.trim()) {
      toast.error('Titel og indhold er påkrævet.');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        title: formTitle,
        content: formContent,
        category: formCategory,
        tenantId: formTenantId === 'global' ? null : formTenantId,
        description: formDescription || null,
      };

      const res = editTarget
        ? await fetch(`/api/hermes/knowledge/${editTarget.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/hermes/knowledge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

      if (res.ok) {
        const data = await res.json();
        toast.success(
          editTarget
            ? `Dokument opdateret (${data.chunkCount} chunks).`
            : `Dokument oprettet (${data.chunkCount} chunks).`,
        );
        setIsEditorOpen(false);
        await fetchDocs();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || 'Kunne ikke gemme dokumentet.');
      }
    } catch (err) {
      console.error('Save failed:', err);
      toast.error('Kunne ikke gemme dokumentet.');
    } finally {
      setIsSaving(false);
    }
  }, [formTitle, formContent, formCategory, formTenantId, formDescription, editTarget, fetchDocs]);

  // ── Delete ──
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/hermes/knowledge/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success(`"${deleteTarget.title}" slettet.`);
        setDeleteTarget(null);
        await fetchDocs();
      } else {
        toast.error('Kunne ikke slette dokumentet.');
      }
    } catch (err) {
      toast.error('Kunne ikke slette dokumentet.');
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, fetchDocs]);

  // ── Reindex ──
  const handleReindex = useCallback(async (doc: KnowledgeDoc) => {
    toast.info(`Re-indekserer "${doc.title}"...`);
    try {
      const res = await fetch(`/api/hermes/knowledge/${doc.id}/reindex`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Re-indeksering færdig (${data.chunkCount} chunks).`);
        await fetchDocs();
      } else {
        toast.error('Re-indeksering fejlede.');
      }
    } catch (err) {
      toast.error('Re-indeksering fejlede.');
    }
  }, [fetchDocs]);

  // ── Filter docs by search ──
  const filteredDocs = docs.filter((d) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.title.toLowerCase().includes(q) ||
      d.category.toLowerCase().includes(q) ||
      (d.description ?? '').toLowerCase().includes(q)
    );
  });

  // ── Summary stats ──
  const totalDocs = docs.length;
  const activeDocs = docs.filter((d) => d.status === 'active').length;
  const errorDocs = docs.filter((d) => d.status === 'error').length;
  const totalChunks = docs.reduce((sum, d) => sum + d.chunkCount, 0);

  // ── Render ──
  return (
    <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
      <CardHeader className="pb-4">
        <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
            <BookOpen className="h-4 w-4 text-white" />
          </div>
          Vidensbase (RAG)
          <Badge variant="outline" className="ml-1 text-xs">SuperDev</Badge>
        </CardTitle>
        <CardDescription className="text-sm">
          Administrer Hermes' semantiske vidensbase. Dokumenter chunkes, embeddes og gøres søgbare.
          Tenant-noter er kun synlige for den specifikke virksomhed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary + actions */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">{totalDocs} dokumenter</Badge>
            <Badge variant="secondary">{totalChunks} chunks</Badge>
            <Badge variant={activeDocs === totalDocs ? 'default' : 'destructive'} className="gap-1">
              {activeDocs === totalDocs ? (
                <><CheckCircle2 className="h-3 w-3" /> Alle aktive</>
              ) : (
                <><AlertCircle className="h-3 w-3" /> {errorDocs} med fejl</>
              )}
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Opdater
            </Button>
            <Button size="sm" onClick={openNewEditor}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Nyt dokument
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Søg i dokumenter..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9"
          />
        </div>

        {/* Document list */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-lg">
            {docs.length === 0 ? (
              <>
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                Ingen dokumenter endnu. Klik &quot;Nyt dokument&quot; for at tilføje viden.
              </>
            ) : (
              'Ingen dokumenter matcher din søgning.'
            )}
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredDocs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
              >
                <div className="mt-0.5 shrink-0">
                  {doc.tenantId ? (
                    <Building2 className="h-4 w-4 text-blue-500" />
                  ) : (
                    <Globe className="h-4 w-4 text-emerald-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{doc.title}</span>
                    <Badge variant="outline" className="text-[10px] py-0">{doc.category}</Badge>
                    {doc.status !== 'active' && (
                      <Badge variant="destructive" className="text-[10px] py-0">{doc.status}</Badge>
                    )}
                  </div>
                  {doc.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {doc.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                    <span>{doc.chunkCount} chunks</span>
                    <span>{doc.tenantId ? 'Tenant-specifik' : 'Global'}</span>
                    {doc.status === 'error' && doc.errorMessage && (
                      <span className="text-red-500 truncate" title={doc.errorMessage}>
                        ⚠ {doc.errorMessage}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => openEditEditor(doc)}
                    title="Rediger"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => handleReindex(doc)}
                    title="Re-indekser"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                    onClick={() => setDeleteTarget(doc)}
                    title="Slet"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* ── Editor dialog ── */}
      <Dialog open={isEditorOpen} onOpenChange={(open) => { if (!open) setIsEditorOpen(false); }}>
        <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? 'Rediger dokument' : 'Nyt vidensbase-dokument'}
            </DialogTitle>
            <DialogDescription>
              Dokumentet deles i chunks, embeddes og gøres semantisk søgbart for Hermes.
              Store dokumenter kan tage op til et minut at indeksere.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="kb-title" className="text-sm">Titel *</Label>
              <Input
                id="kb-title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="f.eks. AlphaFlow Brugsvejledning"
              />
            </div>

            {/* Category + Tenant scope */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="kb-category" className="text-sm">Kategori</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger id="kb-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual (app-brug)</SelectItem>
                    <SelectItem value="general">Generel viden</SelectItem>
                    <SelectItem value="faq">FAQ</SelectItem>
                    <SelectItem value="tax-rules">Skatteregler</SelectItem>
                    <SelectItem value="tenant-note">Tenant-notat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kb-scope" className="text-sm">Synlighed</Label>
                <Select value={formTenantId} onValueChange={setFormTenantId}>
                  <SelectTrigger id="kb-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Global (alle tenants)</SelectItem>
                    <SelectItem value={typeof window !== 'undefined' ? (document.querySelector('[data-active-company-id]') as HTMLElement)?.dataset.activeCompanyId || 'current' : 'current'}>
                      Kun aktuel tenant
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="kb-desc" className="text-sm">Beskrivelse (valgfrit)</Label>
              <Input
                id="kb-desc"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Kort beskrivelse vist i oversigten"
              />
            </div>

            {/* Content */}
            <div className="space-y-1.5">
              <Label htmlFor="kb-content" className="text-sm">
                Indhold * <span className="text-xs text-muted-foreground">(Markdown understøttes)</span>
              </Label>
              <Textarea
                id="kb-content"
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Indsæt dokumentets fulde indhold her..."
                className="min-h-[300px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {formContent.length.toLocaleString('da-DK')} tegn · ca. {Math.ceil(formContent.length / 4)} tokens
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditorOpen(false)} disabled={isSaving}>
              Annullér
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Indekserer...</>
              ) : editTarget ? (
                <><Edit2 className="h-4 w-4 mr-2" /> Gem & re-indekser</>
              ) : (
                <><Plus className="h-4 w-4 mr-2" /> Opret & indekser</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Slet dokument?</DialogTitle>
            <DialogDescription>
              &quot;{deleteTarget?.title}&quot; og alle dens {deleteTarget?.chunkCount} chunks slettes permanent.
              Denne handling kan ikke fortrydes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              Annullér
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Slet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
