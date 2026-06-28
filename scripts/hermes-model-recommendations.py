# -*- coding: utf-8 -*-
"""
Hermes AI — Modelanbefalinger til professionel regnskabsrådgivning.
Genererer et professionelt PDF-dokument med modelanbefalinger + priser.
Output: hermes-modelanbefalinger.pdf
"""
import os
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table,
    TableStyle, PageBreak, KeepTogether, HRFlowable, NextPageTemplate
)

# ──────────────────────────────────────────────────────────────
# Fonts (Latin — Danish æøå fully covered by Liberation Sans)
# ──────────────────────────────────────────────────────────────
FONT_DIR = '/usr/share/fonts/truetype/liberation'
pdfmetrics.registerFont(TTFont('Sans',       f'{FONT_DIR}/LiberationSans-Regular.ttf'))
pdfmetrics.registerFont(TTFont('Sans-Bold',  f'{FONT_DIR}/LiberationSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('Sans-Italic',f'{FONT_DIR}/LiberationSans-Italic.ttf'))
pdfmetrics.registerFont(TTFont('Mono',       f'{FONT_DIR}/LiberationMono-Regular.ttf'))
pdfmetrics.registerFont(TTFont('Mono-Bold',  f'{FONT_DIR}/LiberationMono-Bold.ttf'))
registerFontFamily('Sans', normal='Sans', bold='Sans-Bold', italic='Sans-Italic')

# ──────────────────────────────────────────────────────────────
# Palette (cascade-generated, professional steel-blue/teal)
# ──────────────────────────────────────────────────────────────
PAGE_BG       = colors.HexColor('#f4f5f5')
SECTION_BG    = colors.HexColor('#f0f1f2')
CARD_BG       = colors.HexColor('#eaeced')
TABLE_STRIPE  = colors.HexColor('#f3f4f5')
HEADER_FILL   = colors.HexColor('#416374')
COVER_BLOCK   = colors.HexColor('#2f4550')
BORDER        = colors.HexColor('#b3bfc5')
ICON          = colors.HexColor('#53869f')
ACCENT        = colors.HexColor('#3b95c3')
ACCENT_2      = colors.HexColor('#c65064')
TEXT_PRIMARY  = colors.HexColor('#1c1e1f')
TEXT_MUTED    = colors.HexColor('#878d90')
SEM_SUCCESS   = colors.HexColor('#4b805d')
SEM_WARNING   = colors.HexColor('#907847')
SEM_ERROR     = colors.HexColor('#b04d44')

# Tier accent colors
TIER1_COLOR = colors.HexColor('#2f4550')   # premium — dark slate
TIER2_COLOR = colors.HexColor('#416374')   # balanced — steel
TIER3_COLOR = colors.HexColor('#53869f')   # budget — muted teal

# ──────────────────────────────────────────────────────────────
# Page geometry
# ──────────────────────────────────────────────────────────────
PAGE_W, PAGE_H = A4
MARGIN_L = 22 * mm
MARGIN_R = 22 * mm
MARGIN_T = 24 * mm
MARGIN_B = 20 * mm
CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R

# ──────────────────────────────────────────────────────────────
# Paragraph styles
# ──────────────────────────────────────────────────────────────
ss = {}
ss['cover_title'] = ParagraphStyle('cover_title', fontName='Sans-Bold', fontSize=30,
    leading=36, textColor=colors.white, alignment=TA_LEFT, spaceAfter=6)
ss['cover_sub'] = ParagraphStyle('cover_sub', fontName='Sans', fontSize=13,
    leading=18, textColor=colors.HexColor('#c8d4da'), alignment=TA_LEFT, spaceAfter=4)
ss['cover_meta'] = ParagraphStyle('cover_meta', fontName='Sans', fontSize=9.5,
    leading=14, textColor=colors.HexColor('#9fb0b8'), alignment=TA_LEFT)
ss['cover_tag'] = ParagraphStyle('cover_tag', fontName='Sans-Bold', fontSize=9,
    leading=12, textColor=ACCENT, alignment=TA_LEFT)

ss['h1'] = ParagraphStyle('h1', fontName='Sans-Bold', fontSize=18, leading=23,
    textColor=TIER1_COLOR, spaceBefore=14, spaceAfter=8, keepWithNext=True)
ss['h2'] = ParagraphStyle('h2', fontName='Sans-Bold', fontSize=13, leading=18,
    textColor=HEADER_FILL, spaceBefore=12, spaceAfter=5, keepWithNext=True)
ss['h3'] = ParagraphStyle('h3', fontName='Sans-Bold', fontSize=11, leading=15,
    textColor=TEXT_PRIMARY, spaceBefore=8, spaceAfter=3, keepWithNext=True)

ss['body'] = ParagraphStyle('body', fontName='Sans', fontSize=10, leading=15.5,
    textColor=TEXT_PRIMARY, alignment=TA_JUSTIFY, spaceAfter=7)
ss['body_left'] = ParagraphStyle('body_left', fontName='Sans', fontSize=10, leading=15.5,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT, spaceAfter=7)
ss['bullet'] = ParagraphStyle('bullet', fontName='Sans', fontSize=10, leading=15,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT, leftIndent=14, bulletIndent=2,
    spaceAfter=3, bulletFontName='Sans-Bold', bulletFontSize=10)
ss['muted'] = ParagraphStyle('muted', fontName='Sans-Italic', fontSize=9, leading=13,
    textColor=TEXT_MUTED, alignment=TA_LEFT, spaceAfter=5)
ss['caption'] = ParagraphStyle('caption', fontName='Sans', fontSize=8.5, leading=12,
    textColor=TEXT_MUTED, alignment=TA_LEFT, spaceAfter=4, spaceBefore=2)

ss['table_h'] = ParagraphStyle('table_h', fontName='Sans-Bold', fontSize=9, leading=12,
    textColor=colors.white, alignment=TA_LEFT)
ss['table_h_c'] = ParagraphStyle('table_h_c', fontName='Sans-Bold', fontSize=9, leading=12,
    textColor=colors.white, alignment=TA_CENTER)
ss['table_c'] = ParagraphStyle('table_c', fontName='Sans', fontSize=9, leading=12.5,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT)
ss['table_c_c'] = ParagraphStyle('table_c_c', fontName='Sans', fontSize=9, leading=12.5,
    textColor=TEXT_PRIMARY, alignment=TA_CENTER)
ss['table_mono'] = ParagraphStyle('table_mono', fontName='Mono', fontSize=8.5, leading=12,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT)
ss['table_price'] = ParagraphStyle('table_price', fontName='Mono-Bold', fontSize=8.5, leading=12,
    textColor=TIER1_COLOR, alignment=TA_CENTER)
ss['table_bold'] = ParagraphStyle('table_bold', fontName='Sans-Bold', fontSize=9, leading=12.5,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT)

ss['code'] = ParagraphStyle('code', fontName='Mono', fontSize=8.5, leading=12.5,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT, leftIndent=8, rightIndent=8,
    backColor=CARD_BG, borderPadding=6, spaceAfter=6)

ss['callout'] = ParagraphStyle('callout', fontName='Sans', fontSize=9.5, leading=14,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT, leftIndent=10, rightIndent=10,
    spaceAfter=6, spaceBefore=2)

# ──────────────────────────────────────────────────────────────
# Page templates
# ──────────────────────────────────────────────────────────────
def cover_bg(canvas, doc):
    canvas.saveState()
    # Full-bleed dark cover background
    canvas.setFillColor(COVER_BLOCK)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    # Accent vertical bar on left
    canvas.setFillColor(ACCENT)
    canvas.rect(0, 0, 6 * mm, PAGE_H, stroke=0, fill=1)
    # Subtle geometric accent — diagonal block bottom right
    canvas.setFillColor(colors.HexColor('#3a525c'))
    p = canvas.beginPath()
    p.moveTo(PAGE_W, 0)
    p.lineTo(PAGE_W, 60 * mm)
    p.lineTo(PAGE_W - 80 * mm, 0)
    p.close()
    canvas.drawPath(p, stroke=0, fill=1)
    # Thin top rule
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(0.8)
    canvas.line(MARGIN_L, PAGE_H - 20 * mm, PAGE_W - MARGIN_R, PAGE_H - 20 * mm)
    canvas.restoreState()

def body_bg(canvas, doc):
    canvas.saveState()
    # White page
    canvas.setFillColor(colors.white)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    # Header rule
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN_L, PAGE_H - MARGIN_T + 8 * mm, PAGE_W - MARGIN_R, PAGE_H - MARGIN_T + 8 * mm)
    # Header text (left)
    canvas.setFont('Sans', 8)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN_L, PAGE_H - MARGIN_T + 11 * mm, 'Hermes AI  ·  Modelanbefalinger')
    # Header text (right)
    canvas.drawRightString(PAGE_W - MARGIN_R, PAGE_H - MARGIN_T + 11 * mm, 'AlphaFlow · Regnskabsassistent')
    # Footer rule
    canvas.line(MARGIN_L, MARGIN_B - 4 * mm, PAGE_W - MARGIN_R, MARGIN_B - 4 * mm)
    # Footer text
    canvas.setFont('Sans', 8)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN_L, MARGIN_B - 8 * mm, 'Internt teknisk notat')
    canvas.drawRightString(PAGE_W - MARGIN_R, MARGIN_B - 8 * mm, f'Side {doc.page - 1}')
    canvas.restoreState()

