# Tools

This file documents every capability this agent has access to. Do not claim or attempt to use any capability not listed here.

## Available Tools

### 1. Read Current Email

- **What it does:** Reads the subject, sender name, sender email address, and full body of the email currently open in Outlook.
- **How it's triggered:** Automatically sent to the agent as context when the user opens a message or asks a question.
- **Limitations:**
  - Only the currently open email is accessible. No inbox browsing.
  - Attachments cannot be read — only the email body text.
  - Inline images are not processed.

### 2. Chat / Answer Questions

- **What it does:** Responds to free-text questions or instructions from the user about the open email.
- **How it's triggered:** User types in the chat input and sends.
- **Limitations:** Context is limited to the current email and the current session history (last 50 messages).

### 3. Draft Reply

- **What it does:** Generates a draft reply to the current email, written in first person as the user.
- **How it's triggered:** User clicks the "Draft Reply" button, or types a request to draft a reply.
- **Wire prompt the agent receives:**
  `Please draft a professional reply to this email. Respond in the same language as the original email.`
- **Output:** Text reply shown in the chat window. User can click "Use Draft" to push it into Outlook's reply compose form.
- **Limitations:**
  - Does not send the email. Only populates the reply form.
  - Cannot access previous email threads beyond what is in the current email body.

### 4. Auto Label (AI Priority)

- **What it does:** Reads the email and assigns one of three priority labels: Urgent, Medium, or Minor.
- **How it's triggered:** User clicks the "Auto Label" button.
- **Wire prompt the agent receives:**
  `Read this email and assign a priority label (Urgent, Medium, or Minor) based on its urgency. Reply with a brief reason for your choice.`
- **How the label is applied:** The agent must end its response with exactly one of `[LABEL:Urgent]`, `[LABEL:Medium]`, or `[LABEL:Minor]`. The task pane parses this tag, applies the matching Outlook category, and strips the tag from the visible reply. The tag is only applied to live replies — historical messages from `chat.history` will not retroactively change the label.
- **Output:** Suggested label shown in chat with a one-sentence reason. Label is also applied to the email as an Outlook category.
- **Labels and colours:**
  - Urgent — Red
  - Medium — Yellow
  - Minor — Green
- **Limitations:** Classification is based solely on the email content visible in the current open message.

### 5. Manual Label (Toggle Category)

- **What it does:** Allows the user to manually toggle Urgent / Medium / Minor labels on the current email.
- **How it's triggered:** User clicks one of the three label buttons in the task pane UI.
- **Limitations:** Only one label can be active at a time. Selecting a new label removes the previous one.

### 6. Load Conversation History

- **What it does:** Retrieves the last 50 messages from the OpenClaw session for the current email.
- **How it's triggered:** Automatically on load when an email is opened, or when the user scrolls up in chat.
- **Limitations:** History is scoped per email by hash. Switching emails clears the visible history and loads the new email's history.

### 7. Use Draft (Populate Reply Form)

- **What it does:** Takes the last AI message in the chat and pushes it into Outlook's reply compose window using `displayReplyForm()`.
- **How it's triggered:** User clicks the "Use Draft" button.
- **Limitations:** Only uses the last AI message. If the user wants to edit the draft, they do so inside Outlook's compose window after clicking the button.

## What Is NOT Available

- Browsing the inbox or other folders
- Reading attachment contents
- Sending emails
- Accessing the user's calendar or contacts
- Searching across multiple emails
- Creating or saving files to disk
- Internet access or external API calls (all AI processing is local via Ollama)
- Accessing other users' mailboxes

## Model

- Provider: Ollama (local, no cloud)
- Model: `qwen2.5:3b`
- All processing happens on the user's machine. No email data leaves the device.
