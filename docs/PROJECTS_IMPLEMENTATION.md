# AlphaFlow — Projektbogføring: Implementationsguide

> **Feature:** Projekter med separat regnskab, koblet til tenant-hovedregnskabet
> **Princip:** Simpelt. Stort. dansk-først.

---

## 1. Koncept

Et **Projekt** er en dimension i tenant-regnskabet — ikke et separat selskab. Hver postering (journalbilagslinje) kan tilknyttes et projekt. Dette muliggør:

- **Projekt-specifik resultatopgørelse** (indtægter vs. udgifter pr. projekt)
- **Projekt-budget** med løbende afvigelsesstyring
- **Projekt-tidslinje** (start/slut, status)
- **Konsolideret rapportering** (alle projekter + hovedregnskab)

### Hvorfor `projectId` på `JournalEntryLine` — ikke `JournalEntry`?

Et enkelt bilag kan dække flere projekter (f.eks. en leverandørfaktura med linjer til 2 forskellige projekter). Ved at placere `projectId` på **linjeniveau** opnår vi maksimal granularitet uden at sprænge den dobbelte bogholderis balancer.

---

## 2. Database-schema

### 2.1 Ny model: `Project`

Tilføj til `prisma/schema.prisma`:

```prisma
// ─── PROJECT ACCOUNTING ──────────────────────────────────────────

enum ProjectStatus {
  ACTIVE
  ON_HOLD
  COMPLETED
  CANCELLED
}

model Project {
  id          String        @id @default(cuid())
  name        String                                    // "Hjemmeside redesign"
  code        String?                                   // Kort kode: "PRJ-001"
  description String?                                   // Valgfri beskrivelse
  color       String?                                   // Visuel farve-tag: "#0d9488"
  status      ProjectStatus @default(ACTIVE)
  startDate   DateTime?                                 // Projektets startdato
  endDate     DateTime?                                 // Forventet/ reel slutdato
  budgetTotal Decimal?      @db.Decimal(18, 2)          // Valgfri samlet projektbudget
  customerId  String?                                   // Valgfri kunde-kobling
  companyId   String
  company     Company       @relation(fields: [companyId], references: [id], onDelete: Cascade)
  customer    Contact?      @relation(fields: [customerId], references: [id], onDelete: SetNull)

  // Relations
  journalLines JournalEntryLine[]
  invoices     Invoice[]
  budgetEntries ProjectBudgetEntry[]

  // Meta
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  userId      String?
  user        User?         @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@unique([companyId, code])
  @@index([companyId, status])
  @@index([companyId, customerId])
}
```

### 2.2 Ny model: `ProjectBudgetEntry`

Projekt-budget pr. konto pr. måned — parallelt til eksisterende `BudgetEntry`:

```prisma
model ProjectBudgetEntry {
  id        String   @id @default(cuid())
  projectId String
  companyId String                                    // Denormalized for query performance
  accountId String
  january   Decimal  @db.Decimal(18, 2) @default(0)
  february  Decimal  @db.Decimal(18, 2) @default(0)
  march     Decimal  @db.Decimal(18, 2) @default(0)
  april     Decimal  @db.Decimal(18, 2) @default(0)
  may       Decimal  @db.Decimal(18, 2) @default(0)
  june      Decimal  @db.Decimal(18, 2) @default(0)
  july      Decimal  @db.Decimal(18, 2) @default(0)
  august    Decimal  @db.Decimal(18, 2) @default(0)
  september Decimal  @db.Decimal(18, 2) @default(0)
  october   Decimal  @db.Decimal(18, 2) @default(0)
  november  Decimal  @db.Decimal(18, 2) @default(0)
  december  Decimal  @db.Decimal(18, 2) @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  account   Account  @relation(fields: [accountId], references: [id])

  @@unique([projectId, accountId])
  @@index([projectId])
  @@index([companyId])
  @@index([accountId])
}
```

