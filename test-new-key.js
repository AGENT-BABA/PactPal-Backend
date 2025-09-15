import { VertexAI } from "@google-cloud/vertexai";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env variables first
dotenv.config({ path: join(__dirname, ".env") });

const project_id = process.env.GCLOUD_PROJECT_ID;
const location = process.env.GCLOUD_LOCATION;

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  throw new Error("Missing GOOGLE_APPLICATION_CREDENTIALS_JSON in .env");
}

// Write service account credentials to a key file
const keyFilePath = "/keys/my_key.json";
fs.mkdirSync("/keys", { recursive: true });
fs.writeFileSync(keyFilePath, process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);

// Set GOOGLE_APPLICATION_CREDENTIALS env var for Google library
process.env.GOOGLE_APPLICATION_CREDENTIALS = keyFilePath;

console.log("🔧 Testing Google Cloud Vertex AI connection...");
console.log(`📧 Project ID: ${project_id}`);
console.log(`📍 Location: ${location}`);

try {
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

  const testPrompt = "Hello, can you respond with 'API test successful'?";

  console.log("🔄 Sending test API call...");

  const request = {
    contents: [{ role: "user", parts: [{ text: testPrompt }] }],
  };

  generativeModel.generateContent(request)
    .then(response => {
      const responseText =
        response.response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      console.log("✅ API call successful!");
      console.log("📝 Response:", responseText);
    })
    .catch(error => {
      console.error("❌ API call failed!");
      console.error("Message:", error.message);
      console.error("Code:", error.code);
      console.error("Status:", error.status);
      console.error("Full error:", error);
    });

} catch (error) {
  console.error("❌ Error initializing Vertex AI:");
  console.error(error);
}
