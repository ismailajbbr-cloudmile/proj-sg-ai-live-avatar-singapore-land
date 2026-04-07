"""
Phoneme-to-viseme pipeline — direct Python port of frontend_nextjs/src/app/api/tts/route.ts
"""
from typing import TypedDict

# ─── Word-to-Viseme mapping ──────────────────────────────────────────────────
WORD_VISEME_MAP: dict[str, list[str]] = {
    # function words
    "a": ["AH"], "an": ["AE", "NN"], "and": ["AE", "NN", "DD"], "the": ["TH", "AH"],
    "to": ["TT", "UW"], "of": ["AH", "FF"], "is": ["IH", "SS"], "in": ["IH", "NN"],
    "it": ["IH", "TT"], "be": ["BB", "IY"], "as": ["AE", "SS"], "at": ["AE", "TT"],
    "or": ["AO", "RR"], "on": ["AO", "NN"], "are": ["AO", "RR"], "not": ["NN", "AO", "TT"],
    "i": ["AY"], "we": ["WW", "IY"], "you": ["YY", "UW"], "he": ["HH", "IY"],
    "she": ["SH", "IY"], "they": ["TH", "EY"], "this": ["TH", "IH", "SS"],
    "that": ["TH", "AE", "TT"], "with": ["WW", "IH", "TH"], "for": ["FF", "AO", "RR"],
    # common content words
    "hello": ["HH", "EH", "LL", "OW"], "hi": ["HH", "AY"],
    "good": ["GG", "UH", "DD"], "morning": ["MM", "AO", "RR", "NN", "IH", "NG"],
    "how": ["HH", "AW"], "can": ["KK", "AE", "NN"], "help": ["HH", "EH", "LL", "PP"],
    "please": ["PP", "LL", "IY", "ZZ"], "thank": ["TH", "AE", "NG", "KK"],
    "yes": ["YY", "EH", "SS"], "no": ["NN", "OW"], "okay": ["OW", "KK", "EY"],
    "what": ["WW", "AH", "TT"], "where": ["WW", "EH", "RR"], "when": ["WW", "EH", "NN"],
    "welcome": ["WW", "EH", "LL", "KK", "AH", "MM"],
}

# Phoneme → Viseme label + mouth opening weight
_PhonemeEntry = TypedDict("_PhonemeEntry", {"label": str, "mouth": float})

PHONEME_TO_VISEME: dict[str, _PhonemeEntry] = {
    # Bilabials – lips together
    "PP": {"label": "MBP", "mouth": 1.0}, "BB": {"label": "MBP", "mouth": 0.9},
    "MM": {"label": "MBP", "mouth": 1.0},
    # Labio-dentals
    "FF": {"label": "FV", "mouth": 0.85}, "VV": {"label": "FV", "mouth": 0.85},
    # Dental
    "TH": {"label": "TH", "mouth": 0.75},
    # Alveolars
    "TT": {"label": "T", "mouth": 0.8}, "DD": {"label": "T", "mouth": 0.8},
    "NN": {"label": "T", "mouth": 0.7}, "LL": {"label": "L", "mouth": 0.75},
    "SS": {"label": "S", "mouth": 0.8}, "ZZ": {"label": "S", "mouth": 0.75},
    # Post-alveolars
    "SH": {"label": "CH", "mouth": 0.85}, "CH": {"label": "CH", "mouth": 0.9},
    "JH": {"label": "CH", "mouth": 0.85},
    # Velars
    "KK": {"label": "K", "mouth": 0.85}, "GG": {"label": "K", "mouth": 0.8},
    "NG": {"label": "K", "mouth": 0.6},
    # Glottal
    "HH": {"label": "AA", "mouth": 0.3},
    # Approximants
    "WW": {"label": "UW", "mouth": 0.7}, "YY": {"label": "IY", "mouth": 0.65},
    "RR": {"label": "R", "mouth": 0.7},
    # Vowels
    "AA": {"label": "AA", "mouth": 1.0}, "AE": {"label": "AE", "mouth": 0.85},
    "AH": {"label": "AH", "mouth": 0.8}, "AO": {"label": "AO", "mouth": 0.85},
    "AW": {"label": "AO", "mouth": 0.9}, "AY": {"label": "AA", "mouth": 0.85},
    "EH": {"label": "EH", "mouth": 0.8}, "ER": {"label": "ER", "mouth": 0.75},
    "EY": {"label": "EH", "mouth": 0.8}, "IH": {"label": "IY", "mouth": 0.7},
    "IY": {"label": "IY", "mouth": 0.75}, "OW": {"label": "OH", "mouth": 0.85},
    "OY": {"label": "OH", "mouth": 0.8}, "UH": {"label": "UW", "mouth": 0.7},
    "UW": {"label": "UW", "mouth": 0.8},
}

