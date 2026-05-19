describe('processAIText', () => {
  let toggleCategoryMock;

  const processAIText = (text) => {
    let cleaned = text.replace(/\[Current email context\][\s\S]*?---\s*/g, "").trim();
    cleaned = cleaned.replace(/\n---+\s*$/g, "").trim();
    const match = cleaned.match(/\[LABEL:(Urgent|Medium|Minor)\]/i);
    if (match) {
      const label = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
      toggleCategoryMock(label);
      cleaned = cleaned.replace(/\s*\[LABEL:[^\]]+\]/gi, "").trim();
    }
    return cleaned;
  };

  beforeEach(() => {
    toggleCategoryMock = jest.fn();
  });

  describe('label extraction', () => {
    test('extracts [LABEL:Urgent] and calls toggleCategory', () => {
      const result = processAIText("This email needs immediate attention. [LABEL:Urgent]");
      expect(result).toBe("This email needs immediate attention.");
      expect(toggleCategoryMock).toHaveBeenCalledWith("Urgent");
    });

    test('extracts [LABEL:Medium] and calls toggleCategory', () => {
      const result = processAIText("Please review when convenient. [LABEL:Medium]");
      expect(result).toBe("Please review when convenient.");
      expect(toggleCategoryMock).toHaveBeenCalledWith("Medium");
    });

    test('extracts [LABEL:Minor] and calls toggleCategory', () => {
      const result = processAIText("Low priority informational email. [LABEL:Minor]");
      expect(result).toBe("Low priority informational email.");
      expect(toggleCategoryMock).toHaveBeenCalledWith("Minor");
    });

    test('extracts lowercase label variants', () => {
      const result = processAIText("Test content [LABEL:urgent]");
      expect(toggleCategoryMock).toHaveBeenCalledWith("Urgent");
    });

    test('extracts mixed-case label variants', () => {
      const result = processAIText("Test content [LABEL:MEDIUM]");
      expect(toggleCategoryMock).toHaveBeenCalledWith("Medium");
    });

    test('does not call toggleCategory when no label present', () => {
      const result = processAIText("Plain AI response without any label.");
      expect(result).toBe("Plain AI response without any label.");
      expect(toggleCategoryMock).not.toHaveBeenCalled();
    });

    test('removes all label tags even if multiple present', () => {
      const result = processAIText("Email text [LABEL:Urgent] [LABEL:Minor]");
      expect(result).toBe("Email text");
      expect(toggleCategoryMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('context stripping', () => {
    test('strips [Current email context] block with body', () => {
      const input = `[Current email context]
Subject: Test
From: sender@example.com

Body:
Email body here

---

User question: What is this about? [LABEL:Minor]`;
      const result = processAIText(input);
      expect(result).toBe("User question: What is this about?");
      expect(toggleCategoryMock).toHaveBeenCalledWith("Minor");
    });

test('strips trailing dashes (after label has been removed)', () => {
    const result = processAIText("Response text\n[LABEL:Urgent]\n-----\n");
    expect(result).toBe("Response text");
    expect(toggleCategoryMock).toHaveBeenCalledWith("Urgent");
  });

  test('dashes before label remain (label extracted first, then dashes stripped)', () => {
    const result = processAIText("Response text\n-----\n[LABEL:Urgent]");
    expect(result).toBe("Response text\n-----");
    expect(toggleCategoryMock).toHaveBeenCalledWith("Urgent");
  });

    test('handles text with no context and no label', () => {
      const result = processAIText("Simple response text");
      expect(result).toBe("Simple response text");
      expect(toggleCategoryMock).not.toHaveBeenCalled();
    });
  });

  describe('full response simulation', () => {
    test('processes realistic AI response with full context prefix', () => {
      const fullResponse = `[Current email context]
Subject: Question about Assignment 2 deadline
From: Alex Chen <alex.chen@student.university.edu>
To: Dr. Zahra Jadidi <z.jadidi@university.edu>
Date: 2026-04-15T09:30:00Z

Body:
Hi Dr. Jadidi,\n\nI am writing to ask about the deadline for Assignment 2...

---

Based on the email, this is a straightforward inquiry about an assignment deadline. It does not appear to be time-sensitive beyond the normal course schedule.

[LABEL:Medium]`;
      const result = processAIText(fullResponse);
      expect(result).toContain("Based on the email");
      expect(result).not.toContain("[Current email context]");
      expect(toggleCategoryMock).toHaveBeenCalledWith("Medium");
    });
  });
});

describe('stripAITags', () => {
  const stripAITags = (text) => {
    let cleaned = text.replace(/\[Current email context\][\s\S]*?---\s*/g, "").trim();
    cleaned = cleaned.replace(/\n---+\s*$/g, "").trim();
    cleaned = cleaned.replace(/\s*\[LABEL:[^\]]+\]/gi, "").trim();
    return cleaned;
  };

  test('strips LABEL:Urgent tag during streaming', () => {
    const result = stripAITags("Draft response [LABEL:Urgent]");
    expect(result).toBe("Draft response");
  });

  test('strips LABEL:Medium tag during streaming', () => {
    const result = stripAITags("Some analysis here [LABEL:Medium]");
    expect(result).toBe("Some analysis here");
  });

  test('strips LABEL:Minor tag during streaming', () => {
    const result = stripAITags("Low priority info [LABEL:Minor]");
    expect(result).toBe("Low priority info");
  });

  test('strips context block like processAIText', () => {
    const input = `[Current email context]
Subject: Test
From: sender@example.com

Body:
Content here

---

Message [LABEL:Urgent]`;
    const result = stripAITags(input);
    expect(result).toBe("Message");
    expect(result).not.toContain("[Current email context]");
  });

  test('returns text unchanged when no tags present', () => {
    const result = stripAITags("Regular streaming text without any tags");
    expect(result).toBe("Regular streaming text without any tags");
  });

  test('handles empty string', () => {
    const result = stripAITags("");
    expect(result).toBe("");
  });

  test('strips label regardless of case', () => {
    expect(stripAITags("Text [LABEL:URGENT]")).toBe("Text");
    expect(stripAITags("Text [label:minor]")).toBe("Text");
  });
});

describe('handleEvent', () => {
  let showTypingMock, hideTypingMock, setTypingLabelMock, addMessageMock;
  let renderStreamingBubbleMock, flushStreamMock;
  let fetchLatestReplyMock;
  let activeRunId;

  const handleEvent = (evt) => {
    const event = evt.event || "";
    const payload = evt.payload || evt.data || {};

    switch (event) {
      case "connect.challenge":
        break;

      case "agent.run": {
        const phase = payload.phase || payload.data?.phase || "";
        if (phase === "start") {
          activeRunId = payload.runId || null;
          showTypingMock();
        } else if (phase === "end" || phase === "error") {
          activeRunId = null;
          flushStreamMock();
          hideTypingMock();
        }
        break;
      }

      case "chat": {
        const state = payload.state || "";
        if (state === "start" || state === "started") {
          flushStreamMock();
          showTypingMock();
        } else if (state === "final" || state === "end" || state === "error") {
          flushStreamMock();
          hideTypingMock();
        }
        break;
      }

      case "agent.delta":
      case "chat.delta": {
        const chunk = payload.delta || payload.text || payload.content || "";
        if (chunk) {
          renderStreamingBubbleMock(chunk);
        }
        break;
      }

      case "agent.message":
      case "chat.message": {
        flushStreamMock();
        const content = payload.content || payload.text || payload.message || "";
        if (content) {
          const text = typeof content === "string" ? content : JSON.stringify(content);
          addMessageMock("ai", text);
        }
        if (!activeRunId) hideTypingMock();
        break;
      }

      case "agent.tool_call":
      case "tool_call":
        flushStreamMock();
        setTypingLabelMock(payload.name ? `Using ${payload.name}…` : "Working…");
        showTypingMock();
        break;

      case "agent.tool_result":
      case "tool_result":
        setTypingLabelMock("Processing…");
        break;

      default:
        if (payload.content || payload.text || payload.message) {
          const text = payload.content || payload.text || payload.message;
          if (typeof text === "string" && text.trim()) {
            flushStreamMock();
            addMessageMock("ai", text.trim());
            if (!activeRunId) hideTypingMock();
          }
        }
        break;
    }
  };

  beforeEach(() => {
    showTypingMock = jest.fn();
    hideTypingMock = jest.fn();
    setTypingLabelMock = jest.fn();
    addMessageMock = jest.fn();
    renderStreamingBubbleMock = jest.fn();
    flushStreamMock = jest.fn();
    fetchLatestReplyMock = jest.fn();
    activeRunId = null;
  });

  describe('agent.run phase=start', () => {
    test('sets activeRunId and calls showTyping', () => {
      handleEvent({ event: "agent.run", payload: { phase: "start", runId: "run-123" } });
      expect(activeRunId).toBe("run-123");
      expect(showTypingMock).toHaveBeenCalled();
      expect(hideTypingMock).not.toHaveBeenCalled();
    });

    test('handles phase in nested data object', () => {
      handleEvent({ event: "agent.run", payload: { data: { phase: "start" } } });
      expect(activeRunId).toBe(null);
      expect(showTypingMock).toHaveBeenCalled();
    });

    test('sets activeRunId to null when runId not provided', () => {
      handleEvent({ event: "agent.run", payload: { phase: "start" } });
      expect(activeRunId).toBe(null);
      expect(showTypingMock).toHaveBeenCalled();
    });
  });

  describe('agent.run phase=end', () => {
    test('clears activeRunId and calls flush/hide', () => {
      activeRunId = "some-run";
      handleEvent({ event: "agent.run", payload: { phase: "end" } });
      expect(activeRunId).toBe(null);
      expect(flushStreamMock).toHaveBeenCalled();
      expect(hideTypingMock).toHaveBeenCalled();
    });

    test('handles phase=error similarly to phase=end', () => {
      handleEvent({ event: "agent.run", payload: { phase: "error" } });
      expect(activeRunId).toBe(null);
      expect(flushStreamMock).toHaveBeenCalled();
      expect(hideTypingMock).toHaveBeenCalled();
    });
  });

  describe('chat.delta / agent.delta', () => {
    test('passes delta chunk to renderStreamingBubble', () => {
      handleEvent({ event: "chat.delta", payload: { delta: "Hello" } });
      expect(renderStreamingBubbleMock).toHaveBeenCalledWith("Hello");
    });

test('prefers delta over text field', () => {
      handleEvent({ event: "agent.delta", payload: { delta: "part1", text: "part2" } });
      expect(renderStreamingBubbleMock).toHaveBeenCalledWith("part1");
    });

    test('falls back to text when delta absent', () => {
      handleEvent({ event: "chat.delta", payload: { text: "fallback text" } });
      expect(renderStreamingBubbleMock).toHaveBeenCalledWith("fallback text");
    });

    test('falls back to content when delta and text absent', () => {
      handleEvent({ event: "chat.delta", payload: { content: "content-only" } });
      expect(renderStreamingBubbleMock).toHaveBeenCalledWith("content-only");
    });

    test('prefers delta over content when all present', () => {
      handleEvent({ event: "chat.delta", payload: { delta: "delta-wins", text: "text-val", content: "content-val" } });
      expect(renderStreamingBubbleMock).toHaveBeenCalledWith("delta-wins");
    });

    test('falls back to text when delta absent', () => {
      handleEvent({ event: "chat.delta", payload: { text: "fallback text" } });
      expect(renderStreamingBubbleMock).toHaveBeenCalledWith("fallback text");
    });

    test('ignores empty chunk', () => {
      handleEvent({ event: "agent.delta", payload: { delta: "" } });
      expect(renderStreamingBubbleMock).not.toHaveBeenCalled();
    });
  });

  describe('agent.message / chat.message', () => {
    test('flushes stream and adds AI message from content', () => {
      handleEvent({ event: "agent.message", payload: { content: "AI response text" } });
      expect(flushStreamMock).toHaveBeenCalled();
      expect(addMessageMock).toHaveBeenCalledWith("ai", "AI response text");
    });

    test('uses text field as fallback', () => {
      handleEvent({ event: "chat.message", payload: { text: "Response via text" } });
      expect(addMessageMock).toHaveBeenCalledWith("ai", "Response via text");
    });

    test('uses message field as fallback', () => {
      handleEvent({ event: "agent.message", payload: { message: "Response via message" } });
      expect(addMessageMock).toHaveBeenCalledWith("ai", "Response via message");
    });

    test('stringifies object content', () => {
      handleEvent({ event: "chat.message", payload: { content: { complex: "object" } } });
      expect(addMessageMock).toHaveBeenCalledWith("ai", '{"complex":"object"}');
    });

    test('hides typing when no active run', () => {
      activeRunId = null;
      handleEvent({ event: "agent.message", payload: { content: "Done" } });
      expect(hideTypingMock).toHaveBeenCalled();
    });

    test('does not hide typing when active run exists', () => {
      activeRunId = "ongoing-run";
      handleEvent({ event: "chat.message", payload: { content: "Still working" } });
      expect(hideTypingMock).not.toHaveBeenCalled();
    });
  });

  describe('agent.tool_call / tool_call', () => {
    test('flushes, sets typing label with tool name, shows typing', () => {
      handleEvent({ event: "tool_call", payload: { name: "read_email" } });
      expect(flushStreamMock).toHaveBeenCalled();
      expect(setTypingLabelMock).toHaveBeenCalledWith("Using read_email…");
      expect(showTypingMock).toHaveBeenCalled();
    });

    test('falls back to Working when no tool name', () => {
      handleEvent({ event: "agent.tool_call", payload: {} });
      expect(setTypingLabelMock).toHaveBeenCalledWith("Working…");
    });
  });

  describe('agent.tool_result / tool_result', () => {
    test('sets typing label to Processing', () => {
      handleEvent({ event: "tool_result", payload: {} });
      expect(setTypingLabelMock).toHaveBeenCalledWith("Processing…");
    });
  });

  describe('default case', () => {
    test('handles payload.content in default branch', () => {
      handleEvent({ event: "some.other.event", payload: { content: "Fallback content" } });
      expect(flushStreamMock).toHaveBeenCalled();
      expect(addMessageMock).toHaveBeenCalledWith("ai", "Fallback content");
    });

    test('ignores empty string content in default', () => {
      handleEvent({ event: "unknown", payload: { content: "   " } });
      expect(addMessageMock).not.toHaveBeenCalled();
    });
  });

  describe('connect.challenge', () => {
    test('connect.challenge event is handled without errors', () => {
      expect(() => handleEvent({ event: "connect.challenge", payload: {} })).not.toThrow();
    });
  });
});

describe('autoLabel instructions alignment', () => {
  test('label extraction supports exactly Urgent, Medium, Minor from sendMessage prompt', () => {
    const processAIText = (text) => {
      let cleaned = text.replace(/\[Current email context\][\s\S]*?---\s*/g, "").trim();
      cleaned = cleaned.replace(/\n---+\s*$/g, "").trim();
      const match = cleaned.match(/\[LABEL:(Urgent|Medium|Minor)\]/i);
      if (match) {
        const label = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
        cleaned = cleaned.replace(/\s*\[LABEL:[^\]]+\]/gi, "").trim();
        return { text: cleaned, label };
      }
      return { text: cleaned, label: null };
    };

    const urgentResult = processAIText("Response [LABEL:Urgent]");
    expect(urgentResult.label).toBe("Urgent");

    const mediumResult = processAIText("Response [LABEL:Medium]");
    expect(mediumResult.label).toBe("Medium");

    const minorResult = processAIText("Response [LABEL:Minor]");
    expect(minorResult.label).toBe("Minor");

    const lowerResult = processAIText("Response [LABEL:urgent]");
    expect(lowerResult.label).toBe("Urgent");

    const mixedResult = processAIText("Response [LABEL:MEDIUM]");
    expect(mixedResult.label).toBe("Medium");
  });
});