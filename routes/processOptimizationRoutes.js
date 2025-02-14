const express = require("express");
const router = express.Router();
const getModel = require("../utils/googleAI");
const NodeCache = require("node-cache");

// Cache optimization results for 1 hour
const optimizationCache = new NodeCache({ stdTTL: 3600 });

// Helper function to extract JSON from AI response
const extractJSONFromResponse = (content) => {
  try {
    // First try direct parsing
    return JSON.parse(content);
  } catch (e) {
    // If direct parsing fails, try to extract JSON from markdown
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      return JSON.parse(jsonMatch[1]);
    }
    
    // If still no match, try to find any JSON object
    const objectMatch = content.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return JSON.parse(objectMatch[0]);
    }
    
    throw new Error("No valid JSON found in response");
  }
};

// Validation middleware
const validateProcessSteps = (req, res, next) => {
  const { processSteps } = req.body;

  if (!processSteps || Object.keys(processSteps).length === 0) {
    return res.status(400).json({ 
      error: "Invalid process steps provided",
      details: "Process steps object is empty or undefined"
    });
  }

  // Parameter validation rules
  const parameterLimits = {
    'Temperature (°C)': { min: 0, max: 150 },
    'Pressure (bar)': { min: 0, max: 10 },
    'Time (h)': { min: 0, max: 24 },
    'Speed (rpm)': { min: 0, max: 5000 },
    'Flow Rate (mL/min)': { min: 0, max: 100 }
  };

  for (const [step, parameters] of Object.entries(processSteps)) {
    if (!parameters || typeof parameters !== 'object') {
      return res.status(400).json({
        error: `Invalid parameters for step: ${step}`,
        details: "Parameters must be an object with numeric values"
      });
    }

    for (const [param, value] of Object.entries(parameters)) {
      const limits = parameterLimits[param];

      if (typeof value !== 'number' || isNaN(value)) {
        return res.status(400).json({
          error: `Invalid value for parameter: ${param} in step: ${step}`,
          details: "Parameter values must be numbers"
        });
      }

      if (limits && (value < limits.min || value > limits.max)) {
        return res.status(400).json({
          error: `Parameter value out of range: ${param} in step: ${step}`,
          details: `Value must be between ${limits.min} and ${limits.max}`
        });
      }
    }
  }

  next();
};

// Generate optimization prompt
const generateOptimizationPrompt = (processSteps) => {
  return `Analyze the following pharmaceutical manufacturing process steps and suggest optimizations. 
Provide your response in valid JSON format only, without any markdown formatting or explanatory text.

Current Process Parameters:
${JSON.stringify(processSteps, null, 2)}

Response Format:
{
  "optimizations": {
    "<step_name>": {
      "<parameter>": {
        "value": <number>,
        "explanation": "<string>",
        "impact": "<string>",
        "safety": "<string>"
      }
    }
  },
  "summary": {
    "expectedBenefits": ["<string>"],
    "potentialRisks": ["<string>"],
    "validationRequirements": ["<string>"]
  }
}`;
};

// Routes
router.get("/history", async (req, res) => {
  try {
    const history = optimizationCache.keys().map(key => ({
      id: key,
      data: optimizationCache.get(key)
    }));
    res.json(history);
  } catch (error) {
    console.error("Error fetching optimization history:", error);
    res.status(500).json({ 
      error: "Failed to fetch optimization history",
      details: error.message 
    });
  }
});

router.post("/optimize", validateProcessSteps, async (req, res) => {
  try {
    const { processSteps } = req.body;
    const cacheKey = JSON.stringify(processSteps);

    // Check cache
    const cachedResult = optimizationCache.get(cacheKey);
    if (cachedResult) {
      return res.json({
        ...cachedResult,
        fromCache: true
      });
    }

    // Get AI response
    const model = getModel();
    const prompt = generateOptimizationPrompt(processSteps);
    const result = await model.generateContent(prompt);
    const content = result.response.text();

    console.log("Raw AI response:", content); // For debugging

    // Parse response
    let optimizationResponse;
    try {
      optimizationResponse = extractJSONFromResponse(content);
      
      // Validate response structure
      if (!optimizationResponse.optimizations || !optimizationResponse.summary) {
        throw new Error("Invalid response structure from AI model");
      }
    } catch (error) {
      console.error("Error parsing AI response:", error);
      return res.status(500).json({
        error: "Failed to parse optimization response",
        details: error.message,
        rawResponse: content // Include raw response for debugging
      });
    }

    // Add metadata
    const response = {
      ...optimizationResponse,
      metadata: {
        timestamp: new Date().toISOString(),
        processStepsHash: cacheKey,
        version: "1.0"
      }
    };

    // Cache result
    optimizationCache.set(cacheKey, response);

    res.json(response);
  } catch (error) {
    console.error("Process optimization error:", error);
    res.status(500).json({
      error: "Failed to optimize process",
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.get("/result/:id", async (req, res) => {
  try {
    const result = optimizationCache.get(req.params.id);
    if (!result) {
      return res.status(404).json({ 
        error: "Optimization result not found",
        details: "The requested optimization result may have expired or does not exist"
      });
    }
    res.json(result);
  } catch (error) {
    console.error("Error fetching optimization result:", error);
    res.status(500).json({ 
      error: "Failed to fetch optimization result",
      details: error.message
    });
  }
});

router.delete("/result/:id", async (req, res) => {
  try {
    const deleted = optimizationCache.del(req.params.id);
    if (!deleted) {
      return res.status(404).json({ 
        error: "Optimization result not found"
      });
    }
    res.json({ message: "Optimization result deleted successfully" });
  } catch (error) {
    console.error("Error deleting optimization result:", error);
    res.status(500).json({ 
      error: "Failed to delete optimization result",
      details: error.message
    });
  }
});

module.exports = router;