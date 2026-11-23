# GrainGuard V2.0 — International deployment and commissioning runbook

This is the one-time deployment sequence for a customer organisation. Use a private repository, an organisation-owned Supabase project and provider accounts controlled by the organisation. Complete the sections in order; do not enter real grain records until the acceptance test passes.

## A. Decisions and credentials the organisation must supply

Before deployment, the organisation's IT/security owner should confirm:

- Production domain or GitHub Pages URL and repository administrator.
- Supabase project owner, approved region, database backup and Auth/SMTP administrator.
- Organisation name, countries, warehouse locations, time zones and staff roster/roles.
- Whether public reporting will be opened and the contact/triage department.
- Provider accounts and approvals: Africa's Talking (USSD/SMS), Mailgun receiving domain/API credentials, Meta business/app/assets, Telegram bot.
- Data retention, privacy notice, consent language, contact escalation, data-processing agreements, cross-border transfer requirements and incident response procedure.

Do not send private keys or passwords by email or paste them into GitHub. Enter provider credentials only in the administrator-only Communication Centre over HTTPS.

## B. Deploy the static website

1. Download/extract the GrainGuard V2.0 package.
2. Create or use the organisation's private GitHub repository. Copy the **contents** of this source folder into the repository root; preserve hidden `.github` and `.nojekyll` files.
3. In **Settings → Pages**, set source to **GitHub Actions**.
4. Commit to the `main` branch. The `pages.yml` workflow publishes the static app.
5. Open the HTTPS URL. Confirm index.html loads and that the browser console shows no missing local asset.

The frontend uses external Supabase JS and Chart.js modules loaded from public CDNs. The website needs an internet connection for cloud/auth and those dependencies.

## C. Provision Supabase

1. Create a dedicated project in a region selected under the organisation's data-residency/security policy. Check the Supabase data-processing terms and the organisation's regulatory obligations before storing personal or commercially sensitive data.
2. Back up an existing V1.3 project and export legacy browser-only records from each device that holds them.
3. Open **SQL Editor** as the project database owner and run `supabase/schema.sql` once. The schema contains the V1.3 tenant baseline and the V2.0 multi-warehouse/community extension in separate transactions; for an already-migrated V1.3 database, rerun only according to the comments and check constraints/columns before reapplying. If the target project is already partially at V2.0, have a database administrator inspect its migration state first rather than guessing.
4. Verify the script completes. Confirm `warehouses`, `warehouse_members`, `communication_channels`, `integration_secrets`, `community_reports`, `community_report_updates` and relevant RPCs exist. Keep RLS enabled.
5. In Supabase **Authentication → URL Configuration**, set the production Site URL and allowed redirect URL(s) to the actual HTTPS site. Enable email confirmation/password policy as required by the organisation.
6. Configure custom SMTP in Supabase Auth for account confirmation and password reset. GrainGuard does not send staff invitation-code emails automatically; administrators securely share generated invitation codes.
7. Configure MFA/strong password rules if required by the organisation's identity policy.

### Edge Function deployment

`supabase/config.toml` deliberately sets `verify_jwt = false` because the function also receives public provider callbacks. The function validates JWT and role for every administrative action itself. Do not remove `requireUser` checks or put the Supabase service key in the browser.

Install Supabase CLI and run from the repository root:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Generate once, store securely in the password vault and keep a protected backup.
openssl rand -base64 32

# Set the generated value as the encryption key. Do not commit it.
supabase secrets set GRAINGUARD_ENCRYPTION_KEY='PASTE_GENERATED_BASE64_32_BYTE_VALUE'

# Deploy the function and configuration.
supabase functions deploy grain-gateway --project-ref YOUR_PROJECT_REF
```

Supabase supplies `SUPABASE_URL` and the service-role secret to Edge Functions. The frontend uses only the project's public anon/publishable key. If your Supabase project uses a separate publishable key, the app's public key field accepts it. Keep the encryption key stable: rotating or losing it without decrypt/re-encrypt migration will make existing integration credentials unreadable.

The optional GitHub Actions workflow `deploy-edge.yml` is manual. Add repository Actions secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID` and `SUPABASE_DB_PASSWORD` to enable it. The database password is required to make `supabase link` non-interactive in CI. Never add the service-role key to GitHub workflow secrets for a public frontend deployment; the CLI uses a Supabase personal access token and project ref to deploy the function.