### 2.3 Tilføj `projectId` til eksisterende modeller

**`JournalEntryLine`** — tilføj ét felt:

```prisma
model JournalEntryLine {
  // ... eksisterende felter ...
  projectId   String?                // NY: valgfri projekt-kobling
  project     Project?   @relation(fields: [projectId], references: [id], onDelete: SetNull)
  // ... resten uændret ...
}
```

**`Invoice`** — tilføj ét felt:

```prisma
model Invoice {
  // ... eksisterende felter ...
  projectId   String?                // NY: valgfri projekt-kobling
  project     Project?   @relation(fields: [projectId], references: [id], onDelete: SetNull)
  // ... resten uændret ...
}
```

**`Company`** — tilføj relation:

```prisma
model Company {
  // ... eksisterende felter ...
  projects              Project[]
  // ... resten uændret ...
}
```

**`Contact`** — tilføj relation:

```prisma
model Contact {
  // ... eksisterende felter ...
  projects  Project[]   // Kunder der er tilknyttet projekter
  // ... resten uændret ...
}
```

**`Account`** — tilføj relation:

```prisma
model Account {
  // ... eksisterende felter ...
  projectBudgetEntries  ProjectBudgetEntry[]
  // ... resten uændret ...
}
```

**`User`** — tilføj relation:

```prisma
model User {
  // ... eksisterende felter ...
  projects   Project[]   // Projekter oprettet af brugeren
  // ... resten uændret ...
}
```

### 2.4 Kør migrering

```bash
npx prisma db push
# eller: npx prisma migrate dev --name add-projects
```

---

## 3. Navigation & Routing

### 3.1 Tilføj til `View` type

**Fil:** `src/components/layout/app-layout.tsx` — linje ~62

```typescript
export type View =
  | 'dashboard'
  | 'transactions'
  | 'invoices'
  | 'projects'         // ← NY
  // ... resten ...
```

### 3.2 Tilføj til sidebar-navigation

**Fil:** `src/components/layout/accordion-nav.tsx` — `NAV_SECTIONS`

Tilføj i `"daily-operations"` sektionen, efter `contacts`:

```typescript
{ id: 'projects', nameDa: 'Projekter', nameEn: 'Projects', icon: Briefcase },
```

Importér `Briefcase` fra `lucide-react`.

### 3.3 Tilføj til kommando-palet

**Fil:** `src/components/command-palette.tsx`

Tilføj `{ id: 'projects', nameDa: 'Projekter', nameEn: 'Projects', icon: Briefcase }`

### 3.4 Tilføj til mobil-bottom-nav

**Fil:** `src/components/mobile-bottom-nav.tsx`

Erstat et eksisterende item eller tilføj som 5. tab (hvis plads).

### 3.5 Render view i `page.tsx`

**Fil:** `src/app/page.tsx` — i `renderView()` switch

```typescript
case 'projects':
  return <ProjectsPage user={user} />;
```

---

## 4. API-Ruter

### 4.1 CRUD — `/api/projects/route.ts`

| Metode | Beskrivelse |
|--------|-------------|
| `GET` | Hent alle projekter for tenant (`companyId`) med aggregeret finansiel status |
| `POST` | Opret nyt projekt (valider unik `code` pr. company) |

### 4.2 Enkelt projekt — `/api/projects/[id]/route.ts`

| Metode | Beskrivelse |
|--------|-------------|
| `GET` | Hent projekt med beregnede nøgletal (realiseret omsætning, omkostninger, resultat) |
| `PUT` | Opdater projekt (navn, status, budget, start/slut, kunde) |
| `DELETE` | Soft-slet: sæt status=CANCELLED, fjern ikke data |

### 4.3 Projekt-budget — `/api/projects/[id]/budget/route.ts`

| Metode | Beskrivelse |
|--------|-------------|
| `GET` | Hent budget-entries med actuals pr. konto pr. måned |
| `PUT` | Opdater budget-entries (batch upsert) |

