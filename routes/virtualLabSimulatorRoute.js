const express = require("express");
const router = express.Router();
const getModel = require("../utils/googleAI");

const labSessions = new Map();

// Function to call Google Gemini AI
async function callGoogleAI(prompt) {
  try {
    const model = getModel();
    const result = await model.generateContent(prompt);
    const responseText = await result.response.text();

    // Parse the response as JSON
    const cleanedResponse = responseText.replace(/```json|```/g, "").trim();
    const parsedResponse = JSON.parse(cleanedResponse);

    return parsedResponse;
  } catch (error) {
    console.error("Error calling Google AI:", error);
    throw new Error("Failed to generate AI response");
  }
}

// 🧪 Start a New Experiment
router.post("/start-experiment", async (req, res) => {
  try {
    const { experimentName } = req.body;
    const sessionId = Date.now().toString();

    const prompt = `As an AI assistant for pharmaceutical laboratory experiments, provide a structured introduction for the ${experimentName} experiment using the following format:

{
  "title": "Comprehensive Introduction to ${experimentName}",
  "overview": {
    "description": "Brief overview of the experiment (2-3 sentences)",
    "significance": "Why this experiment is important in pharmaceutical manufacturing"
  },
  "keyObjectives": [
    "Objective 1",
    "Objective 2",
    "Objective 3"
  ],
  "regulatoryCompliance": {
    "gmpGuidelines": ["List relevant GMP guidelines"],
    "qualityStandards": ["List applicable quality standards"]
  },
  "experimentalDetails": {
    "purpose": "Main purpose of the experiment",
    "methodology": "Brief description of the method",
    "criticalParameters": ["List critical parameters to monitor"]
  },
  "industryApplications": [
    {
      "area": "Area of application",
      "impact": "Impact on pharmaceutical manufacturing"
    }
  ],
  "qualityControl": {
    "parameters": ["List quality control parameters"],
    "acceptanceCriteria": ["List acceptance criteria"]
  },
  "safetyConsiderations": [
    "Safety consideration 1",
    "Safety consideration 2"
  ]
}

Provide all responses in this exact JSON format, ensuring each section is detailed yet concise. For any section where specific information isn't applicable, use "N/A" but maintain the structure.`;

    const structuredIntroduction = await callGoogleAI(prompt);

    labSessions.set(sessionId, {
      experimentName,
      currentStep: 0,
      actions: [],
      equipmentSelected: false,
      experimentData: structuredIntroduction, // Store the structured data
    });

    res.json({
      sessionId,
      introduction: structuredIntroduction,
    });
  } catch (error) {
    console.error("Error starting experiment:", error);
    res.status(500).json({ error: "Failed to start experiment." });
  }
});

