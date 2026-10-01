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
  /** Relevant SKAT/Erhvervsstyrelsen link for this specific rule */
  linkUrl?: string;
  linkLabel?: string;
  linkLabelEn?: string;
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
        linkUrl: 'https://skat.dk/moms/salg-af-varer-og-ydelser',
        linkLabel: 'Læs mere om moms ved salg',
        linkLabelEn: 'Read more about VAT on sales',
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
        linkUrl: 'https://xn--bogfringsguide-tqb.skat.dk/#/PMV',
        linkLabel: 'Bogføring af kreditssalg',
        linkLabelEn: 'Booking credit sales',
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
        linkUrl: 'https://skat.dk/moms/handel-med-lande-i-eu',
        linkLabel: 'EU-handel og omvendt betalingspligt',
        linkLabelEn: 'EU trade and reverse charge',
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
        linkUrl: 'https://skat.dk/moms/momspligtige-og-momsfrie-ydelser',
        linkLabel: 'Momspligtige og momsfrie ydelser',
        linkLabelEn: 'VAT-liable and VAT-exempt services',
      },
      {
        title: 'Eksport til lande udenfor EU (0% moms)',
        titleEn: 'Export to non-EU countries (0% VAT)',
        debitAccount: '1200',
        debitAccountName: 'Tilgodehavender fra salg',
        creditAccount: '4300',
        creditAccountName: 'Salg af varer udenfor EU',
        intro: 'Salg af varer til kunder i lande udenfor EU (tredjelande):',
        introEn: 'Sale of goods to customers in non-EU countries:',
        debitLabel: 'Tilgodehavender — kunden skylder dig',
        debitLabelEn: 'Receivables — customer owes you',
        creditLabel: 'Eksportsalg (0% moms) — dokumenter eksporten',
        creditLabelEn: 'Export sale (0% VAT) — document the export',
        followUp: 'Ved vareeksport skal du kunne dokumentere at varerne har forladt EU',
        followUpEn: 'For goods export you must document that goods left the EU',
        icon: 'Truck',
        linkUrl: 'https://skat.dk/moms/eksport-af-varer',
        linkLabel: 'Eksport af varer',
        linkLabelEn: 'Export of goods',
      },
      {
        title: 'Rabatter og kreditnotaer',
        titleEn: 'Discounts and credit notes',
        debitAccount: '1210',
        debitAccountName: 'Salgsrabatter',
        creditAccount: '1200',
        creditAccountName: 'Tilgodehavender fra salg',
        intro: 'Når du giver en rabat eller udsteder en kreditnota efter et salg:',
        introEn: 'When giving a discount or issuing a credit note after a sale:',
        debitLabel: 'Salgsrabat (modposterer salget) + momsregulering',
        debitLabelEn: 'Sales discount (offsets the sale) + VAT adjustment',
        creditLabel: 'Tilgodehavender — reducerer det kunden skylder',
        creditLabelEn: 'Receivables — reduces what customer owes',
        followUp: 'Kreditnotaer skal have reference til den oprindelige faktura',
        followUpEn: 'Credit notes must reference the original invoice',
        icon: 'Receipt',
        linkUrl: 'https://skat.dk/moms/kreditnotaer-og-rabatter',
        linkLabel: 'Kreditnotaer og rabatter',
        linkLabelEn: 'Credit notes and discounts',
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
        linkUrl: 'https://skat.dk/moms/kob-af-varer-og-ydelser',
        linkLabel: 'Køb af varer og ydelser',
        linkLabelEn: 'Purchase of goods and services',
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
        linkUrl: 'https://skat.dk/erhverv/egen-virksomhed/lon-og-mennesker',
        linkLabel: 'Løn og personale',
        linkLabelEn: 'Salaries and personnel',
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
        linkUrl: 'https://skat.dk/moms/momsfri-aktiviteter',
        linkLabel: 'Momsfrie aktiviteter',
        linkLabelEn: 'VAT-exempt activities',
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
        linkUrl: 'https://skat.dk/moms/kob-fra-lande-i-eu',
        linkLabel: 'Køb fra EU-lande',
        linkLabelEn: 'Purchases from EU countries',
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
        linkUrl: 'https://skat.dk/moms/fradragsberettigede-omkostninger',
        linkLabel: 'Fradragsberettigede omkostninger',
        linkLabelEn: 'Deductible expenses',
      },
      {
        title: 'Repræsentation og gaver',
        titleEn: 'Representation and gifts',
        debitAccount: '1990',
        debitAccountName: 'Repræsentation, fuldt fradrag',
        creditAccount: '1100',
        creditAccountName: 'Bankkonto',
        intro: 'Udgifter til repræsentation, gaver til kunder/forretningsforbindelser:',
        introEn: 'Expenses for representation, gifts to customers/business contacts:',
        debitLabel: 'Repræsentationsomkostning (kun 25% af moms er fradragsberettiget)',
        debitLabelEn: 'Representation expense (only 25% of VAT is deductible)',
        creditLabel: 'Bank',
        creditLabelEn: 'Bank',
        followUp: 'Virksomhedsjulegaver og repræsentation har særlige fradragsregler',
        followUpEn: 'Corporate Christmas gifts and representation have special deduction rules',
        icon: 'Briefcase',
        linkUrl: 'https://skat.dk/erhverv/egen-virksomhed/kost-og-repraesentation',
        linkLabel: 'Kost og repræsentation',
        linkLabelEn: 'Meals and representation',
      },
      {
        title: 'Anlægsaktiver og investeringer',
        titleEn: 'Fixed assets and investments',
        debitAccount: '1700',
        debitAccountName: 'Kørende maskiner og udstyr',
        creditAccount: '1100',
        creditAccountName: 'Bankkonto',
        intro: 'Køb af anlægsaktiver (maskiner, IT-udstyr, køretøjer, inventar):',
        introEn: 'Purchase of fixed assets (machinery, IT equipment, vehicles):',
        debitLabel: 'Anlægsaktiv (kapitaliseres, afskrives over tid) + indgående moms',
        debitLabelEn: 'Fixed asset (capitalized, depreciated over time) + input VAT',
        creditLabel: 'Bank',
        creditLabelEn: 'Bank',
        followUp: 'Anlægsaktiver skal afskrives årligt — brug EDB-lignende afskrivning',
        followUpEn: 'Fixed assets must be depreciated annually — use EDB-like depreciation',
        icon: 'Package',
        linkUrl: 'https://skat.dk/erhverv/egen-virksomhed/afskrivninger',
        linkLabel: 'Afskrivninger',
        linkLabelEn: 'Depreciation',
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
        linkUrl: 'https://skat.dk/moms/momsangivelse',
        linkLabel: 'Momsangivelse og betaling',
        linkLabelEn: 'VAT return and payment',
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
        linkUrl: 'https://skat.dk/moms/refusion-af-moms',
        linkLabel: 'Refusion af moms',
        linkLabelEn: 'VAT refund',
      },
      {
        title: 'Moms ved opstart og nedlæggelse',
        titleEn: 'VAT during startup and closure',
        debitAccount: '5410',
        debitAccountName: 'Indgående moms',
        creditAccount: '1100',
        creditAccountName: 'Bankkonto',
        intro: 'Ved virksomhedsopstart kan du fratrække moms af varer købt før registreringen:',
        introEn: 'At business startup you can deduct VAT on goods purchased before registration:',
        debitLabel: 'Indgående moms — forudgående køb (op til 3 år før registrering)',
        debitLabelEn: 'Input VAT — prior purchases (up to 3 years before registration)',
        creditLabel: 'Bank — moms refunderes via første momsangivelse',
        creditLabelEn: 'Bank — VAT refunded via first VAT return',
        followUp: 'Ved nedlæggelse skal der afregnes moms af varelager og anlægsaktiver',
        followUpEn: 'At closure, VAT must be settled on inventory and fixed assets',
        icon: 'Calculator',
        linkUrl: 'https://skat.dk/moms/registrering-og-afregistrering',
        linkLabel: 'Registrering og afregistrering',
        linkLabelEn: 'Registration and deregistration',
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
        linkUrl: 'https://xn--bogfringsguide-tqb.skat.dk/#/PMV',
        linkLabel: 'Årsafslutning i bogføringsguiden',
        linkLabelEn: 'Year-end in the posting guide',
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
        linkUrl: 'https://skat.dk/erhverv/egen-virksomhed/aarsregnskab',
        linkLabel: 'Årsregnskab',
        linkLabelEn: 'Annual accounts',
      },
      {
        title: 'Varelageropgørelse',
        titleEn: 'Inventory valuation',
        debitAccount: '1300',
        debitAccountName: 'Varelager',
        creditAccount: '6000',
        creditAccountName: 'Vareforbrug',
        intro: 'Ved årsafslutning skal varelageret opgøres til laveste værdi (kostpris eller dagspris):',
        introEn: 'At year-end, inventory must be valued at the lower of cost or market price:',
        debitLabel: 'Varelager (opdateres til årets optælling)',
        debitLabelEn: 'Inventory (updated to the year\'s count)',
        creditLabel: 'Vareforbrug — regulering af årets forbrug',
        creditLabelEn: 'Cost of goods — adjustment of the year\'s consumption',
        followUp: 'Værdiansættelse skal følge FIFO- eller gennemsnitsmetoden konsekvent',
        followUpEn: 'Valuation must consistently follow FIFO or average cost method',
        icon: 'Package',
        linkUrl: 'https://skat.dk/erhverv/egen-virksomhed/varelager',
        linkLabel: 'Varelager og værdiansættelse',
        linkLabelEn: 'Inventory and valuation',
      },
      {
        title: 'Afskrivning af anlægsaktiver',
        titleEn: 'Depreciation of fixed assets',
        debitAccount: '1700',
        debitAccountName: 'Afskrivning på anlægsaktiver',
        creditAccount: '1700',
        creditAccountName: 'Akumulerede afskrivninger',
        intro: 'Anlægsaktiver (maskiner, inventar, IT) afskrives årligt over deres levetid:',
        introEn: 'Fixed assets (machinery, furniture, IT) are depreciated annually over their useful life:',
        debitLabel: 'Afskrivningsomkostning — årets fordeling af anlægsaktivets kostpris',
        debitLabelEn: 'Depreciation expense — the year\'s allocation of the asset\'s cost',
        creditLabel: 'Akkumulerede afskrivninger — reducerer anlægsaktivets bogførte værdi',
        creditLabelEn: 'Accumulated depreciation — reduces the asset\'s book value',
        followUp: 'Standard afskrivningssatser: 25% (inventar/IT), 15% (maskiner), 6% (bygninger)',
        followUpEn: 'Standard rates: 25% (furniture/IT), 15% (machinery), 6% (buildings)',
        icon: 'Calculator',
        linkUrl: 'https://skat.dk/erhverv/egen-virksomhed/afskrivninger',
        linkLabel: 'Afskrivningsregler',
        linkLabelEn: 'Depreciation rules',
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
                <div className="px-4 pb-3 flex-1">
                  {/* Intro */}
                  <p className="text-[14px] leading-relaxed text-gray-700 dark:text-gray-300 font-medium mb-3">
                    {isDanish ? rule.intro : rule.introEn}
                  </p>

                  {/* Debet line */}
                  <div className="text-[12px] leading-relaxed text-gray-600 dark:text-gray-400 pl-2 border-l-2 border-gray-200 dark:border-gray-700 mb-1">
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
                    <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-500 italic mt-3">
                      {isDanish ? rule.followUp : rule.followUpEn}
                    </p>
                  )}
                </div>

                {/* Inline accounts — subtle */}
                <div className="px-4 pb-3 pt-1 border-t border-gray-50 dark:border-white/5">
                  <div className="flex items-center justify-between gap-2 pt-2">
                    <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
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
                    {/* Relevant link — clean, doesn't take up much space */}
                    {rule.linkUrl && (
                      <a
                        href={rule.linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-[#0d9488] hover:text-[#0d7c66] dark:text-[#2dd4bf] dark:hover:text-[#5eead4] font-medium shrink-0 transition-colors"
                      >
                        {isDanish ? rule.linkLabel : rule.linkLabelEn}
                        <ArrowUpRight className="h-3 w-3" />
                      </a>
                    )}
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
