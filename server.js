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
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const PRIMARY_PROVIDER = process.env.PRIMARY_PROVIDER || "gemini";

const activeRequests = new Map();

// Gemini Models Priority List
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

const NVIDIA_MODELS = [
    'meta/llama-3.3-70b-instruct',
    'nvidia/llama-3.1-nemotron-70b-instruct'
];

const BLOCKED_PATTERNS = [
    /nigg(a|er|ers)/i, /sex/i, /naked/i, /strip/i, /nsfw/i, /nude/i, 
    /blood/i, /gore/i, /porn/i, /bitch/i, /fuck/i, /عاري/i, /جنس/i, 
    /إباحي/i, /شرموط/i, /منيوك/i, /قحبة/i, /كس/i, /طيز/i, /زب/i, 
    /desnud[oa]/i, /puta/i, /sexo/i, /porno/i, /salope/i, /putain/i
];

function containsInappropriateContent(text) {
    if (!text) return false;
    return BLOCKED_PATTERNS.some((pattern) => pattern.test(text));
}

// Safely initialize Gemini Client
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

const SYSTEM_INSTRUCTION = `You are the AMRORO Genius Studio Engine, an expert Roblox Luau script, Sound, Model, and VFX builder.

MULTILINGUAL SUPPORT:
- Understand and fully support English, Arabic (العربية), Spanish, French, Portuguese, and global languages.
- ALWAYS return clean Roblox Luau code inside code blocks \`\`\`lua ... \`\`\`.

STRICT MODERATION RULES:
- Refuse any NSFW, slur, or adult-themed requests immediately.
- If inappropriate, respond strictly with: "ACTION_SUMMARY: Request blocked due to inappropriate content."

YOUR CAPABILITIES:
1. Direct Code & Script Building wrapped in \`\`\`lua ... \`\`\`.
2. Model & Part Generation via Instance.new().
3. Read web content/documentation provided in prompts and create appropriate Luau code based on it.

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

async function callGemini(promptText, signal) {
    if (!ai) throw new Error("Gemini API key is missing.");
    for (const modelName of GEMINI_MODELS) {
        if (signal?.aborted) throw new Error("Request cancelled by user.");
        try {
            console.log(`[Gemini] Attempting ${modelName}...`);
            const response = await ai.models.generateContent({
                model: modelName,
                contents: promptText,
                config: { systemInstruction: SYSTEM_INSTRUCTION }
            });
            if (response && response.text) return { text: response.text, usedModel: modelName };
        } catch (err) {
            if (signal?.aborted) throw new Error("Request cancelled by user.");
            console.error(`[Gemini Error] ${modelName}:`, err.message);
            await delay(200);
        }
    }
    throw new Error("All Gemini models failed.");
}

async function callOpenRouter(promptText, signal) {
    if (!OPENROUTER_API_KEY) throw new Error("OpenRouter API key is missing.");
    for (const modelName of OPENROUTER_MODELS) {
        if (signal?.aborted) throw new Error("Request cancelled by user.");
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
                }),
                signal
            });
            const data = await response.json();
            if (data.choices?.[0]?.message) return { text: data.choices[0].message.content, usedModel: modelName };
        } catch (err) {
            if (signal?.aborted) throw new Error("Request cancelled by user.");
            console.error(`[OpenRouter Error] ${modelName}:`, err.message);
            await delay(200);
        }
    }
    throw new Error("All OpenRouter models failed.");
}

async function callGroq(promptText, signal) {
    if (!GROQ_API_KEY) throw new Error("Groq API key is missing.");
    for (const modelName of GROQ_MODELS) {
        if (signal?.aborted) throw new Error("Request cancelled by user.");
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
                }),
                signal
            });
            const data = await response.json();
            if (data.choices?.[0]?.message) return { text: data.choices[0].message.content, usedModel: modelName };
        } catch (err) {
            if (signal?.aborted) throw new Error("Request cancelled by user.");
            console.error(`[Groq Error] ${modelName}:`, err.message);
            await delay(200);
        }
    }
    throw new Error("All Groq models failed.");
}

async function callNvidia(promptText, signal) {
    if (!NVIDIA_API_KEY) throw new Error("NVIDIA API key is missing.");
    for (const modelName of NVIDIA_MODELS) {
        if (signal?.aborted) throw new Error("Request cancelled by user.");
        try {
            console.log(`[NVIDIA] Attempting ${modelName}...`);
            const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${NVIDIA_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: modelName,
                    max_tokens: 4096,
                    messages: [
                        { role: "system", content: SYSTEM_INSTRUCTION },
                        { role: "user", content: promptText }
                    ]
                }),
                signal
            });
            const data = await response.json();
            if (data.choices?.[0]?.message) return { text: data.choices[0].message.content, usedModel: modelName };
        } catch (err) {
            if (signal?.aborted) throw new Error("Request cancelled by user.");
            console.error(`[NVIDIA Error] ${modelName}:`, err.message);
            await delay(200);
        }
    }
    throw new Error("All NVIDIA models failed.");
}

async function generateWithFallback(promptText, signal) {
    const defaultOrder = ["gemini", "openrouter", "groq", "nvidia"];
    const providers = [PRIMARY_PROVIDER, ...defaultOrder.filter(p => p !== PRIMARY_PROVIDER)];

    for (const provider of providers) {
        if (signal?.aborted) throw new Error("Request cancelled by user.");
        try {
            if (provider === "gemini") return await callGemini(promptText, signal);
            if (provider === "openrouter") return await callOpenRouter(promptText, signal);
            if (provider === "groq") return await callGroq(promptText, signal);
            if (provider === "nvidia") return await callNvidia(promptText, signal);
        } catch (err) {
            if (signal?.aborted) throw new Error("Request cancelled by user.");
            console.log(`Provider [${provider}] failed, falling back...`);
        }
    }
    throw new Error("All provider fallbacks failed.");
}

app.get('/', (req, res) => {
    res.send("AMRORO Roblox AI Backend Active & Running");
});

app.post('/stop', (req, res) => {
    const { requestId } = req.body;
    if (requestId && activeRequests.has(requestId)) {
        const controller = activeRequests.get(requestId);
        controller.abort();
        activeRequests.delete(requestId);
        return res.json({ success: true, message: `Request ${requestId} stopped successfully.` });
    }
    return res.status(404).json({ success: false, error: "Active request ID not found." });
});

app.post('/ask-questions', async (req, res) => {
    const startTime = Date.now();
    const { prompt, gameContext, genre, guiStyle, requestId } = req.body;

    const controller = new AbortController();
    const reqKey = requestId || `q_${Date.now()}`;
    activeRequests.set(reqKey, controller);

    const combinedInput = `${prompt || ''} ${gameContext || ''} ${genre || ''}`;
    if (containsInappropriateContent(combinedInput)) {
        activeRequests.delete(reqKey);
        const fallbackItems = [
            "Add Rebirth System",
            "Auto Tap & Pets",
            "Leaderboard Stats",
            "Custom Sound Effects"
        ];
        return res.status(400).json({
            success: false,
            error: "Request blocked due to inappropriate content.",
            questions: fallbackItems,
            ideas: fallbackItems
        });
    }

    const questionPrompt = `You are an expert Roblox game developer assistant.
