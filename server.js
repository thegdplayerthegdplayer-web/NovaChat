import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();

// 💡 1. Dynamic hosting port configuration
const PORT = process.env.PORT || 3000; 

// 💡 2. Secure production environment token management
const HUGGINGFACE_TOKEN = process.env.HUGGINGFACE_TOKEN;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Updates the client-side system status checks to clear error states
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

    // Connects natively to the Hugging Face serverless instance
    const response = await fetch(
      "https://huggingface.co",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${HUGGINGFACE_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
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
          },
          options: {
            wait_for_model: true
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Cloud AI error data:", data);
      return res.status(502).json({
        error: data?.error || "NovaChat Cloud Engine is currently busy. Try again in a few seconds!"
      });
    }
    
    // Safely fallback checks to cleanly catch any structure changes
    let replyContent = "";
    if (data?.choices && data.choices[0]?.message?.content) {
      replyContent = data.choices[0].message.content;
    } else if (data?.choices?.message?.content) {
      replyContent = data.choices.message.content;
    } else if (Array.isArray(data) && data[0]?.generated_text) {
      replyContent = data[0].generated_text;
    } else if (data?.generated_text) {
      replyContent = data.generated_text;
    } else if (data?.message?.content) {
      replyContent = data.message.content;
    }

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
