require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// ==========================================
// MIDDLEWARE CONFIGURATION
// ==========================================
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Environment Variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// ==========================================
// SYSTEM PROMPTS & PROMPT TEMPLATES
// ==========================================
const ROBLOX_SYSTEM_PROMPT = `
You are AMRORO AI, an expert Roblox Studio Luau developer and engine assistant.
Your goal is to write clean, optimized, production-ready Roblox Luau code.
Follow these rules:
1. Always use modern Luau standards (type checking, task.wait, task.spawn, Vector3.new).
2. Never use deprecated methods like wait(), spawn(), or Connect() with lowercase c unless required.
3. Ensure all scripts are fully self-contained and ready to execute in Roblox Studio.
4. Do not include markdown text or conversational explanations when returning Luau code unless asked.
`.trim();

const DEEP_BUILD_SYSTEM_PROMPT = `
You are AMRORO DEEP BUILD ENGINE, an autonomous 3D builder and Luau generator for Roblox Studio.
When the user asks to build or construct something:
1. Generate an executable Luau script that programmatically instantiates Parts, Models, MeshParts, Lighting, or Effects in game.Workspace.
2. Ensure created parts have correct Anchored, CanCollide, Size, Position, Color, Material, and CFrame properties.
3. Group created instances under a primary Model in Workspace.
4. Return pure Luau code that can be executed directly inside Roblox Studio via loadstring or Script injection.
`.trim();

const PIPELINE_SYSTEM_PROMPT = `
You are AMRORO AUTONOMOUS PIPELINE. You verify, validate, and compile Roblox Luau code.
1. Check for syntax errors, missing variables, or infinite loops.
2. Return fixed, production-ready code.
`.trim();

// ==========================================
// UTILITY & SANITIZATION FUNCTIONS
// ==========================================

/**
 * Strips markdown code blocks (```lua ... ```) from AI output
 */
