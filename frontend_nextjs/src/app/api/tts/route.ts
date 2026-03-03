import { NextResponse } from "next/server";
import textToSpeech from "@google-cloud/text-to-speech";
import type { VisemeFrame } from "@/types/viseme";

// ─── Word-to-Viseme mapping ──────────────────────────────────────────────────
// Simple CMU-style word → viseme shape lookup for common words.
// For unknown words, we estimate shapes from their letters/ending.

const WORD_VISEME_MAP: Record<string, string[]> = {
    // function words
    a: ["AH"], an: ["AE", "NN"], and: ["AE", "NN", "DD"], the: ["TH", "AH"],
    to: ["TT", "UW"], of: ["AH", "FF"], is: ["IH", "SS"], in: ["IH", "NN"],
    it: ["IH", "TT"], be: ["BB", "IY"], as: ["AE", "SS"], at: ["AE", "TT"],
    or: ["AO", "RR"], on: ["AO", "NN"], are: ["AO", "RR"], not: ["NN", "AO", "TT"],
    i: ["AY"], we: ["WW", "IY"], you: ["YY", "UW"], he: ["HH", "IY"], she: ["SH", "IY"],
    they: ["TH", "EY"], this: ["TH", "IH", "SS"], that: ["TH", "AE", "TT"],
    with: ["WW", "IH", "TH"], for: ["FF", "AO", "RR"],
    // common content words
    hello: ["HH", "EH", "LL", "OW"], hi: ["HH", "AY"],
    good: ["GG", "UH", "DD"], morning: ["MM", "AO", "RR", "NN", "IH", "NG"],
    how: ["HH", "AW"], can: ["KK", "AE", "NN"], help: ["HH", "EH", "LL", "PP"],
    please: ["PP", "LL", "IY", "ZZ"], thank: ["TH", "AE", "NG", "KK"],
    yes: ["YY", "EH", "SS"], no: ["NN", "OW"], okay: ["OW", "KK", "EY"],
    what: ["WW", "AH", "TT"], where: ["WW", "EH", "RR"], when: ["WW", "EH", "NN"],
    welcome: ["WW", "EH", "LL", "KK", "AH", "MM"],
};

// Phoneme → Viseme label (mouth shape on the mesh)
const PHONEME_TO_VISEME: Record<string, { label: string; mouth: number }> = {
    // Bilabials – lips together
    PP: { label: "MBP", mouth: 1.0 }, BB: { label: "MBP", mouth: 0.9 },
    MM: { label: "MBP", mouth: 1.0 },
    // Labio-dentals
    FF: { label: "FV", mouth: 0.85 }, VV: { label: "FV", mouth: 0.85 },
    // Dental
    TH: { label: "TH", mouth: 0.75 },
    // Alveolars  
    TT: { label: "T", mouth: 0.8 }, DD: { label: "T", mouth: 0.8 },
    NN: { label: "T", mouth: 0.7 }, LL: { label: "L", mouth: 0.75 },
    SS: { label: "S", mouth: 0.8 }, ZZ: { label: "S", mouth: 0.75 },
    // Post-alveolars
    SH: { label: "CH", mouth: 0.85 }, CH: { label: "CH", mouth: 0.9 },
    JH: { label: "CH", mouth: 0.85 },
    // Velars
    KK: { label: "K", mouth: 0.85 }, GG: { label: "K", mouth: 0.8 },
    NG: { label: "K", mouth: 0.6 },
    // Glottal
    HH: { label: "AA", mouth: 0.3 },
    // Approximants
    WW: { label: "UW", mouth: 0.7 }, YY: { label: "IY", mouth: 0.65 },
    RR: { label: "R", mouth: 0.7 },
    // Vowels
    AA: { label: "AA", mouth: 1.0 }, AE: { label: "AE", mouth: 0.85 },
    AH: { label: "AH", mouth: 0.8 }, AO: { label: "AO", mouth: 0.85 },
    AW: { label: "AO", mouth: 0.9 }, AY: { label: "AA", mouth: 0.85 },
    EH: { label: "EH", mouth: 0.8 }, ER: { label: "ER", mouth: 0.75 },
    EY: { label: "EH", mouth: 0.8 }, IH: { label: "IY", mouth: 0.7 },
    IY: { label: "IY", mouth: 0.75 }, OW: { label: "OH", mouth: 0.85 },
    OY: { label: "OH", mouth: 0.8 }, UH: { label: "UW", mouth: 0.7 },
    UW: { label: "UW", mouth: 0.8 },
};

