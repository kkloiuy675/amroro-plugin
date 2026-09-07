require('dotenv').config(); // Loads .env file for local development

const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(cors());
app.use(express.json());

// API Keys pulled safely from environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const PRIMARY_PROVIDER = process.env.PRIMARY_PROVIDER || "gemini";

const GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.7-flash'];
const OPENROUTER_MODELS = ['google/gemini-3.5-flash', 'google/gemini-3.6-flash', 'google/gemini-3.7-flash'];
const GROQ_MODELS = ['mixtral-8x7b-32768', 'llama-3-70b-8192', 'llama-3-8b-8192'];

const BLOCKED_PATTERNS = [];

function containsInappropriateContent(text) {
    if (!text) return false;
    for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(text)) return true;
    }
    return false;
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = `You are an expert Roblox Luau script, Sound, and VFX generator.

STRICT MODERATION RULES:
- Refuse to process any sexually suggestive, inappropriate, NSFW, or adult-themed requests immediately.
- If a user prompt contains weird or suggestive context, respond with "ACTION_SUMMARY: Request blocked due to inappropriate content." and provide no code.

YOUR CAPABILITIES:
1. IMPORT assets:
   ACTION_TYPE: IMPORT
   ASSET_NAME: <name>
   ACTION_SUMMARY: Searching and importing requested asset.

2. EXPORT selected items:
   ACTION_TYPE: EXPORT
   ACTION_SUMMARY: Exporting selected workspace objects.

3. Code generation:
   - Provide working Roblox Luau code in \`\`\`lua ... \`\`\`.
   - AT THE END: "ACTION_SUMMARY: <summary>"`;

function parseAIResponse(text) {
    let actionType = "CODE";
    let assetName = "";
    let luauCode = "";
    let actionSummary = "Action completed successfully!";

    if (text.includes("ACTION_TYPE: IMPORT")) {
        actionType = "IMPORT";
        const assetMatch = text.match(/ASSET_NAME:\s*(.*)/i);
        if (assetMatch) assetName = assetMatch[1].trim();
    } else if (text.includes("ACTION_TYPE: EXPORT")) {
        actionType = "EXPORT";
    } else {
        const codeMatch = text.match(/```(?:lua)?([\s\S]*?)```/i);
        if (codeMatch && codeMatch[1]) {
            luauCode = codeMatch[1].trim();
        } else {
            luauCode = text.replace(/ACTION_SUMMARY:[\s\S]*/i, '').trim();
        }
    }

    const summaryMatch = text.match(/ACTION_SUMMARY:\s*([\s\S]*)/i);
    if (summaryMatch && summaryMatch[1]) {
        actionSummary = summaryMatch[1].trim();
    }

    return { actionType, assetName, luauCode, actionSummary };
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGemini(promptText) {
    for (const modelName of GEMINI_MODELS) {
        try {
            console.log(`[Gemini] ${modelName}...`);
            const response = await ai.models.generateContent({
                model: modelName,
                contents: promptText,
                config: { systemInstruction: SYSTEM_INSTRUCTION }
            });
            if (response && response.text) return { text: response.text, usedModel: modelName };
        } catch (err) {
            console.error(`[Gemini Error] ${modelName}:`, err.message);
            await delay(200);
        }
    }
    throw new Error("All Gemini models failed.");
}

async function callOpenRouter(promptText) {
    for (const modelName of OPENROUTER_MODELS) {
        try {
            console.log(`[OpenRouter] ${modelName}...`);
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: modelName,
                    max_tokens: 4096,
                    messages: [
                        { role: "system", content: SYSTEM_INSTRUCTION },
                        { role: "user", content: promptText }
                    ]
                })
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

async function callGroq(promptText) {
    for (const modelName of GROQ_MODELS) {
        try {
            console.log(`[Groq] ${modelName}...`);
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${GROQ_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: modelName,
                    max_tokens: 4096,
                    messages: [
                        { role: "system", content: SYSTEM_INSTRUCTION },
                        { role: "user", content: promptText }
                    ]
                })
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

async function generateWithFallback(promptText) {
    const providers = [PRIMARY_PROVIDER];
    if (PRIMARY_PROVIDER !== "gemini") providers.push("gemini");
    if (PRIMARY_PROVIDER !== "openrouter") providers.push("openrouter");
    if (PRIMARY_PROVIDER !== "groq") providers.push("groq");

    for (const provider of providers) {
        try {
            if (provider === "gemini") return await callGemini(promptText);
            if (provider === "openrouter") return await callOpenRouter(promptText);
            if (provider === "groq") return await callGroq(promptText);
        } catch (err) {
            console.log(`${provider} failed, trying next...`);
        }
    }
    throw new Error("All providers failed.");
}

async function callGeminiChat(history, promptText, gameContext) {
    let contents = [];
    if (history?.length) {
        for (const h of history) {
            contents.push({
                role: h.role === 'model' ? 'model' : 'user',
                parts: [{ text: h.content }]
            });
        }
    }
    const currentText = gameContext ? `Context: ${gameContext}\nTask: ${promptText}` : promptText;
    contents.push({ role: 'user', parts: [{ text: currentText }] });

    for (const modelName of GEMINI_MODELS) {
        try {
            console.log(`[Gemini Chat] ${modelName}...`);
            const response = await ai.models.generateContent({
                model: modelName,
                contents: contents,
                config: { systemInstruction: SYSTEM_INSTRUCTION }
            });
            if (response?.text) return { text: response.text, usedModel: modelName };
        } catch (err) {
            console.error(`[Gemini Chat Error] ${modelName}:`, err.message);
            await delay(200);
        }
    }
    throw new Error("All Gemini chat models failed.");
}

async function callOpenRouterChat(history, promptText, gameContext) {
    let messages = [{ role: "system", content: SYSTEM_INSTRUCTION }];
    if (history?.length) {
        for (const h of history) {
            messages.push({
                role: h.role === 'model' ? 'assistant' : 'user',
                content: h.content
            });
        }
    }
    const currentText = gameContext ? `Context: ${gameContext}\nTask: ${promptText}` : promptText;
    messages.push({ role: "user", content: currentText });

    for (const modelName of OPENROUTER_MODELS) {
        try {
            console.log(`[OpenRouter Chat] ${modelName}...`);
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: modelName,
                    max_tokens: 4096,
                    messages: messages
                })
            });
            const data = await response.json();
            if (data.choices?.[0]?.message) return { text: data.choices[0].message.content, usedModel: modelName };
        } catch (err) {
            console.error(`[OpenRouter Chat Error] ${modelName}:`, err.message);
            await delay(200);
        }
    }
    throw new Error("All OpenRouter chat models failed.");
}

