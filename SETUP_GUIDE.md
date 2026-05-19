# Academic Email Assistant — Setup Guide

The Academic Email Assistant is an Outlook add-in that brings a locally hosted AI into your email sidebar. The AI runs entirely on your machine using Ollama and OpenClaw, meaning no email data is sent to external cloud AI services.

The add-in allows users to:
- Ask questions about emails
- Generate draft replies
- Automatically assign priority labels
- Manually apply labels
- Maintain per-email chat history
- Use light/dark mode automatically based on Outlook theme

---

# System Overview

There are four main components working together:

| Component | Purpose |
|---|---|
| Ollama | Runs the local AI model |
| OpenClaw Gateway | Handles AI communication |
| Webpack Dev Server | Hosts the Outlook add-in locally |
| Outlook | Runs the Academic Assistant add-in |

When all four are running, the AI assistant becomes available inside Outlook.

---

# Required Software

Install the following before beginning setup:

| Tool | Purpose | Download |
|---|---|---|
| Node.js 18+ | Runs the development server and scripts | https://nodejs.org |
| Ollama | Runs the AI model locally | https://ollama.com |
| Outlook Desktop OR Outlook Web | Hosts the add-in | Microsoft 365 |

After installing Ollama, ensure it is running before continuing. It normally starts automatically.

---

# One-Time Setup

## 1. Clone the Repository

Open PowerShell or Terminal:

```bash
git clone https://github.com/iammimii/AI-Agent-Concept-Workshop-Academic-Automation.git
cd AI-Agent-Concept-Workshop-Academic-Automation
```

---

## 2. Run the Setup Script

Inside the project folder:

```bash
npm run setup
```

This automatically:
- installs all npm dependencies
- installs the HTTPS certificate required by Outlook
- downloads the AI model (~2 GB)
- creates the OpenClaw configuration
- configures the AI workspace

If PowerShell asks about execution policy:
- press `Y`
- then press Enter

A Windows security popup may appear asking to trust the development certificate. Click **Yes**.

---

# Sideloading the Add-in into Outlook

This only needs to be completed once.

## Outlook Desktop

1. Open Outlook Desktop
2. Click **Get Add-ins**
3. Go to:
   - My Add-ins
   - Add a custom add-in
   - Add from file
4. Select:

```text
manifest.xml
```

from the project folder.

5. Click **OK**

You should now see **Academic Assistant** in the Outlook ribbon.

---

## Outlook Web

1. Open Outlook Web
2. Open any email
3. Click:
   - `...`
   - Get Add-ins
   - My Add-ins
4. Scroll to:
   - Custom Add-ins
   - Add a custom add-in
   - Add from file
5. Select:

```text
manifest.xml
```

from the project folder.

6. Install the add-in

The Academic Assistant should now appear in Outlook.

---

# First-Time Token Setup

This only needs to be completed once.

## 1. Start the AI Gateway

Open a terminal inside the project folder:

```bash
npm run gateway
```

Leave this terminal running.

After startup, open:

```text
C:\Users\<YourName>\.openclaw\openclaw.json
```

Locate the line:

```json
"token": "abc123..."
```

Copy the token value.

---

## 2. Open Outlook

Open either:
- Outlook Desktop
- Outlook Web

---

## 3. Open Academic Assistant

Open any email and click:

```text
Academic Assistant
```

from the Outlook ribbon/sidebar.

---

## 4. Connect the Add-in

1. A settings panel will appear
2. Paste the copied token
3. Click **Save & Connect**

If successful:
- the connection status bar will turn green
- the token will be saved locally by Outlook

---

# Quick Start

After completing the one-time setup, daily startup only takes about 1 minute.

Each time you want to use the add-in:

## 1. Start the AI Gateway

Open a terminal inside the project folder:

```bash
npm run gateway
```

Leave this terminal running.

---

## 2. Start the Dev Server

Open a SECOND terminal inside the project folder:

```bash
npm start
```