Analyze the user request and generate exactly 4 short, action-oriented idea suggestions or setup questions (2-5 words each) to populate the Quick Selection Idea buttons.

User Prompt: "${prompt || 'Simulator game'}"
Selected Genre: ${genre || 'Simulator'}
GUI Style: ${guiStyle || 'Cartoon / Stylized'}

[Existing Game Scripts Context]:
${gameContext ? gameContext.slice(0, 3000) : 'None provided'}

OUTPUT REQUIREMENTS:
Respond ONLY with a valid JSON array containing exactly 4 string items.
Do NOT include markdown formatting or extra text outside the JSON array.`;

    try {
        const result = await generateWithFallback(questionPrompt, controller.signal);
        let textResponse = (result.text || "").trim();
        textResponse = textResponse.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();

        let suggestionsArray;
        try {
            suggestionsArray = JSON.parse(textResponse);
            if (!Array.isArray(suggestionsArray) || suggestionsArray.length === 0) {
                throw new Error("Invalid array output");
            }
        } catch {
            suggestionsArray = [
                "Add Rebirth System",
                "Create Pet Hatching",
                "Double Click Boost",
                "Add Shop GUI"
            ];
        }

        const elapsedTimeMs = Date.now() - startTime;
        activeRequests.delete(reqKey);

        res.json({
            success: true,
            provider: result.usedModel,
            questions: suggestionsArray,
            ideas: suggestionsArray,
            elapsedTimeMs,
            elapsedTimeSec: (elapsedTimeMs / 1000).toFixed(2)
        });
    } catch (err) {
        activeRequests.delete(reqKey);
        res.status(500).json({
            success: false,
            questions: ["Add Rebirth System", "Create Pet Hatching", "Double Click Boost", "Add Shop GUI"],
            ideas: ["Add Rebirth System", "Create Pet Hatching", "Double Click Boost", "Add Shop GUI"],
            error: err.message
        });
    }
});

app.post('/fetch-url', async (req, res) => {
    const startTime = Date.now();
    const { url, instruction, requestId } = req.body;

    if (!url || !url.startsWith("http")) {
        return res.status(400).json({ success: false, error: "Invalid HTTP/HTTPS URL provided." });
    }

    const controller = new AbortController();
    const reqKey = requestId || `url_${Date.now()}`;
    activeRequests.set(reqKey, controller);

    try {
        const pageRes = await fetch(url, { signal: controller.signal });
        const htmlText = await pageRes.text();

        const cleanText = htmlText
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .slice(0, 12000);

        const prompt = `Web Page URL Context (${url}):\n${cleanText}\n\nUser Instruction: ${instruction || 'Build Luau code based on the URL context above.'}`;

        const result = await generateWithFallback(prompt, controller.signal);
        const parsed = parseAIResponse(result.text || "");
        const elapsedTimeMs = Date.now() - startTime;

        activeRequests.delete(reqKey);
        res.json({
            success: true,
            provider: result.usedModel,
            code: parsed.luauCode,
            summary: parsed.actionSummary,
            elapsedTimeMs,
            elapsedTimeSec: (elapsedTimeMs / 1000).toFixed(2)
        });
    } catch (err) {
        activeRequests.delete(reqKey);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/generate', async (req, res) => {
    const startTime = Date.now();
    const { prompt, gameContext, guiStyle, requestId } = req.body;

    const controller = new AbortController();
    const reqKey = requestId || `gen_${Date.now()}`;
    activeRequests.set(reqKey, controller);

    const combinedInput = `${prompt || ''} ${gameContext || ''} ${guiStyle || ''}`;
    if (containsInappropriateContent(combinedInput)) {
        activeRequests.delete(reqKey);
        return res.status(400).json({ success: false, error: "Request blocked due to inappropriate content." });
    }

    const userPrompt = `Genre Context: ${gameContext || 'None'}\nUI Style: ${guiStyle || 'Default'}\nTask: ${prompt}`;

    try {
        const result = await generateWithFallback(userPrompt, controller.signal);
        const parsed = parseAIResponse(result.text || "");
        const elapsedTimeMs = Date.now() - startTime;

        activeRequests.delete(reqKey);
        res.json({
            success: true,
            provider: result.usedModel,
            actionType: parsed.actionType,
            assetName: parsed.assetName,
            code: parsed.luauCode,
            summary: parsed.actionSummary,
            elapsedTimeMs,
            elapsedTimeSec: (elapsedTimeMs / 1000).toFixed(2)
        });
    } catch (err) {
        activeRequests.delete(reqKey);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/auto-fix', async (req, res) => {
    const startTime = Date.now();
    const { fullOutputLog, requestId } = req.body;

    const controller = new AbortController();
    const reqKey = requestId || `fix_${Date.now()}`;
    activeRequests.set(reqKey, controller);

    if (containsInappropriateContent(fullOutputLog)) {
        activeRequests.delete(reqKey);
        return res.status(400).json({ success: false, error: "Request blocked." });
    }

    const fixPrompt = `Fix this Roblox Luau code output or log errors:\n${fullOutputLog}`;

    try {
        const result = await generateWithFallback(fixPrompt, controller.signal);
        const parsed = parseAIResponse(result.text || "");
        const elapsedTimeMs = Date.now() - startTime;

        activeRequests.delete(reqKey);
        res.json({
            success: true,
            code: parsed.luauCode,
            summary: parsed.actionSummary,
            elapsedTimeMs,
            elapsedTimeSec: (elapsedTimeMs / 1000).toFixed(2)
        });
    } catch (err) {
        activeRequests.delete(reqKey);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/chat', async (req, res) => {
    const startTime = Date.now();
    const { prompt, requestId } = req.body;

    const controller = new AbortController();
    const reqKey = requestId || `chat_${Date.now()}`;
    activeRequests.set(reqKey, controller);

    try {
        const result = await generateWithFallback(prompt || "", controller.signal);
        const parsed = parseAIResponse(result.text || "");
        const elapsedTimeMs = Date.now() - startTime;

        activeRequests.delete(reqKey);
        res.json({
            success: true,
            provider: result.usedModel,
            code: parsed.luauCode,
            reply: parsed.actionSummary,
            summary: parsed.actionSummary,
            elapsedTimeMs,
            elapsedTimeSec: (elapsedTimeMs / 1000).toFixed(2)
        });
    } catch (err) {
        activeRequests.delete(reqKey);
        res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

module.exports = app;