async function callGroqChat(history, promptText, gameContext) {
    let messages = [{ role: "system", content: SYSTEM_INSTRUCTION }];
    if (history?.length) {
        for (const h of history) {
            messages.push({
                role: h.role === 'model' ? 'assistant' : 'user',
                content: h.content
            });
        }
    }
    const currentText = gameContext ? `Context: ${gameContext}\nTask: ${promptText}` : promptText;
    messages.push({ role: "user", content: currentText });

    for (const modelName of GROQ_MODELS) {
        try {
            console.log(`[Groq Chat] ${modelName}...`);
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${GROQ_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: modelName,
                    max_tokens: 4096,
                    messages: messages
                })
            });
            const data = await response.json();
            if (data.choices?.[0]?.message) return { text: data.choices[0].message.content, usedModel: modelName };
        } catch (err) {
            console.error(`[Groq Chat Error] ${modelName}:`, err.message);
            await delay(200);
        }
    }
    throw new Error("All Groq chat models failed.");
}

async function generateChatWithFallback(history, promptText, gameContext) {
    const providers = [PRIMARY_PROVIDER];
    if (PRIMARY_PROVIDER !== "gemini") providers.push("gemini");
    if (PRIMARY_PROVIDER !== "openrouter") providers.push("openrouter");
    if (PRIMARY_PROVIDER !== "groq") providers.push("groq");

    for (const provider of providers) {
        try {
            if (provider === "gemini") return await callGeminiChat(history, promptText, gameContext);
            if (provider === "openrouter") return await callOpenRouterChat(history, promptText, gameContext);
            if (provider === "groq") return await callGroqChat(history, promptText, gameContext);
        } catch (err) {
            console.log(`Chat ${provider} failed, trying next...`);
        }
    }
    throw new Error("All chat providers failed.");
}

app.post('/generate', async (req, res) => {
    const { prompt, gameContext, guiStyle, webUrl } = req.body;

    const combinedInput = `${prompt || ''} ${gameContext || ''} ${guiStyle || ''}`;
    if (containsInappropriateContent(combinedInput)) {
        return res.status(400).json({ success: false, error: "Request blocked due to inappropriate content." });
    }

    let userPrompt = `Context: ${gameContext}\nUI Style: ${guiStyle}\nTask: ${prompt}`;
    if (webUrl?.trim()) userPrompt += `\nReference Web URL: ${webUrl.trim()}`;

    try {
        const result = await generateWithFallback(userPrompt);
        const parsed = parseAIResponse(result.text || "");

        res.json({
            success: true,
            provider: result.usedModel,
            actionType: parsed.actionType,
            assetName: parsed.assetName,
            code: parsed.luauCode,
            summary: parsed.actionSummary
        });
    } catch (err) {
        console.error("Generation Error:", err.message);
        res.status(500).json({ success: false, error: "Service busy. Try again." });
    }
});

app.post('/auto-fix', async (req, res) => {
    const { brokenCode, errorMsg } = req.body;

    if (containsInappropriateContent(brokenCode) || containsInappropriateContent(errorMsg)) {
        return res.status(400).json({ success: false, error: "Request blocked." });
    }

    const fixPrompt = `Fix this Roblox Luau code.\nBroken Code:\n${brokenCode}\nError:\n${errorMsg}`;

    try {
        const result = await generateWithFallback(fixPrompt);
        const parsed = parseAIResponse(result.text || "");

        res.json({
            success: true,
            code: parsed.luauCode,
            summary: parsed.actionSummary
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/chat', async (req, res) => {
    const { prompt, history, gameContext } = req.body;

    const combinedInput = `${prompt || ''} ${gameContext || ''} ${JSON.stringify(history || [])}`;
    if (containsInappropriateContent(combinedInput)) {
        return res.status(400).json({ success: false, error: "Request blocked." });
    }

    try {
        const result = await generateChatWithFallback(history, prompt, gameContext);
        const parsed = parseAIResponse(result.text || "");

        res.json({
            success: true,
            provider: result.usedModel,
            result: parsed.luauCode || parsed.actionSummary,
            summary: parsed.action*
