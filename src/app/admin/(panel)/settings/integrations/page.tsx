import { desc } from "drizzle-orm";
import { PageHeader, Panel, Table, Td, Badge } from "@/components/admin/ui";
import { db } from "@/db";
import { jobRuns } from "@/db/schema";
import { outboxHealth } from "@/domain/notifications";
import { analyticsConfig, appEnv, channelConfig, emailConfig, isDemoMode, paymentConfig, publicBaseUrl, requireOwnerMfa, storageConfig } from "@/lib/config";
import { formatDateTime } from "@/lib/dates";
import { requireStaffPage } from "@/lib/staff";

export const metadata = { title: "Integrations" };

export default async function Integrations() {
  await requireStaffPage("settings.manage");
  const pay = paymentConfig();
  const mail = emailConfig();
  const store = storageConfig();
  const jobs = await db.select().from(jobRuns).orderBy(desc(jobRuns.lastStartedAt));
  const outbox = await outboxHealth();
  const base = publicBaseUrl();
  const row = (name: string, ok: boolean, detail: string) => (
    <tr key={name}><Td className="font-medium">{name}</Td><Td><Badge value={ok ? "active" : "failed"} label={ok ? "configured" : "not configured"} /></Td><Td className="text-xs">{detail}</Td></tr>
  );
  return (
    <>
      <PageHeader title="Integrations & health" subtitle={`Environment: ${appEnv()}${isDemoMode() ? " · DEMO MODE" : ""}. Secrets are set as server environment variables and are never shown here.`} />
      <Table head={["Integration", "Status", "Details"]}>
        {row("Payment gateway", pay.provider === "razorpay", pay.provider === "none" ? pay.reason : pay.provider === "demo" ? "DEMO adapter — simulated payments only" : `Razorpay ${pay.mode} · webhook secret ${pay.webhookSecret ? "set" : "MISSING"}`)}
        {row("Transactional email", mail.provider === "smtp", mail.provider === "none" ? mail.reason : mail.provider === "demo" ? "DEMO capture — not delivered" : `SMTP ${mail.host}:${mail.port} from ${mail.from}`)}
        {row("Media storage", store.provider === "s3" || store.provider === "db", store.provider === "none" ? store.reason : store.provider === "local" ? "Local disk (development only)" : store.provider === "db" ? "Database (Supabase Postgres) — persistent" : `S3 bucket ${store.bucket}`)}
        {row("Channel manager / PMS", false, channelConfig().note)}
        {row("Analytics", analyticsConfig().provider !== "none", analyticsConfig().provider === "none" ? "Disabled" : `${analyticsConfig().provider} (consent-gated, no personal data)`)}
        {row("Owner MFA enforcement", requireOwnerMfa(), requireOwnerMfa() ? "Owners must use TOTP" : "Not enforced in this environment")}
      </Table>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Endpoints to configure">
          <ul className="space-y-2 text-sm">
            <li>Razorpay webhook: <code className="break-all">{base}/api/webhooks/razorpay</code> (events: payment.captured, payment.failed, payment.authorized, order.paid, refund.processed, refund.failed)</li>
            <li>Scheduler (every 1–5 min): <code className="break-all">{base}/api/cron/all</code> with header <code>Authorization: Bearer $CRON_SECRET</code></li>
            <li>Uptime monitor: <code>{base}/api/health</code></li>
          </ul>
        </Panel>
        <Panel title="Outbox">
          <ul className="text-sm">{Object.entries(outbox).map(([k, v]) => <li key={k} className="flex justify-between"><Badge value={k} /> <span>{v}</span></li>)}</ul>
        </Panel>
      </div>
      <Panel title="Background jobs" className="mt-6">
        <Table head={["Job", "Last start", "Last finish", "Status", "Result / error"]} empty="Jobs have not run yet — configure the scheduler or run `npm run worker`.">
          {jobs.map((j) => <tr key={j.job}><Td>{j.job}</Td><Td className="text-xs">{formatDateTime(j.lastStartedAt)}</Td><Td className="text-xs">{formatDateTime(j.lastFinishedAt)}</Td><Td>{j.lastStatus && <Badge value={j.lastStatus === "ok" ? "active" : "failed"} label={j.lastStatus} />}</Td><Td className="max-w-[360px] truncate text-xs">{j.lastError ?? JSON.stringify(j.lastResult)}</Td></tr>)}
        </Table>
      </Panel>
    </>
  );
}