### 4.4 Projekt-rapport — `/api/projects/[id]/report/route.ts`

| Metode | Beskrivelse |
|--------|-------------|
| `GET` | Projekt-specifik resultatopgørelse (aggreger JournalEntryLine pr. AccountGroup hvor `projectId` matcher) |

### 4.5 Opdater eksisterende ruter

**`/api/journal-entries/route.ts`** — Propager `projectId` fra request body til `JournalEntryLine`:

```typescript
// I linje-oprettelsen:
lines: {
  create: lines.map((l) => ({
    companyId: ctx.activeCompanyId!,
    accountId: l.accountId,
    debit: l.debit,
    credit: l.credit,
    description: l.description || null,
    vatCode: l.vatCode ?? null,
    projectId: l.projectId ?? null,   // ← NY
  })),
},
```

**`/api/transactions/route.ts`** — Tilføj `projectId` til request-body og propager til journal-linje.

**`/api/invoices/route.ts`** — Tilføj `projectId` til invoice creation.

**`/api/reports/route.ts`** — Tilføj valgfri `?projectId=xxx` query parameter for projekt-specifik rapport.

---

## 5. Frontend-komponenter

### 5.1 Nye filer

| Fil | Beskrivelse |
|-----|-------------|
| `src/components/projects/projects-page.tsx` | Hovedside: projektliste + opret-dialog |
| `src/components/projects/project-detail.tsx` | Projekt-detail: oversigt, transaktioner, budget |
| `src/components/projects/project-card.tsx` | Projekt-kort med KPI'er (budget vs. actual, status) |
| `src/components/projects/project-budget-tab.tsx` | Budget-tab med redigerbare felter pr. konto/måned |
| `src/components/projects/project-selector.tsx` | Dropdown til projekt-valg i transaktions-/faktura-formularer |

### 5.2 ProjectsPage — Layout

```
┌─────────────────────────────────────────────────────┐
│  Projekter                              [+ Nyt projekt] │
│  Følg dine projekters økonomi                           │
├─────────────────────────────────────────────────────┤
│  [Søg...]  [Status: Alle ▼]                          │
├─────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ PRJ-001  │  │ PRJ-002  │  │ PRJ-003  │          │
│  │ Hjemmeside│  │ App v2   │  │ Kampagne │          │
│  │ ● Aktiv  │  │ ● Aktiv  │  │ ○ Afsluttet│         │
│  │ 45.000 / │  │ 120.000 /│  │ 25.000 / │          │
│  │ 80.000   │  │ 150.000  │  │ 25.000   │          │
│  │ 56%      │  │ 80%      │  │ 100%     │          │
│  └──────────┘  └──────────┘  └──────────┘          │
└─────────────────────────────────────────────────────┘
```

### 5.3 ProjectDetail — Tabs

