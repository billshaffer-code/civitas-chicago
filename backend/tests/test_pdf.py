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

    @pytest.mark.parametrize("tier", ["LOW", "MODERATE", "ELEVATED", "HIGH"])
    def test_all_tiers_render(self, sample_report, tier):
        sample_report["risk_tier"] = tier
        sample_report["risk_score"] = {"LOW": 10, "MODERATE": 35, "ELEVATED": 55, "HIGH": 85}[tier]
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
        sample_report["risk_tier"] = "LOW"
        sample_report["risk_score"] = 0
        result = generate_pdf(sample_report)
        assert result[:5] == b"%PDF-"
