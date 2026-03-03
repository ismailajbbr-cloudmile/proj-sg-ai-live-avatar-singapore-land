// Shared viseme types used by the TTS API route, Chat.tsx, and Avatar.tsx

export type VisemeShape =
    | "PP" | "FF" | "TH" | "DD" | "KK" | "CH" | "SS" | "NN" | "RR"
    | "AA" | "AE" | "AH" | "AO" | "AW" | "AY" | "EH" | "ER" | "EY"
    | "IH" | "IY" | "OW" | "OY" | "UH" | "UW"
    | "silence";

export type VisemeFrame = {
    /** Timestamp from audio playback start, in milliseconds */
    t: number;
    /** Viseme label matching morph target in the 3D model */
    label: string;
    /** Influence weight 0–1 for the morph target */
    mouth: number;
};

export type TtsResponse = {
    audioBase64: string;
    mimeType: string;
    visemes: VisemeFrame[];
};
