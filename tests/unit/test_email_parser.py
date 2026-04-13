from app.services.email_parser import parse_graph_message


SAMPLE_MSG = {
    "id": "msg-001",
    "subject": "Hello World",
    "sender": {"emailAddress": {"name": "Alice", "address": "alice@example.com"}},
    "toRecipients": [{"emailAddress": {"name": "Bob", "address": "bob@example.com"}}],
    "body": {"contentType": "html", "content": "<p>Hi there</p>"},
    "receivedDateTime": "2024-01-01T10:00:00Z",
    "conversationId": "thread-001",
}


def test_parse_graph_message_basic():
    email = parse_graph_message(SAMPLE_MSG)
    assert email.message_id == "msg-001"
    assert email.subject == "Hello World"
    assert email.sender.address == "alice@example.com"
    assert len(email.recipients) == 1
    assert email.body_text == "Hi there"
    assert email.thread_id == "thread-001"


def test_parse_strips_html():
    msg = {**SAMPLE_MSG, "body": {"contentType": "html", "content": "<b>Bold</b> text"}}
    email = parse_graph_message(msg)
    assert "<b>" not in email.body_text
    assert "Bold" in email.body_text


def test_parse_plain_text_body():
    msg = {**SAMPLE_MSG, "body": {"contentType": "text", "content": "Plain text body"}}
    email = parse_graph_message(msg)
    assert email.body_text == "Plain text body"
    assert email.body_html is None
