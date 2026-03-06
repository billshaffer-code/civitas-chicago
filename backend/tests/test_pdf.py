"""
Tests for backend.app.services.pdf — PDF generation.
"""

import pytest

from backend.app.services.pdf import generate_pdf


class TestGeneratePdf:
    def test_produces_bytes(self, sample_report):
        result = generate_pdf(sample_report)
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_pdf_header(self, sample_report):
        result = generate_pdf(sample_report)
        assert result[:5] == b"%PDF-"

    @pytest.mark.parametrize("level", ["QUIET", "TYPICAL", "ACTIVE", "COMPLEX"])
    def test_all_levels_render(self, sample_report, level):
        sample_report["activity_level"] = level
        sample_report["activity_score"] = {"QUIET": 10, "TYPICAL": 35, "ACTIVE": 55, "COMPLEX": 85}[level]
        result = generate_pdf(sample_report)
        assert result[:5] == b"%PDF-"

    def test_empty_records(self, sample_report):
        sample_report["supporting_records"] = {
            "violations": [],
            "inspections": [],
            "permits": [],
            "tax_liens": [],
        }
        sample_report["triggered_flags"] = []
        sample_report["activity_level"] = "QUIET"
        sample_report["activity_score"] = 0
        result = generate_pdf(sample_report)
        assert result[:5] == b"%PDF-"
