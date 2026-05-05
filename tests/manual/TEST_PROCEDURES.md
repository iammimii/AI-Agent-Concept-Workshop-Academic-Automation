# Manual Test Procedures - Academic Email Assistant

> ⚠️ Note: During testing, AI response generation was inconsistent on some local environments. As a result, response-based test cases (e.g. TC-06–TC-08) may not be fully reproducible across all machines. System-level, UI, and integration tests were prioritised.

> 📌 Scope Note: Current testing focuses on prompt handling, system functionality, UI behaviour, and integration between components. Email classification functionality has been deferred to Sprint 3 following the sprint review and is therefore not included in this test suite.

## Test Environment Setup

### Prerequisites
- [ ] Microsoft Outlook Desktop (Windows) installed
- [ ] Academic Email Assistant add-in sideloaded
- [ ] OpenClaw Gateway running on `localhost:18789`
- [ ] Ollama LLM model
- [ ] Test data (sample emails) loaded in Outlook

### Setup Verification
- [x] Open Outlook and verify "Academic Assistant" button appears in ribbon
- [x] Click Academic Assistant to open sidebar
- [x] Verify sidebar shows "Disconnected" status initially
- [x] Enter gateway token in settings (⚙ icon) and click "Save & Connect"
- [x] Verify status changes to "Academic AI Ready"

---

## TC-06: Basic Email Question

**Objective**: Verify AI provides relevant answers to email-related questions

**Test Data**: Use the 10 sample academic emails from `tests/fixtures/sampleEmails.json`

**Steps**:
1. Open Outlook and select Email #001 (Assignment deadline question)
2. Type: "What is this email asking about?"
3. Wait for AI response and evaluate relevance
4. Record result in table below
5. Repeat for all 10 emails

| Email ID | Question | Expected Topic | Actual Response | Relevant (Y/N) | Rating (1-5) |
|----------|----------|----------------|-----------------|----------------|--------------|
| 001 | What is this email asking about? | Assignment deadline inquiry | | | |
| 002 | What is this email asking about? | Exam marks access issue | | | |
| 003 | What is this email about? | Workshop attendance | | | |
| 004 | What is this email about? | Extension request | | | |
| 005 | What is this email about? | Lecture feedback | | | |
| 006 | What is this email about? | Exam format question | | | |
| 007 | What is this email about? | Course materials follow-up | | | |
| 008 | What is this email about? | Meeting request | | | |
| 009 | What is this email about? | Library resources announcement | | | |
| 010 | What is this email about? | Group project complaint | | | |

---

## TC-07: Draft Reply Generation

**Objective**: Verify AI generates contextually appropriate draft replies

**Steps**:
1. Select test email
2. Click "Draft Reply" button
3. Wait for AI to generate draft response
4. Click "Use Draft" to open Outlook compose
5. Evaluate appropriateness (tone, content, accuracy)

| Email ID | Original Topic | Draft Tone | Content Accurate (Y/N) | Format Appropriate (Y/N) | Overall Rating (1-5) |
|----------|---------------|------------|------------------------|-------------------------|---------------------|
| 001 | Assignment deadline | | | | |
| 002 | Exam marks issue | | | | |
| 003 | Workshop attendance | | | | |
| 004 | Extension request | | | | |
| 005 | Lecture feedback | | | | |
| 006 | Exam format question | | | | |
| 007 | Course materials | | | | |
| 008 | Meeting request | | | | |
| 009 | Library announcement | | | | |
| 010 | Group project issue | | | | |

---

## TC-08: Use Draft in Outlook

**Objective**: Verify draft opens correctly in Outlook reply form

**Steps**:
1. Generate a draft reply for Email #001
2. Click "Use Draft"
3. Verify Outlook reply form opens
4. Check: Recipient field populated correctly
5. Check: Subject line has "Re:" prefix
6. Check: Body contains AI-generated draft

**Checklist**:
- [ ] Reply form opened
- [ ] To: field shows original sender
- [ ] Subject: "Re: [original subject]"
- [ ] Body has content

**Screenshots**: (attach)

---

## TC-10: Ambiguous Email Content

**Objective**: Verify AI handles unclear emails appropriately

**Test Data**: Create 5 ambiguous emails with unclear intent/missing context

