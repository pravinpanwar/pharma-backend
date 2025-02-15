const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const gmpQuizRoutes = require("./routes/gmpQuizRoutes");
const regulationUpdatesRoutes = require("./routes/regulationUpdatesRoutes");
const processOptimizationRoutes = require("./routes/processOptimizationRoutes");
const labSimulatorRoutes = require("./routes/virtualLabSimulatorRoute");
const getModel = require("./utils/googleAI"); // Import Google AI utility

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/gmp-quiz", gmpQuizRoutes);
app.use("/api/regulation-updates", regulationUpdatesRoutes);
app.use('/api/process-optimization', processOptimizationRoutes);
app.use("/api/lab", labSimulatorRoutes);

// Store interview sessions
const interviewSessions = new Map();

// Utility function for logging
const log = (message, error = null) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
  if (error) console.error(error);
};

// Start interview session
app.post("/api/start-interview", async (req, res) => {
  try {
    const { jobRole, difficulty, interviewType, numQuestions } = req.body;
    const sessionId = Date.now().toString();

    interviewSessions.set(sessionId, {
      jobRole,
      difficulty,
      interviewType,
      numQuestions,
      questions: [],
      answers: [],
      feedbacks: [],
    });

    log(`New interview session started: ${sessionId}`);
    res.json({ sessionId });
  } catch (error) {
    log("Error starting interview session", error);
    res.status(500).json({ error: "Failed to start interview session" });
  }
});

// Generate interview question using Google AI
app.post("/api/question", async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = interviewSessions.get(sessionId);

    if (!session) {
      log(`Session not found: ${sessionId}`);
      return res.status(404).json({ error: "Session not found" });
    }

    const model = getModel(); // Use default Gemini model

    const prompt = `You are an experienced pharmaceutical industry interviewer for ${session.jobRole} positions. 
    Your task is to ask a challenging, role-specific question that assesses both technical skills and soft skills relevant to the position. 
    The question should be concise, not exceeding one sentence. 
    It should be tailored to reveal the candidate's expertise, problem-solving abilities, and fit for the role.
    This is question number ${session.questions.length + 1} out of ${session.numQuestions}.
    The difficulty level is ${session.difficulty} and the interview type is ${session.interviewType}.
    Previous questions asked: ${session.questions.join(' | ')}
    Ensure the new question explores a different aspect of the role or a different skill set.`;

    console.log(prompt)

    const result = await model.generateContent(prompt);
    const question = result.response.text();

    session.questions.push(question);
    log(`Generated question for session ${sessionId}: ${question}`);
    res.json({ question });
  } catch (error) {
    log("Error generating question", error);
    res.status(500).json({ error: "Failed to generate question", details: error.message });
  }
});

// Provide AI-generated feedback using Google AI
// Provide AI-generated feedback using Google AI
app.post("/api/feedback", async (req, res) => {
  try {
    const { sessionId, answer } = req.body;
    const session = interviewSessions.get(sessionId);

    if (!session) {
      log(`Session not found: ${sessionId}`);
      return res.status(404).json({ error: "Session not found" });
    }

    const model = getModel();
    const currentQuestion = session.questions[session.questions.length - 1];
    session.answers.push(answer);

    const prompt = `You are an AI interviewer providing feedback on a candidate's response.
    Question: ${currentQuestion}
    Candidate's Answer: ${answer}
    Provide constructive feedback in the following structured JSON format, without markdown or extra characters:
    [
      { "section": "Overall Feedback", "content": "..." },
      { "section": "Strengths", "content": "..." },
      { "section": "Areas for Improvement", "content": ["...", "..."] },
      { "section": "Example of a Better Response", "content": "..." }
    ]
    Ensure the response is a valid JSON array without any additional formatting.`;

    const result = await model.generateContent(prompt);
    let feedbackText = result.response.text();

    // Clean the response to ensure it's valid JSON
    feedbackText = feedbackText.replace(/```json|```/g, "").trim();

    const feedback = JSON.parse(feedbackText); // Parse clean JSON

    session.feedbacks.push(feedback);
    log(`Generated structured feedback for session ${sessionId}`);
    res.json({ feedback });
  } catch (error) {
    log("Error generating feedback", error);
    res.status(500).json({ error: "Failed to generate feedback", details: error.message });
  }
});



// Generate interview summary using Google AI
// Generate structured interview summary using Google AI
app.get("/api/interview-summary/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = interviewSessions.get(sessionId);

    if (!session) {
      log(`Session not found: ${sessionId}`);
      return res.status(404).json({ error: "Session not found" });
    }

    const model = getModel();
    const interviewDetails = session.questions
      .map((q, i) => `Question ${i + 1}: ${q}\nAnswer: ${session.answers[i]}\nFeedback: ${session.feedbacks[i]}`)
      .join("\n");

    const prompt = `You are an experienced hiring manager summarizing an interview.
    Review the following interview details and provide a comprehensive summary in the following structured JSON format, without markdown or extra characters:
    [
      {
        "section": "Overall Assessment",
        "content": "Provide a brief overall assessment of the candidate's performance"
      },
      {
        "section": "Key Strengths",
        "content": ["Strength 1", "Strength 2", "Strength 3"]
      },
      {
        "section": "Areas for Development",
        "content": ["Area 1", "Area 2", "Area 3"]
      },
      {
        "section": "Technical Competency",
        "content": "Evaluate the candidate's technical knowledge and skills"
      },
      {
        "section": "Communication Skills",
        "content": "Assess the candidate's communication ability"
      },
      {
        "section": "Final Recommendation",
        "content": "Provide a hiring recommendation and any next steps"
      }
    ]
    Ensure the response is a valid JSON array without any additional formatting.
    
    Interview Details:\n${interviewDetails}`;

    const result = await model.generateContent(prompt);
    let summaryText = result.response.text();

    // Clean the response to ensure it's valid JSON
    summaryText = summaryText.replace(/```json|```/g, "").trim();

    const summary = JSON.parse(summaryText);

    log(`Generated structured summary for session ${sessionId}`);
    res.json({ summary });
  } catch (error) {
    log("Error generating interview summary", error);
    res.status(500).json({ error: "Failed to generate interview summary", details: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => log(`Server running on port ${PORT}`));