CONSONANT_MAP: dict[str, str] = {
    "b": "BB", "c": "KK", "d": "DD", "f": "FF", "g": "GG", "h": "HH", "j": "JH",
    "k": "KK", "l": "LL", "m": "MM", "n": "NN", "p": "PP", "q": "KK", "r": "RR",
    "s": "SS", "t": "TT", "v": "VV", "w": "WW", "x": "SS", "y": "YY", "z": "ZZ",
}


def _guess_phonemes(word: str) -> list[str]:
    w = "".join(c for c in word.lower() if c.isalpha())
    phonemes: list[str] = []
    i = 0
    while i < len(w):
        two = w[i:i + 2]
        one = w[i]
        if two == "th":
            phonemes.append("TH"); i += 2
        elif two == "sh":
            phonemes.append("SH"); i += 2
        elif two == "ch":
            phonemes.append("CH"); i += 2
        elif two == "ph":
            phonemes.append("FF"); i += 2
        elif two == "ng":
            phonemes.append("NG"); i += 2
        elif two == "wh":
            phonemes.append("WW"); i += 2
        elif one in "aeiou":
            mapping = {"a": "AE", "e": "EH", "i": "IH", "o": "AO", "u": "UH"}
            phonemes.append(mapping[one]); i += 1
        else:
            phonemes.append(CONSONANT_MAP.get(one, "AH")); i += 1
    return phonemes if phonemes else ["AH"]


def _get_phonemes(word: str) -> list[str]:
    clean = "".join(c for c in word.lower() if c.isalpha())
    return WORD_VISEME_MAP.get(clean) or _guess_phonemes(clean)


class VisemeFrame(TypedDict):
    t: int
    label: str
    mouth: float


def build_viseme_frames(
    words: list[str],
    timepoints: list[dict],  # [{markName: str, timeSeconds: float}]
) -> list[VisemeFrame]:
    frames: list[VisemeFrame] = [{"t": 0, "label": "MBP", "mouth": 0.0}]

    time_lookup: dict[str, float] = {
        tp["markName"]: tp["timeSeconds"] * 1000 for tp in timepoints
    }
    has_real_timings = bool(time_lookup)

    if has_real_timings:
        for wi, word in enumerate(words):
            word_start_ms = time_lookup.get(f"w{wi}", 0.0)
            next_start_ms = time_lookup.get(f"w{wi + 1}", word_start_ms + 400)
            word_duration_ms = max(80.0, next_start_ms - word_start_ms)

            phonemes = _get_phonemes(word)
            phoneme_duration = word_duration_ms / len(phonemes)

            for pi, phoneme in enumerate(phonemes):
                vis = PHONEME_TO_VISEME.get(phoneme, {"label": "AA", "mouth": 0.5})
                frames.append({
                    "t": round(word_start_ms + pi * phoneme_duration),
                    "label": vis["label"],
                    "mouth": vis["mouth"],
                })
            frames.append({
                "t": round(word_start_ms + word_duration_ms - 30),
                "label": "MBP",
                "mouth": 0.0,
            })
    else:
        MS_PER_PHONEME = 110
        WORD_GAP_MS = 50
        cursor = 50.0

        for word in words:
            phonemes = _get_phonemes(word)
            word_duration_ms = len(phonemes) * MS_PER_PHONEME

            for pi, phoneme in enumerate(phonemes):
                vis = PHONEME_TO_VISEME.get(phoneme, {"label": "AA", "mouth": 0.5})
                frames.append({
                    "t": round(cursor + pi * MS_PER_PHONEME),
                    "label": vis["label"],
                    "mouth": vis["mouth"],
                })
            frames.append({
                "t": round(cursor + word_duration_ms - 30),
                "label": "MBP",
                "mouth": 0.0,
            })
            cursor += word_duration_ms + WORD_GAP_MS

        frames.append({"t": round(cursor + 100), "label": "MBP", "mouth": 0.0})

    return sorted(frames, key=lambda f: f["t"])