# ──────────────────────────────────────────────────────────────
# Build story
# ──────────────────────────────────────────────────────────────
def P(text, style='body'):
    return Paragraph(text, ss[style])

story = []

# ══════════════════════════════════════════════════════════════
# COVER PAGE
# ══════════════════════════════════════════════════════════════
story.append(Spacer(1, 70 * mm))
story.append(P('TEKNISKE ANBEFALINGER', 'cover_tag'))
story.append(Spacer(1, 4 * mm))
story.append(P('Hermes AI —<br/>Modelanbefalinger', 'cover_title'))
story.append(Spacer(1, 6 * mm))
story.append(P('Valg af LLM-model til professionel<br/>regnskabsrådgivning i AlphaFlow', 'cover_sub'))
story.append(Spacer(1, 18 * mm))
story.append(HRFlowable(width=40 * mm, thickness=1.2, color=ACCENT, spaceBefore=0, spaceAfter=6))
story.append(P('Udarbejdet til: AlphaFlow · Hermes Agent Service', 'cover_meta'))
story.append(P('Formål: Erstatning af ustabil gratis model med produktionskvalitet', 'cover_meta'))
story.append(P('Dato: Juni 2026', 'cover_meta'))

story.append(NextPageTemplate('body'))
story.append(PageBreak())

# ══════════════════════════════════════════════════════════════
# 1. INDLEDNING
# ══════════════════════════════════════════════════════════════
story.append(P('1. Indledning', 'h1'))
story.append(P(
    'Hermes er AlphaFlows AI-drevne regnskabskonsulent, der betjener brugere via en Socket.IO-baseret '
    'mini-service. Servicen kalder i dag OpenRouters gratis model <b>meta-llama/llama-3.3-70b-instruct:free</b>, '
    'som leveres af upstream-udbyderen Venice. Denne model deler kapacitet på tværs af alle OpenRouters '
    'gratis-brugere og returnerer hyppigt HTTP 429 ("temporarily rate-limited upstream"). Selv med den '
    'automatiske retry-logik vi har implementeret, forbliver modellen ustabil i produktion.', 'body'))
story.append(P(
    'Dette notat anbefaler modeller, der kan levere <b>professionel regnskabsrådgivning</b> på dansk — '
    'det vil sige modeller med stærk ræsonnementsevne, pålidelig nummerisk forståelse, god dansk '
    'sprogunderstøttelse og stabil kapacitet uden delt rate-limiting. dårlig kvalitet er ikke acceptabelt '
    'i en regnskabskontekst, hvor forkerte tal eller misforståede skatteregler har reelle økonomiske '
    'konsekvenser for brugerne.', 'body'))

# ══════════════════════════════════════════════════════════════
# 2. EVALUERINGSKRITERIER
# ══════════════════════════════════════════════════════════════
story.append(P('2. Evalueringskriterier', 'h1'))
story.append(P(
    'Modellerne er vurderet på fem kriterier, der alle er afgørende for en regnskabsassistent i produktion. '
    'En model kan have lav pris og god sprogkvalitet, men hvis den rate-limites hyppigt eller har svagt '
    'nummerisk ræsonnement, er den uegnet til formålet.', 'body'))