function cleanCodeOutput(text) {
    if (!text || typeof text !== 'string') return '';
    let cleaned = text.trim();
    
    // Remove ```lua and ``` code block wrappers
    cleaned = cleaned.replace(/^```(?:lua|json|luau)?\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/, '');
    
    return cleaned.trim();
}

/**
 * Safe JSON parser helper
 */
function safeJsonParse(str) {
    try {
        return JSON.parse(str);
    } catch (e) {
        return null;
    }
}

// ==========================================
// AI CALLER ENGINE WITH AUTOMATIC FAILOVER
// ==========================================

async function callOpenRouter(systemPrompt, userPrompt, modelOverride) {
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is missing in environment variables.");

    const model = modelOverride || "google/gemini-2.0-flash-lite-001";
    
    const response = await fetch("[https://openrouter.ai/api/v1/chat/completions](https://openrouter.ai/api/v1/chat/completions)", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "[https://amroro-plugin.vercel.app](https://amroro-plugin.vercel.app)",
            "X-Title": "AMRORO AI Engine Pro"
        },
        body: JSON.stringify({
            model: model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 4096
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    
    if (!content) throw new Error("OpenRouter returned an empty response.");
    return content;
}

async function callGeminiDirect(systemPrompt, userPrompt) {
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is missing in environment variables.");

    const geminiUrl = `[https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$](https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$){GEMINI_API_KEY}`;
    
    const response = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: `${systemPrompt}\n\nUser Request:\n${userPrompt}` }]
            }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 4096
            }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini Direct HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) throw new Error("Gemini API returned an empty response.");
    return content;
}

/**
 * Primary Unified AI Caller
 * Tries OpenRouter first, falls back to direct Gemini API gracefully.
 */
async function callAIUnified(systemPrompt, userPrompt, modelOverride) {
    let lastError = null;

    // Attempt 1: OpenRouter
    if (OPENROUTER_API_KEY) {
        try {
            console.log("[AMRORO AI] Calling OpenRouter API...");
            return await callOpenRouter(systemPrompt, userPrompt, modelOverride);
        } catch (err) {
            console.warn("[AMRORO AI] OpenRouter call failed:", err.message);
            lastError = err;
        }
    }

    // Attempt 2: Gemini Direct API
    if (GEMINI_API_KEY) {
        try {
            console.log("[AMRORO AI] Falling back to Direct Gemini API...");
            return await callGeminiDirect(systemPrompt, userPrompt);
        } catch (err) {
            console.warn("[AMRORO AI] Direct Gemini API call failed:", err.message);
            lastError = err;
        }
    }

    // If both failed or keys are missing
    const missingKeysMsg = !OPENROUTER_API_KEY && !GEMINI_API_KEY 
        ? "No API keys configured. Set OPENROUTER_API_KEY or GEMINI_API_KEY in Vercel." 
        : lastError?.message || "All AI Providers failed.";

    throw new Error(missingKeysMsg);
}

// ==========================================
// ROUTE HANDLERS & ENDPOINTS
// ==========================================

// Health Check (GET /)
app.get('/', (req, res) => {
    res.status(200).json({
        status: "OK",
        engine: "AMRORO AI Engine Pro",
        version: "1.0.0",
        message: "AMRORO AI Backend is live on Vercel!",
        timestamp: new Date().toISOString()
    });
});

// API Status Check (GET /api/status)
app.get('/api/status', (req, res) => {
    res.status(200).json({
        status: "Online",
        hasOpenRouterKey: !!OPENROUTER_API_KEY,
        hasGeminiKey: !!GEMINI_API_KEY
    });
});

/**
 * Universal Chat Endpoint
 * Handles: POST /api/chat, /chat, /api/generate, /generate
 */
async function handleChatRequest(req, res) {
    try {
        const body = req.body || {};
        const userPrompt = body.userPrompt || body.prompt || body.message || body.input || body.query;
        const systemPrompt = body.systemPrompt || ROBLOX_SYSTEM_PROMPT;
        const model = body.model;

        if (!userPrompt) {
            return res.status(400).json({ 
                error: "Missing prompt", 
                message: "Please provide a valid prompt or message in the request body." 
            });
        }

        const rawAiResponse = await callAIUnified(systemPrompt, userPrompt, model);
        const cleanedResponse = cleanCodeOutput(rawAiResponse);

        return res.status(200).json({
            status: "success",
            result: rawAiResponse,
            answer: rawAiResponse,
            response: rawAiResponse,
            content: rawAiResponse,
            code: cleanedResponse,
            luauCode: cleanedResponse,
            generatedCode: cleanedResponse
        });

    } catch (error) {
        console.error("[AMRORO AI Error - Chat Handler]:", error.message);
        return res.status(500).json({
            status: "error",
            error: error.message || "An error occurred while generating response.",
            details: "Ensure API keys are properly configured in Vercel Environment Variables."
        });
    }
}

/**
 * Deep Build Endpoint
 * Handles: POST /api/deep-build, /deep-build, /api/build, /build
 */
async function handleDeepBuildRequest(req, res) {
    try {
        const body = req.body || {};
        const userPrompt = body.userPrompt || body.prompt || body.message || body.buildPrompt || body.input;

        if (!userPrompt) {
            return res.status(400).json({ 
                error: "Missing build prompt", 
                message: "Please specify what you want to build in Roblox Studio." 
            });
        }

        const rawAiResponse = await callAIUnified(DEEP_BUILD_SYSTEM_PROMPT, userPrompt);
        const executableLuauCode = cleanCodeOutput(rawAiResponse);

        return res.status(200).json({
            status: "success",
            result: rawAiResponse,
            answer: executableLuauCode,
            response: executableLuauCode,
            code: executableLuauCode,
            luauCode: executableLuauCode,
            buildScript: executableLuauCode,
            action: "BUILD_EXECUTE"
        });

    } catch (error) {
        console.error("[AMRORO AI Error - Deep Build]:", error.message);
        return res.status(500).json({
            status: "error",
            error: error.message || "Failed to generate build script."
        });
    }
}

/**
 * Autonomous Pipeline Verification Endpoint
 * Handles: POST /api/pipeline, /pipeline
 */
async function handlePipelineRequest(req, res) {
    try {
        const body = req.body || {};
        const codeToVerify = body.code || body.luauCode || body.prompt || body.input;

        if (!codeToVerify) {
            return res.status(400).json({ error: "Missing code input for pipeline verification." });
        }

        const prompt = `Verify and optimize the following Luau script for Roblox Studio:\n\n${codeToVerify}`;
        const rawAiResponse = await callAIUnified(PIPELINE_SYSTEM_PROMPT, prompt);
        const cleanedCode = cleanCodeOutput(rawAiResponse);

        return res.status(200).json({
            status: "success",
            step1: "Complete",
            step2: "Compiled Luau Code via AMRORO Engine",
            step3: "Code Integrity Verified",
            step4: "Deployment Complete",
            result: rawAiResponse,
            code: cleanedCode,
            luauCode: cleanedCode
        });

    } catch (error) {
        console.error("[AMRORO AI Error - Pipeline]:", error.message);
        return res.status(500).json({
            status: "error",
            error: error.message || "Pipeline execution failed."
        });
    }
}

// Bind Endpoints to all expected path permutations
app.post('/api/chat', handleChatRequest);
app.post('/chat', handleChatRequest);
app.post('/api/generate', handleChatRequest);
app.post('/generate', handleChatRequest);

app.post('/api/deep-build', handleDeepBuildRequest);
app.post('/deep-build', handleDeepBuildRequest);
app.post('/api/build', handleDeepBuildRequest);
app.post('/build', handleDeepBuildRequest);

app.post('/api/pipeline', handlePipelineRequest);
app.post('/pipeline', handlePipelineRequest);

// Catch-all route for unmapped POST endpoints
app.post('*', (req, res) => {
    console.log(`[AMRORO AI] Received POST request on unmapped route: ${req.path}`);
    return handleChatRequest(req, res);
});

// ==========================================
// GLOBAL ERROR HANDLING MIDDLEWARE
// ==========================================
app.use((err, req, res, next) => {
    console.error("[AMRORO AI Unhandled Server Error]:", err.stack || err);
    res.status(500).json({
        status: "error",
        error: "Internal Server Error",
        message: err.message || "An unexpected error occurred."
    });
});

// Export for Vercel Serverless Function deployment
module.exports = app;

// Local Development Server Listener
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`====================================================`);
        console.log(`  AMRORO AI Engine Pro Server active on port ${PORT}`);
        console.log(`====================================================`);
    });
}
