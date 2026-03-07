"""
CIVITAS Pitch Deck Generator

Generates a 13-slide PowerPoint pitch deck targeting small real estate
law firms and title companies in Chicago.

Usage:
    pip install python-pptx
    python scripts/generate_pitch_deck.py
    # -> civitas_pitch_deck.pptx in project root
"""

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
import os

# -- Design tokens (bright, modern, multi-color) -----------------------------
PRIMARY = RGBColor(0x25, 0x63, 0xEB)       # blue-600  primary accent
VIOLET = RGBColor(0x7C, 0x3A, 0xED)        # violet-600
TEAL = RGBColor(0x0D, 0x94, 0x88)          # teal-600
CORAL = RGBColor(0xF4, 0x72, 0x5C)         # warm coral
AMBER = RGBColor(0xD9, 0x77, 0x06)         # amber-600
EMERALD = RGBColor(0x05, 0x96, 0x69)       # emerald-600
ROSE = RGBColor(0xE1, 0x1D, 0x48)          # rose-600
INDIGO = RGBColor(0x43, 0x38, 0xCA)        # indigo-600

BG = RGBColor(0xFF, 0xFF, 0xFF)            # clean white
BG_WARM = RGBColor(0xFA, 0xFA, 0xFA)       # near-white for contrast
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
BORDER = RGBColor(0xE5, 0xE7, 0xEB)        # gray-200
TEXT_HEADING = RGBColor(0x11, 0x18, 0x27)
TEXT_BODY = RGBColor(0x37, 0x41, 0x51)
TEXT_SEC = RGBColor(0x6B, 0x72, 0x80)
LIGHT_BG = RGBColor(0xF0, 0xF4, 0xFF)      # very light blue tint

FONT = "Calibri"
SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)

LEVEL_COLORS = {
    "QUIET": RGBColor(0x94, 0xA3, 0xB8),     # slate-400
    "TYPICAL": RGBColor(0x60, 0xA5, 0xFA),   # blue-400
    "ACTIVE": RGBColor(0x25, 0x63, 0xEB),    # blue-600
    "COMPLEX": RGBColor(0x1E, 0x3A, 0x5F),   # navy
}


# -- Helpers ------------------------------------------------------------------

def _set_slide_bg(slide, color):
    bg = slide.background
    fill = bg.fill
    fill.solid()
    fill.fore_color.rgb = color


def _add_gradient_bar(slide, color1, color2):
    """Two-tone thin bar across the top."""
    half = int(SLIDE_W / 2)
    bar1 = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, half, Pt(5))
    bar1.fill.solid()
    bar1.fill.fore_color.rgb = color1
    bar1.line.fill.background()
    bar2 = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, half, 0, half, Pt(5))
    bar2.fill.solid()
    bar2.fill.fore_color.rgb = color2
    bar2.line.fill.background()


def _add_accent_bar(slide, color=PRIMARY):
    """Thin colored rectangle across top of slide."""
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, SLIDE_W, Pt(5))
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()


def _add_footer(slide, page_num=None):
    txBox = slide.shapes.add_textbox(
        Inches(0.6), Inches(6.9), Inches(2), Inches(0.4)
    )
    tf = txBox.text_frame
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "CIVITAS"
    run.font.name = FONT
    run.font.size = Pt(10)
    run.font.color.rgb = TEXT_SEC
    run.font.bold = True
    p.space_before = Pt(0)
    p.space_after = Pt(0)

    if page_num is not None:
        txBox2 = slide.shapes.add_textbox(
            Inches(11.8), Inches(6.9), Inches(1), Inches(0.4)
        )
        tf2 = txBox2.text_frame
        p2 = tf2.paragraphs[0]
        p2.alignment = PP_ALIGN.RIGHT
        run2 = p2.add_run()
        run2.text = str(page_num)
        run2.font.name = FONT
        run2.font.size = Pt(10)
        run2.font.color.rgb = TEXT_SEC


def _add_title(slide, text, left=0.8, top=0.7, width=11.5, size=32):
    txBox = slide.shapes.add_textbox(
        Inches(left), Inches(top), Inches(width), Inches(0.8)
    )
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = text
    run.font.name = FONT
    run.font.size = Pt(size)
    run.font.color.rgb = TEXT_HEADING
    run.font.bold = True
    return txBox