```
┌─────────────────────────────────────────────────────┐
│  ← Tilbage    PRJ-001: Hjemmeside redesign    [Rediger]│
│  ● Aktiv  |  Start: 01/03  |  Slut: 30/06            │
├─────────────────────────────────────────────────────┤
│  [Oversigt]  [Transaktioner]  [Budget]  [Fakturaer]  │
├─────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐│
│  │ Resultatopgørelse                               ││
│  │ ────────────────────────────────────             ││
│  │ Indtægter        80.000 DKK                     ││
│  │ Udgifter        -45.000 DKK                     ││
│  │ ────────────────────────────────────             ││
│  │ Projektresultat   35.000 DKK  ▲ 43,7%           ││
│  │ Budgetforbrug     56% af 80.000 DKK             ││
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

### 5.4 ProjectSelector — I transaktions-/faktura-formularer

Tilføj en valgfri dropdown-komponent under eksisterende felter:

```tsx
<Select value={projectId} onValueChange={setProjectId}>
  <SelectTrigger>
    <SelectValue placeholder="Vælg projekt (valgfri)" />
  </SelectTrigger>
  <SelectContent>
    {projects.filter(p => p.status === 'ACTIVE').map(p => (
      <SelectItem key={p.id} value={p.id}>
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color || '#0d9488' }} />
          {p.code ? `${p.code} — ` : ''}{p.name}
        </span>
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

Integrer i:
- `src/components/transaction/add-transaction-form.tsx`
- `src/components/invoices/invoices-page.tsx` (faktura-oprettelse)
- `src/components/journal/` (journal-bilag)

---

## 6. Dashboard — Projekt-widgets

Tilføj to nye widgets til `src/lib/dashboard-widget-definitions.ts`:

| Widget ID | Titel | Data |
|-----------|-------|------|
| `project-summary` | Aktive projekter | Kort-liste med budget vs. actual for top 3 projekter |
| `project-profit` | Projektresultat | Bar-chart med resultat pr. aktivt projekt |

---

## 7. Oversættelser

Tilføj til `src/lib/translations.ts`:

```typescript
// Dansk
projectsTitle: 'Projekter',
projectsDescription: 'Følg dine projekters økonomi',
newProject: 'Nyt projekt',
projectName: 'Projektnavn',
projectCode: 'Projektkode',
projectStatus: 'Status',
projectBudget: 'Budget',
projectActual: 'Realiseret',
projectResult: 'Projektresultat',
projectStartDate: 'Startdato',
projectEndDate: 'Slutdato',
projectCustomer: 'Kunde',
selectProject: 'Vælg projekt (valgfri)',
activeProjects: 'Aktive projekter',
completedProjects: 'Afsluttede projekter',
onHold: 'På pause',
noProjectsYet: 'Ingen projekter endnu',
createFirstProject: 'Opret dit første projekt',

// Engelsk
projectsTitle: 'Projects',
projectsDescription: 'Track your project finances',
newProject: 'New Project',
projectName: 'Project Name',
projectCode: 'Project Code',
// ... osv.
```

---

## 8. Implementationsrækkefølge

### Fase 1: Fundament (Database + API)

| Step | Opgave | Filer |
|------|--------|-------|
| 1.1 | Tilføj `Project`, `ProjectStatus`, `ProjectBudgetEntry` til Prisma-schema | `prisma/schema.prisma` |
| 1.2 | Tilføj `projectId` til `JournalEntryLine` og `Invoice` | `prisma/schema.prisma` |
| 1.3 | Tilføj `projects`-relationer til `Company`, `Contact`, `Account`, `User` | `prisma/schema.prisma` |
| 1.4 | Kør `prisma db push` | CLI |
| 1.5 | Opret `/api/projects/route.ts` (GET list, POST create) | Ny fil |
| 1.6 | Opret `/api/projects/[id]/route.ts` (GET, PUT, DELETE) | Ny fil |
| 1.7 | Opret `/api/projects/[id]/budget/route.ts` (GET, PUT) | Ny fil |
| 1.8 | Opret `/api/projects/[id]/report/route.ts` (GET) | Ny fil |
| 1.9 | Opdater journal-entry API til at understøtte `projectId` på linjer | `src/app/api/journal-entries/route.ts` |
| 1.10 | Opdater transaction API til at propager `projectId` | `src/app/api/transactions/route.ts` |
| 1.11 | Opdater invoice API til at understøtte `projectId` | `src/app/api/invoices/route.ts` |
| 1.12 | Opdater reports API med valgfri `projectId`-filter | `src/app/api/reports/route.ts` |

### Fase 2: Navigation & Siderouter

| Step | Opgave | Filer |
|------|--------|-------|
| 2.1 | Tilføj `'projects'` til `View` type | `src/components/layout/app-layout.tsx` |
| 2.2 | Tilføj projekter til `NAV_SECTIONS` med `Briefcase` ikon | `src/components/layout/accordion-nav.tsx` |
| 2.3 | Tilføj til kommando-palet | `src/components/command-palette.tsx` |
| 2.4 | Tilføj til mobil-bottom-nav | `src/components/mobile-bottom-nav.tsx` |
| 2.5 | Render `<ProjectsPage />` i page.tsx switch | `src/app/page.tsx` |

### Fase 3: Frontend — Projektside

| Step | Opgave | Filer |
|------|--------|-------|
| 3.1 | Opret `projects-page.tsx` med liste + opret-dialog | `src/components/projects/projects-page.tsx` |
| 3.2 | Opret `project-card.tsx` med KPI-visning | `src/components/projects/project-card.tsx` |
| 3.3 | Opret `project-detail.tsx` med tabs | `src/components/projects/project-detail.tsx` |
| 3.4 | Opret `project-budget-tab.tsx` | `src/components/projects/project-budget-tab.tsx` |
| 3.5 | Opret `project-selector.tsx` dropdown | `src/components/projects/project-selector.tsx` |

### Fase 4: Integration i eksisterende forms

| Step | Opgave | Filer |
|------|--------|-------|
| 4.1 | Integrer ProjectSelector i transaktionsformular | `src/components/transaction/add-transaction-form.tsx` |
| 4.2 | Integrer ProjectSelector i faktura-oprettelse | `src/components/invoices/invoices-page.tsx` |
| 4.3 | Integrer ProjectSelector i journal-bilag | `src/components/journal/` |
| 4.4 | Vis projekt-badge på transaktions- og fakturalister | Respektive liste-komponenter |

### Fase 5: Dashboard & Oversættelse

| Step | Opgave | Filer |
|------|--------|-------|
| 5.1 | Tilføj projekt-widgets til dashboard | `src/lib/dashboard-widget-definitions.ts`, `src/components/dashboard/` |
| 5.2 | Tilføj oversættelser (da/en) | `src/lib/translations.ts` |
| 5.3 | Tilføj projekt-relaterede tilladelser (valgfrit) | `src/lib/rbac.ts` |

---

## 9. Kerneprincipper for Implementation

1. **Projekt = Dimension, ikke selskab.** Alle posteringer lever i tenant-regnskabet. Projekt er et filter, ikke en separat ledger.

2. **Valgfri, ikke obligatorisk.** `projectId` er altid nullable. Brugeren kan bogføre uden at vælge et projekt.

3. **Linjeniveau-kobling.** `projectId` på `JournalEntryLine` (ikke `JournalEntry`) giver maksimal fleksibilitet.

4. **Konsolideret rapportering.** Eksisterende rapporter viser altid ALT (inkl. ikke-projekt posteringer). Projekt-rapporter viser KUN projektets linjer.

5. **Farve-tags.** Hvert projekt kan have en farve (`color` felt) for visuel genkendelse på tværs af UI'et.

6. **DKK-valuta.** Projekt-budgetter er altid i tenantens valuta (DKK).

---

## 10. SQL til Projekt-rapport (reference)

```sql
-- Projekt-resultatopgørelse
SELECT
  a.group        AS account_group,
  a.type         AS account_type,
  SUM(jel.debit) AS total_debit,
  SUM(jel.credit) AS total_credit,
  SUM(jel.debit) - SUM(jel.credit) AS balance
FROM "JournalEntryLine" jel
JOIN "Account" a ON a.id = jel."accountId"
JOIN "JournalEntry" je ON je.id = jel."journalEntryId"
WHERE jel."projectId" = $1
  AND jel."companyId" = $2
  AND je.status = 'POSTED'
  AND je.date >= $3   -- start of period
  AND je.date <= $4   -- end of period
  AND je.cancelled = false
GROUP BY a.group, a.type
ORDER BY a.type, a.group;
```

---

*AlphaFlow Projektbogføring — Simpelt. Stort. Dansk.*
