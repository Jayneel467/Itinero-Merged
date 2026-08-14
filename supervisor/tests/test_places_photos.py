"""Places photo ranking must not confuse short city tokens with English words."""

from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))


def test_token_in_blob_word_boundary():
    from supervisor.places_photos import _token_in_blob

    assert _token_in_blob("leh", "leh palace ladakh")
    assert not _token_in_blob("leh", "leisure himalayan trek operator")
    assert _token_in_blob("rome", "rome colosseum italy")
    assert not _token_in_blob("rome", "romantic lake palace udaipur")
    assert _token_in_blob("goa", "baga beach goa india")
    assert not _token_in_blob("goa", "angola safari camp")
    assert _token_in_blob("hong kong", "hong kong victoria harbour")


def test_city_match_score_penalizes_wrong_city():
    from supervisor.places_photos import _city_match_score

    udaipur_palace = {
        "displayName": {"text": "City Palace"},
        "formattedAddress": "Udaipur, Rajasthan, India",
        "primaryType": "tourist_attraction",
    }
    goa_beach = {
        "displayName": {"text": "Baga Beach"},
        "formattedAddress": "Goa, India",
        "primaryType": "beach",
    }
    leisure_tour = {
        "displayName": {"text": "Leisure Himalayan Treks"},
        "formattedAddress": "Manali, Himachal Pradesh, India",
        "primaryType": "travel_agency",
    }

    assert _city_match_score(udaipur_palace, "Udaipur") > 0
    assert _city_match_score(goa_beach, "Udaipur") < 0
    assert _city_match_score(leisure_tour, "Leh") < 0