def _add_subtitle(slide, text, left=0.8, top=1.4, width=11.5, size=16):
    txBox = slide.shapes.add_textbox(
        Inches(left), Inches(top), Inches(width), Inches(0.6)
    )
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = text
    run.font.name = FONT
    run.font.size = Pt(size)
    run.font.color.rgb = TEXT_SEC
    return txBox


def _add_body(slide, text, left=0.8, top=2.2, width=11.5, height=3.5, size=15):
    txBox = slide.shapes.add_textbox(
        Inches(left), Inches(top), Inches(width), Inches(height)
    )
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = text
    run.font.name = FONT
    run.font.size = Pt(size)
    run.font.color.rgb = TEXT_BODY
    p.line_spacing = Pt(24)
    return txBox


def _add_card(slide, left, top, width, height, title, body,
              accent_color=None, title_size=16, body_size=13):
    """White rounded-rect card with optional colored top border."""
    shape = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE, Inches(left), Inches(top),
        Inches(width), Inches(height)
    )
    shape.fill.solid()
    shape.fill.fore_color.rgb = WHITE
    shape.line.color.rgb = BORDER
    shape.line.width = Pt(1)
    shape.adjustments[0] = 0.05

    # Accent stripe on top (modern style)
    if accent_color:
        stripe = slide.shapes.add_shape(
            MSO_SHAPE.RECTANGLE,
            Inches(left), Inches(top),
            Inches(width), Pt(4)
        )
        stripe.fill.solid()
        stripe.fill.fore_color.rgb = accent_color
        stripe.line.fill.background()

    # Title
    txBox = slide.shapes.add_textbox(
        Inches(left + 0.25), Inches(top + 0.2),
        Inches(width - 0.4), Inches(0.4)
    )
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = title
    run.font.name = FONT
    run.font.size = Pt(title_size)
    run.font.color.rgb = TEXT_HEADING
    run.font.bold = True

    # Body
    txBox2 = slide.shapes.add_textbox(
        Inches(left + 0.25), Inches(top + 0.6),
        Inches(width - 0.4), Inches(height - 0.7)
    )
    tf2 = txBox2.text_frame
    tf2.word_wrap = True
    p2 = tf2.paragraphs[0]
    run2 = p2.add_run()
    run2.text = body
    run2.font.name = FONT
    run2.font.size = Pt(body_size)
    run2.font.color.rgb = TEXT_BODY
    p2.line_spacing = Pt(20)


def _add_level_pill(slide, left, top, level, width=1.6, height=0.45):
    color = LEVEL_COLORS.get(level, PRIMARY)
    shape = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE,
        Inches(left), Inches(top), Inches(width), Inches(height)
    )
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()
    shape.adjustments[0] = 0.4
    tf = shape.text_frame
    tf.word_wrap = False
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    run = p.add_run()
    run.text = level
    run.font.name = FONT
    run.font.size = Pt(14)
    run.font.color.rgb = WHITE
    run.font.bold = True


def _add_stat_card(slide, left, top, number, label, color=PRIMARY):
    """Large number stat with subtle background card."""
    # Background card
    shape = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE,
        Inches(left), Inches(top), Inches(3.2), Inches(2.0)
    )
    shape.fill.solid()
    shape.fill.fore_color.rgb = WHITE
    shape.line.color.rgb = BORDER
    shape.line.width = Pt(1)
    shape.adjustments[0] = 0.05

    # Color dot accent
    dot = slide.shapes.add_shape(
        MSO_SHAPE.OVAL,
        Inches(left + 1.35), Inches(top + 0.15), Inches(0.5), Inches(0.5)
    )
    dot.fill.solid()
    dot.fill.fore_color.rgb = color
    dot.line.fill.background()

    # Number
    txBox = slide.shapes.add_textbox(
        Inches(left), Inches(top + 0.7), Inches(3.2), Inches(0.7)
    )
    tf = txBox.text_frame
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    run = p.add_run()
    run.text = number
    run.font.name = FONT
    run.font.size = Pt(36)
    run.font.color.rgb = TEXT_HEADING
    run.font.bold = True

    # Label
    txBox2 = slide.shapes.add_textbox(
        Inches(left), Inches(top + 1.35), Inches(3.2), Inches(0.6)
    )
    tf2 = txBox2.text_frame
    tf2.word_wrap = True
    p2 = tf2.paragraphs[0]
    p2.alignment = PP_ALIGN.CENTER
    run2 = p2.add_run()
    run2.text = label
    run2.font.name = FONT
    run2.font.size = Pt(12)
    run2.font.color.rgb = TEXT_SEC


