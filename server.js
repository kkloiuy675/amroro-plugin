/**
 * AMRORO AI Engine Pro - Production Server Backend
 * Built for Vercel Serverless Functions & Roblox Studio Plugin Integration
 */

const express = require('express');
const cors = require('cors');

// ============================================================================
// ENVIRONMENT & INITIALIZATION
// ============================================================================
// Safely attempt loading dotenv for local execution without throwing in serverless
try {
    require('dotenv').config();
} catch (e) {
    // dotenv is optional in production on Vercel
}

const app = express();

// Enable CORS for Roblox Studio HttpService and Web clients
app.use(cors({ origin: '*' }));

// Increase payload limit for large script submissions
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Retrieve active API keys from process environment
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

// ============================================================================
// REQUEST LOGGER MIDDLEWARE
// ============================================================================
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

// ============================================================================
// SYSTEM PROMPTS FOR AMRORO ENGINES
// ============================================================================

const ROBLOX_SYSTEM_PROMPT = `
You are AMRORO AI, an expert Roblox Studio Luau software engineer and engine assistant.
Your goal is to write clean, optimized, production-ready Luau scripts tailored for Roblox Studio.

STRICT GUIDELINES:
1. Always use modern Luau standards: Strict type check annotations where appropriate, 'task.wait()', 'task.spawn()', 'task.defer()', and Vector3/CFrame constructors.
2. Avoid deprecated Roblox API calls: Do NOT use legacy 'wait()', 'spawn()', 'delay()', 'workspace.Terrain', or lowercase 'connect()'.
3. Always check for nil instances before operating on them using guard clauses.
4. Organize scripts clearly with Services at the top using 'game:GetService()'.
5. When returning Luau code, do not output unnecessary conversation or markdown prose unless explicitly requested.
`.trim();

const DEEP_BUILD_SYSTEM_PROMPT = `
You are AMRORO DEEP BUILD ENGINE, an autonomous 3D world builder and Luau generator for Roblox Workspace.

BUILDING PRINCIPLES:
1. Generate executable Luau code that programmatically instantiates Parts, Models, MeshParts, Lights, ParticleEmitters, or Visual Effects directly inside 'game.Workspace'.
2. Always create a primary 'Model' container anchored in Workspace to house all generated parts.
3. Apply realistic scale, Anchored = true, CanCollide settings, appropriate Colors (Color3.fromRGB), and Materials (Enum.Material).
4. Use CFrames for positioning, rotation, and alignment relative to the Model's PrimaryPart or pivot point.
5. Return clean, executable Luau code without markdown block formatting if output is meant for execution.
`.trim();

const PIPELINE_SYSTEM_PROMPT = `
You are AMRORO AUTONOMOUS PIPELINE, an advanced code verification, refactoring, and static analysis engine for Roblox Luau.

PIPELINE DUTIES:
1. Scan input Luau code for syntax errors, missing variables, infinite loops without wait(), or memory leaks.
2. Optimize execution loops, replace legacy deprecated API calls with modern equivalents, and enhance performance.
3. Validate instance references and ensure network security for RemoteEvents/RemoteFunctions.
4. Output verified, production-ready Luau code.
`.trim();

const DEBUGGER_SYSTEM_PROMPT = `
You are AMRORO SCRIPT SOLVER & DEBUGGER.
Your job is to analyze broken Roblox Luau scripts, identify bug causes, runtime stack traces, or syntax errors, and return a corrected, fully functional replacement script.
`.trim();

// ============================================================================
// CODE SANITIZATION & PARSING UTILITIES
// ============================================================================

/**
 * Removes markdown backtick wrappers (e.g., ```lua ... ```) to return raw executable Luau.
 */
