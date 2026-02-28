"""
CIVITAS – PDF report generation via WeasyPrint + Jinja2.

Produces a 3-page PDF:
  Page 1 – Executive Summary
  Page 2 – Detailed Findings
  Page 3 – Methodology Appendix
"""

from __future__ import annotations

import io
from pathlib import Path

from jinja2 import Environment, FileSystemLoader
from weasyprint import CSS, HTML

TEMPLATE_DIR = Path(__file__).parent.parent / "templates"
_jinja = Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)), autoescape=True)


def generate_pdf(report: dict) -> bytes:
    """Render the report dict to a PDF byte string."""
    template = _jinja.get_template("report.html")
    html_str = template.render(report=report)

    css_path = TEMPLATE_DIR / "report.css"
    pdf_buf = io.BytesIO()

    HTML(string=html_str, base_url=str(TEMPLATE_DIR)).write_pdf(
        pdf_buf,
        stylesheets=[CSS(filename=str(css_path))],
    )
    return pdf_buf.getvalue()