crit_data = [
    [P('Kriterium', 'table_h'), P('Hvorfor det er kritisk for Hermes', 'table_h'), P('Vægt', 'table_h_c')],
    [P('Dansk sprogkvalitet', 'table_bold'),
     P('Korrekt grammatik, naturligt dansk, forstår fagtermer (moms, skat, årsregnskab, CVR).', 'table_c'),
     P('Høj', 'table_c_c')],
    [P('Nummerisk ræsonnement', 'table_bold'),
     P('Korrekt håndtering af beløb, procentberegninger, momsopgørelser og frister uden hallucinationer.', 'table_c'),
     P('Kritisk', 'table_c_c')],
    [P('Pålidelighed / oppetid', 'table_bold'),
     P('Ingen delt rate-limiting. Betalte modeller har dedikeret kapacitet og langt færre 429-fejl.', 'table_c'),
     P('Høj', 'table_c_c')],
    [P('Pris per samtale', 'table_bold'),
     P('Samtalevolumen bestemmer den månedlige omkostning. Både input- og outputpris tæller.', 'table_c'),
     P('Medium', 'table_c_c')],
    [P('Kontekstvindue', 'table_bold'),
     P('Store kontekstvinduer tillader at medsende virksomhedens fulde regnskabsdata som kontekst.', 'table_c'),
     P('Medium', 'table_c_c')],
]
crit_tbl = Table(crit_data, colWidths=[42 * mm, CONTENT_W - 42 * mm - 20 * mm, 20 * mm])
crit_tbl.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, TABLE_STRIPE]),
    ('GRID', (0, 0), (-1, -1), 0.4, BORDER),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ('TOPPADDING', (0, 0), (-1, -1), 5),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
]))
story.append(crit_tbl)

# ══════════════════════════════════════════════════════════════
# 3. ANBEFALEDE MODELLER (hovedtabel med priser)
# ══════════════════════════════════════════════════════════════
story.append(P('3. Anbefalede modeller — oversigt og priser', 'h1'))
story.append(P(
    'Nedenfor er modellerne inddelt i tre kvalitetstier. Priser er OpenRouters offesielle priser per '
    '<b>1 million tokens</b> (input / output) og gælder pay-as-you-go uden abonnement. Alle priser er '
    'i USD. Se afsnit 5 for en konkret omkostningsberegning per samtale.', 'body'))

# Helper to make tier header row
def tier_header(text, color):
    return [Paragraph(f'<font color="white"><b>{text}</b></font>', ss['table_h']), '', '', '', '', '']

# Main comparison table
hdr = [
    P('Model', 'table_h'),
    P('Pris input<br/>per 1M tok', 'table_h_c'),
    P('Pris output<br/>per 1M tok', 'table_h_c'),
    P('Kontekst', 'table_h_c'),
    P('Dansk<br/>kvalitet', 'table_h_c'),
    P('Passer til', 'table_h'),
]

# Tier 1 — Premium
t1_rows = [
    ['TIER 1 — PREMIUM (produktionskvalitet)', '', '', '', '', ''],
    ['Anthropic Claude Sonnet 4', '$3.00', '$15.00', '200K', 'Fremragende',
     'Kompleks rådgivning, skat, regler'],
    ['OpenAI GPT-4.1', '$2.00', '$8.00', '1M', 'Fremragende',
     'Alm. rådgivning, bred viden'],
    ['Google Gemini 2.5 Pro', '$1.25', '$10.00', '1M', 'God',
     'Store regnskabsdata som kontekst'],
]
# Tier 2 — Balanced
t2_rows = [
    ['TIER 2 — BALANCERET (kvalitet + pris)', '', '', '', '', ''],
    ['Anthropic Claude 3.5 Haiku', '$1.00', '$5.00', '200K', 'God',
     'Daglig rådgivning, hurtig svar'],
    ['Google Gemini 2.5 Flash', '$0.30', '$2.50', '1M', 'God',
     'Hurtig, billig, god kvalitet'],
    ['OpenAI GPT-4o-mini', '$0.15', '$0.60', '128K', 'Acceptabel',
     'Budget, simple spørgsmål'],
]
# Tier 3 — Budget
t3_rows = [
    ['TIER 3 — BUDGET (acceptabel, ikke til kompleks rådgivning)', '', '', '', '', ''],
    ['DeepSeek V3.1', '$0.27', '$1.10', '128K', 'Acceptabel',
     'Meget billig, rimelig kvalitet'],
    ['Meta Llama 3.3 70B (betalt)', '$0.23', '$0.40', '128K', 'Acceptabel',
     'Fjerner delt rate-limiting'],
]

all_rows = [hdr]
# Tier 1
tier1_start = len(all_rows)
all_rows.append(t1_rows[0])
for r in t1_rows[1:]:
    all_rows.append([P(r[0], 'table_bold'), P(r[1], 'table_price'), P(r[2], 'table_price'),
                     P(r[3], 'table_c_c'), P(r[4], 'table_c_c'), P(r[5], 'table_c')])
# Tier 2
tier2_start = len(all_rows)
all_rows.append(t2_rows[0])
for r in t2_rows[1:]:
    all_rows.append([P(r[0], 'table_bold'), P(r[1], 'table_price'), P(r[2], 'table_price'),
                     P(r[3], 'table_c_c'), P(r[4], 'table_c_c'), P(r[5], 'table_c')])
# Tier 3
tier3_start = len(all_rows)
all_rows.append(t3_rows[0])
for r in t3_rows[1:]:
    all_rows.append([P(r[0], 'table_bold'), P(r[1], 'table_price'), P(r[2], 'table_price'),
                     P(r[3], 'table_c_c'), P(r[4], 'table_c_c'), P(r[5], 'table_c')])

col_widths = [52 * mm, 22 * mm, 22 * mm, 16 * mm, 20 * mm, CONTENT_W - 52*mm - 22*mm - 22*mm - 16*mm - 20*mm]
main_tbl = Table(all_rows, colWidths=col_widths, repeatRows=1)