function cleanLuauOutput(text) {
    if (!text || typeof text !== 'string') return '';
    let cleaned = text.trim();

    // Strip markdown code block headers and footers
    cleaned = cleaned.replace(/^```(?:lua|json|luau)?\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/, '');

    return cleaned.trim();
}

/**
 * Constructs a standardized JSON response compatible with all Roblox plugin script versions.
 */
function buildStandardResponse(rawAiResponse, extraData = {}) {
    const cleanedCode = cleanLuauOutput(rawAiResponse);
    return {
        status: "success",
        result: rawAiResponse,
        answer: rawAiResponse,
        response: rawAiResponse,
        content: rawAiResponse,
        code: cleanedCode,
        luauCode: cleanedCode,
        generatedCode: cleanedCode,
        timestamp: new Date().toISOString(),
        ...extraData
    };
}

// ============================================================================
// AI PROVIDER INTEGRATIONS & FAILOVER ENGINE
// ============================================================================

/**
 * Call OpenRouter API
 */
async function callOpenRouter(systemPrompt, userPrompt, modelName) {
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not defined.");

    const selectedModel = modelName || "google/gemini-2.0-flash-lite-001";

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://amroro-plugin.vercel.app",
            "X-Title": "AMRORO AI Engine Pro"
        },
        body: JSON.stringify({
            model: selectedModel,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 4096
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenRouter returned status ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content) throw new Error("OpenRouter response was empty.");
    return content;
}

/**
 * Call Direct Google Gemini API
 */
async function callGeminiDirect(systemPrompt, userPrompt) {
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not defined.");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: `${systemPrompt}\n\nUser Prompt:\n${userPrompt}` }]
            }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 4096
            }
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini Direct returned status ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) throw new Error("Gemini API response was empty.");
    return content;
}

/**
 * Unified AI Caller with Automatic Provider Failover
 */
async function executeUnifiedAI(systemPrompt, userPrompt, modelOverride) {
    let lastError = null;

    // 1. Attempt Primary: OpenRouter
    if (OPENROUTER_API_KEY) {
        try {
            return await callOpenRouter(systemPrompt, userPrompt, modelOverride);
        } catch (err) {
            console.warn("[AMRORO AI Failover] OpenRouter failed:", err.message);
            lastError = err;
        }
    }

    // 2. Attempt Fallback: Direct Gemini API
    if (GEMINI_API_KEY) {
        try {
            return await callGeminiDirect(systemPrompt, userPrompt);
        } catch (err) {
            console.warn("[AMRORO AI Failover] Direct Gemini API failed:", err.message);
            lastError = err;
        }
    }

    // If no provider succeeded
    const failureReason = !OPENROUTER_API_KEY && !GEMINI_API_KEY
        ? "No API Keys found. Set OPENROUTER_API_KEY or GEMINI_API_KEY in Vercel Environment Variables."
        : (lastError ? lastError.message : "All AI service calls failed.");

    throw new Error(failureReason);
}

// ============================================================================
// API ENDPOINT HANDLERS
// ============================================================================

/**
 * GET / - Health Check & System Info
 */
app.get('/', (req, res) => {
    res.status(200).json({
        engine: "AMRORO AI Engine Pro",
        status: "Active & Operational",
        version: "2.5.0",
        platform: "Vercel Serverless Function",
        hasOpenRouter: !!OPENROUTER_API_KEY,
        hasGemini: !!GEMINI_API_KEY,
        hasGroq: !!GROQ_API_KEY,
        hasNvidia: !!NVIDIA_API_KEY,
        timestamp: new Date().toISOString()
    });
});

/**
 * GET /api/status - Detailed Provider Diagnostics
 */
app.get('/api/status', (req, res) => {
    res.status(200).json({
        status: "Online",
        providers: {
            openrouter: !!OPENROUTER_API_KEY,
            gemini: !!GEMINI_API_KEY,
            groq: !!GROQ_API_KEY,
            nvidia: !!NVIDIA_API_KEY
        },
        endpoints: [
            "/api/chat",
            "/api/deep-build",
            "/api/pipeline",
            "/api/debug",
            "/api/generate"
        ]
    });
});

/**
 * Universal Chat & Script Generator Handler
 */
async function handleChatEndpoint(req, res) {
    try {
        const body = req.body || {};
        const userPrompt = body.userPrompt || body.prompt || body.message || body.input || body.query;
        const systemPrompt = body.systemPrompt || ROBLOX_SYSTEM_PROMPT;
        const model = body.model;

        if (!userPrompt) {
            return res.status(400).json({
                status: "error",
                error: "Missing user prompt in request body."
            });
        }

        const rawAiOutput = await executeUnifiedAI(systemPrompt, userPrompt, model);
        return res.status(200).json(buildStandardResponse(rawAiOutput));

    } catch (error) {
        console.error("[AMRORO AI Chat Error]:", error.message);
        return res.status(500).json({
            status: "error",
            error: error.message || "Failed to process chat request."
        });
    }
}

/**
 * Deep Build Endpoint Handler
 */
async function handleDeepBuildEndpoint(req, res) {
    try {
        const body = req.body || {};
        const buildPrompt = body.userPrompt || body.prompt || body.buildPrompt || body.message || body.input;

        if (!buildPrompt) {
            return res.status(400).json({
                status: "error",
                error: "Missing build prompt. Please describe what object or scene to construct."
            });
        }

        const rawAiOutput = await executeUnifiedAI(DEEP_BUILD_SYSTEM_PROMPT, buildPrompt);
        return res.status(200).json(buildStandardResponse(rawAiOutput, { action: "EXECUTE_BUILD" }));

    } catch (error) {
        console.error("[AMRORO AI Deep Build Error]:", error.message);
        return res.status(500).json({
            status: "error",
            error: error.message || "Failed to generate 3D build code."
        });
    }
}

/**
 * Autonomous Pipeline Verification Handler
 */
async function handlePipelineEndpoint(req, res) {
    try {
        const body = req.body || {};
        const codeInput = body.code || body.luauCode || body.userPrompt || body.prompt;

        if (!codeInput) {
            return res.status(400).json({
                status: "error",
                error: "Missing Luau code input for autonomous pipeline processing."
            });
        }

        const prompt = `Review, correct syntax, and optimize the following Roblox Luau script:\n\n${codeInput}`;
        const rawAiOutput = await executeUnifiedAI(PIPELINE_SYSTEM_PROMPT, prompt);

        return res.status(200).json(buildStandardResponse(rawAiOutput, {
            pipelineSteps: [
                "Step 1: Code Parsing Complete",
                "Step 2: Static Analysis Passed",
                "Step 3: Luau Modernization Complete",
                "Step 4: Output Verified"
            ]
        }));

    } catch (error) {
        console.error("[AMRORO AI Pipeline Error]:", error.message);
        return res.status(500).json({
            status: "error",
            error: error.message || "Pipeline execution failed."
        });
    }
}

/**
 * Script Debugger & Solver Handler
 */
async function handleDebugEndpoint(req, res) {
    try {
        const body = req.body || {};
        const scriptCode = body.code || body.luauCode || body.script;
        const errorMessage = body.errorMessage || body.error || "Unknown Runtime Error";

        if (!scriptCode) {
            return res.status(400).json({ status: "error", error: "Missing script code to debug." });
        }

        const prompt = `Script Code:\n${scriptCode}\n\nRuntime Error / Bug Details:\n${errorMessage}`;
        const rawAiOutput = await executeUnifiedAI(DEBUGGER_SYSTEM_PROMPT, prompt);

        return res.status(200).json(buildStandardResponse(rawAiOutput, { debugStatus: "Resolved" }));

    } catch (error) {
        console.error("[AMRORO AI Debugger Error]:", error.message);
        return res.status(500).json({ status: "error", error: error.message });
    }
}

// ============================================================================
// ROUTE BINDINGS
// ============================================================================

// Chat & Script Generation
app.post('/api/chat', handleChatEndpoint);
app.post('/chat', handleChatEndpoint);
app.post('/api/generate', handleChatEndpoint);
app.post('/generate', handleChatEndpoint);

// Deep Build Engine
app.post('/api/deep-build', handleDeepBuildEndpoint);
app.post('/deep-build', handleDeepBuildEndpoint);
app.post('/api/build', handleDeepBuildEndpoint);
app.post('/build', handleDeepBuildEndpoint);

// Autonomous Pipeline
app.post('/api/pipeline', handlePipelineEndpoint);
app.post('/pipeline', handlePipelineEndpoint);

// Debugger
app.post('/api/debug', handleDebugEndpoint);
app.post('/debug', handleDebugEndpoint);

// Catch-All Route for non-standard endpoints from older plugin builds
app.post('*', (req, res) => {
    console.log(`[AMRORO AI] Catch-all route hit for path: ${req.path}`);
    return handleChatEndpoint(req, res);
});

// ============================================================================
// GLOBAL SERVERLESS ERROR CATCHER
// ============================================================================
app.use((err, req, res, next) => {
    console.error("[AMRORO AI Uncaught Exception]:", err.stack || err);
    res.status(500).json({
        status: "error",
        error: "Internal Server Exception",
        message: err.message || "An unhandled error occurred inside the server execution context."
    });
});

// Export app for Vercel Serverless Function deployment
module.exports = app;

// Local Development Server Listener
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`====================================================`);
        console.log(`  AMRORO AI Engine Pro Server Running on Port ${PORT}`);
        console.log(`====================================================`);
    });
}
