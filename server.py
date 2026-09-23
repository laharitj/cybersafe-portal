import json
import os
import secrets
import smtplib
from datetime import datetime, timezone
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse
from dotenv import load_dotenv
load_dotenv()

HOST = "127.0.0.1"
PORT = int(os.getenv("RESET_PORT", "0"))
REQUESTS_FILE = Path(__file__).with_name("reset_requests.json")


def build_reset_url(token):
    encoded_token = quote(token, safe="")
    return f"laharivault://reset?token={encoded_token}"


def send_email(email, token):
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    from_email = os.getenv("RESET_FROM_EMAIL", smtp_user or "")

    if not all((smtp_host, smtp_user, smtp_password, from_email)):
        return False

    reset_url = build_reset_url(token)
    plain_text = (
        "A LahariVault password reset was requested for this email.\n\n"
        f"Reset link: {reset_url}\n\n"
        f"Reset token: {token}\n\n"
        "Open the link above or enter the token in the app."
    )
    html = f"""
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
        <p>A LahariVault password reset was requested for this email.</p>
        <p><a href="{reset_url}" style="color: #2563eb; font-weight: bold;">Reset your password</a></p>
        <p>Reset token: <code>{token}</code></p>
        <p>Open the link above or enter the token in the app.</p>
      </body>
    </html>
    """

    message = EmailMessage()
    message["Subject"] = "LahariVault password reset request"
    message["From"] = from_email
    message["To"] = email
    message.set_content(plain_text)
    message.add_alternative(html, subtype="html")

    with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as smtp:
        smtp.starttls()
        smtp.login(smtp_user, smtp_password)
        smtp.send_message(message)

    return True


def save_request(email, token):
    requests = []
    if REQUESTS_FILE.exists():
        try:
            requests = json.loads(REQUESTS_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            requests = []

    requests.append({
        "email": email,
        "token": token,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    REQUESTS_FILE.write_text(json.dumps(requests, indent=2), encoding="utf-8")


class ResetHandler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self.send_json(200, {"status": "ok"})
            return

        if parsed.path == "/reset":
            params = parse_qs(parsed.query)
            token = params.get("token", [""])[0]
            html = f"""
            <html>
              <head><title>LahariVault Password Reset</title></head>
              <body style="font-family: Arial, sans-serif; padding: 2rem; color: #111827;">
                <h2>Password reset</h2>
                <p>Use this token in the LahariVault app:</p>
                <p><strong>{token}</strong></p>
                <p>If you opened this from an email, copy the token and paste it into the app to complete the reset.</p>
              </body>
            </html>
            """.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(html)))
            self.end_headers()
            self.wfile.write(html)
            return

        self.send_json(404, {"error": "Not found"})

    def do_POST(self):
        if urlparse(self.path).path != "/forgot-password":
            self.send_json(404, {"error": "Not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            data = json.loads(self.rfile.read(length))
        except (ValueError, json.JSONDecodeError):
            self.send_json(400, {"error": "Invalid request"})
            return

        email = str(data.get("email", "")).strip()
        if "@" not in email or "." not in email.rsplit("@", 1)[-1]:
            self.send_json(400, {"error": "Enter a valid email address"})
            return

        token = secrets.token_urlsafe(32)
        try:
            save_request(email, token)
            sent = send_email(email, token)
        except (OSError, smtplib.SMTPException) as error:
            print(f"Reset email failed: {error}")
            self.send_json(500, {"error": "Could not send the reset email"})
            return

        self.send_json(200, {
            "message": "Reset email sent" if sent else "Reset request recorded",
            "email_sent": sent,
        })

    def log_message(self, format_string, *args):
        return


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), ResetHandler)
    actual_port = server.server_address[1]
    print(f"LahariVault reset server listening on http://{HOST}:{actual_port}", flush=True)
    server.serve_forever()