## D. Connect the application and create the organisation

1. Open the deployed website and go to **Settings & integrations**.
2. Enter the Supabase Project URL (`https://<project-ref>.supabase.co`) and public anon/publishable key; choose Connect.
3. Create the organisation with the organisation's legal/operating name. The first signed-in user becomes Owner and a default Main Warehouse is created automatically.
4. Add each other warehouse under **Warehouses & locations**. Use ISO 3166-1 alpha-2 country codes and IANA time-zone names. Enter coordinates only if the organisation has verified them.
5. Invite staff using their exact sign-in email. Select Owner/Admin/Operator/Viewer as applicable; invitations are generated as short-lived codes and must be shared privately.
6. Plan site assignments before assigning the first staff member. Before the first row exists, members retain organisation-wide access. After the first row, each non-admin must be assigned to one or more warehouses. Owners/admins remain global.
7. Verify each role/site with test accounts. Do not onboard the full organisation until read/write access is correct.
8. Use the explicit **Import local records** path for records trapped in old browsers; review counts and sample records. Keep original backups until verified.

## E. Enable public community reporting

1. Sign in as Owner/Admin and open **Community reports & incidents**.
2. Leave public intake disabled while configuring the service; this is the database default for new organisations.
3. Set the public contact/department name and enable reporting when the organisation is ready.
4. Copy the generated public reporting link. It carries the organisation routing ID and public anon/publishable key—not a service-role credential. Share it only where the organisation's privacy notice and incident handling process are ready.
5. Submit a test report. Confirm it receives a reference number, appears in the correct organisation's inbox and is restricted by warehouse assignment after routing.
6. Disable the portal immediately if it is being spammed or the organisation pauses intake.

The app performs basic rate limiting; this is not a substitute for a managed WAF, abuse monitoring, privacy/legal review or operational moderation.

## F. Configure the communication channels

Open **Communication & Community Intelligence Centre**. It displays callback URLs based on the connected Supabase project. Use administrator credentials only. Blank password fields on a later save retain the existing encrypted value; replacing a credential requires entering a new one. Credentials are encrypted by the Edge Function using `GRAINGUARD_ENCRYPTION_KEY`.

### 1. USSD — Africa's Talking

Required: provider account, approved service/short code, username and API key.

1. Obtain the code from the provider; GrainGuard cannot allocate it.
2. Enter the allocated service code(s), provider username and API key under USSD. Generate a strong callback token and save the channel.
3. Copy the **complete secured USSD callback URL**, including its `?token=...` query string, using the Copy button. The token is stored encrypted server-side and is not redisplayed from the database after a page reload. Save the token and full URL in the organisation's approved secrets vault. If it is lost, generate and save a replacement, then update the provider callback immediately.
4. In the Africa's Talking dashboard, configure the complete token-bearing callback URL against every allocated service code. The provider must preserve the query string when calling GrainGuard. Keep this URL private because it contains the shared callback secret.
5. Dial the real code from a test handset. Test one report category, enter a location and brief description, then record the returned `GG-YYYYMMDD-XXXXXX` reference.
6. Check that the incident arrives in the right organisation inbox and that the USSD sender can use the reference lookup menu.

The callback expects Africa's Talking form fields such as `serviceCode`, `sessionId`, `phoneNumber` and accumulated `text`. The menu is text-based and returns `CON`/`END` responses. Use the organisation's actual provider test/production environment and verify service pricing/coverage for each country.

### 2. Email — Mailgun inbound and outbound

Required: a Mailgun receiving domain, working DNS/MX records, receiving address at that domain, private API key, webhook signing key and sender address for replies.

1. Configure a Mailgun receiving domain (US or EU region) and publish the MX records Mailgun specifies.
2. Enter the full receiving address, exact receiving domain, region, Mailgun private API key and webhook signing key. Enter a verified sender address for outbound email.
3. Save, then click **Create / verify inbound route**. GrainGuard calls the Mailgun Routes API to forward matching recipient messages to `/webhooks/mailgun` and stop further route processing.
4. Send a real email from an external mailbox. Confirm provider webhook delivery, signature acceptance, reference code creation and receipt in the organisation inbox.
5. Confirm the sender receives the automatic acknowledgement. Test a later staff public reply from the incident screen.
6. Record the provider message ID and route ID in the organisation's configuration log (never the API key).