def _add_step_box(slide, left, top, number, title, desc, color=PRIMARY):
    """Numbered step with colored circle, title, and description."""
    circle = slide.shapes.add_shape(
        MSO_SHAPE.OVAL,
        Inches(left + 0.5), Inches(top), Inches(0.7), Inches(0.7)
    )
    circle.fill.solid()
    circle.fill.fore_color.rgb = color
    circle.line.fill.background()
    tf = circle.text_frame
    tf.word_wrap = False
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    run = p.add_run()
    run.text = str(number)
    run.font.name = FONT
    run.font.size = Pt(22)
    run.font.color.rgb = WHITE
    run.font.bold = True

    txBox = slide.shapes.add_textbox(
        Inches(left), Inches(top + 0.85), Inches(1.7), Inches(0.4)
    )
    tf2 = txBox.text_frame
    tf2.word_wrap = True
    p2 = tf2.paragraphs[0]
    p2.alignment = PP_ALIGN.CENTER
    run2 = p2.add_run()
    run2.text = title
    run2.font.name = FONT
    run2.font.size = Pt(15)
    run2.font.color.rgb = TEXT_HEADING
    run2.font.bold = True

    txBox2 = slide.shapes.add_textbox(
        Inches(left - 0.15), Inches(top + 1.25), Inches(2), Inches(0.8)
    )
    tf3 = txBox2.text_frame
    tf3.word_wrap = True
    p3 = tf3.paragraphs[0]
    p3.alignment = PP_ALIGN.CENTER
    run3 = p3.add_run()
    run3.text = desc
    run3.font.name = FONT
    run3.font.size = Pt(12)
    run3.font.color.rgb = TEXT_SEC


def _add_arrow(slide, left, top, color=BORDER):
    shape = slide.shapes.add_shape(
        MSO_SHAPE.RIGHT_ARROW,
        Inches(left), Inches(top), Inches(0.8), Inches(0.35)
    )
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()


def _add_bullet_list(slide, items, left=0.8, top=2.2, width=11.5, size=15):
    txBox = slide.shapes.add_textbox(
        Inches(left), Inches(top), Inches(width), Inches(4)
    )
    tf = txBox.text_frame
    tf.word_wrap = True
    for i, item in enumerate(items):
        if i == 0:
            p = tf.paragraphs[0]
        else:
            p = tf.add_paragraph()
        p.space_after = Pt(8)
        p.line_spacing = Pt(24)
        run = p.add_run()
        run.text = f"\u2022  {item}"
        run.font.name = FONT
        run.font.size = Pt(size)
        run.font.color.rgb = TEXT_BODY


# -- Slide builders -----------------------------------------------------------

