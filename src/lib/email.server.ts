// Gmail SMTP sender. Server-only.
//
// Uses Node's built-in TLS socket, so it needs no npm package. Nothing is sent
// unless EMAIL_ENABLED="true" and GMAIL_USER and GMAIL_APP_PASSWORD are set. The connection always
// uses TLS with certificate verification to smtp.gmail.com:465. The result is
// "sent" only after Gmail accepts the message with a 250 reply.
//
// Create the app password at https://myaccount.google.com/apppasswords (it
// needs 2-Step Verification). Use the 16-character app password, not the
// normal Gmail password.

import { randomUUID } from "node:crypto";
import type { Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";

import type { EmailMessage } from "./notifications";

const SMTP_HOST = "smtp.gmail.com";
const SMTP_PORT = 465;
const TIMEOUT_MS = 20_000;
const EHLO_NAME = "bidmysite";

export type EmailResult = "sent" | "skipped";

export type GmailConfig = { user: string; pass: string };

/** Reads the Gmail settings. Returns null, which disables email, unless both are set. */
export function gmailConfig(
  env: Record<string, string | undefined>,
): GmailConfig | null {
  // Email stays off until EMAIL_ENABLED is set to "true", even with credentials present.
  if (env.EMAIL_ENABLED !== "true") return null;
  const user = env.GMAIL_USER?.trim() ?? "";
  // Google shows app passwords with spaces; the spaces are not part of the password.
  const pass = (env.GMAIL_APP_PASSWORD ?? "").replace(/\s+/g, "");
  if (!user || !pass) return null;
  return { user, pass };
}

const ADDRESS = /^[^@\s<>,;:"]+@[^@\s<>,;:"]+\.[^@\s<>,;:"]+$/;

function checkAddress(address: string, label: string): string {
  const value = address.trim();
  if (!ADDRESS.test(value) || /[\r\n]/.test(value))
    throw new Error(`The ${label} email address is not valid.`);
  return value;
}

/** Keeps header text on one line and encodes non-ASCII text. */
function encodeHeader(text: string): string {
  const single = text.replace(/[\r\n]+/g, " ").trim();
  if (/^[\x20-\x7e]*$/.test(single)) return single;
  return `=?UTF-8?B?${Buffer.from(single, "utf8").toString("base64")}?=`;
}

/** Builds an RFC 5322 message. Body lines starting with "." are dot-stuffed. */
export function buildMessage(
  from: string,
  to: string,
  message: EmailMessage,
  now = new Date(),
): string {
  const domain = from.split("@")[1] ?? "localhost";
  const headers = [
    `From: BidMySite <${from}>`,
    `To: ${to}`,
    `Subject: ${encodeHeader(message.subject)}`,
    `Date: ${now.toUTCString()}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
  ];
  const body = message.text
    .split(/\r?\n/)
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
  return `${headers.join("\r\n")}\r\n\r\n${body}\r\n`;
}

/** Reads SMTP replies line by line. Multi-line replies use "250-" until the last "250 " line. */
class ReplyReader {
  private buffer = "";
  private lines: string[] = [];
  private waiting: {
    resolve: (line: string) => void;
    reject: (e: Error) => void;
  }[] = [];
  private failure: Error | null = null;

  constructor(socket: Socket) {
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      this.buffer += chunk;
      let end = this.buffer.indexOf("\r\n");
      while (end !== -1) {
        this.push(this.buffer.slice(0, end));
        this.buffer = this.buffer.slice(end + 2);
        end = this.buffer.indexOf("\r\n");
      }
    });
    socket.on("error", (error) => this.fail(error));
    socket.on("close", () =>
      this.fail(new Error("The mail server closed the connection.")),
    );
    socket.on("timeout", () => {
      this.fail(new Error("The mail server timed out."));
      socket.destroy();
    });
  }

  private push(line: string) {
    const waiter = this.waiting.shift();
    if (waiter) waiter.resolve(line);
    else this.lines.push(line);
  }

  private fail(error: Error) {
    this.failure ??= error;
    for (const waiter of this.waiting.splice(0)) waiter.reject(error);
  }

  private next(): Promise<string> {
    const line = this.lines.shift();
    if (line !== undefined) return Promise.resolve(line);
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) =>
      this.waiting.push({ resolve, reject }),
    );
  }

  async reply(): Promise<number> {
    for (;;) {
      const line = await this.next();
      const code = Number(line.slice(0, 3));
      if (line.length < 4 || line[3] !== "-") return code;
    }
  }
}

class SmtpRejected extends Error {
  constructor(readonly code: number) {
    super(
      code === 530 || code === 534 || code === 535
        ? "Gmail rejected the login. Check GMAIL_USER and GMAIL_APP_PASSWORD."
        : `The mail server rejected the message (SMTP ${code}).`,
    );
  }
}

async function command(
  socket: Socket,
  replies: ReplyReader,
  line: string,
  accepted: number[],
): Promise<void> {
  socket.write(`${line}\r\n`);
  const code = await replies.reply();
  if (!accepted.includes(code)) throw new SmtpRejected(code);
}

/**
 * Sends one plain-text email through Gmail. Returns "skipped" without a
 * connection when email is not configured. Otherwise it resolves with "sent"
 * only after Gmail accepts the message, and rejects on any failure.
 *
 * `open` exists only so tests can point the client at a local server. Production
 * never passes it, so the connection always uses verified TLS.
 */
export async function sendEmail(
  to: string,
  message: EmailMessage,
  options: { open?: () => Socket } = {},
): Promise<EmailResult> {
  const config = gmailConfig(process.env);
  if (!config) return "skipped";

  const recipient = checkAddress(to, "recipient");
  const from = checkAddress(config.user, "sender");

  const socket = options.open
    ? options.open()
    : tlsConnect({ host: SMTP_HOST, port: SMTP_PORT, servername: SMTP_HOST });
  socket.setTimeout(TIMEOUT_MS);
  const replies = new ReplyReader(socket);

  try {
    const greeting = await replies.reply();
    if (greeting !== 220) throw new SmtpRejected(greeting);
    await command(socket, replies, `EHLO ${EHLO_NAME}`, [250]);
    await command(socket, replies, "AUTH LOGIN", [334]);
    await command(
      socket,
      replies,
      Buffer.from(config.user).toString("base64"),
      [334],
    );
    await command(
      socket,
      replies,
      Buffer.from(config.pass).toString("base64"),
      [235],
    );
    await command(socket, replies, `MAIL FROM:<${from}>`, [250]);
    await command(socket, replies, `RCPT TO:<${recipient}>`, [250, 251]);
    await command(socket, replies, "DATA", [354]);
    socket.write(`${buildMessage(from, recipient, message)}.\r\n`);
    const accepted = await replies.reply();
    if (accepted !== 250) throw new SmtpRejected(accepted);
    socket.write("QUIT\r\n");
    return "sent";
  } finally {
    socket.destroy();
  }
}
