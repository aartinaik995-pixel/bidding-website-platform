// Live Gmail test. Runs only when GMAIL_LIVE_TEST=1 and EMAIL_ENABLED=true (both
// set by the manual live-sandbox workflow). Sends one test email to GMAIL_USER.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { sendEmail } from "../src/lib/email.server";

const live =
  process.env.GMAIL_LIVE_TEST === "1" && process.env.EMAIL_ENABLED === "true";

describe(
  "Gmail SMTP (live)",
  { skip: !live && "set GMAIL_LIVE_TEST=1 and EMAIL_ENABLED=true to run" },
  () => {
    it("sends one test email through Gmail and gets acceptance", async () => {
      const to = process.env.GMAIL_USER ?? "";
      const result = await sendEmail(to, {
        subject: "BidMySite Gmail SMTP test",
        text: "This is an automated test message from the BidMySite live-sandbox workflow. No action is needed.",
      });
      assert.equal(result, "sent");
    });
  },
);