def _slide_01_title(prs):
    """Title slide with gradient hero."""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _set_slide_bg(slide, BG)

    # Gradient-style hero: left violet, right teal
    hero_h = Inches(3.4)
    left_block = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, 0, 0, int(SLIDE_W * 0.55), hero_h
    )
    left_block.fill.solid()
    left_block.fill.fore_color.rgb = VIOLET
    left_block.line.fill.background()

    right_block = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, int(SLIDE_W * 0.55), 0,
        int(SLIDE_W * 0.45), hero_h
    )
    right_block.fill.solid()
    right_block.fill.fore_color.rgb = TEAL
    right_block.line.fill.background()

    # CIVITAS wordmark
    txBox = slide.shapes.add_textbox(
        Inches(0.8), Inches(0.7), Inches(11.5), Inches(1.2)
    )
    tf = txBox.text_frame
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "C I V I T A S"
    run.font.name = FONT
    run.font.size = Pt(54)
    run.font.color.rgb = WHITE
    run.font.bold = True

    # Subtitle on hero
    txBox2 = slide.shapes.add_textbox(
        Inches(0.8), Inches(1.9), Inches(11.5), Inches(0.6)
    )
    tf2 = txBox2.text_frame
    p2 = tf2.paragraphs[0]
    run2 = p2.add_run()
    run2.text = "Municipal Intelligence"
    run2.font.name = FONT
    run2.font.size = Pt(22)
    run2.font.color.rgb = RGBColor(0xE0, 0xE7, 0xFF)  # light violet

    # Tagline below hero
    txBox3 = slide.shapes.add_textbox(
        Inches(0.8), Inches(4.0), Inches(11.5), Inches(1)
    )
    tf3 = txBox3.text_frame
    tf3.word_wrap = True
    p3 = tf3.paragraphs[0]
    run3 = p3.add_run()
    run3.text = "Transaction-grade property intelligence\nin minutes, not days."
    run3.font.name = FONT
    run3.font.size = Pt(24)
    run3.font.color.rgb = TEXT_HEADING

    # Chicago v1 note
    txBox4 = slide.shapes.add_textbox(
        Inches(0.8), Inches(5.4), Inches(11.5), Inches(0.5)
    )
    tf4 = txBox4.text_frame
    p4 = tf4.paragraphs[0]
    run4 = p4.add_run()
    run4.text = "Chicago v1  \u2022  Built for real estate law firms & title companies"
    run4.font.name = FONT
    run4.font.size = Pt(14)
    run4.font.color.rgb = TEXT_SEC

    _add_footer(slide)