style_cmds = [
    # Header
    ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('GRID', (0, 0), (-1, -1), 0.4, BORDER),
    ('LEFTPADDING', (0, 0), (-1, -1), 5),
    ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ('TOPPADDING', (0, 0), (-1, -1), 4),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    # Tier headers (span across all columns)
    ('SPAN', (0, tier1_start), (-1, tier1_start)),
    ('BACKGROUND', (0, tier1_start), (-1, tier1_start), TIER1_COLOR),
    ('SPAN', (0, tier2_start), (-1, tier2_start)),
    ('BACKGROUND', (0, tier2_start), (-1, tier2_start), TIER2_COLOR),
    ('SPAN', (0, tier3_start), (-1, tier3_start)),
    ('BACKGROUND', (0, tier3_start), (-1, tier3_start), TIER3_COLOR),
    # Tier header text color
    ('TEXTCOLOR', (0, tier1_start), (-1, tier3_start), colors.white),
    ('FONTNAME', (0, tier1_start), (-1, tier3_start), 'Sans-Bold'),
    ('FONTSIZE', (0, tier1_start), (-1, tier3_start), 9),
    ('ALIGN', (0, tier1_start), (-1, tier3_start), 'LEFT'),
    # Row striping for data rows (skip tier headers)
]
# Add striping for data rows
data_row_indices = []
for i in range(1, len(all_rows)):
    if i not in (tier1_start, tier2_start, tier3_start):
        data_row_indices.append(i)
for idx, ri in enumerate(data_row_indices):
    if idx % 2 == 1:
        style_cmds.append(('BACKGROUND', (0, ri), (-1, ri), TABLE_STRIPE))

main_tbl.setStyle(TableStyle(style_cmds))
story.append(main_tbl)
story.append(P(
    'Kilde: OpenRouter prisliste, juni 2026 (openrouter.ai/models). Priser kan ændre sig — verificér '
    'aktuelle priser før implementering.', 'caption'))

# ══════════════════════════════════════════════════════════════
# 4. DETALJERET VURDERING
# ══════════════════════════════════════════════════════════════
story.append(P('4. Detaljeret vurdering af anbefalede modeller', 'h1'))

story.append(P('4.1 Anthropic Claude Sonnet 4 — bedste samlede kvalitet', 'h2'))
story.append(P(
    'Claude Sonnet 4 er den klart stærkeste model til professionel regnskabsrådgivning. Den har overlegen '
    'ræsonnementsevne, forstår komplekse skatteregler og danske fagtermer naturligt, og har den laveste '
    'rate af "hallucinationer" (forkerte tal) i branchen. Modellen er ideel når brugeren spørger ind til '
    'momsberegning, frister, årsregnskab eller komplekse skattescenarier. Ulempen er prisen: ca. tre gange '
    'dyrere end GPT-4.1 per output-token, men til gengæld får man svar der sjældent behøver dobbelttjek.', 'body'))

story.append(P('4.2 OpenAI GPT-4.1 — stærk all-round-model', 'h2'))
story.append(P(
    'GPT-4.1 er en velafbalanceret model med bred viden om dansk skattelovgivning og regnskabspraksis. '
    'Den har et enormt kontekstvindue på 1 million tokens, hvilket gør det muligt at medsende et helt '
    'regnskabsår som kontekst. Dansk sprogkvalitet er fremragende. Prisen er moderate, og OpenAI leverer '
    'stabil kapacitet uden den rate-limiting der plager gratis-modellerne. Et sikkert valg til daglig drift.', 'body'))

story.append(P('4.3 Google Gemini 2.5 Pro — bedst til store datakontekster', 'h2'))
story.append(P(
    'Gemini 2.5 Pro kombinerer et 1 million token-kontekstvindue med stærk ræsonnementsevne til en lavere '
    'inputpris end både Claude og GPT-4.1. Den er særligt stærk når Hermes skal analysere store mængder '
    'regnskabsdata (transaktioner, fakturaer, historik) som kontekst. Outputprisen er dog højere end '
    'GPT-4.1, så den er mest økonomisk fordata-tunge opgaver frem for hyppige korte samtaler.', 'body'))

story.append(P('4.4 Anthropic Claude 3.5 Haiku — bedst balanceret til daglig drift', 'h2'))
story.append(P(
    'Claude 3.5 Haiku er Anthropics hurtige, billige model — og overraskende stærk på dansk. Den bevarer '
    'meget af Claudes ræsonnementskvalitet men til en femtedel af outputprisen. Dette er den anbefalede '
    'model til <b>Hermes i daglig drift</b>: hurtig svar, god kvalitet, forudsigelig omkostning. Kun ved '
    'meget komplekse spørgsmål (skatteplanlægning, selskabsret) bør man opgradere til Sonnet 4.', 'body'))

story.append(P('4.5 Google Gemini 2.5 Flash — billigste med god kvalitet', 'h2'))
story.append(P(
    'Gemini 2.5 Flash er Googles hurtige model med 1 million tokens kontekst. Til $0.30/$2.50 per million '
    'tokens leverer den bemærkelsesværdig god kvalitet til en brøkdel af prisen for premium-modellerne. '
    'Et fremragende valg når samtalevolumen er høj og budgettet stramt. Dansk kvalitet er god, dog ikke '
    'helt på niveau med Claude-familien til nuancerede fagtermer.', 'body'))

story.append(P('4.6 OpenAI GPT-4o-mini — den absolut billigste', 'h2'))
story.append(P(
    'GPT-4o-mini er ekstremt billig ($0.15/$0.60) og lynhurtig, men dansk kvalitet er kun "acceptabel" '
    'og nummerisk ræsonnement svækkes ved komplekse beregninger. Velegnet til simple rutine-spørgsmål '
    '(frister, basis moms-satser) men <b>ikke</b> til rådgivning der kræver dyb faglig forståelse. '
    'Anbefales kun som budget-fallback eller til interne test-scripts.', 'body'))

story.append(P('4.7 DeepSeek V3.1 — open-source alternativ med god værdi', 'h2'))
story.append(P(
    'DeepSeek V3.1 er en kinesisk open-source model der har vundet popularitet for sin lave pris og '
    'overraskende stærke ræsonnement. Dansk sprogkvalitet er acceptabel men ikke i topklasse — den kan '
    'lejlighedsvis fremstå formel eller let maskinoversat. Prisen er fremragende. Velegnet som budget-'
    'model hvis man accepterer lidt lavere sproglig polish.', 'body'))

