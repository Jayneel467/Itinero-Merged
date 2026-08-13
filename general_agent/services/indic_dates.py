"""Normalize Gujarati / Hindi / Gujlish dates so validate_date can parse them."""
from __future__ import annotations

import re

_GUJ_NUM = {
    "એક": 1, "બે": 2, "ત્રણ": 3, "ચાર": 4, "પાંચ": 5, "છ": 6, "સાત": 7, "આઠ": 8, "નવ": 9, "દસ": 10,
    "અગિયાર": 11, "બાર": 12, "તેર": 13, "ચૌદ": 14, "પંદર": 15, "સોળ": 16, "સત્તર": 17,
    "અઢાર": 18, "ઓગણીસ": 19, "વીસ": 20, "એકવીસ": 21, "બાવીસ": 22, "તેવીસ": 23, "ચોવીસ": 24,
    "પચ્ચીસ": 25, "છવ્વીસ": 26, "સત્તાવીસ": 27, "અઠ્ઠાવીસ": 28, "ઓગણત્રીસ": 29, "ત્રીસ": 30,
    "એકત્રીસ": 31,
    "ek": 1, "be": 2, "tran": 3, "char": 4, "panch": 5, "chh": 6, "saat": 7, "aath": 8, "nav": 9,
    "das": 10, "bavis": 22, "baavis": 22, "tevis": 23, "chovis": 24, "pachis": 25,
    "बाईस": 22, "तेईस": 23, "चौबीस": 24, "पच्चीस": 25, "इक्कीस": 21, "तीस": 30, "इकतीस": 31,
}

_MONTH_SWAP = {
    "જાન્યુઆરી": "January", "ફેબ્રુઆરી": "February", "માર્ચ": "March", "એપ્રિલ": "April",
    "મે": "May", "જૂન": "June", "જુન": "June", "જુલાઈ": "July", "જુલાઇ": "July",
    "ઓગસ્ટ": "August", "ઑગસ્ટ": "August", "ઓગષ્ટ": "August", "સપ્ટેમ્બર": "September",
    "ઓક્ટોબર": "October", "નવેમ્બર": "November", "ડિસેમ્બર": "December",
    "जनवरी": "January", "फरवरी": "February", "मार्च": "March", "अप्रैल": "April",
    "मई": "May", "जून": "June", "जुलाई": "July", "अगस्त": "August", "सितंबर": "September",
    "अक्टूबर": "October", "नवंबर": "November", "दिसंबर": "December",
    "ogast": "August", "agast": "August",
}

_RELATIVE = [
    (re.compile(r"આવતી\s*કાલે|પરમ\s*દિવસે|परसों|\bparso\b|\bday\s+after\s+tomorrow\b", re.I), "day after tomorrow"),
    (re.compile(r"કાલે|कल\b|\bkaale\b|\bkaal[eé]\b|\bkal\b(?!\s*ak)", re.I), "tomorrow"),
    (re.compile(r"આજે|आज\b|\baaj\b|\btoday\b", re.I), "today"),
]


def normalize_indic_date(raw: str) -> str:
    text = str(raw or "").strip()
    if not text:
        return text
    for pat, eng in _RELATIVE:
        if pat.search(text):
            text = pat.sub(eng, text)
    for src, dst in _MONTH_SWAP.items():
        text = re.sub(re.escape(src), dst, text, flags=re.I)
    # longest number words first. Latin tokens MUST be whole words —
    # otherwise "be" (2) turns September into Septem2r and between into 2tween.
    for word, num in sorted(_GUJ_NUM.items(), key=lambda kv: len(kv[0]), reverse=True):
        if all(ord(c) < 128 for c in word):
            text = re.sub(rf"\b{re.escape(word)}\b", str(num), text, flags=re.I)
        else:
            text = re.sub(re.escape(word) + r"ે?", str(num), text, flags=re.I)
    text = re.sub(r"સવારે|सुबह|\bsavare\b|\bmorning\b", " morning", text, flags=re.I)
    return re.sub(r"\s+", " ", text).strip()