def _slide_02_problem(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _set_slide_bg(slide, BG)
    _add_gradient_bar(slide, CORAL, AMBER)
    _add_title(slide, "The Problem")
    _add_subtitle(slide, "Manual municipal due diligence is slow, fragmented, and error-prone.")

    cards = [
        ("Scattered Data",
         "Law firms manually search 6+ city databases\u2014violations, permits, inspections, tax liens, 311 complaints\u2014each with different interfaces and formats."),
        ("No Unified Picture",
         "There is no single view connecting a property's violation history, permit status, tax standing, and complaint patterns. Critical context gets missed."),
        ("Missed Findings",
         "Without systematic analysis, aged violations, recurring complaints, and tax lien patterns fall through the cracks\u2014creating liability exposure."),
    ]
    colors = [CORAL, AMBER, ROSE]
    for i, (title, body) in enumerate(cards):
        _add_card(slide, 0.8 + i * 4.0, 2.4, 3.6, 2.8, title, body,
                  accent_color=colors[i])

    _add_footer(slide, 2)


def _slide_03_cost(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _set_slide_bg(slide, BG)
    _add_accent_bar(slide, CORAL)
    _add_title(slide, "The Cost of Inaction")
    _add_subtitle(slide, "What happens when due diligence gaps go unaddressed.")

    _add_stat_card(slide, 0.5, 2.4, "4\u20136 hrs", "Average time per manual\nmunicipal records search", CORAL)
    _add_stat_card(slide, 4.8, 2.4, "23%", "Of Chicago properties have\nat least one open violation", AMBER)
    _add_stat_card(slide, 9.1, 2.4, "$50K+", "Potential liability from\nundiscovered liens & violations", ROSE)

    _add_body(slide,
              "Every missed violation or undisclosed lien is a potential post-closing dispute. "
              "Title companies and law firms bear the reputational and financial risk.",
              top=5.0, size=14)

    _add_footer(slide, 3)


def _slide_04_solution(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _set_slide_bg(slide, BG)
    _add_gradient_bar(slide, VIOLET, TEAL)
    _add_title(slide, "The Solution: CIVITAS")
    _add_subtitle(slide, "Automated municipal intelligence for real estate transactions.")

    features = [
        "Aggregates 6 municipal & tax datasets into a unified property profile",
        "Applies 15 deterministic, auditable rules across 4 action categories",
        "Computes transparent, weighted activity scores with full citation",
        "Generates AI-narrated executive summaries grounded in structured data",
        "Delivers professional PDF reports in under 60 seconds",
    ]
    _add_bullet_list(slide, features, top=2.3, size=16)

    _add_footer(slide, 4)


def _slide_05_how_it_works(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _set_slide_bg(slide, BG)
    _add_accent_bar(slide, TEAL)
    _add_title(slide, "How It Works")
    _add_subtitle(slide, "From address to actionable intelligence in three steps.")

    _add_step_box(slide, 2.0, 2.8, 1, "Enter Address",
                  "Type a Chicago address or PIN.\n6-tier resolution matches\nto canonical records.",
                  color=VIOLET)
    _add_arrow(slide, 4.2, 3.0, TEAL)
    _add_step_box(slide, 5.3, 2.8, 2, "Automated Analysis",
                  "SQL rule engine evaluates\n15 rules across 6 datasets\ninstantly.",
                  color=TEAL)
    _add_arrow(slide, 7.5, 3.0, TEAL)
    _add_step_box(slide, 8.6, 2.8, 3, "Property Report",
                  "Scored report with findings,\nsupporting records, AI\nnarrative, and PDF export.",
                  color=PRIMARY)

    _add_body(slide,
              "Every finding is deterministic and citable. Claude AI interprets structured results\u2014"
              "it never invents findings or computes scores.",
              top=5.3, size=13)

    _add_footer(slide, 5)


def _slide_06_activity_scoring(prs):
    """Activity Scoring slide with 4-level visual."""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _set_slide_bg(slide, BG)
    _add_accent_bar(slide, INDIGO)
    _add_title(slide, "Activity Scoring Model")
    _add_subtitle(slide, "Weighted, additive, and fully transparent.")

    levels = [
        ("QUIET", "0 \u2013 24", "No active findings"),
        ("TYPICAL", "25 \u2013 49", "Minor compliance items"),
        ("ACTIVE", "50 \u2013 74", "Notable municipal activity"),
        ("COMPLEX", "75+", "Multiple findings requiring attention"),
    ]
    for i, (level, score_range, desc) in enumerate(levels):
        y = 2.5 + i * 0.85
        _add_level_pill(slide, 1.0, y, level)
        txBox = slide.shapes.add_textbox(Inches(3.0), Inches(y + 0.05), Inches(1.5), Inches(0.4))
        tf = txBox.text_frame
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = score_range
        run.font.name = FONT
        run.font.size = Pt(16)
        run.font.color.rgb = TEXT_HEADING
        run.font.bold = True
        txBox2 = slide.shapes.add_textbox(Inches(4.8), Inches(y + 0.05), Inches(4), Inches(0.4))
        tf2 = txBox2.text_frame
        p2 = tf2.paragraphs[0]
        run2 = p2.add_run()
        run2.text = desc
        run2.font.name = FONT
        run2.font.size = Pt(14)
        run2.font.color.rgb = TEXT_BODY

    _add_card(slide, 9.2, 2.3, 3.5, 3.5,
              "4 Action Groups",
              "Action Required \u2014 Tax & financial (25\u201340 pts)\n"
              "Review Recommended \u2014 Enforcement (20\u201335 pts)\n"
              "Worth Noting \u2014 Compliance (15\u201320 pts)\n"
              "Informational \u2014 Regulatory friction (10\u201315 pts)\n\n"
              "15 rules total \u2022 Configurable weights",
              accent_color=INDIGO, body_size=12)

    _add_footer(slide, 6)


def _slide_07_report_deep_dive(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _set_slide_bg(slide, BG)
    _add_gradient_bar(slide, TEAL, VIOLET)
    _add_title(slide, "Report Deep-Dive")
    _add_subtitle(slide, "Everything a closing attorney needs in one document.")

    sections = [
        ("Executive Summary", "Activity score, level, triggered\nfindings, and AI-generated overview."),
        ("Findings by Action Group", "Action Required, Review Recommended,\nWorth Noting, Informational."),
        ("Supporting Records", "Violations, inspections, permits,\n311 requests, tax liens\u2014sortable tables."),
        ("AI Narrative", "Claude interprets findings in legally\ncautious, citation-backed language."),
        ("PDF Export", "Professional report ready to attach\nto closing files or send to clients."),
        ("Legal Disclaimer", "Clear statement that CIVITAS does\nnot replace formal title examination."),
    ]
    colors = [TEAL, VIOLET, PRIMARY, EMERALD, AMBER, TEXT_SEC]
    for i, (title, body) in enumerate(sections):
        col = i % 3
        row = i // 3
        _add_card(slide, 0.8 + col * 4.0, 2.3 + row * 2.3, 3.6, 1.9,
                  title, body, accent_color=colors[i], title_size=14, body_size=12)

    _add_footer(slide, 7)


def _slide_08_data_sources(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _set_slide_bg(slide, BG)
    _add_accent_bar(slide, EMERALD)
    _add_title(slide, "Data Sources")
    _add_subtitle(slide, "Six authoritative Chicago datasets power every report.")

    datasets = [
        ("Building Violations", "Dept. of Buildings enforcement\nactions and compliance orders."),
        ("Food Inspections", "Health dept. inspection results\nand pass/fail/conditional outcomes."),
        ("Building Permits", "Active, completed, and delayed\npermit applications and status."),
        ("311 Service Requests", "13.4M+ citizen complaints\nincluding building and sanitation."),
        ("Tax Liens", "Cook County Clerk records\nof delinquent property tax liens."),
        ("Vacant Buildings", "Registered vacant/abandoned\nbuildings on the Chicago Data Portal."),
    ]
    colors = [CORAL, TEAL, PRIMARY, AMBER, ROSE, VIOLET]
    for i, (title, body) in enumerate(datasets):
        col = i % 3
        row = i // 3
        _add_card(slide, 0.8 + col * 4.0, 2.3 + row * 2.3, 3.6, 1.9,
                  title, body, accent_color=colors[i], title_size=14, body_size=12)

    _add_footer(slide, 8)


def _slide_09_portfolio(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _set_slide_bg(slide, BG)
    _add_accent_bar(slide, VIOLET)
    _add_title(slide, "Portfolio Analysis")
    _add_subtitle(slide, "Analyze entire portfolios at once with batch CSV upload.")

    features = [
        ("CSV Upload", "Upload a list of addresses.\nEach property is analyzed\nagainst all 15 rules."),
        ("Live Progress", "Server-sent events stream\nreal-time status as each\nproperty is processed."),
        ("Summary Dashboard", "Average activity score, level\ndistribution chart, and\nper-property drill-down."),
    ]
    colors = [VIOLET, TEAL, PRIMARY]
    for i, (title, body) in enumerate(features):
        _add_card(slide, 0.8 + i * 4.0, 2.4, 3.6, 2.5,
                  title, body, accent_color=colors[i])

    _add_body(slide,
              "Ideal for acquisition teams evaluating multiple properties in a single transaction.",
              top=5.4, size=14)

    _add_footer(slide, 9)


def _slide_10_comparison(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _set_slide_bg(slide, BG)
    _add_accent_bar(slide, TEAL)
    _add_title(slide, "Report Comparison")
    _add_subtitle(slide, "Track changes over time with side-by-side analysis.")

    items = [
        ("Score Delta", "See how a property's activity score\nhas changed between reports."),
        ("Findings Diff", "Findings only in Report A, shared\nfindings, and findings only in Report B."),
        ("Record Changes", "Compare violation, inspection,\npermit, and lien counts over time."),
    ]
    colors = [TEAL, VIOLET, AMBER]
    for i, (title, body) in enumerate(items):
        _add_card(slide, 0.8 + i * 4.0, 2.4, 3.6, 2.5,
                  title, body, accent_color=colors[i])

    _add_body(slide,
              "Monitor properties on your watchlist and catch emerging issues before closing.",
              top=5.4, size=14)

    _add_footer(slide, 10)


def _slide_11_why_civitas(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _set_slide_bg(slide, BG)
    _add_gradient_bar(slide, EMERALD, PRIMARY)
    _add_title(slide, "Why CIVITAS")
    _add_subtitle(slide, "Purpose-built for transactional due diligence.")

    diffs = [
        ("Deterministic",
         "Every finding is computed by SQL rules\u2014never AI-guessed. "
         "Results are reproducible and auditable.",
         EMERALD),
        ("Transparent",
         "Every triggered finding includes a description, weight, "
         "and the supporting records that caused it.",
         TEAL),
        ("Legally Cautious",
         "AI narratives avoid speculation, predictions, and legal advice. "
         "Clear disclaimers on every report.",
         VIOLET),
        ("Fast",
         "Full property analysis in under 60 seconds. Batch portfolios "
         "processed with real-time streaming progress.",
         PRIMARY),
    ]
    for i, (title, body, color) in enumerate(diffs):
        col = i % 2
        row = i // 2
        _add_card(slide, 0.8 + col * 6.0, 2.3 + row * 2.2, 5.6, 1.8,
                  title, body, accent_color=color, title_size=16, body_size=13)

    _add_footer(slide, 11)


def _slide_12_pricing(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _set_slide_bg(slide, BG)
    _add_accent_bar(slide, VIOLET)
    _add_title(slide, "Pricing")
    _add_subtitle(slide, "Simple, transparent plans that scale with your practice.")

    plans = [
        ("Starter", "$99/mo",
         "\u2022  10 reports per month\n"
         "\u2022  Full activity scoring & PDF export\n"
         "\u2022  AI narrative summaries\n"
         "\u2022  Email support"),
        ("Professional", "$249/mo",
         "\u2022  50 reports per month\n"
         "\u2022  Batch portfolio upload\n"
         "\u2022  Report comparison\n"
         "\u2022  Priority email support"),
        ("Enterprise", "Custom",
         "\u2022  Unlimited reports\n"
         "\u2022  API access & integrations\n"
         "\u2022  Dedicated account manager\n"
         "\u2022  Custom rule configuration"),
    ]
    plan_colors = [TEXT_SEC, VIOLET, TEAL]
    border_colors = [BORDER, VIOLET, TEAL]
    for i, (name, price, features) in enumerate(plans):
        x = 0.8 + i * 4.0
        shape = slide.shapes.add_shape(
            MSO_SHAPE.ROUNDED_RECTANGLE,
            Inches(x), Inches(2.3), Inches(3.6), Inches(3.8)
        )
        shape.fill.solid()
        shape.fill.fore_color.rgb = WHITE
        shape.line.color.rgb = border_colors[i]
        shape.line.width = Pt(2 if i >= 1 else 1)
        shape.adjustments[0] = 0.05

        # Top accent bar
        accent = slide.shapes.add_shape(
            MSO_SHAPE.RECTANGLE,
            Inches(x), Inches(2.3), Inches(3.6), Pt(4)
        )
        accent.fill.solid()
        accent.fill.fore_color.rgb = plan_colors[i]
        accent.line.fill.background()

        txBox = slide.shapes.add_textbox(
            Inches(x + 0.3), Inches(2.5), Inches(3), Inches(0.4)
        )
        tf = txBox.text_frame
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = name
        run.font.name = FONT
        run.font.size = Pt(18)
        run.font.color.rgb = plan_colors[i]
        run.font.bold = True

        txBox2 = slide.shapes.add_textbox(
            Inches(x + 0.3), Inches(2.9), Inches(3), Inches(0.5)
        )
        tf2 = txBox2.text_frame
        p2 = tf2.paragraphs[0]
        run2 = p2.add_run()
        run2.text = price
        run2.font.name = FONT
        run2.font.size = Pt(28)
        run2.font.color.rgb = TEXT_HEADING
        run2.font.bold = True

        txBox3 = slide.shapes.add_textbox(
            Inches(x + 0.3), Inches(3.6), Inches(3), Inches(2.3)
        )
        tf3 = txBox3.text_frame
        tf3.word_wrap = True
        p3 = tf3.paragraphs[0]
        run3 = p3.add_run()
        run3.text = features
        run3.font.name = FONT
        run3.font.size = Pt(13)
        run3.font.color.rgb = TEXT_BODY
        p3.line_spacing = Pt(22)

    # Popular badge on Professional
    badge = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE,
        Inches(5.5), Inches(2.1), Inches(1.4), Inches(0.3)
    )
    badge.fill.solid()
    badge.fill.fore_color.rgb = VIOLET
    badge.line.fill.background()
    badge.adjustments[0] = 0.4
    tf = badge.text_frame
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    run = p.add_run()
    run.text = "POPULAR"
    run.font.name = FONT
    run.font.size = Pt(10)
    run.font.color.rgb = WHITE
    run.font.bold = True

    _add_footer(slide, 12)


def _slide_13_cta(prs):
    """Get Started / CTA slide."""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _set_slide_bg(slide, BG)

    # Gradient hero: violet -> teal
    hero_h = Inches(4.5)
    left_block = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, 0, 0, int(SLIDE_W * 0.5), hero_h
    )
    left_block.fill.solid()
    left_block.fill.fore_color.rgb = VIOLET
    left_block.line.fill.background()

    right_block = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, int(SLIDE_W * 0.5), 0,
        int(SLIDE_W * 0.5), hero_h
    )
    right_block.fill.solid()
    right_block.fill.fore_color.rgb = TEAL
    right_block.line.fill.background()

    # CIVITAS wordmark
    txBox = slide.shapes.add_textbox(
        Inches(0.8), Inches(1.0), Inches(11.5), Inches(1)
    )
    tf = txBox.text_frame
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    run = p.add_run()
    run.text = "C I V I T A S"
    run.font.name = FONT
    run.font.size = Pt(48)
    run.font.color.rgb = WHITE
    run.font.bold = True

    txBox2 = slide.shapes.add_textbox(
        Inches(0.8), Inches(2.0), Inches(11.5), Inches(0.5)
    )
    tf2 = txBox2.text_frame
    p2 = tf2.paragraphs[0]
    p2.alignment = PP_ALIGN.CENTER
    run2 = p2.add_run()
    run2.text = "Municipal Intelligence"
    run2.font.name = FONT
    run2.font.size = Pt(20)
    run2.font.color.rgb = RGBColor(0xE0, 0xE7, 0xFF)

    # CTA
    txBox3 = slide.shapes.add_textbox(
        Inches(0.8), Inches(3.0), Inches(11.5), Inches(0.6)
    )
    tf3 = txBox3.text_frame
    p3 = tf3.paragraphs[0]
    p3.alignment = PP_ALIGN.CENTER
    run3 = p3.add_run()
    run3.text = "Request a Demo"
    run3.font.name = FONT
    run3.font.size = Pt(28)
    run3.font.color.rgb = WHITE
    run3.font.bold = True

    # Contact info
    txBox4 = slide.shapes.add_textbox(
        Inches(0.8), Inches(5.2), Inches(11.5), Inches(1)
    )
    tf4 = txBox4.text_frame
    tf4.word_wrap = True
    p4 = tf4.paragraphs[0]
    p4.alignment = PP_ALIGN.CENTER
    run4 = p4.add_run()
    run4.text = "contact@civitas.ai  \u2022  civitas.ai"
    run4.font.name = FONT
    run4.font.size = Pt(16)
    run4.font.color.rgb = TEXT_SEC

    p5 = tf4.add_paragraph()
    p5.alignment = PP_ALIGN.CENTER
    p5.space_before = Pt(8)
    run5 = p5.add_run()
    run5.text = "Chicago v1  \u2022  Deterministic  \u2022  Transparent  \u2022  Legally Cautious"
    run5.font.name = FONT
    run5.font.size = Pt(12)
    run5.font.color.rgb = TEXT_SEC

    _add_footer(slide, 13)


# -- Main ---------------------------------------------------------------------

def generate():
    prs = Presentation()
    prs.slide_width = SLIDE_W
    prs.slide_height = SLIDE_H

    _slide_01_title(prs)
    _slide_02_problem(prs)
    _slide_03_cost(prs)
    _slide_04_solution(prs)
    _slide_05_how_it_works(prs)
    _slide_06_activity_scoring(prs)
    _slide_07_report_deep_dive(prs)
    _slide_08_data_sources(prs)
    _slide_09_portfolio(prs)
    _slide_10_comparison(prs)
    _slide_11_why_civitas(prs)
    _slide_12_pricing(prs)
    _slide_13_cta(prs)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    output_path = os.path.join(project_root, "civitas_pitch_deck.pptx")
    prs.save(output_path)
    print(f"Pitch deck saved to: {output_path}")
    print(f"Slides: {len(prs.slides)}")


if __name__ == "__main__":
    generate()
