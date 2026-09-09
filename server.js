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

// Updated 2026 Flash Model Stack (Fallback progression: 3.8 -> 3.7 -> 3.6 -> 3.5)
const GEMINI_MODELS = [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash'
];

const OPENROUTER_MODELS = [
    'google/gemini-3.8-flash',
    'google/gemini-3.7-flash',
    'meta-llama/llama-3.3-70b-instruct'
];

const GROQ_MODELS = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant'
];

// Expanded Multi-Language Moderation Blocked Patterns
const BLOCKED_PATTERNS = [
    // English explicit / profane / slur terms
    /nigg(a|er|ers)/i,
    /sex/i,
    /naked/i,
    /strip/i,
    /nsfw/i,
    /nude/i,
    /blood/i,
    /gore/i,
    /porn/i,
    /bitch/i,
    /fuck/i,
    
    // Arabic explicit / offensive terms
    /عاري/i,
    /جنس/i,
    /إباحي/i,
    /شرموط/i,
    /منيوك/i,
    /قحبة/i,
    /كس/i,
    /طيز/i,
    /زب/i,

    // Spanish / Portuguese / French basic explicit terms
    /desnud[oa]/i,
    /puta/i,
    /sexo/i,
    /porno/i,
    /salope/i,
    /putain/i
];

function containsInappropriateContent(text) {
    if (!text) return false;
    for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(text)) return true;
    }
    return false;
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY || "dummy" });

// Multilingual-enabled System Prompt
const SYSTEM_INSTRUCTION = `You are the AMRORO Genius Studio Engine, an expert Roblox Luau script, Sound, Model, and VFX builder.

MULTILINGUAL SUPPORT:
- You must understand and fully support all prompt languages including English, Arabic (العربية), Spanish (Español), French (Français), Portuguese/Brazilian (Português), and other Middle Eastern or global languages.
- ALWAYS return clean Roblox Luau code inside code blocks \`\`\`lua ... \`\`\`.
- Keep technical script identifiers in standard Roblox Luau, but feel free to summarize or answer in the same language as the user's input.

STRICT MODERATION RULES:
- Refuse to process any sexually suggestive, inappropriate, NSFW, slur, or adult-themed requests immediately.
- If a prompt contains inappropriate context or insults, respond strictly with:
  "ACTION_SUMMARY: Request blocked due to inappropriate content." and provide no code.

YOUR CAPABILITIES:
1. Direct Code & Script Building:
   - Provide valid Roblox Luau code wrapped inside \`\`\`lua ... \`\`\`.
   - Build Scripts, LocalScripts, and ModuleScripts.
   - Set proper parents (e.g., ServerScriptService, StarterPlayer, ReplicatedStorage).
2. Model & Part Generation:
   - Create Instance.new("Part"), Instance.new("Model"), set Size, Color, Position, Anchored, and parent to workspace.
3. Import Toolbox Assets:
   - ACTION_TYPE: IMPORT
   - ASSET_NAME: <name>
4. Export Workspace Items:
   - ACTION_TYPE: EXPORT

AT THE VERY END OF YOUR RESPONSE, ALWAYS INCLUDE:
ACTION_SUMMARY: <Brief summary of what was generated or performed>`;

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
            console.log(`[Gemini] Attempting ${modelName}...`);
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
            console.log(`[OpenRouter] Attempting ${modelName}...`);
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
            console.log(`[Groq] Attempting ${modelName}...`);
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
            console.log(`Provider [${provider}] failed, falling back to next...`);
        }
    }
    throw new Error("All provider fallbacks failed.");
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
            console.log(`[Gemini Chat] Attempting ${modelName}...`);
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

async function generateChatWithFallback(history, promptText, gameContext) {
    const providers = [PRIMARY_PROVIDER];
    if (PRIMARY_PROVIDER !== "gemini") providers.push("gemini");
    if (PRIMARY_PROVIDER !== "openrouter") providers.push("openrouter");
    if (PRIMARY_PROVIDER !== "groq") providers.push("groq");

    for (const provider of providers) {
        try {
            if (provider === "gemini") return await callGeminiChat(history, promptText, gameContext);
        } catch (err) {
            console.log(`Chat Provider [${provider}] failed, trying next...`);
        }
    }
    throw new Error("All chat providers failed.");
}

// REST ENDPOINTS

app.get('/', (req, res) => {
    res.send("AMRORO Roblox AI Backend Active & Running");
});

app.post('/generate', async (req, res) => {
    const { prompt, gameContext, guiStyle, webUrl } = req.body;

    const combinedInput = `${prompt || ''} ${gameContext || ''} ${guiStyle || ''}`;
    if (containsInappropriateContent(combinedInput)) {
        return res.status(400).json({ success: false, error: "Request blocked due to inappropriate content." });
    }

    let userPrompt = `Context: ${gameContext || 'General'}\nUI Style: ${guiStyle || 'Default'}\nTask: ${prompt}`;
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
        const result = await generateChatWithFallback(history, prompt || "", gameContext || "");
        const parsed = parseAIResponse(result.text || "");

        res.json({
            success: true,
            provider: result.usedModel,
            code: parsed.luauCode,
            reply: parsed.actionSummary,
            summary: parsed.actionSummary
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = app;