**Steps**:
1. Select ambiguous test email
2. Ask AI to draft a reply
3. Observe behavior

**Expected Behavior**: AI either (a) asks clarifying question OR (b) provides cautious generic response

| Email ID | Ambiguity Type | AI Response Type | Appropriate (Y/N) | Notes |
|----------|---------------|------------------|-------------------|-------|
| Ambiguous 1 | Unclear intent | | | |
| Ambiguous 2 | Missing context | | | |
| Ambiguous 3 | Vague request | | | |
| Ambiguous 4 | Contradictory info | | | |
| Ambiguous 5 | No specific question | | | |

---

## TC-13: Per-Email Chat History

**Objective**: Verify each email maintains independent chat history

**Steps**:
1. Open Email A (e.g., #001)
2. Send message: "Summarize this email"
3. Receive AI response
4. Switch to Email B (e.g., #002)
5. Send message: "What is this email about?"
6. Verify response is specific to Email B
7. Return to Email A
8. Verify original conversation is restored

**Checklist**:
- [ ] Email A chat exists after switching to Email B
- [ ] Email B has fresh session (not contaminated with Email A context)
- [ ] Returning to Email A restores original conversation
- [ ] History persists correctly

**Screenshots**: (attach)

---

## TC-15: Performance and Code Coverage

**Unit Tests**: Run `npm test` - should show 60/60 passing

**Coverage Target**: Logic validation via unit tests (≥80% of testable logic covered)

**Performance Test**: **Manual timing required**

> **Note**: The automated performance test requires specific OpenClaw Gateway CORS configuration that varies by deployment environment. Manual stopwatch timing is required.

**Manual Performance Test Steps**:
1. Open Outlook with Academic Assistant sidebar connected
2. Ensure gateway is responsive and model is loaded
3. Use a stopwatch to time each of 20 queries
4. Record response times in the table below
5. Calculate metrics manually

**20-Query Performance Log**:
| Query # | Query | Response Time (ms) | Success (Y/N) |
|---------|-------|-------------------|---------------|
| 1 | Summarize this email | | |
| 2 | What is the urgency level? | | |
| 3 | Draft a professional reply | | |
| 4 | Is this email about an assignment? | | |
| 5 | Extract the key action items | | |
| 6 | Identify the sender type | | |
| 7 | What course is this related to? | | |
| 8 | Should I respond immediately? | | |
| 9 | Is this spam or legitimate? | | |
| 10 | What tone should I use? | | |
| 11 | Are there any deadlines mentioned? | | |
| 12 | Is this a sensitive matter? | | |
| 13 | Should I forward this to someone? | | |
| 14 | What is the main question? | | |
| 15 | Create a brief summary | | |
| 16 | Is this urgent? | | |
| 17 | What type of email is this? | | |
| 18 | Should I Escalate this? | | |
| 19 | What response is appropriate? | | |
| 20 | Analyze the sentiment | | |

**Performance Calculations**:
- Average Response Time = SUM(response times) / 20 = ___ ms
- Success Rate = (successful queries / 20) × 100 = ___%

**Pass Criteria**:
- Average response time ≤ 4000ms
- Success rate ≥ 70%

---

## TC-16: Pinned Sidebar / Email Switching

**Objective**: Verify sidebar stays open when switching emails (pinned mode)

**Steps**:
1. Open Email #001
2. Open Academic Assistant sidebar
3. Click pin icon (📌) to enable pinned mode
4. Switch to Email #002 in Outlook main window
5. Verify sidebar remains open
6. Verify sidebar shows Email #002 context

**Checklist**:
- [ ] Pin icon toggles pinned mode
- [ ] Sidebar stays open when switching emails
- [ ] New email context loads correctly
- [ ] Pinned state persists across email selections

**Screenshots**: (attach)

---

## TC-17: Token Persistence

**Objective**: Verify gateway token persists across sessions

**Steps**:
1. Launch Outlook
2. Open Academic Assistant
3. Enter gateway token in settings
4. Verify connection succeeds (status: Connected)
5. Close Outlook completely
6. Reopen Outlook
7. Open Academic Assistant
8. Verify auto-reconnect without re-entering token

---

## Additional Manual Test Procedures (System & Integration - Reem)

---

## TC-01: Outlook Add-in Loading

**Objective**: Verify the add-in loads correctly in Outlook

**Method**: Manual Test  

**Steps**:
1. Open Outlook on web
2. Select any email
3. Click the "Academic Assistant" extension

**Expected Result**:
- Sidebar opens successfully
- No crashes or error banners occur

**Actual Result**:
The add-in successfully loaded within the Outlook sidebar without any crashes or errors. The interface rendered correctly and remained responsive.

**Status**: Passed

---

## TC-02: Email Context Extraction

**Objective**: Verify email metadata is correctly extracted

**Method**: Manual Test  

**Steps**:
1. Open an email
2. Open the add-in
3. Observe header details

**Expected Result**:
- Subject, sender, and date are visible
- Information matches the selected email

**Actual Result**:
The add-in correctly extracted and displayed the selected email’s subject, sender, and timestamp. All metadata matched the original email content, confirming accurate context retrieval.

**Status**: Passed

---

## TC-03: Gateway Token Connection

**Objective**: Verify successful authentication with the gateway

**Method**: Integration Test  

**Steps**:
1. Enter a valid token in add-in settings
2. Click "Save & Connect"

**Expected Result**:
- Status changes to "Academic AI Ready"

**Actual Result**:
The system successfully authenticated with the OpenClaw Gateway using a valid token. The connection status updated to "Academic AI Ready," confirming successful integration.

**Status**: Passed

---

## TC-04: Invalid or Missing Token

**Objective**: Verify secure handling of invalid authentication

**Method**: Security / Manual Test  

**Steps**:
1. Remove or modify the token
2. Click "Save & Connect"

**Expected Result**:
- System does not connect
- No sensitive information is exposed

**Actual Result**:
When an invalid or missing token was provided, the system remained disconnected. No sensitive authentication details were exposed, demonstrating appropriate security handling.

**Status**: Passed

---

## TC-05: End-to-End Workflow (Connection Validation)

**Objective**: Verify connection across all system components

**Method**: Integration Test  

**Steps**:
1. Ensure OpenClaw Gateway is running
2. Ensure add-in shows "Academic AI Ready"

**Expected Result**:
- Add-in ↔ Gateway ↔ Ollama connection established

**Actual Result**:
The system established a successful end-to-end connection between the Outlook add-in, WebSocket gateway, and local Ollama model.

**Status**: Passed

---

## TC-09: Empty / Unreadable Email Body

**Objective**: Verify system handles missing email content

**Method**: Edge Case / Manual Test  

**Steps**:
1. Open an email with minimal or no body content
2. Open the add-in

**Expected Result**:
- No crashes occur
- UI loads normally

**Actual Result**:
The system handled emails with minimal or missing body content without crashing. The add-in remained functional and continued to display available metadata.

**Status**: Passed

---

## TC-11: Very Long Email Body

**Objective**: Verify system handles large email inputs

**Method**: Edge Case / Manual Test  

**Steps**:
1. Open an email with large body content (~3000 characters)
2. Open the add-in

**Expected Result**:
- No freezing or crashes occur

**Actual Result**:
The system successfully handled long email content without performance degradation or UI failure, indicating stable handling of large inputs.

**Status**: Passed

---

## TC-12: Gateway / Model Unavailable

**Objective**: Verify system behaviour when backend services are offline

**Method**: Edge Case / Integration Test  

**Steps**:
1. Stop the OpenClaw gateway (Ctrl + C in terminal)
2. Refresh Outlook
3. Attempt to use the add-in

**Expected Result**:
- System shows disconnected state

**Actual Result**:
When the OpenClaw Gateway was unavailable, the system correctly displayed a disconnected state and prevented further interaction, demonstrating safe failure behaviour.

**Status**: Passed

---

## TC-14: Privacy and Data Handling

**Objective**: Verify sensitive data is handled securely

**Method**: Manual / Security Review  

**Steps**:
1. Observe system behaviour during usage
2. Check UI and logs for exposed data

**Expected Result**:
- No sensitive data stored or exposed

**Actual Result**:
No sensitive email content or authentication tokens were visibly stored or exposed within the interface or logs. All processing remained local, aligning with privacy requirements.

**Status**: Passed
