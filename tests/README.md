# QA Test Suite - Academic Email Assistant

## Overview

This directory contains the complete test suite for the Academic Email Assistant Outlook add-in.

## Test Structure

```
tests/
├── README.md              # This file
├── setup.js               # Jest setup with global mocks
├── fixtures/
│   └── sampleEmails.json  # 12 synthetic academic emails for testing
├── unit/
│   ├── utilityFunctions.test.js   # Tests for hashString, extractMessages, extractText, isRawToolCall
│   ├── themeDetection.test.js     # Tests for applyTheme() logic
│   ├── tokenStorage.test.js       # Tests for localStorage token persistence
│   ├── rpcLayer.test.js           # Tests for RPC call/response handling
│   └── labelProcessing.test.js    # Tests for processAIText, stripAITags, handleEvent
└── manual/
    └── TEST_PROCEDURES.md # Step-by-step manual test procedures
```

## Running Tests

### Unit Tests
```bash
npm test              # Run all tests
npm run test:unit     # Run unit tests only
npm run test:coverage # Run with coverage report
```

### Manual Test Execution
All manual tests are documented in `manual/TEST_PROCEDURES.md`. These require:
- Microsoft Outlook Desktop with sideloaded Academic Email Assistant
- OpenClaw Gateway running on localhost:18789
- Active LLM connection (Ollama)

## Test Coverage

**~104 unit tests** covering:
- Utility functions (hashString, extractMessages, extractText, isRawToolCall)
- Theme detection logic (light/dark mode)
- Token storage and persistence
- RPC layer (callRpc, handleIncoming)
- Event handling (handleEvent, agent.run, chat.delta, chat.message, tool_call)
- Label processing (processAIText LABEL: extraction, stripAITags streaming)

## Test Data

12 synthetic academic emails in `fixtures/sampleEmails.json` covering:
- Email-001: Assignment deadline inquiry (medium urgency, inquiry) — standard question about due date
- Email-002: Exam marks access issue (urgent, urgent) — scholarship deadline tomorrow, needs immediate help
- Email-003: Workshop attendance confirmation (medium urgency, administrative) — room booking depends on reply
- Email-004: Assignment extension request (medium urgency, request) — health circumstances with medical certificate
- Email-005: Lecture feedback (minor urgency, feedback) — positive student feedback, no action needed
- Email-006: Exam format question (medium urgency, inquiry) — exam preparation question, helpful to answer
- Email-007: Missing course materials follow-up (medium urgency, inquiry) — student blocked from studying
- Email-008: Thesis meeting request (minor urgency, request) — flexible scheduling, no deadline pressure
- Email-009: Library resources announcement (minor urgency, announcement) — informational broadcast, no action
- Email-010: Group project teammate complaint (medium urgency, urgent) — conflict needs guidance but not emergency
- Email-011: Empty/malformed email (medium urgency, unknown) — edge case, cannot assess without content
- Email-012: Long email body ~3000 chars (minor urgency, inquiry) — system stress test, no real urgency

## Manual Test Cases

The manual test procedures are documented in `manual/TEST_PROCEDURES.md` and cover both response-based testing and system/integration testing.

### System, UI, and Integration Tests
- TC-01: Outlook add-in loading
- TC-02: Email context extraction
- TC-03: Gateway token connection
- TC-04: Invalid or missing token handling
- TC-05: End-to-end workflow connection validation
- TC-09: Empty/unreadable email body
- TC-11: Very long email body
- TC-12: Gateway/model unavailable
- TC-14: Privacy and data handling

### Response-Based and Extended Manual Tests
- TC-06: Basic email question
- TC-07: Draft reply generation
- TC-08: Use Draft in Outlook
- TC-10: Ambiguous email content
- TC-13: Per-email chat history
- TC-15: Performance and code coverage (manual timing required)
- TC-16: Pinned sidebar / email switching
- TC-17: Token persistence

## Notes

The unit tests test **logic in isolation** by defining local copies of functions to test. This approach was chosen because the actual source code (taskpane.js) depends heavily on Office.js browser APIs that require complex mocking. The tests validate the correctness of the algorithmic logic.

For full integration testing with Outlook, run the manual test procedures documented in `manual/TEST_PROCEDURES.md`.
