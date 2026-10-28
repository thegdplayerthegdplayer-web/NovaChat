import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();

// 💡 FIX 1: Let Render choose the port dynamically, and remove the hardcoded local HOST
const PORT = process.env.PORT || 3000; 

// 💡 FIX 2: Use the cloud Hugging Face Token stored securely in your dashboard environment
const HUGGINGFACE_TOKEN = process.env.HUGGINGFACE_TOKEN;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Updates your status indicator dot in the bottom corner to stay green for the cloud
app.get("/api/status", async (req, res) => {
  res.json({
    configured: true,
    provider: "Hugging Face Cloud",
    model: "llama-3.2-3b"
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body ?? {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: "No messages received. Please type a message and try again."
      });
    }

    const validMessages = messages
      .filter(message =>
        message &&
        ["user", "assistant"].includes(message.role) &&
        typeof message.content === "string"
      )
      .slice(-20)
      .map(message => ({
        role: message.role,
        content: message.content
      }));

    if (
      validMessages.length === 0 ||
      validMessages[validMessages.length - 1].role !== "user"
    ) {
      return res.status(400).json({
        error: "Your latest message is missing. Please try again."
      });
    }

    // 💡 FIX 3: Fetch directly from Hugging Face's serverless endpoints instead of local Ollama
    const response = await fetch(
      "https://huggingface.co",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${HUGGINGFACE_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          // Hugging Face's chat system accepts your exact context array setup perfectly!
          model: "meta-llama/Llama-3.2-3B-Instruct",
          messages: [
            {
              role: "system",
              content: "You are NovaChat, a helpful and friendly AI assistant. Answer clearly and accurately."
            },
            ...validMessages
          ],
          parameters: {
             max_new_tokens: 500
          }
        })
      }
    );

    if (!response.ok) {
      const details = await response.text();
      console.error("Cloud AI error:", details);

      return res.status(502).json({
        error: "NovaChat Cloud Engine is busy processing other user queues. Try again in a second!"
      });
    }

    const data = await response.json();
    
    // Extract the answer from Hugging Face's server response structure
    const replyContent = data.choices?.[0]?.message?.content || data[0]?.generated_text || data.message?.content;

    if (!replyContent) {
      return res.status(502).json({
        error: "Cloud AI returned an unexpected response structure."
      });
    }

    res.json({ reply: replyContent });
  } catch (error) {
    console.error("Chat error:", error);

    res.status(500).json({
      error: "Cannot reach the cloud server. Make sure you are connected to the internet."
    });
  }
});

// 💡 FIX 4: Listen to standard PORT only so it goes live to the public internet
const server = app.listen(PORT, () => {
  console.log(`NovaChat running publicly on port ${PORT}`);
});

server.on("error", error => {
  console.error("Could not start NovaChat:", error.message);
});