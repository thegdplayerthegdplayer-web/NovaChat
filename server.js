import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();

// Let Render choose the port dynamically
const PORT = process.env.PORT || 3000; 

// Read the secure Hugging Face token from your Render environment panel
const HUGGINGFACE_TOKEN = process.env.HUGGINGFACE_TOKEN;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Keep your system indicator green on the public cloud build
app.get("/api/status", async (req, res) => {
  res.json({
    configured: true,
    provider: "Hugging Face Cloud",
    model: "Qwen2.5-72B"
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

    // Connects to the ultra-stable v1 chat completions endpoint on Hugging Face cluster
    const response = await fetch(
      "https://huggingface.co",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${HUGGINGFACE_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "Qwen/Qwen2.5-72B-Instruct",
          messages: [
            {
              role: "system",
              content: "You are NovaChat, a helpful and friendly AI assistant. Answer clearly and accurately."
            },
            ...validMessages
          ],
          max_tokens: 500,
          stream: false
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Cloud AI error data:", data);
      return res.status(502).json({
        error: data?.error?.message || data?.error || "NovaChat Cloud Engine is currently busy. Try again!"
      });
    }
    
    // Extracting content from the standard standard OpenAI-compatible choices model layout
    const replyContent = data?.choices?.[0]?.message?.content;

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

const server = app.listen(PORT, () => {
  console.log(`NovaChat running publicly on port ${PORT}`);
});

server.on("error", error => {
  console.error("Could not start NovaChat:", error.message);
});
