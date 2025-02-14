const express = require("express");
const router = express.Router();
const getModel = require("../utils/googleAI");
const NodeCache = require("node-cache");

const questionCache = new NodeCache({ stdTTL: 3600 }); // Cache questions for 1 hour
const quizSessions = new Map(); // Store quiz sessions

// Function to pregenerate questions
async function pregenerateQuestions(difficulty, category, count) {
  const cacheKey = `${difficulty}-${category}`;
  let questions = questionCache.get(cacheKey) || [];

  if (questions.length < count) {
    const model = getModel(); // Get Google AI model
    const prompt = `You are a GMP expert tasked with creating challenging and educational quiz questions for pharmaceutical professionals. Ensure all output is in valid JSON format. Generate ${count - questions.length} unique GMP (Good Manufacturing Practice) quiz questions. 
    Difficulty: ${difficulty}
    Category: ${category}
    Format the output as a JSON array:
    [
      {
        "type": "multipleChoice" or "trueFalse",
        "question": "The question text",
        "options": ["Option A", "Option B", "Option C", "Option D"] (only for multipleChoice),
        "correctAnswer": "The correct answer or true/false for trueFalse questions",
        "explanation": "A brief explanation of the correct answer"
      }
    ]`;

    try {
      const result = await model.generateContent(prompt);
      const content = result.response.text().trim();
  
      // Extract JSON content from AI response using regex
      const jsonMatch = content.match(/\[.*\]/s);
      if (!jsonMatch) {
        throw new Error(`Invalid JSON format: Expected an array, got: ${content}`);
      }
  
      const jsonString = jsonMatch[0];
  
      let newQuestions;
      try {
        newQuestions = JSON.parse(jsonString);
      } catch (parseError) {
        console.error("Error parsing JSON:", jsonString);
        throw parseError;
      }
  
      if (!Array.isArray(newQuestions)) {
        throw new Error("Invalid response format: Expected an array.");
      }
  
      questions = [...questions, ...newQuestions];
      questionCache.set(cacheKey, questions);
      return questions.slice(0, count);
    } catch (error) {
      console.error("Error pregenerating questions:", error);
      return [];
    }
  }

  return questions.slice(0, count);
}

// Start a new quiz session
router.post("/start-quiz", async (req, res) => {
  console.log("Starting quiz...");
  try {
    const { numberOfQuestions, difficulty, category } = req.body;
    const sessionId = Date.now().toString();

    const questions = await pregenerateQuestions(difficulty, category, numberOfQuestions);

    if (questions.length === 0) {
      return res.status(500).json({ error: "Failed to generate questions. Please try again." });
    }

    quizSessions.set(sessionId, {
      questions,
      currentQuestionIndex: 0,
      numberOfQuestions: questions.length,
      difficulty,
      category,
    });

    res.json({ sessionId });
  } catch (error) {
    console.error("Error starting quiz:", error);
    res.status(500).json({ error: "Failed to start quiz." });
  }
});

// Generate a new quiz question
router.post("/generate-question", async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = quizSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }

    if (session.currentQuestionIndex >= session.numberOfQuestions) {
      return res.json({ quizCompleted: true });
    }

    const questionData = session.questions[session.currentQuestionIndex];
    session.currentQuestionIndex++;

    res.json({ ...questionData, questionIndex: session.currentQuestionIndex - 1 });
  } catch (error) {
    console.error("Error generating question:", error);
    res.status(500).json({ error: "Failed to generate question." });
  }
});

// Check answer correctness
router.post("/check-answer", async (req, res) => {
  try {
    const { sessionId, questionIndex, userAnswer } = req.body;
    const session = quizSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }

    if (questionIndex < 0 || questionIndex >= session.questions.length) {
      return res.status(400).json({ error: "Invalid question index." });
    }

    const question = session.questions[questionIndex];

    let isCorrect = false;
    const normalizeAnswer = (answer) => (typeof answer === "string" ? answer.toLowerCase().trim() : answer);

    if (question.type === "multipleChoice") {
      if (typeof question.correctAnswer === "number") {
        isCorrect = parseInt(userAnswer) === question.correctAnswer;
      } else {
        isCorrect = normalizeAnswer(userAnswer) === normalizeAnswer(question.correctAnswer);
      }
    } else if (question.type === "trueFalse") {
      isCorrect = normalizeAnswer(userAnswer) === normalizeAnswer(question.correctAnswer);
    } else if (question.type === "shortAnswer") {
      const userAnswerNormalized = normalizeAnswer(userAnswer);
      const correctAnswerNormalized = normalizeAnswer(question.correctAnswer);

      if (Array.isArray(correctAnswerNormalized)) {
        isCorrect = correctAnswerNormalized.some((answer) =>
          userAnswerNormalized.includes(normalizeAnswer(answer))
        );
      } else {
        isCorrect =
          userAnswerNormalized.includes(correctAnswerNormalized) ||
          correctAnswerNormalized.includes(userAnswerNormalized);
      }
    } else {
      return res.status(400).json({ error: "Unknown question type." });
    }

    res.json({ isCorrect, explanation: question.explanation });
  } catch (error) {
    console.error("Error checking answer:", error);
    res.status(500).json({ error: "Failed to check answer." });
  }
});

// Complete quiz and generate feedback
router.post("/complete-quiz", async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = quizSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }

    const model = getModel();
    const totalQuestions = session.numberOfQuestions;
    const answeredQuestions = session.currentQuestionIndex;
    const quizSummary = `The user completed ${answeredQuestions} out of ${totalQuestions} questions in the GMP quiz.`;

    const prompt = `Based on the following quiz summary, provide a brief encouraging message and suggest areas for improvement in GMP knowledge:
    ${quizSummary}`;

    const result = await model.generateContent(prompt);
    const feedbackMessage = result.response.text();

    quizSessions.delete(sessionId); // Clean up session

    res.json({ message: feedbackMessage });
  } catch (error) {
    console.error("Error completing quiz:", error);
    res.status(500).json({ error: "Failed to complete quiz." });
  }
});

module.exports = router;
