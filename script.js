/***********************************************************
 * 1) CONFIGURE YOUR OPENROUTER SETTINGS
 ***********************************************************/
const OPENROUTER_API_KEY = "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"; // Replace with your actual API key
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const MODEL_NAME = "deepseek/deepseek-chat-v3-0324:free"; 

/***********************************************************
 * 2) DEFINE YOUR SYSTEM PROMPT (Hidden backend instructions)
 ***********************************************************/
const systemPrompt = `
You are the “Home Cooking Class Finder” – an AI-powered virtual assistant dedicated to helping users discover, compare, and book local cooking classes and provide food recipes when requested.
- Prioritize local, paid or community-based cooking class options.
- Generate detailed food recipes (e.g., pasta recipes) when requested.
- If a user asks for topics outside these domains (e.g., "history of cooking classes" or "Elon's favourite recipe"), respond with:
  "I specialize in providing cooking class information and food recipes. Please ask accordingly."
- Maintain a friendly, professional tone.
`;

/***********************************************************
 * 3) INITIAL MESSAGES & CONVERSATION STORAGE
 ***********************************************************/
const initialAssistantMessage = "Hello! I'm your Home Cooking Class Finder. **Tell me, what kind of cooking class are you interested in? And where are you located?**";
let initialMessages = [
  { role: "system", content: systemPrompt },
  { role: "assistant", content: initialAssistantMessage }
];

// Each conversation is stored as: { id, title, messages }
let conversations = [];
// The current active conversation
let currentConversation = {
  id: Date.now(),
  title: "",
  messages: [...initialMessages]
};

/***********************************************************
 * 4) DOM ELEMENTS
 ***********************************************************/
const chatLog = document.getElementById("chat-log");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const spinnerContainer = document.getElementById("spinner-container");
const conversationList = document.getElementById("conversation-list");
const newChatBtn = document.getElementById("new-chat-btn");

/***********************************************************
 * 5) HELPER FUNCTIONS
 ***********************************************************/
// Determine if the user's input is out of scope
function isOutOfScope(text) {
  const lower = text.toLowerCase();
  if ((lower.includes("history") && lower.includes("cooking class")) ||
      (lower.includes("elon") && lower.includes("recipe"))) {
    return true;
  }
  return false;
}

// Render messages from a conversation into the chat log (skip system messages)
function renderConversation(convo) {
  chatLog.innerHTML = "";
  convo.messages.forEach(msg => {
    if (msg.role !== "system") {
      appendMessage(msg.role, msg.content, false);
    }
  });
}

// Append a message to the chat log (renders markdown)
function appendMessage(role, text, scroll = true) {
  const msgDiv = document.createElement("div");
  msgDiv.classList.add("chat-message");
  msgDiv.classList.add(role === "user" ? "user-message" : "assistant-message");
  msgDiv.innerHTML = marked.parse(text);
  chatLog.appendChild(msgDiv);
  if (scroll) chatLog.scrollTop = chatLog.scrollHeight;
}

// Generate a conversation title based on the first non-default user message
function generateConversationTitle(convo) {
  const nonInitialUserMsg = convo.messages.find(m => m.role === "user" && m.content.trim());
  if (nonInitialUserMsg) {
    let title = nonInitialUserMsg.content.replace(/[#_*]/g, "").trim();
    return title.length > 50 ? title.slice(0, 50) + '...' : title;
  }
  return "Untitled Chat";
}

// Check if a conversation with the given ID exists in the sidebar
function conversationExists(convoId) {
  return Array.from(conversationList.children).some(li => li.dataset.convoId === convoId.toString());
}

// Add conversation summary to the sidebar if not already present
function addConversationSummary(convo) {
  if (conversationExists(convo.id)) return;
  if (!convo.title) {
    convo.title = generateConversationTitle(convo);
  }
  const li = document.createElement("li");
  li.textContent = convo.title;
  li.dataset.convoId = convo.id;
  
  // Use contentEditable for inline editing on double-click
  li.addEventListener("dblclick", () => {
    li.contentEditable = "true";
    li.classList.add("editing");
    li.focus();
  });
  // When editing finishes, update the title
  li.addEventListener("blur", () => {
    li.contentEditable = "false";
    li.classList.remove("editing");
    const newTitle = li.textContent.trim() || "Untitled Chat";
    li.textContent = newTitle;
    const convoToUpdate = conversations.find(c => c.id == li.dataset.convoId);
    if (convoToUpdate) {
      convoToUpdate.title = newTitle;
    }
  });
  // Also, finish editing on Enter key
  li.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      li.blur();
    }
  });
  
  li.addEventListener("click", () => {
    currentConversation = conversations.find(c => c.id == li.dataset.convoId) || currentConversation;
    renderConversation(currentConversation);
  });
  conversationList.appendChild(li);
}

// Save current conversation (if more than initial messages) and start a new one
function startNewConversation() {
  if (currentConversation.messages.length > initialMessages.length && !conversationExists(currentConversation.id)) {
    conversations.push({ ...currentConversation });
    addConversationSummary(currentConversation);
  }
  currentConversation = {
    id: Date.now(),
    title: "",
    messages: [...initialMessages]
  };
  renderConversation(currentConversation);
}

// Show spinner & disable send button
function showSpinner() {
  spinnerContainer.style.display = "flex";
  sendBtn.disabled = true;
}

// Hide spinner & enable send button
function hideSpinner() {
  spinnerContainer.style.display = "none";
  sendBtn.disabled = false;
}

/***********************************************************
 * 6) EVENT LISTENERS
 ***********************************************************/
// New Chat Button: Save current conversation and start a new one
newChatBtn.addEventListener("click", () => {
  startNewConversation();
});

// Send message on button click
sendBtn.addEventListener("click", async () => {
  const content = userInput.value.trim();
  if (!content) return;
  if (isOutOfScope(content)) {
    const refusal = "I specialize in providing cooking class information and food recipes. Please ask accordingly.";
    appendMessage("assistant", refusal);
    currentConversation.messages.push({ role: "assistant", content: refusal });
    userInput.value = "";
    return;
  }
  appendMessage("user", content);
  currentConversation.messages.push({ role: "user", content });
  userInput.value = "";
  showSpinner();
  await getBotReply();
});

// Send message on pressing "Enter"
userInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendBtn.click();
  }
});

/***********************************************************
 * 7) API CALL TO OPENROUTER
 ***********************************************************/
async function getBotReply() {
  try {
    const response = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: currentConversation.messages
      })
    });
    const data = await response.json();
    hideSpinner();
    if (data.error) {
      const errorMsg = `Error: ${data.error.message || "Unknown error"}`;
      appendMessage("assistant", errorMsg);
      currentConversation.messages.push({ role: "assistant", content: errorMsg });
      return;
    }
    const botReply = data?.choices?.[0]?.message?.content;
    if (botReply) {
      appendMessage("assistant", botReply);
      currentConversation.messages.push({ role: "assistant", content: botReply });
    } else {
      const fallback = "Sorry, I didn't receive a valid response from the model.";
      appendMessage("assistant", fallback);
      currentConversation.messages.push({ role: "assistant", content: fallback });
    }
  } catch (error) {
    hideSpinner();
    const errMsg = `Error: ${error.message}`;
    console.error("Fetch error:", error);
    appendMessage("assistant", errMsg);
    currentConversation.messages.push({ role: "assistant", content: errMsg });
  }
}

// On initial load, render the active conversation
renderConversation(currentConversation);
