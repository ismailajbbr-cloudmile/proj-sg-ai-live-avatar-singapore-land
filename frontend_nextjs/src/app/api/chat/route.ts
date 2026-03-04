import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

// Ensure the API key is available
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.warn("GEMINI_API_KEY is not set in the environment variables.");
}

// Initialize the API exactly once per API route execution
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

// The default model is gemini-2.5-flash
const MODEL_NAME = "gemini-2.5-flash";

const systemInstruction = `You are the Singapore Land AI Concierge, a helpful, professional, and knowledgeable digital assistant for Singapore Land Group. 
Your goal is to assist visitors, answer questions about properties, services, and provide general guidance. 
Be polite, concise, and helpful. Do not mention that you are an AI model created by Google.`;

export async function POST(req: Request) {
    if (!genAI) {
        return NextResponse.json(
            { error: "Gemini API key not configured on server." },
            { status: 500 }
        );
    }

    try {
        const { message, history } = await req.json();

        if (!message) {
            return NextResponse.json(
                { error: "Message is required." },
                { status: 400 }
            );
        }

        const model = genAI.getGenerativeModel({
            model: MODEL_NAME,
            systemInstruction: systemInstruction,
        });

        // Format the history for the Gemini API
        // Gemini expects history as: { role: "user" | "model", parts: [{ text: "..." }] }
        const rawHistory = Array.isArray(history)
            ? history.map((msg: any) => ({
                role: msg.role === "bot" || msg.role === "model" ? "model" : "user",
                parts: [{ text: msg.text || msg.content || "" }],
            }))
            : [];

        // Gemini requires history to start with 'user' and roles must strictly alternate.
        const validHistory: any[] = [];
        for (const msg of rawHistory) {
            if (validHistory.length === 0) {
                if (msg.role === "user") {
                    validHistory.push(msg);
                }
                // Skip leading model messages
            } else {
                const lastMsg = validHistory[validHistory.length - 1];
                if (lastMsg.role === msg.role) {
                    // Combine consecutive messages from the same role
                    lastMsg.parts[0].text += "\n" + msg.parts[0].text;
                } else {
                    validHistory.push(msg);
                }
            }
        }

        const chat = model.startChat({
            history: validHistory,
        });

        const result = await chat.sendMessage(message);
        const responseText = result.response.text();

        return NextResponse.json({ text: responseText });

    } catch (error: any) {
        console.error("[Gemini Chat API Error]:", error);
        return NextResponse.json(
            { error: error.message || "An error occurred while communicating with the AI." },
            { status: 500 }
        );
    }
}
