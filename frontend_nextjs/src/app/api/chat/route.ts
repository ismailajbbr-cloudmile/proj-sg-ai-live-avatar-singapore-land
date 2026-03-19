import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

const PROJECT = process.env.GOOGLE_VERTEX_PROJECT;
const LOCATION = process.env.GOOGLE_VERTEX_LOCATION || "us-central1";
const WEB_DATASTORE_ID = process.env.VERTEX_AI_WEB_DATASTORE_ID;
const PDF_DATASTORE_ID = process.env.VERTEX_AI_PDF_DATASTORE_ID;

if (!PROJECT) console.warn("[chat] GOOGLE_VERTEX_PROJECT is not set.");
if (!WEB_DATASTORE_ID) console.warn("[chat] VERTEX_AI_WEB_DATASTORE_ID is not set.");
if (!PDF_DATASTORE_ID) console.warn("[chat] VERTEX_AI_PDF_DATASTORE_ID is not set.");

const ai = new GoogleGenAI({ vertexai: true, project: PROJECT, location: LOCATION });

const MODEL_NAME = "gemini-2.5-flash";

function datastorePath(id: string) {
    return `projects/${PROJECT}/locations/global/collections/default_collection/dataStores/${id}`;
}

const groundingTools = [
    ...(WEB_DATASTORE_ID ? [{ retrieval: { vertexAiSearch: { datastore: datastorePath(WEB_DATASTORE_ID) } } }] : []),
    ...(PDF_DATASTORE_ID ? [{ retrieval: { vertexAiSearch: { datastore: datastorePath(PDF_DATASTORE_ID) } } }] : []),
];

const VALID_GESTURES = new Set(["idle", "nod", "shake", "tilt", "lookup", "excited"]);

const systemInstruction = `You are the Marina Square AI Concierge, a helpful, professional, and knowledgeable digital assistant for Marina Square shopping mall in Singapore.
Your goal is to assist visitors, answer questions about stores, dining, events, promotions, facilities, parking, and provide general guidance about Marina Square.
Be polite, concise, and helpful. Do not mention that you are an AI model created by Google.

IMPORTANT: Always respond in exactly this format — no JSON, no code blocks:
Line 1: <gesture> (exactly one word from: idle | nod | shake | tilt | lookup | excited)
Line 2+: <your spoken response>

Example:
nod
Yes, Marina Square is located at 6 Raffles Boulevard and offers over 300 retail stores.

Gesture rules — be very selective, most responses should use "idle":
- idle: DEFAULT for all informational, factual, or multi-sentence answers
- nod: ONLY for a single short confirmation ("Yes.", "That's correct.")
- shake: ONLY when explicitly saying no or correcting a misconception
- tilt: ONLY when genuinely uncertain or asking a clarifying question
- lookup: ONLY when recalling a specific fact or statistic
- excited: ONLY for greetings or clearly positive news

When in doubt, use "idle".`;

export async function POST(req: Request) {
    try {
        const { message, history } = await req.json();

        if (!message) {
            return NextResponse.json({ error: "Message is required." }, { status: 400 });
        }

        // Build and validate conversation history
        const rawHistory = Array.isArray(history)
            ? history.map((msg: any) => ({
                role: msg.role === "bot" || msg.role === "model" ? "model" : "user",
                parts: [{ text: msg.text || msg.content || "" }],
            }))
            : [];

        const validHistory: any[] = [];
        for (const msg of rawHistory) {
            if (validHistory.length === 0) {
                if (msg.role === "user") validHistory.push(msg);
            } else {
                const last = validHistory[validHistory.length - 1];
                if (last.role === msg.role) {
                    last.parts[0].text += "\n" + msg.parts[0].text;
                } else {
                    validHistory.push(msg);
                }
            }
        }

        const isFirstMessage = validHistory.length === 0;

        const contents = [
            ...validHistory,
            { role: "user", parts: [{ text: message }] },
        ];

        const stream = await ai.models.generateContentStream({
            model: MODEL_NAME,
            contents,
            config: { systemInstruction, tools: groundingTools },
        });

        const encoder = new TextEncoder();
        let gestureEmitted = false;
        let lineBuffer = "";

        const readable = new ReadableStream({
            async start(controller) {
                const send = (obj: object) =>
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

                try {
                    for await (const chunk of stream) {
                        const text = chunk.text ?? "";

                        if (!gestureEmitted) {
                            lineBuffer += text;
                            const newlineIdx = lineBuffer.indexOf("\n");
                            if (newlineIdx !== -1) {
                                const gestureLine = lineBuffer.slice(0, newlineIdx).trim().toLowerCase();
                                const gesture = VALID_GESTURES.has(gestureLine) ? gestureLine : "idle";
                                send({ type: "gesture", value: isFirstMessage ? "excited" : gesture });
                                gestureEmitted = true;

                                const rest = lineBuffer.slice(newlineIdx + 1);
                                if (rest) send({ type: "chunk", value: rest });
                                lineBuffer = "";
                            }
                        } else {
                            send({ type: "chunk", value: text });
                        }
                    }

                    // Flush if model never output a newline
                    if (!gestureEmitted) {
                        send({ type: "gesture", value: isFirstMessage ? "excited" : "idle" });
                        if (lineBuffer) send({ type: "chunk", value: lineBuffer });
                    }

                    send({ type: "done" });
                } catch (err: any) {
                    send({ type: "error", value: err.message ?? "Stream error" });
                } finally {
                    controller.close();
                }
            },
        });

        return new Response(readable, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        });

    } catch (error: any) {
        console.error("[Chat API Error]:", error);
        return NextResponse.json(
            { error: error.message || "An error occurred while communicating with the AI." },
            { status: 500 }
        );
    }
}