// Estimate phonemes for an unknown word from its characters
function guessPhonemes(word: string): string[] {
    const w = word.toLowerCase().replace(/[^a-z]/g, "");
    const phonemes: string[] = [];
    let i = 0;
    while (i < w.length) {
        const two = w.slice(i, i + 2);
        const one = w[i];
        if (two === "th") { phonemes.push("TH"); i += 2; }
        else if (two === "sh") { phonemes.push("SH"); i += 2; }
        else if (two === "ch") { phonemes.push("CH"); i += 2; }
        else if (two === "ph") { phonemes.push("FF"); i += 2; }
        else if (two === "ng") { phonemes.push("NG"); i += 2; }
        else if (two === "wh") { phonemes.push("WW"); i += 2; }
        else if ("aeiou".includes(one)) {
            if (one === "a") phonemes.push("AE");
            else if (one === "e") phonemes.push("EH");
            else if (one === "i") phonemes.push("IH");
            else if (one === "o") phonemes.push("AO");
            else phonemes.push("UH");
            i++;
        } else {
            const consonantMap: Record<string, string> = {
                b: "BB", c: "KK", d: "DD", f: "FF", g: "GG", h: "HH", j: "JH", k: "KK",
                l: "LL", m: "MM", n: "NN", p: "PP", q: "KK", r: "RR", s: "SS", t: "TT",
                v: "VV", w: "WW", x: "SS", y: "YY", z: "ZZ",
            };
            phonemes.push(consonantMap[one] ?? "AH");
            i++;
        }
    }
    return phonemes.length > 0 ? phonemes : ["AH"];
}

function getPhonemes(word: string): string[] {
    const clean = word.toLowerCase().replace(/[^a-z]/g, "");
    return WORD_VISEME_MAP[clean] ?? guessPhonemes(clean);
}

// Build viseme frames from word timings returned by Google Cloud TTS.
// When real timepoints are available (SSML marks), we use them.
// Otherwise, we fall back to a linear estimate: ~120ms per phoneme at natural speech rate.
function buildVisemeFrames(
    words: string[],
    timepoints: { markName: string; timeSeconds: number }[]
): VisemeFrame[] {
    const frames: VisemeFrame[] = [];
    frames.push({ t: 0, label: "MBP", mouth: 0 });

    const timeLookup: Record<string, number> = {};
    for (const tp of timepoints) {
        timeLookup[tp.markName] = tp.timeSeconds * 1000;
    }

    const hasRealTimings = Object.keys(timeLookup).length > 0;

    if (hasRealTimings) {
        // ── Timepoints returned by Google TTS: use real word start times ──────
        for (let wi = 0; wi < words.length; wi++) {
            const wordStartMs = timeLookup[`w${wi}`] ?? 0;
            const nextStartMs = timeLookup[`w${wi + 1}`] ?? wordStartMs + 400;
            const wordDurationMs = Math.max(80, nextStartMs - wordStartMs);

            const phonemes = getPhonemes(words[wi]);
            const phonemeDuration = wordDurationMs / phonemes.length;

            for (let pi = 0; pi < phonemes.length; pi++) {
                const vis = PHONEME_TO_VISEME[phonemes[pi]] ?? { label: "AA", mouth: 0.5 };
                frames.push({
                    t: Math.round(wordStartMs + pi * phonemeDuration),
                    label: vis.label,
                    mouth: vis.mouth,
                });
            }
            // Close mouth briefly between words
            frames.push({ t: Math.round(wordStartMs + wordDurationMs - 30), label: "MBP", mouth: 0 });
        }
    } else {
        // ── No timepoints: estimate linearly at natural speech rate ─────────
        // Typical phoneme duration: ~90–130ms at moderate speaking pace.
        // We use 110ms per phoneme as the default, capped by min word gap.
        const MS_PER_PHONEME = 110;
        const WORD_GAP_MS = 50; // silence between words

        let cursor = 50; // small initial silence before speech starts

        for (let wi = 0; wi < words.length; wi++) {
            const phonemes = getPhonemes(words[wi]);
            const wordDurationMs = phonemes.length * MS_PER_PHONEME;

            for (let pi = 0; pi < phonemes.length; pi++) {
                const vis = PHONEME_TO_VISEME[phonemes[pi]] ?? { label: "AA", mouth: 0.5 };
                frames.push({
                    t: Math.round(cursor + pi * MS_PER_PHONEME),
                    label: vis.label,
                    mouth: vis.mouth,
                });
            }

            // Close mouth between words
            frames.push({ t: Math.round(cursor + wordDurationMs - 30), label: "MBP", mouth: 0 });
            cursor += wordDurationMs + WORD_GAP_MS;
        }

        // Trailing silence
        frames.push({ t: cursor + 100, label: "MBP", mouth: 0 });
    }

    return frames.sort((a, b) => a.t - b.t);
}

