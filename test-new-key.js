import { VertexAI } from "@google-cloud/vertexai";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const keyFilename = join(__dirname ,"keys", "my_key.json");
process.env.GOOGLE_APPLICATION_CREDENTIALS = keyFilename;

const project_id = "text-simplifier-471608";
const location = "us-central1";

console.log("🔧 Testing NEW Google Cloud Vertex AI connection...");
console.log(`📁 Service Account: ${keyFilename}`);
console.log(`🔧 Project ID: ${project_id}`);
console.log(`📍 Location: ${location}`);

try {
  // Initialize Vertex AI client
  const vertex_ai = new VertexAI({
    project: project_id, 
    location: location,
  });

  const generativeModel = vertex_ai.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 0.1,
    },
    safetySettings: [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
    ],
  });

  console.log("✅ Vertex AI client initialized successfully");

  // Test with a simple prompt
  const testPrompt = "Hello, can you respond with 'API test successful'?";
  
  console.log("🔄 Testing API call...");
  
  const request = {
    contents: [{ role: "user", parts: [{ text: testPrompt }] }],
  };

  const response = await generativeModel.generateContent(request);
  const responseText = response.response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  
  console.log("✅ API call successful!");
  console.log("📝 Response:", responseText);
  
} catch (error) {
  console.error("❌ Error details:");
  console.error("Message:", error.message);
  console.error("Code:", error.code);
  console.error("Status:", error.status);
  console.error("Full error:", error);
}