The inbound webhook checks Mailgun's timestamp/token HMAC signature with a 15-minute freshness window. Reject and investigate requests that fail validation.

### 3. SMS — Africa's Talking outbound

Required: provider username/API key and sender ID approval where required.

1. Save username, API key and approved sender ID (optional where provider supports the default).
2. Run **Check setup**. This validates account credentials only; it does not prove message delivery.
3. Send an actual report notification to an authorised test number in E.164 format and confirm delivery with the handset/provider logs.

This release uses SMS for outbound acknowledgements/replies. Inbound SMS-to-report conversion is not implemented; use USSD, email, web form, WhatsApp, Facebook/Instagram or Telegram for inbound community messages.

### 4. WhatsApp, Facebook Messenger and Instagram — Meta

Required: Meta Developer app, organisation-owned business assets, approved access token(s), App Secret, webhook verify token, app and asset IDs, and the permissions/review status required by Meta for the intended users and regions.

1. Configure an app in Meta for the organisation and add the required Webhooks/Messaging products.
2. Enter App ID, App Secret, webhook verify token, WhatsApp Business Account ID, WhatsApp phone-number ID, WhatsApp system-user access token, Facebook Page ID, Instagram professional account ID and Page access token as appropriate.
3. Save the Meta channel and click **Register Meta subscriptions**. The backend requests supported App/Page/WABA subscriptions with the supplied access tokens.
4. In Meta Developer dashboard, add the exact callback URL from GrainGuard and the same verify token. Subscribe the app to the required Page/Instagram/WhatsApp message fields. Verify that the app's business assets and permissions grant the intended access; the in-app action cannot approve the Meta app or grant permissions on behalf of Meta.
5. Test inbound messages from non-admin personal accounts. Confirm the signed webhook creates the correct source type and the sender receives an acknowledgement where permitted.
6. Test a staff public reply within the platform's allowed messaging window. If an API token or permission expires, refresh it in Meta and replace it in GrainGuard.

Meta webhook POSTs require a valid `X-Hub-Signature-256` calculated using the app secret. The same webhook URL may receive several subscribed object types; make sure the correct app-level subscriptions are active. API permissions, app review, quality checks, recipient eligibility and messaging windows are determined by Meta and can change.

### 5. Telegram

1. Create the bot in Telegram with BotFather.
2. Enter the exact bot token and a strong random webhook secret in the Telegram section; save/register.
3. GrainGuard calls Telegram `setWebhook` using the callback URL with the organisation ID and the secret-token header.
4. Send a message to the bot; confirm a community report/reference and automatic reply.
5. Test a staff public reply and verify it reaches the same chat.

### 6. Social handles

Save the official WhatsApp click-to-chat, Facebook, Instagram, X, TikTok and LinkedIn HTTPS URLs. These appear as public contact links on the website's public reporting page. A link is not equivalent to a private inbox integration: X, TikTok and LinkedIn DM ingestion is not supported in this release.

## G. International and enterprise operational controls

Before production go-live, the organisation should complete:

- **Data residency:** approve Supabase project region and review where the organisation's data and provider webhook data are processed.
- **Privacy/legal:** define purpose, lawful basis/consent where required, privacy notice, retention schedule, data-subject request process, cross-border transfer safeguards and controller/processor responsibilities.
- **Identity:** enforce individual accounts, MFA where available, account offboarding, password-reset SMTP and an administrator roster.
- **Network/security:** restrict Supabase/GitHub admin accounts; rotate provider tokens where needed; monitor Edge Function logs and provider security events; never share secret keys.
- **Backups/continuity:** schedule database backups, store encrypted exports, test a restore, document provider outage/manual phone fallback and incident escalation.
- **Service governance:** set support contacts, incident severity, response targets, escalation routes, provider cost limits and service-level expectations.
- **Field safety:** validate sensor measurements, calibrate instruments, establish grain sampling/placement SOPs and train staff.

This source release does not itself provide an enterprise SLA, ISO 27001/SOC 2 certification, GDPR certification, penetration-test report or legal opinion. The organisation must review these requirements before placing regulated or highly sensitive data in the service.

## H. Commissioning and acceptance tests

Complete and sign the following with named testers:

| Test | Pass evidence |
|---|---|
| Cloud sign-in | Owner signs in; Auth redirect and email confirmation work |
| Organisation | One organisation and default Main Warehouse created |
| Multi-warehouse | Two or more sites with distinct country/time zones; site filter displays only selected-site records |
| Tenant isolation | User from organisation A cannot query organisation B records or provider config |
| Warehouse isolation | Non-admin assigned to Site A cannot query Site B records or Site B report updates |
| Role enforcement | Viewer cannot write; operator cannot invite or change integrations; admin permissions match policy |
| Community portal | Enabled public URL accepts one report; disabled portal rejects it |
| USSD | Dial-in callback works and creates a report; rate limit and status lookup tested |
| Email | Mailgun route and signed webhook work; acknowledgement and staff reply tested |
| SMS | Provider accepts API call and actual handset receives SMS |
| Meta | Signed WhatsApp/FB/IG webhooks create correct source reports; supported reply works |
| Telegram | Webhook registration, inbound report and outbound reply work |
| Sync recovery | Loss/recovery of network retains and resends accepted changes without silent queue loss |
| Hardware | Sensor reference checks, calibration log, stale data and disconnection tests passed |
| Backup | Export opens; Supabase backup/restore procedure is documented and tested |

A channel should be marked operational only after its corresponding live message test succeeds. Keep a separate sign-off sheet listing provider account IDs, configuration date, callback status, tester, sample reference and outstanding errors. Never record passwords, private API keys or tokens in that sheet.

## I. Troubleshooting quick reference

- **Gateway health returns 503:** confirm Supabase Edge Function has `SUPABASE_URL`, service-role secret and `GRAINGUARD_ENCRYPTION_KEY`.
- **Cannot save provider secrets:** confirm the encryption key is a base64 string decoding to exactly 32 bytes, and the admin action is signed in with Owner/Admin role.
- **USSD code reaches provider but not app:** check service-code callback URL, exact code spacing, provider environment and Edge Function logs.
- **Mailgun webhook gets 401:** check webhook signing key, exact recipient address, region and server time; do not disable signature verification.
- **Meta webhook gets 401:** check App Secret, app-level verify token, subscribed object/entry IDs and access token/page/phone IDs.
- **Telegram webhook gets 401:** re-register after correcting token/secret; ensure Telegram is sending the correct secret-token header.
- **Staff cannot see a warehouse:** check organisation role and `warehouse_members` assignments after site-assignment mode is enabled.
- **Records not syncing:** inspect the queue and Supabase logs; preserve local export and resolve schema or permission error before retrying.

## References

- Supabase Edge Function secrets: https://supabase.com/docs/guides/functions/secrets
- Supabase Edge Function deploy: https://supabase.com/docs/guides/functions/deploy
- Africa's Talking USSD: https://developers.africastalking.com/docs/ussd/overview
- Mailgun Routes API: https://documentation.mailgun.com/docs/mailgun/api-reference/openapi-final/tag/Routes/
- Meta Webhooks: https://developers.facebook.com/docs/graph-api/webhooks/
- Telegram Bot API: https://core.telegram.org/bots/api


## V2.0.1 — Headquarters / site synchronisation acceptance

1. Re-deploy the updated `index.html` to the same website URL. Apply the updated `supabase/schema.sql` publication section (or run the complete approved migration according to the migration notes).
2. Confirm the tables `grain_readings`, `grain_batches`, `grain_moisture_records`, `lab_validation_records`, `warehouses` and `community_reports` are members of the `supabase_realtime` publication.
3. Sign in as Owner/Admin: Overview should start in **All warehouses** mode and show all warehouses returned by the organisation RLS policies.
4. Sign in as a Warehouse 001 operator on a separate device/browser: the same website opens the operator's permitted warehouse view. Save a test batch.
5. Confirm the Owner/Admin dashboard updates the Warehouse 001 row automatically while the cloud connection shows `SUBSCRIBED`. Use **Refresh network** if a browser/network interrupts realtime.
6. Sign in as Warehouse 002 operator and verify they cannot read or change Warehouse 001 data. This must be verified with separate real test accounts, not by changing a dropdown as one user.
7. Verify the browser console, Supabase logs, RLS behaviour, offline queue retry and sensor-to-warehouse association before production use.