story.append(P('4.8 Meta Llama 3.3 70B (betalt) — fjerner rate-limit-problemet', 'h2'))
story.append(P(
    'Det er den <b>samme model</b> som den nuværende gratis version, blot via betalt rute. Dette fjerner '
    'helt den delt rate-limiting der forårsager 429-fejlene, til en meget lav pris ($0.23/$0.40). Dansk '
    'kvalitet er acceptabel men ikke topklasse. Et godt "mindre indgreb"-valg hvis man vil løse '
    'stabiliteten hurtigt uden at skifte model-familie.', 'body'))

# ══════════════════════════════════════════════════════════════
# 5. PRISBEREGNING
# ══════════════════════════════════════════════════════════════
story.append(PageBreak())
story.append(P('5. Omkostningsberegning per samtale', 'h1'))
story.append(P(
    'En typisk Hermes-samtale består af et system-prompt + virksomhedens regnskabskontekst + '
    'samtalehistorik + brugerens spørgsmål (ca. <b>1.500 input-tokens</b>) og et fyldestgørende svar '
    '(ca. <b>600 output-tokens</b>). Nedenfor er omkostningen per samtale og per måned ved to '
    'forskellige samtalevolumener.', 'body'))

cost_hdr = [P('Model', 'table_h'),
            P('Pris per<br/>samtale', 'table_h_c'),
            P('100 samtaler/dag<br/>(≈3.000/md)', 'table_h_c'),
            P('1.000 samtaler/dag<br/>(≈30.000/md)', 'table_h_c')]
cost_rows = [cost_hdr,
    [P('Claude Sonnet 4', 'table_bold'),        P('$0,014', 'table_price'), P('≈ $40/md',  'table_c_c'), P('≈ $405/md',  'table_c_c')],
    [P('OpenAI GPT-4.1', 'table_bold'),         P('$0,008', 'table_price'), P('≈ $23/md',  'table_c_c'), P('≈ $234/md',  'table_c_c')],
    [P('Gemini 2.5 Pro', 'table_bold'),         P('$0,008', 'table_price'), P('≈ $24/md',  'table_c_c'), P('≈ $237/md',  'table_c_c')],
    [P('Claude 3.5 Haiku', 'table_bold'),       P('$0,005', 'table_price'), P('≈ $14/md',  'table_c_c'), P('≈ $135/md',  'table_c_c')],
    [P('Gemini 2.5 Flash', 'table_bold'),       P('$0,002', 'table_price'), P('≈ $6/md',   'table_c_c'), P('≈ $60/md',   'table_c_c')],
    [P('GPT-4o-mini', 'table_bold'),            P('$0,0006','table_price'), P('≈ $2/md',   'table_c_c'), P('≈ $18/md',   'table_c_c')],
    [P('DeepSeek V3.1', 'table_bold'),          P('$0,001', 'table_price'), P('≈ $3/md',   'table_c_c'), P('≈ $33/md',   'table_c_c')],
    [P('Llama 3.3 70B (betalt)', 'table_bold'), P('$0,0007','table_price'), P('≈ $2/md',   'table_c_c'), P('≈ $21/md',   'table_c_c')],
]
cost_tbl = Table(cost_rows, colWidths=[55*mm, 28*mm, 40*mm, CONTENT_W - 55*mm - 28*mm - 40*mm])
cost_tbl.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, TABLE_STRIPE]),
    ('GRID', (0, 0), (-1, -1), 0.4, BORDER),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 5),
    ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ('TOPPADDING', (0, 0), (-1, -1), 5),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
]))
story.append(cost_tbl)
story.append(P(
    'Forudsætning: 1.500 input-tokens + 600 output-tokens per samtale (gennemsnit for regnskabsspørgsmål '
    'med virksomheds-kontekst). Faktisk forbrug varierer med samtales længde og mængden af medsendt '
    'regnskabsdata. Priser ekskluderer OpenRouters eventuelle platform-gebyr.', 'caption'))

# ══════════════════════════════════════════════════════════════
# 6. KONKLUSION
# ══════════════════════════════════════════════════════════════
story.append(P('6. Konklusion og anbefaling', 'h1'))
story.append(P(
    'Den nuværende gratis model er ikke egnet til professionel produktion. Baseret på vurderingen '
    'anbefales en to-niveau-strategi, der balancerer kvalitet og omkostning:', 'body'))

# Recommendation callout table
rec_data = [
    [P('PRIMÆR ANBEFALING', 'table_h'), P('', 'table_c'), P('', 'table_c')],
    [P('Claude 3.5 Haiku', 'table_bold'),
     P('$1,00 / $5,00 per 1M tok', 'table_c'),
     P('Bedste balance. Professionel dansk kvalitet, hurtig svar, forudsigelig omkostning. Anbefales til daglig drift for alle brugere.', 'table_c')],
    [P('TIL KOMPLEKSE SAGER', 'table_h'), P('', 'table_c'), P('', 'table_c')],
    [P('Claude Sonnet 4', 'table_bold'),
     P('$3,00 / $15,00 per 1M tok', 'table_c'),
     P('Til komplekse spørgsmål om skat, selskabsret eller årsregnskab. Kan tilkaldes on-demand for specifikke samtaler, fx via en "Spørg eksperten"-knap.', 'table_c')],
    [P('BUDGET-FALLBACK', 'table_h'), P('', 'table_c'), P('', 'table_c')],
    [P('Gemini 2.5 Flash', 'table_bold'),
     P('$0,30 / $2,50 per 1M tok', 'table_c'),
     P('Hvis budgettet er stramt og samtalevolumen høj. Stadig god kvalitet, men lidt lavere sproglig polish end Claude.', 'table_c')],
]
rec_tbl = Table(rec_data, colWidths=[42*mm, 38*mm, CONTENT_W - 42*mm - 38*mm])
rec_style = [
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('GRID', (0, 0), (-1, -1), 0.4, BORDER),
    ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ('TOPPADDING', (0, 0), (-1, -1), 5),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    # section headers
    ('SPAN', (0, 0), (-1, 0)),
    ('BACKGROUND', (0, 0), (-1, 0), SEM_SUCCESS),
    ('SPAN', (0, 2), (-1, 2)),
    ('BACKGROUND', (0, 2), (-1, 2), TIER1_COLOR),
    ('SPAN', (0, 4), (-1, 4)),
    ('BACKGROUND', (0, 4), (-1, 4), TIER2_COLOR),
]
rec_tbl.setStyle(TableStyle(rec_style))
story.append(rec_tbl)

