require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const PRIMARY_PROVIDER = process.env.PRIMARY_PROVIDER || "gemini";

const activeRequests = new Map();

// Updated Gemini models list (removed 1.5, added 3.5 - 3.8 Flash series)
const GEMINI_MODELS = [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.5-flash-lite'
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

const ROBLOX_SYSTEM_INSTRUCTION = `You are the AMRORO Genius Studio Engine v2.0 - an expert Roblox Luau script, Sound, Model, and VFX builder with deep knowledge of game development.

=== ROBLOX EXPERTISE ===
- Expert in Roblox Luau scripting (NOT Lua 5.1, but Luau with types, generics, table operations)
- Understand: Humanoids, Connections, TweenService, RunService, RemoteEvents, RemoteFunctions, DataStores, Signals, Attributes
- Know proper folder structure: ServerScriptService, LocalScript in StarterPlayer > StarterCharacterScripts, StarterGui scripts
- Understand game loops: RunService.Heartbeat, RunService.RenderStepped, RunService.Stepped, game.Loaded
- Know best practices: Debouncing, connection cleanup, proper error handling with pcall()
- Sound expertise: SoundService, Sound objects, audio groups, volume management, spatial audio
- Model generation: Can create parts, meshes, constraints, welds, assemblies via Instance.new()
- VFX: ParticleEmitter, Decals, SurfaceAppearance, Textures, AnimationTracks, Tweens

=== CODE GENERATION RULES ===
1. Generate detailed, production-ready Luau code (500-1000+ lines when requested)
2. Include comprehensive comments explaining each section
3. Use proper variable naming: camelCase for variables, PascalCase for classes
4. Always include error handling with pcall() for risky operations
5. Add type annotations where applicable (Roblox Luau supports them)
6. Create modular, reusable functions
7. Include configuration tables at the top for easy customization
8. Use local variables to minimize overhead
9. Implement proper connection cleanup with :Disconnect()
10. Add debug print statements (can be toggled off)

=== MODEL GENERATION ===
When creating models:
- Use Instance.new() to create BaseParts (Part, MeshPart, etc.)
- Apply proper materials, colors, and transparency
- Use constraints for joints (WeldConstraint, HingeConstraint, etc.)
- Set proper physics properties (CanCollide, CustomPhysicalProperties)
- Group parts in Folders or Models
- Add humanoids for NPCs with proper description tables

=== SOUND IMPLEMENTATION ===
- Suggest Roblox Toolbox sound asset IDs when appropriate
- Create SoundService groups for volume management
- Implement spatial audio with AttachmentPoints
- Handle looping, pitch variation, volume fading
- Code sound effects with proper cleanup

=== AUTO-NAMING CONVENTION ===
Scripts should be named following these patterns:
- Server scripts: "Server_FeatureName" (e.g., "Server_DamageSystem")
- Local scripts: "Local_FeatureName" (e.g., "Local_CameraController")
- Module scripts: "Module_FeatureName" (e.g., "Module_DebugTools")
- Utility modules: "Util_FeatureName"

=== PLAY TEST INTEGRATION ===
- Code should be testable in Studio
- Include initialization functions that don't require players
- Use game.Players:WaitForChild() safely
- Handle edge cases (player leaving mid-action, late joins)
- Add debug modes for easy testing

=== ERROR FIXING ===
When fixing broken code:
1. Identify the error type (syntax, runtime, logical)
2. Explain what was wrong
3. Provide corrected code
4. Add preventative measures
5. Test logic mentally against Roblox constraints

=== MULTILINGUAL SUPPORT ===
Support English, Arabic (العربية), Spanish, French, Portuguese, and other languages.
Always return clean Roblox Luau code inside code blocks \`\`\`lua ... \`\`\`.

=== STRICT MODERATION ===
Refuse any NSFW, slur, or adult-themed requests immediately.
If inappropriate, respond strictly with: "ACTION_SUMMARY: Request blocked due to inappropriate content."

=== RESPONSE FORMAT ===
For code generation, ALWAYS respond with:
\`\`\`lua
-- [Generated Code Here]
\`\`\`
ACTION_SUMMARY: [Brief explanation of what was generated]
ACTION_TYPE: [CODE|MODEL|SOUND|SCRIPT_NAME|FIX]
SCRIPT_NAME_SUGGESTION: [Suggested name if applicable]`;

function parseAIResponse(text) {
    let actionType = "CODE";
    let assetName = "";
    let luauCode = "";
    let scriptNameSuggestion = "";
    let actionSummary = "Action completed successfully!";

    if (text.includes("ACTION_TYPE: IMPORT")) {
        actionType = "IMPORT";
        const assetMatch = text.match(/ASSET_NAME:\s*(.*)/i);
        if (assetMatch) assetName = assetMatch[1].trim();
    } else if (text.includes("ACTION_TYPE: EXPORT")) {
        actionType = "EXPORT";
    } else if (text.includes("ACTION_TYPE: SCRIPT_NAME")) {
        actionType = "SCRIPT_NAME";
    } else if (text.includes("ACTION_TYPE: MODEL")) {
        actionType = "MODEL";
    } else if (text.includes("ACTION_TYPE: SOUND")) {
        actionType = "SOUND";
    } else if (text.includes("ACTION_TYPE: FIX")) {
        actionType = "FIX";
    } else {
        const codeMatch = text.match(/```(?:lua|luau)?([\s\S]*?)```/i);
        if (codeMatch && codeMatch[1]) {
            luauCode = codeMatch[1].trim();
        } else {
            luauCode = text.replace(/ACTION_SUMMARY:[\s\S]*/i, '').trim();
        }
    }

    const summaryMatch = text.match(/ACTION_SUMMARY:\s*([\s\S]*?)(?:ACTION_TYPE|SCRIPT_NAME|$)/i);
    if (summaryMatch && summaryMatch[1]) {
        actionSummary = summaryMatch[1].trim();
    }

    const scriptNameMatch = text.match(/SCRIPT_NAME_SUGGESTION:\s*(.*?)(?:\n|$)/i);
    if (scriptNameMatch && scriptNameMatch[1]) {
        scriptNameSuggestion = scriptNameMatch[1].trim();
    }

    return { actionType, assetName, luauCode, scriptNameSuggestion, actionSummary };
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
                config: { systemInstruction: ROBLOX_SYSTEM_INSTRUCTION, maxOutputTokens: 8192 }
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
                    max_tokens: 8192,
                    messages: [
                        { role: "system", content: ROBLOX_SYSTEM_INSTRUCTION },
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
                    max_tokens: 8192,
                    messages: [
                        { role: "system", content: ROBLOX_SYSTEM_INSTRUCTION },
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
                    max_tokens: 8192,
                    messages: [
                        { role: "system", content: ROBLOX_SYSTEM_INSTRUCTION },
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
    res.send("AMRORO Roblox AI Backend v2.0 - Active & Running with Enhanced Roblox Knowledge");
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

app.post('/generate', async (req, res) => {
    const startTime = Date.now();
    const { prompt, gameContext, guiStyle, detailedCode, requestId } = req.body;

    const controller = new Ab*
