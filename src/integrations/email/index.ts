import nodemailer from "nodemailer";
import { emailConfig } from "@/lib/config";

export type OutgoingEmail = { to: string; subject: string; html: string; text: string };
export type SendResult =
  | { status: "sent"; providerMessageId: string | null }
  | { status: "captured_demo" }
  | { status: "blocked_unconfigured"; reason: string };

export interface EmailAdapter {
  send(msg: OutgoingEmail): Promise<SendResult>;
}

class SmtpAdapter implements EmailAdapter {
  private transport;
  constructor(private cfg: Extract<ReturnType<typeof emailConfig>, { provider: "smtp" }>) {
    this.transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    });
  }
  async send(msg: OutgoingEmail): Promise<SendResult> {
    const info = await this.transport.sendMail({ from: this.cfg.from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
    return { status: "sent", providerMessageId: info.messageId ?? null };
  }
}

/** DEMO: message is stored in the outbox as "captured_demo" and is NOT delivered. Never "sent". */
class DemoCaptureAdapter implements EmailAdapter {
  async send(): Promise<SendResult> {
    return { status: "captured_demo" };
  }
}

class UnconfiguredAdapter implements EmailAdapter {
  constructor(private reason: string) {}
  async send(): Promise<SendResult> {
    return { status: "blocked_unconfigured", reason: this.reason };
  }
}

let override: EmailAdapter | null = null;
/** Test hook: inject a failing/mock transport. */
export function setEmailAdapterForTests(a: EmailAdapter | null) {
  override = a;
}

export function getEmailAdapter(): EmailAdapter {
  if (override) return override;
  const cfg = emailConfig();
  if (cfg.provider === "smtp") return new SmtpAdapter(cfg);
  if (cfg.provider === "demo") return new DemoCaptureAdapter();
  return new UnconfiguredAdapter(cfg.reason);
}