story.append(Spacer(1, 4 * mm))
story.append(P('Hvad der IKKE anbefales til produktion', 'h3'))
story.append(P(
    'Gratis-modeller (med <b>:free</b>-suffiks) deles om kapacitet på tværs af alle OpenRouters '
    'gratis-brugere og returnerer hyppigt HTTP 429. De er fine til udvikling og test, men ikke til en '
    'regnskabsassistent i produktion, hvor brugeren forventer et svar hver gang. Den nuværende '
    '<b>meta-llama/llama-3.3-70b-instruct:free</b> bør erstattes.', 'body'))
story.append(P(
    'Modeller uden tilstrækkelig dansk sprogunderstøttelse eller svagt nummerisk ræsonnement (fx ældre '
    'små open-source modeller under 8B parametre) er heller ikke acceptable til professionel '
    'regnskabsrådgivning og er udeladt fra anbefalingerne bevidst.', 'body'))

# ══════════════════════════════════════════════════════════════
# 7. IMPLEMENTERING
# ══════════════════════════════════════════════════════════════
story.append(P('7. Implementering — skift af model', 'h1'))
story.append(P(
    'Modellen skiftes i PM2-ecosystem-filen (ecosystem.config.js) under hermes-agent-app-blokken. '
    'Nedenfor er den anbefalede primærkonfiguration med Claude 3.5 Haiku:', 'body'))

code_text = (
    '// ecosystem.config.js — hermes-agent blok<br/>'
    '{<br/>'
    '&nbsp;&nbsp;name: \'hermes-agent\',<br/>'
    '&nbsp;&nbsp;script: \'index.ts\',<br/>'
    '&nbsp;&nbsp;cwd: `${process.cwd()}/mini-services/hermes-agent`,<br/>'
    '&nbsp;&nbsp;interpreter: \'bun\',<br/>'
    '&nbsp;&nbsp;env: {<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;NODE_ENV: \'production\',<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;OPENROUTER_API_KEY: \'sk-or-v1-DIN_NØGLE\',<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;OPENROUTER_BASE_URL: \'https://openrouter.ai/api/v1\',<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;<font color="#2f4550"><b>OPENROUTER_MODEL: \'anthropic/claude-3.5-haiku\'</b></font>,<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;OPENROUTER_APP_NAME: \'AlphaFlow\',<br/>'
    '&nbsp;&nbsp;&nbsp;&nbsp;APP_URL: \'https://alphaflow.dk\',<br/>'
    '&nbsp;&nbsp;},<br/>'
    '&nbsp;&nbsp;exec_mode: \'fork\',<br/>'
    '&nbsp;&nbsp;// ... resten uændret<br/>'
    '}'
)
story.append(Paragraph(code_text, ss['code']))

story.append(P('Genstart efter ændring:', 'h3'))
story.append(Paragraph(
    'pm2 delete hermes-agent<br/>'
    'pm2 start ecosystem.config.js --only hermes-agent<br/>'
    'pm2 save<br/>'
    'pm2 logs hermes-agent --lines 10   # verificér at "API key set? : yes" og ny model vises',
    ss['code']))

story.append(Spacer(1, 3 * mm))
story.append(P(
    'Modeller der ikke kræver API-nøgle fra en specifik udbyder (fx Llama og DeepSeek, som OpenRouter '
    'ruter transparent) fungerer med den samme OPENROUTER_API_KEY — der skal alene ændres én linje '
    '(OPENROUTER_MODEL) for at skifte. Det gør det nemt at A/B-teste modeller mod hinanden.', 'body'))

# ══════════════════════════════════════════════════════════════
# 8. TILLÆG — FORBRUGSESTIMAT FOR 10 TENANTS
# ══════════════════════════════════════════════════════════════
story.append(PageBreak())
story.append(KeepTogether([
    P('8. Tillæg — Forbrugsestimat for 10 tenants', 'h1'),
    P(
        'Dette tillæg udvider omkostningsberegningen fra afsnit 5 med et konkret estimat for en '
        'AlphaFlow-installation med <b>10 tenants</b> (virksomheder). Formålet er at synliggøre, hvad en '
        'multitenant-installation realistisk forbruger per måned, og at foreslå retfærdige rate-limits '
        'per tenant, der beskytter det delte OpenRouter-budget uden at hæmme legitim brug.', 'body'),
]))

# ─── 8.1 Forbrugsforudsætninger ───────────────────────────────
story.append(KeepTogether([
    P('8.1 Forbrugsforudsætninger', 'h2'),
    P(
        'En typisk Hermes-samtale for en lille virksomhed består af et system-prompt + virksomhedens '
        'regnskabskontekst + samtalehistorik + brugerens spørgsmål (ca. <b>1.500 input-tokens</b>) og et '
        'fyldestgørende dansk svar (ca. <b>600 output-tokens</b>), i alt ca. <b>2.100 tokens</b> per '
        'samtale. Nedenfor er de antagne forudsætninger opsummeret.', 'body'),
]))
usage_assum_data = [
    [P('Parameter', 'table_h'), P('Værdi', 'table_h_c'), P('Begrundelse', 'table_h')],
    [P('Aktive tenants/dag', 'table_bold'), P('7 af 10', 'table_c_c'),
     P('Ikke alle bruger appen dagligt', 'table_c')],
    [P('Samtaler per aktiv tenant/dag', 'table_bold'), P('8', 'table_c_c'),
     P('Hurtige spørgsmål (moms, frister, bogføring)', 'table_c')],
    [P('Input-tokens per samtale', 'table_bold'), P('~1.500', 'table_c_c'),
     P('System-prompt + kontekst + historik + spørgsmål', 'table_c')],
    [P('Output-tokens per samtale', 'table_bold'), P('~600', 'table_c_c'),
     P('Fyldestgørende dansk svar', 'table_c')],
    [P('Total per samtale', 'table_bold'), P('~2.100 tokens', 'table_c_c'),
     P('—', 'table_c')],
]
usage_assum_tbl = Table(usage_assum_data, colWidths=[60 * mm, 28 * mm, CONTENT_W - 60 * mm - 28 * mm])
usage_assum_tbl.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, TABLE_STRIPE]),
    ('GRID', (0, 0), (-1, -1), 0.4, BORDER),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ('TOPPADDING', (0, 0), (-1, -1), 5),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
]))
story.append(usage_assum_tbl)