// ─── Google Cloud TTS Client ─────────────────────────────────────────────────

function createTtsClient() {
    const credJson = process.env.GOOGLE_CREDENTIALS_JSON;
    if (credJson) {
        const credentials = JSON.parse(credJson);
        return new textToSpeech.TextToSpeechClient({ credentials });
    }
    // Falls back to GOOGLE_APPLICATION_CREDENTIALS env var (file path)
    return new textToSpeech.TextToSpeechClient();
}

// ─── API Handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
    try {
        const { text, language = "en-US" } = await request.json();

        if (!text?.trim()) {
            return NextResponse.json({ error: "text is required" }, { status: 400 });
        }

        const words = text.trim().split(/\s+/);

        // Build SSML with <mark> tags before each word for precise timing
        const ssmlBody = words
            .map((word: string, i: number) => `<mark name="w${i}"/>${word}`)
            .join(" ");
        const ssml = `<speak>${ssmlBody}</speak>`;

        const client = createTtsClient();

        const [response] = await client.synthesizeSpeech({
            input: { ssml },
            voice: {
                languageCode: language,
                ssmlGender: "FEMALE",
                // Use Neural2 for best quality (enable_time_pointing works with Neural2/Wavenet)
                name: language.startsWith("zh") ? "cmn-CN-Wavenet-A" : `${language.split("-")[0]}-${language.split("-")[1]}-Neural2-F`,
            },
            audioConfig: {
                audioEncoding: "MP3",
                speakingRate: 1.0,
                pitch: 0,
            },
            enableTimePointing: ["SSML_MARK"],
        } as any);

        const audioBase64 = Buffer.from(
            response.audioContent as Uint8Array
        ).toString("base64");

        // Cast to `any` — `timepoints` is returned at runtime but not yet in the SDK's TS types
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resp = response as any;
        const timepoints = (resp.timepoints ?? []) as { markName: string; timeSeconds: number }[];

        // Diagnostic logging — check if timepoints are coming back from Google
        console.log(`[TTS] voice=${language} words=${words.length} timepoints=${timepoints.length}`);
        if (timepoints.length > 0) {
            console.log("[TTS] Sample timepoints:", JSON.stringify(timepoints.slice(0, 3)));
        } else {
            console.warn("[TTS] No timepoints returned – using estimated linear timing (~110ms/phoneme).");
        }

        const visemes = buildVisemeFrames(words, timepoints);

        return NextResponse.json({
            audioBase64,
            mimeType: "audio/mpeg",
            visemes,
            hasRealTimepoints: timepoints.length > 0,
        });
    } catch (error: any) {
        console.error("[TTS API Error]", error?.message ?? error);
        return NextResponse.json(
            { error: error?.message ?? "TTS generation failed" },
            { status: 500 }
        );
    }
}
