"""
CIVITAS – Shared terminology constants.

Maps between internal DB values and presentation-layer labels.
"""

# Old tier names → new activity level names (for backward compat with stored reports)
TIER_LABELS = {
    "LOW": "QUIET",
    "MODERATE": "TYPICAL",
    "ELEVATED": "ACTIVE",
    "HIGH": "COMPLEX",
}

# Category code → action group label
CATEGORY_ACTIONS = {
    "A": "Review Recommended",
    "B": "Worth Noting",
    "C": "Informational",
    "D": "Action Required",
}

# Display order for action groups
ACTION_ORDER = [
    "Action Required",
    "Review Recommended",
    "Worth Noting",
    "Informational",
]