# ─── 8.2 Tre forbrugsscenarier ────────────────────────────────
story.append(KeepTogether([
    P('8.2 Tre forbrugsscenarier', 'h2'),
    P(
        'For at dække spændet fra stille hverdage til månedslukning er der defineret tre scenarier: '
        'konservativ (få brugere), aktiv (baseline hvor alle tenants bruger appen dagligt) og '
        'spidsbelastning (månedslukning eller årsafslutning, hvor der er flere samtaler end normalt).', 'body'),
]))
scenario_data = [
    [P('Scenario', 'table_h'), P('Samtaler/dag', 'table_h_c'),
     P('Samtaler/md (30 dage)', 'table_h_c'), P('Beskrivelse', 'table_h')],
    [P('A — Konservativ', 'table_bold'), P('~56', 'table_c_c'), P('~1.700', 'table_c_c'),
     P('Realistisk daglig brug', 'table_c')],
    [P('B — Aktiv (baseline)', 'table_bold'), P('~100', 'table_c_c'), P('~3.000', 'table_c_c'),
     P('Alle tenants bruger dagligt', 'table_c')],
    [P('C — Spidsbelastning', 'table_bold'), P('~200', 'table_c_c'), P('~6.000', 'table_c_c'),
     P('Månedslukning / årsafslutning', 'table_c')],
]
scenario_tbl = Table(scenario_data, colWidths=[48 * mm, 25 * mm, 33 * mm, CONTENT_W - 48 * mm - 25 * mm - 33 * mm])
scenario_tbl.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, TABLE_STRIPE]),
    ('GRID', (0, 0), (-1, -1), 0.4, BORDER),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ('TOPPADDING', (0, 0), (-1, -1), 5),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
]))
story.append(scenario_tbl)

# ─── 8.3 Omkostningsestimat for 10 tenants ────────────────────
story.append(KeepTogether([
    P('8.3 Omkostningsestimat for 10 tenants (månedlig)', 'h2'),
    P(
        'Omkostningerne nedenfor er baseret på de tre scenarier fra afsnit 8.2 og priserne per samtale '
        'fra afsnit 5. Tallene viser den <b>samlede</b> månedlige omkostning for alle 10 tenants samlet '
        '— ikke per tenant. Claude 3.5 Haiku er den primære anbefaling fra afsnit 6 (fremhævet i '
        'callouten nedenfor).', 'body'),
]))
tenant_cost_hdr = [
    P('Model', 'table_h'),
    P('Per samtale', 'table_h_c'),
    P('Scenario A<br/>(1.700/md)', 'table_h_c'),
    P('Scenario B<br/>(3.000/md)', 'table_h_c'),
    P('Scenario C<br/>(6.000/md)', 'table_h_c'),
]
tenant_cost_rows = [tenant_cost_hdr,
    [P('Claude Sonnet 4', 'table_bold'),     P('$0,014', 'table_price'), P('$24', 'table_price'), P('$42', 'table_price'), P('$84', 'table_price')],
    [P('OpenAI GPT-4.1', 'table_bold'),      P('$0,008', 'table_price'), P('$14', 'table_price'), P('$24', 'table_price'), P('$48', 'table_price')],
    [P('Gemini 2.5 Pro', 'table_bold'),      P('$0,008', 'table_price'), P('$14', 'table_price'), P('$24', 'table_price'), P('$48', 'table_price')],
    [P('Claude 3.5 Haiku  (anbefalet)', 'table_bold'),  P('$0,005', 'table_price'), P('$9',  'table_price'), P('$15', 'table_price'), P('$30', 'table_price')],
    [P('Gemini 2.5 Flash', 'table_bold'),    P('$0,002', 'table_price'), P('$3',  'table_price'), P('$6',  'table_price'), P('$12', 'table_price')],
    [P('DeepSeek V3.1', 'table_bold'),       P('$0,001', 'table_price'), P('$2',  'table_price'), P('$3',  'table_price'), P('$6',  'table_price')],
    [P('GPT-4o-mini', 'table_bold'),         P('$0,0006','table_price'), P('$1',  'table_price'), P('$2',  'table_price'), P('$4',  'table_price')],
]
tenant_cost_tbl = Table(tenant_cost_rows,
    colWidths=[52 * mm, 22 * mm, 30 * mm, 30 * mm, CONTENT_W - 52 * mm - 22 * mm - 30 * mm - 30 * mm])
# Row index 4 = Claude 3.5 Haiku (recommended) — highlighted with success-tint background
RECOMMENDED_ROW = 4
tenant_cost_tbl.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, TABLE_STRIPE]),
    # Highlight recommended row (overrides stripe)
    ('BACKGROUND', (0, RECOMMENDED_ROW), (-1, RECOMMENDED_ROW), colors.HexColor('#eef4f0')),
    ('LINEBEFORE', (0, RECOMMENDED_ROW), (0, RECOMMENDED_ROW), 2.0, SEM_SUCCESS),
    ('GRID', (0, 0), (-1, -1), 0.4, BORDER),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 5),
    ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ('TOPPADDING', (0, 0), (-1, -1), 5),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
]))
story.append(tenant_cost_tbl)

# Per-tenant cost callout (highlighted, mirrors section 6 rec_tbl pattern)
pt_callout_data = [
    [P('PER-TENANT OMKOSTNING', 'table_h')],
    [Paragraph(
        '<b>Claude 3.5 Haiku (Scenario B):</b> $15/md ÷ 10 tenants = <b>$1,50 per tenant/md</b>. '
        'Selv med <b>Claude Sonnet 4</b> (premium) koster det kun <b>$4,20 per tenant/md</b> '
        '(Scenario B: $42 ÷ 10). En omkostning der let retfærdiggøres af værdien af professionel '
        'regnskabsrådgivning on-demand.', ss['callout'])],
]
pt_callout_tbl = Table(pt_callout_data, colWidths=[CONTENT_W])
pt_callout_tbl.setStyle(TableStyle([
    ('SPAN', (0, 0), (-1, 0)),
    ('BACKGROUND', (0, 0), (-1, 0), SEM_SUCCESS),
    ('BACKGROUND', (0, 1), (-1, 1), colors.HexColor('#eef4f0')),
    ('GRID', (0, 0), (-1, -1), 0.4, BORDER),
    ('LEFTPADDING', (0, 0), (-1, -1), 10),
    ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ('TOPPADDING', (0, 0), (-1, -1), 7),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
]))
story.append(Spacer(1, 3 * mm))
story.append(pt_callout_tbl)