Leave this terminal running as well.

---

## 3. Open Outlook

Open either:
- Outlook Desktop
- Outlook Web

---

## 4. Open Academic Assistant

Open any email and click:

```text
Academic Assistant
```

from the Outlook ribbon/sidebar.

---

## 5. Start Using the AI Assistant

You can now:
- ask questions about emails
- summarise emails
- draft replies
- auto-assign labels
- manually apply labels

Example prompt:

```text
summarise this email
```

---

# Using the Add-in

| Action | How |
|---|---|
| Ask a question | Type into the chat box and press Enter |
| Summarise an email | Type “summarise this email” |
| Draft a reply | Click **Draft Reply** |
| Use drafted reply | Click **Use Draft** |
| Auto-assign labels | Click **Auto Label** |
| Manual labels | Click Urgent / Medium / Minor |
| Keep sidebar open | Click the 📌 pin icon |

---

# Architecture

```text
Outlook (Desktop or Web)
        │
        │  wss://localhost:3000/ai-gateway
        ▼
Webpack Dev Server (:3000)
        │
        │  ws://127.0.0.1:18789
        ▼
OpenClaw Gateway
        │
        ▼
Ollama — qwen2.5:3b (:11434)
```

---

# Tech Stack

| Layer | Technology |
|---|---|
| Add-in UI | HTML, CSS, Vanilla JavaScript |
| Office Integration | Office.js |
| AI Model | qwen2.5:3b via Ollama |
| AI Session Management | OpenClaw Gateway |
| Dev Server | Webpack 5 |

---

# Troubleshooting

## Status Bar Says “Disconnected”

Possible causes:
- `npm run gateway` is not running
- the token is incorrect
- the gateway closed unexpectedly

Fixes:
1. Ensure the gateway terminal is still running
2. Verify the token matches:

```text
~/.openclaw/openclaw.json
```

3. Re-save the token in the add-in settings panel

---

## “Cannot Connect” / “Not Connected”

Both services MUST be running:
- Terminal 1 → `npm run gateway`
- Terminal 2 → `npm start`

Then:
- close and reopen the Outlook sidebar
- refresh Outlook if necessary

---

## Add-in Does Not Appear in Outlook

Remove and re-add the add-in:

### Outlook Desktop
- Get Add-ins
- My Add-ins
- Remove Academic Assistant
- Add from file again

### Outlook Web
- My Add-ins
- Remove the add-in
- Reinstall using manifest.xml

---

## Setup Script Fails on Certificates

Run PowerShell as Administrator and retry:

```bash
npm run setup
```

When prompted to trust the certificate:
- click **Yes**

---

## First AI Response Is Very Slow

The AI model may take:
- 10–20 seconds on the first message
- additional time on lower-end hardware

This is normal during initial model loading.

---

## “Model Requires More System Memory Than Available”

The AI model context window may be too large for available VRAM/RAM.

Possible fixes:
- close other memory-intensive applications
- restart Ollama
- use a smaller model if required

---

## Ollama Running on CPU Instead of GPU

Run:

```bash
ollama ps
```

Check the `PROCESSOR` column.

If GPU is not being used:
- restart Ollama
- update GPU drivers
- close stale ollama.exe processes
- reboot the system if needed

---

## Gateway Randomly Disconnects

Possible causes:
- gateway terminal closed
- system sleep interrupted the connection
- local clock drift

Fixes:
- restart `npm run gateway`
- restart Outlook
- reboot if persistent

---

# Useful Paths

| Path | Purpose |
|---|---|
| `~/.openclaw/openclaw.json` | Gateway configuration and token |
| `manifest.xml` | Outlook add-in manifest |
| `src/taskpane/taskpane.js` | Main add-in logic |
| Project folder | Add-in source code |

---

# Notes

- The token only needs to be configured once
- Both terminals must remain open while using the add-in
- No email data is sent to external cloud AI services
- The add-in is intended as a Proof of Concept for educational and academic automation purposes
