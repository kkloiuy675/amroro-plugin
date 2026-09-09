require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const PRIMARY_PROVIDER = process.env.PRIMARY_PROVIDER || "gemini";

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-1.5-flash'];
const OPENROUTER_MODELS = ['google/gemini-2.5-flash', 'openai/gpt-4o-mini'];
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'];

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY || "dummy" });

const SYSTEM_INSTRUCTION = `You are the AMRORO Genius Game Engine, an expert Roblox Luau developer and UI assistant.

REQUIREMENTS:
1. Return raw executable Luau code wrapped in \`\`\`lua ... \`\`\`.
2. Do NOT use deprecated Roblox methods.
3. Keep code robust and modular.
4. AT THE VERY END, append:
   ACTION_SUMMARY: <Summary of generated work>`;

const ASSISTANT_SYSTEM_INSTRUCTION = `You are AMRORO AI Assistant integrated directly inside Roblox Studio.
Help the developer design games, debug scripts, structure databases, write Luau code, and optimize models.
Be direct, helpful, and clear.`;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGemini(promptText, isChat = false, history = []) {
    for (const modelName of GEMINI_MODELS) {
        try {
            if (isChat) {
                const contents = history.map(h => ({
                    role: h.role === 'model' ? 'model' : 'user',
                    parts: [{ text: h.content }]
                }));
                contents.push({ role: 'user', parts: [{ text: promptText }] });
                const response = await ai.models.generateContent({
                    model: modelName,
                    contents: contents,
                    config: { systemInstruction: ASSISTANT_SYSTEM_INSTRUCTION }
                });
                if (response?.text) return { text: response.text, usedModel: modelName };
            } else {
                const response = await ai.models.generateContent({
                    model: modelName,
                    contents: promptText,
                    config: { systemInstruction: SYSTEM_INSTRUCTION }
                });
                if (response?.text) return { text: response.text, usedModel: modelName };
            }
        } catch (err) {
            console.error(`[Gemini Error] ${modelName}:`, err.message);
            await delay(200);
        }
    }
    throw new Error("All Gemini models failed.");
}

async function callOpenRouter(promptText, isChat = false, history = []) {
    const sysPrompt = isChat ? ASSISTANT_SYSTEM_INSTRUCTION : SYSTEM_INSTRUCTION;
    let messages = [{ role: "system", content: sysPrompt }];
    if (isChat && history?.length) {
        for (const h of history) {
            messages.push({ role: h.role === 'model' ? 'assistant' : 'user', content: h.content });
        }
    }
    messages.push({ role: "user", content: promptText });

    for (const modelName of OPENROUTER_MODELS) {
        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ model: modelName, max_tokens: 4096, messages })
            });
            const data = await response.json();
            if (data.choices?.[0]?.message) return { text: data.choices[0].message.content, usedModel: modelName };
        } catch (err) {
            console.error(`[OpenRouter Error] ${modelName}:`, err.message);
            await delay(200);
        }
    }
    throw new Error("All OpenRouter models failed.");
}

async function callGroq(promptText, isChat = false, history = []) {
    const sysPrompt = isChat ? ASSISTANT_SYSTEM_INSTRUCTION : SYSTEM_INSTRUCTION;
    let messages = [{ role: "system", content: sysPrompt }];
    if (isChat && history?.length) {
        for (const h of history) {
            messages.push({ role: h.role === 'model' ? 'assistant' : 'user', content: h.content });
        }
    }
    messages.push({ role: "user", content: promptText });

    for (const modelName of GROQ_MODELS) {
        try {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${GROQ_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ model: modelName, max_tokens: 4096, messages })
            });
            const data = await response.json();
            if (data.choices?.[0]?.message) return { text: data.choices[0].message.content, usedModel: modelName };
        } catch (err) {
            console.error(`[Groq Error] ${modelName}:`, err.message);
            await delay(200);
        }
    }
    throw new Error("All Groq models failed.");
}

async function generateWithFallback(promptText, isChat = false, history = []) {
    const providers = [PRIMARY_PROVIDER, "gemini", "openrouter", "groq"].filter((v, i, a) => a.indexOf(v) === i);

    for (const provider of providers) {
        try {
            if (provider === "gemini" && GEMINI_API_KEY) return await callGemini(promptText, isChat, history);
            if (provider === "openrouter" && OPENROUTER_API_KEY) return await callOpenRouter(promptText, isChat, history);
            if (provider === "groq" && GROQ_API_KEY) return await callGroq(promptText, isChat, history);
        } catch (err) {
            console.log(`Provider ${provider} failed, trying next...`);
        }
    }
    throw new Error("All API key providers failed or missing keys.");
}

function parseAIResponse(text) {
    let luauCode = "";
    let actionSummary = "Generation completed!";

    const codeMatch = text.match(/```(?:lua)?([\s\S]*?)```/i);
    if (codeMatch && codeMatch[1]) {
        luauCode = codeMatch[1].trim();
    } else {
        luauCode = text.replace(/ACTION_SUMMARY:[\s\S]*/i, '').trim();
    }

    const summaryMatch = text.match(/ACTION_SUMMARY:\s*([\s\S]*)/i);
    if (summaryMatch && summaryMatch[1]) {
        actionSummary = summaryMatch[1].trim();
    }

    return { luauCode, actionSummary };
}

app.get('/', (req, res) => res.send("AMRORO Vercel Server Online"));

app.post('/generate', async (req, res) => {
    const { prompt, genre, referenceUrl, attachedImage } = req.body;
    let fullPrompt = `Genre: ${genre || 'General'}\nPrompt: ${prompt}`;
    if (referenceUrl) fullPrompt += `\nReference URL: ${referenceUrl}`;
    if (attachedImage) fullPrompt += `\nImage Context ID: ${attachedImage}`;

    try {
        const steps = [
            `I am generating parts and basic layout...`,
            `I am building gameplay mechanics, scripts, and stats...`,
            `I am polishing visuals, UI, and assembling hierarchy...`
        ];

        const result = await generateWithFallback(fullPrompt, false);
        const parsed = parseAIResponse(result.text || "");

        res.json({
            success: true,
            provider: result.usedModel,
            code: parsed.luauCode,
            summary: parsed.actionSummary,
            steps: steps
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/auto-fix', async (req, res) => {
    const { fullOutputLog, prompt } = req.body;
    const fixPrompt = `Fix this broken Roblox Luau script based on output log:\nLOG:\n${fullOutputLog}\nOriginal Request: ${prompt}`;

    try {
        const result = await generateWithFallback(fixPrompt, false);
        const parsed = parseAIResponse(result.text || "");
        res.json({ success: true, code: parsed.luauCode, summary: parsed.actionSummary });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/chat', async (req, res) => {
    const { prompt, history } = req.body;

    try {
        const result = await generateWithFallback(prompt, true, history);
        res.json({ success: true, reply: result.text, provider: result.usedModel });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = app;