# ─── 8.4 Anbefalede rate limits per tenant ────────────────────
story.append(KeepTogether([
    P('8.4 Anbefalede rate limits per tenant', 'h2'),
    P(
        'Rate-limits tjener to formål: (1) at beskytte det delte OpenRouter-budget mod én grådig '
        'tenant, og (2) at forhindre automation og scripts i at brænde tokens af. Nedenfor er de '
        'anbefalede fire niveauer af limits — konfigurerbare per tenant i Hermes.', 'body'),
]))
rate_limit_data = [
    [P('Niveau', 'table_h'), P('Grænse', 'table_h'),
     P('Formål', 'table_h'), P('HTTP-konsekvens', 'table_h_c')],
    [P('Burst', 'table_bold'),  P('10 samtaler/minut', 'table_c'),
     P('Forhindre flooding/scripts', 'table_c'),       P('429 + Retry-After', 'table_mono')],
    [P('Time', 'table_bold'),   P('40 samtaler/time', 'table_c'),
     P('Bæredygtig brug', 'table_c'),                  P('429 + besked', 'table_mono')],
    [P('Dag', 'table_bold'),    P('120 samtaler/dag', 'table_c'),
     P('Fair use for lille virksomhed', 'table_c'),    P('403 "Daglig kvote nået"', 'table_mono')],
    [P('Måned', 'table_bold'),  P('2.000 samtaler/md', 'table_c'),
     P('Omkostningsforudsigelighed', 'table_c'),       P('403 "Månedlig kvote nået"', 'table_mono')],
]
rate_limit_tbl = Table(rate_limit_data,
    colWidths=[22 * mm, 38 * mm, CONTENT_W - 22 * mm - 38 * mm - 48 * mm, 48 * mm])
rate_limit_tbl.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, TABLE_STRIPE]),
    ('GRID', (0, 0), (-1, -1), 0.4, BORDER),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ('TOPPADDING', (0, 0), (-1, -1), 5),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
]))
story.append(rate_limit_tbl)
story.append(P(
    'En lille virksomhed bruger realistisk 5–15 samtaler per dag, så 120/dag dækker selv '
    'spidsbelastningsperioder (momsfrister, årsafslutning) med god margin. Månedgrænsen på 2.000 '
    'samtaler svarer til ca. 67/dag i gennemsnit — det dobbelte af Scenario B. Burst-grænsen (10/min) '
    'forhindrer ét script i at dræne OpenRouter-kvoten for alle andre tenants. En <b>rigtig lille '
    'virksomhed vil ALDRIG ramme disse grænser</b> — de eksisterer udelukkende som beskyttelse mod '
    'misbrug og automation.', 'body'))

# ─── 8.5 Sammenligning med OpenRouter egne limits ─────────────
story.append(KeepTogether([
    P('8.5 Sammenligning med OpenRouter egne limits', 'h2'),
    P(
        'OpenRouter opererer med egne rate-limits på API-nøgle-niveau, der deles på tværs af alle '
        '10 tenants. Nedenfor sammenlignes OpenRouters grænser med Hermes\' per-tenant grænser.', 'body'),
]))
or_compare_data = [
    [P('Grænse', 'table_h'), P('OpenRouter (account)', 'table_h'), P('Hermes (per tenant)', 'table_h_c')],
    [P('Free models', 'table_bold'),    P('~20 req/min (delt, ustabil)', 'table_c'),  P('—', 'table_c_c')],
    [P('Betalte modeller', 'table_bold'), P('Credit-balance, generøs', 'table_c'),     P('—', 'table_c_c')],
    [P('Burst', 'table_bold'),           P('—', 'table_c'),                            P('10/min', 'table_c_c')],
    [P('Daglig', 'table_bold'),          P('—', 'table_c'),                            P('120/dag', 'table_c_c')],
    [P('Månedlig', 'table_bold'),        P('—', 'table_c'),                            P('2.000/md', 'table_c_c')],
]
or_compare_tbl = Table(or_compare_data,
    colWidths=[42 * mm, 70 * mm, CONTENT_W - 42 * mm - 70 * mm])
or_compare_tbl.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, TABLE_STRIPE]),
    ('GRID', (0, 0), (-1, -1), 0.4, BORDER),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ('TOPPADDING', (0, 0), (-1, -1), 5),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
]))
story.append(or_compare_tbl)
story.append(P(
    'OpenRouter rate-limiter på API-nøgle-niveau (delt på tværs af alle 10 tenants). Derfor er '
    'per-tenant limits i Hermes <b>essential</b> for at fordele kvoten retfærdigt mellem virksomhederne. '
    'Limits er konfigurerbare per tenant fra App Owner-oversigtssiden (virksomhedsliste), så en '
    'stor virksomhed kan tildeles en højere månedlig kvote end en lille.', 'body'))

# ──────────────────────────────────────────────────────────────
# Build document
# ──────────────────────────────────────────────────────────────
OUT_PATH = '/home/z/my-project/hermes-modelanbefalinger.pdf'

doc = BaseDocTemplate(
    OUT_PATH,
    pagesize=A4,
    leftMargin=MARGIN_L, rightMargin=MARGIN_R,
    topMargin=MARGIN_T, bottomMargin=MARGIN_B,
    title='Hermes AI — Modelanbefalinger',
    author='AlphaFlow',
    subject='LLM-modelanbefalinger til professionel regnskabsrådgivning',
    creator='AlphaFlow',
)

cover_frame = Frame(0, 0, PAGE_W, PAGE_H, leftPadding=MARGIN_L, rightPadding=MARGIN_R,
                    topPadding=0, bottomPadding=0, id='cover')
body_frame = Frame(MARGIN_L, MARGIN_B, CONTENT_W, PAGE_H - MARGIN_T - MARGIN_B,
                   leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0, id='body')

doc.addPageTemplates([
    PageTemplate(id='cover', frames=[cover_frame], onPage=cover_bg),
    PageTemplate(id='body', frames=[body_frame], onPage=body_bg),
])

doc.build(story)
print(f'OK: {OUT_PATH}')
print(f'Size: {os.path.getsize(OUT_PATH) / 1024:.1f} KB')