// 🏭 Select Equipment
// 🏭 Select Equipment
router.post("/select-equipment", async (req, res) => {
  try {
    const { sessionId, selectedEquipment } = req.body;
    const session = labSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }

    session.equipmentSelected = true;
    session.actions.push(`Selected equipment: ${selectedEquipment.join(", ")}`);

    const prompt = `As a pharmaceutical laboratory expert, analyze the equipment selection for the ${
      session.experimentName
    } experiment. 
    The user has selected: ${selectedEquipment.join(", ")}

Please provide a structured analysis in the following JSON format:

{
  "equipmentAnalysis": {
    "selectedEquipment": {
      "suitable": [
        {
          "name": "Equipment name",
          "purpose": "Specific use in the experiment",
          "specifications": "Required specifications or standards",
          "gmpConsiderations": "GMP requirements for this equipment"
        }
      ],
      "unsuitable": [
        {
          "name": "Equipment name",
          "reason": "Why this equipment may not be appropriate",
          "alternative": "Suggested alternative",
          "explanation": "Why the alternative is better"
        }
      ]
    },
    "missingCriticalEquipment": [
      {
        "name": "Required equipment name",
        "importance": "Why this equipment is critical",
        "specifications": "Required specifications",
        "impact": "Impact of its absence on the experiment"
      }
    ],
    "calibrationRequirements": [
      {
        "equipment": "Equipment name",
        "frequency": "Required calibration frequency",
        "standards": "Applicable standards",
        "criticalParameters": "Parameters to verify"
      }
    ],
    "safetyConsiderations": [
      {
        "equipment": "Equipment name",
        "risks": ["List of potential risks"],
        "precautions": ["Required safety precautions"],
        "ppe": ["Required Personal Protective Equipment"]
      }
    ],
    "recommendations": {
      "priority": "high/medium/low",
      "immediateActions": ["List of immediate actions needed"],
      "longTermConsiderations": ["Long-term recommendations"]
    }
  }
}`;

    const analysis = await callGoogleAI(prompt);

    console.log(analysis)

    // Update session with equipment analysis
    session.equipmentAnalysis = analysis;

    // Generate summary and urgent notifications
    const urgentIssues = [];

    // Safely check and add missing equipment
    if (analysis.equipmentAnalysis.missingCriticalEquipment && 
        Array.isArray(analysis.equipmentAnalysis.missingCriticalEquipment)) {
      urgentIssues.push(
        ...analysis.equipmentAnalysis.missingCriticalEquipment.map(
          (e) => `Missing: ${e.name}`
        )
      );
    }

    // Safely check and add unsuitable equipment
    if (analysis.equipmentAnalysis.selectedEquipment?.unsuitable && 
        Array.isArray(analysis.equipmentAnalysis.selectedEquipment.unsuitable)) {
      urgentIssues.push(
        ...analysis.equipmentAnalysis.selectedEquipment.unsuitable.map(
          (e) => `Unsuitable: ${e.name}`
        )
      );
    }

    res.json({
      analysis: analysis,
      urgentIssues: urgentIssues.length > 0 ? urgentIssues : null,
      recommendationPriority: analysis.equipmentAnalysis.recommendations?.priority || 'medium',
      immediate_actions: analysis.equipmentAnalysis.recommendations?.immediateActions || [],
      calibrationNeeded: analysis.equipmentAnalysis.calibrationRequirements || [],
      safetyConsiderations: analysis.equipmentAnalysis.safetyConsiderations || []
    });

  } catch (error) {
    console.error("Error selecting equipment:", error);
    res.status(500).json({
      error: "Failed to process equipment selection.",
      details: error.message,
      timestamp: new Date().toISOString(),
      // Provide a fallback structure for the frontend
      analysis: {
        equipmentAnalysis: {
          selectedEquipment: {
            suitable: [],
            unsuitable: []
          },
          missingCriticalEquipment: [],
          calibrationRequirements: [],
          safetyConsiderations: [],
          recommendations: {
            priority: 'medium',
            immediateActions: [],
            longTermConsiderations: []
          }
        }
      }
    });
  }
});

// 📌 Next Step in Experiment
router.post("/next-step", async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = labSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }

    if (!session.equipmentSelected) {
      return res
        .status(400)
        .json({ error: "Equipment must be selected before proceeding." });
    }

    session.currentStep++;

    const prompt = `For the ${
      session.experimentName
    } experiment, provide detailed instructions for step ${
      session.currentStep
    }, ensuring compliance with GMP and pharmaceutical lab standards. 
    The user has already completed these actions: ${session.actions.join(
      ". "
    )}.`;

    const instructions = await callGoogleAI(prompt);

    session.actions.push(`Completed step ${session.currentStep}`);

    res.json({ step: session.currentStep, instructions });
  } catch (error) {
    console.error("Error generating next step:", error);
    res.status(500).json({ error: "Failed to generate next step." });
  }
});

// 🛠️ Perform an Action
router.post("/perform-action", async (req, res) => {
  try {
    const { sessionId, action } = req.body;
    const session = labSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }

    session.actions.push(action);

    const prompt = `For the ${session.experimentName} experiment at step ${session.currentStep}, the user performed the following action: ${action}. 
    Evaluate the correctness of this action and highlight any potential risks or consequences in terms of GMP compliance and product quality in pharmaceutical manufacturing.`;

    const feedback = await callGoogleAI(prompt);

    res.json({ feedback });
  } catch (error) {
    console.error("Error processing action:", error);
    res.status(500).json({ error: "Failed to process action." });
  }
});

// ❓ Ask a Question
router.post("/ask-question", async (req, res) => {
  try {
    const { sessionId, question } = req.body;
    const session = labSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }

    const prompt = `For the ${session.experimentName} experiment at step ${session.currentStep}, answer the following question: ${question}. 
    Ensure your answer is relevant to pharmaceutical manufacturing and laboratory compliance.`;

    const answer = await callGoogleAI(prompt);

    res.json({ answer });
  } catch (error) {
    console.error("Error answering question:", error);
    res.status(500).json({ error: "Failed to answer question." });
  }
});

// ✅ Complete Experiment & Generate Summary
router.post("/complete-experiment", async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = labSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }

    const prompt = `The ${session.experimentName} experiment has been completed. 
    Provide a summary of the experiment, analysis of the results, and its potential real-world applications in pharmaceutical manufacturing, ensuring compliance with regulatory standards such as GMP.`;

    const summary = await callGoogleAI(prompt);

    // Clean up session
    labSessions.delete(sessionId);

    res.json({ summary });
  } catch (error) {
    console.error("Error completing experiment:", error);
    res.status(500).json({ error: "Failed to complete experiment." });
  }
});

module.exports = router;
