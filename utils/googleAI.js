const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

// Initialize Google AI with API key
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Export function to get the AI model
const getModel = (model = "gemini-2.0-flash") => genAI.getGenerativeModel({ model });

module.exports = getModel;
