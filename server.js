
import express from "express";
import { VertexAI } from "@google-cloud/vertexai";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cors from "cors";
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const keyFilename = join(__dirname, "keys", "my_key.json"); 
// 👆 make sure your JSON key is in /keys/service-account.json

// Set the environment variable for authentication
process.env.GOOGLE_APPLICATION_CREDENTIALS = keyFilename;

const project_id = process.env.GCLOUD_PROJECT_ID || "text-simplifier-471608";
const location = process.env.GCLOUD_LOCATION || "us-central1";

// Initialize Vertex AI client
const vertex_ai = new VertexAI({
  project: project_id, 
  location: location,
});

const generativeModel = vertex_ai.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    maxOutputTokens: 8192, // Increased output tokens
    temperature: 0.1, // Lower temperature for more consistent results
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

// Function to chunk large documents
const chunkDocument = (text, maxChunkSize = 50000) => { // 50k characters per chunk to reduce API calls
  if (text.length <= maxChunkSize) {
    return [text];
  }
  
  const chunks = [];
  let start = 0;
  
  while (start < text.length) {
    let end = start + maxChunkSize;
    
    // Try to break at a sentence or paragraph boundary
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('.', end);
      const lastNewline = text.lastIndexOf('\n', end);
      const breakPoint = Math.max(lastPeriod, lastNewline);
      
      if (breakPoint > start + maxChunkSize * 0.7) { // Don't make chunks too small
        end = breakPoint + 1;
      }
    }
    
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  
  return chunks;
};

const app = express();
const port = 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: "5mb" })); // Increased to handle 2MB files
app.use(express.urlencoded({ limit: "5mb", extended: true }));

// API endpoint to simplify text
app.post("/api/simplify-text", async (req, res) => {
  try {
    const { documentContent } = req.body;

    if (!documentContent) {
      return res.status(400).json({ error: "No document content provided." });
    }

    // Check document size
    if (documentContent.length > 2000000) { // 2MB limit
      return res.status(400).json({ error: "Document too large. Please upload a smaller file (max 2MB)." });
    }

    console.log(`📄 Processing document of ${documentContent.length} characters`);

    // Chunk the document if it's too large
    const chunks = chunkDocument(documentContent);
    console.log(`📦 Document split into ${chunks.length} chunks`);

    let allSummaries = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`🔄 Processing chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`);

      const prompt = `Create a concise summary of the following legal document section. Start directly with "### **Simplified Guide to Our Agreement**" (don't include the asterisks and hashes) and provide a brief, friendly explanation without any introductory sentences like "Let's break down" or "Okay, let's". Give me the summary in 3 4 points.
      ${chunks.length > 1 ? `This is section ${i + 1} of ${chunks.length} sections.` : ''}
      
      Document Section:
      ${chunk}

      Summary:`;

      const request = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      };

      try {
        const response = await generativeModel.generateContent(request);
        const simplifiedText = response.response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        allSummaries.push(simplifiedText);
        
        // Add delay between requests to avoid rate limiting
        if (i < chunks.length - 1) {
          console.log(`⏳ Waiting 2 seconds before next chunk...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(`❌ Error processing chunk ${i + 1}:`, error.message);
        // Continue with other chunks even if one fails
        allSummaries.push(`[Error processing section ${i + 1}]`);
      }
    }

    // Combine all summaries
    const finalSummary = allSummaries.join('\n\n');
    console.log(`✅ Document processing complete. Final summary: ${finalSummary.length} characters`);

    res.status(200).json({ summary: finalSummary });
  } catch (error) {
    console.error("❌ Error calling Vertex AI API:", error);
    res.status(500).json({ error: "Failed to simplify document." });
  }
});

// API endpoint to extract and explain clauses
app.post("/api/extract-clauses", async (req, res) => {
  try {
    const { documentContent } = req.body;

    if (!documentContent) {
      return res.status(400).json({ error: "No document content provided." });
    }

    // Check document size
    if (documentContent.length > 2000000) { // 2MB limit
      return res.status(400).json({ error: "Document too large. Please upload a smaller file (max 2MB)." });
    }

    console.log(`📄 Extracting clauses from document of ${documentContent.length} characters`);

    // Chunk the document if it's too large
    const chunks = chunkDocument(documentContent);
    console.log(`📦 Document split into ${chunks.length} chunks for clause extraction`);

    let allClauses = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`🔄 Extracting clauses from chunk ${i + 1}/${chunks.length}`);

      const prompt = `Analyze the following legal document section and group related clauses into 4-5 broader key points. For each key point, provide:

1. A combined explanation of related clauses in simple, plain-English
2. The overall risk level (low, medium, or high) for this key point
3. The main section/category it belongs to
4. A practical tip for the user
5. Key clause examples (2-3 most important clauses from this group)

Return the response as a JSON array with this exact structure:
[
  {
    "explanation": "combined explanation of related clauses in plain English",
    "risk": "low|medium|high",
    "section": "section name like Definitions, Confidentiality, Liability, etc.",
    "tip": "practical tip for the user",
    "keyClauses": ["example clause 1", "example clause 2", "example clause 3"]
  }
]

Group related clauses together (e.g., all definition clauses, all confidentiality clauses, all liability clauses, etc.) into broader categories. Aim for 4-5 key points maximum.

Document Section:
${chunk}

Key Points:`;

      const request = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      };

      try {
        const response = await generativeModel.generateContent(request);
        const responseText = response.response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        
        // Try to parse the JSON response
        try {
          const jsonMatch = responseText.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const chunkClauses = JSON.parse(jsonMatch[0]);
            allClauses = allClauses.concat(chunkClauses);
          }
        } catch (parseError) {
          console.error(`Failed to parse clauses from chunk ${i + 1}:`, parseError);
        }
        
        // Add delay between requests to avoid rate limiting
        if (i < chunks.length - 1) {
          console.log(`⏳ Waiting 2 seconds before next chunk...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(`❌ Error extracting clauses from chunk ${i + 1}:`, error.message);
        // Continue with other chunks even if one fails
        if (error.code === 429) {
          console.log(`⏳ Rate limit hit, waiting 5 seconds before retry...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          // Retry the same chunk
          i--;
          continue;
        }
      }
    }

    // Remove duplicate clauses based on text similarity
    const uniqueClauses = allClauses.filter((clause, index, self) => 
      index === self.findIndex(c => c.text === clause.text)
    );

    console.log(`✅ Extracted ${uniqueClauses.length} unique clauses from document`);

    res.status(200).json({ clauses: uniqueClauses });
  } catch (error) {
    console.error("❌ Error extracting clauses:", error);
    res.status(500).json({ error: "Failed to extract clauses from document." });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`🚀 Legal Helper Backend Server`);
  console.log(`📡 Listening at http://localhost:${port}`);
  console.log(`🔧 Project ID: ${project_id}`);
  console.log(`📍 Location: ${location}`);
  console.log(`🤖 Model: gemini-2.5-flash`);
  console.log(`📁 Service Account: ${keyFilename}`);
});
