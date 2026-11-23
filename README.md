# GrainGuard V2.0 — Organisation & International Pilot Release

**GrainGuard** is a grain-storage monitoring, evidence and community-incident platform. V2.0 consolidates the earlier V1.2/V1.3 work into one organisation-oriented release with multi-warehouse operations, staff access control, cloud synchronisation, sensor telemetry, community reporting and configurable communications.

> **Deployment status:** This ZIP is a deployable source release. It is not already connected to your organisation's Supabase project, provider accounts, USSD short code, email domain, Meta business app or physical sensors. Those accounts and credentials belong to the organisation and must be entered through the Communication Centre / deployment runbook. The code does not fake successful connection states.

## What is included

### Organisation operations
- One organisation can manage one warehouse or many warehouses in different cities and countries.
- Warehouse records include a site code, country, region, city, address, time zone, coordinates and contact details.
- Staff can select **All warehouses** or focus on an assigned site; dashboard, stock batches, telemetry, moisture evidence, validation records, reports and community incident views follow the selected site.
- Warehouse assignments can restrict non-admin staff to specific sites. Before the first site assignment, members have organisation-wide access. Once the first assignment is made, each non-admin must be assigned to one or more sites. Owners/admins retain organisation-wide access.
- Individual accounts and roles: Owner, Admin, Operator and Viewer. Site assignment and organisation role are separate controls.
- Member email addresses are disclosed to organisation owners/admins only through a controlled RPC; other users see role and account identifier only.
- Organisation activity log, exports and staff removal workflow.

### Grain monitoring and decision support
- Existing V1.x dashboard, batch inventory, sensor telemetry, validation and research modules are retained.
- ESP32 USB Serial and BLE telemetry, JSONL packet validation, device status/firmware display and missing-sensor handling remain in the release.
- Cloud sync queue retains rejected records for review rather than silently deleting them.
- Rule-based alerts, condition trends and ventilation decision support require physical evidence and a reviewed crop-specific EMC table.
- No fan, relay, actuator or automatic aeration control is implemented.

### Community reports and communication channels
All supported incoming channels write to one organisation-level incident inbox. Each report receives a reference code, source, time, location text, sender contact (when provided), category, status and optional matched warehouse.

| Channel | Incoming messages | Outgoing acknowledgement / reply | Requirements |
|---|---|---|---|
| Public website form | Yes | Not directly through the form; email/SMS if sender contact is supplied and configured | Enable the organisation's public portal and share its generated link |
| USSD | Yes, interactive menu | USSD completion message | Provider-assigned code and callback configuration (Africa's Talking implementation) |
| Email | Yes, Mailgun inbound route | Yes, Mailgun API | Receiving domain/DNS, API key and webhook signing key |
| SMS | Incoming SMS is not implemented | Yes, Africa's Talking SMS | Provider username/API key and approved sender ID where required |
| WhatsApp | Yes, Meta Cloud API | Yes, Meta Cloud API | WhatsApp Business account, phone number ID, token and webhook permissions |
| Facebook Messenger | Yes, Meta webhook | Yes, Meta Page messaging API | Facebook Page, Page token, approved app permissions and webhook subscriptions |
| Instagram messages | Yes, Meta webhook | Yes, Meta messaging API | Professional account, linked Meta assets, token, permissions and webhook subscriptions |
| Telegram | Yes, bot webhook | Yes, bot API | Bot token and webhook secret; Register action configures the webhook |
| X, TikTok, LinkedIn | Public profile/contact links only | Opens the organisation's profile | Direct inbox automation is not included in this release |

**Important channel distinctions:** entering a code or social URL does not create a provider account. A USSD code must be allocated by the telecom/USSD provider and its service code must point to the GrainGuard callback. Social profile links are not message inbox integrations. Meta-connected WhatsApp/Facebook/Instagram and Telegram use provider APIs/webhooks once the organisation's assets and permissions are approved.

### Security architecture
- Supabase Auth and Postgres Row-Level Security provide organisation separation and role enforcement.
- Warehouse-scoped RLS limits operational rows and report updates according to staff assignments.
- Provider secrets are sent to the Edge Function and encrypted server-side using AES-256-GCM. They are not written to browser localStorage or the public repository.
- Webhook validation: Mailgun HMAC, Meta `X-Hub-Signature-256`, Telegram secret-token header; public website/USSD intake has rate controls.
- Public website uses only Supabase's anon/publishable key. Never place a Supabase service-role/secret key in HTML, JavaScript, GitHub Pages or a browser field.
- Local offline cache is still browser `localStorage` and is not encrypted. See `SECURITY.md`.

## Deploy the application

Follow [`docs/INTERNATIONAL-DEPLOYMENT-V2.0.md`](docs/INTERNATIONAL-DEPLOYMENT-V2.0.md) as the authoritative one-time commissioning guide.

### Web frontend (GitHub Pages)
1. Extract the ZIP and upload the **contents** of this repository folder to the organisation's private GitHub repository.
2. Keep the `supabase/`, `hardware/`, `docs/` and `.github/` directories.
3. In GitHub **Settings → Pages**, select **GitHub Actions** as the source.
4. Commit/push to `main`; the existing Pages workflow deploys `index.html`.
5. Confirm the HTTPS website loads and the application version displays V2.0.

This package does not push to or overwrite the live GrainGuard GitHub repository. A repository owner must deploy it.

### Supabase backend
1. Create/select the organisation's Supabase project in a region approved by its information-security and data-protection teams.
2. Back up the database before applying the schema.
3. Run `supabase/schema.sql` in the Supabase SQL Editor as the project database owner. The V2.0 script is intended to migrate the V1.3 database and add the V2.0 operations/communications tables. For a new project, it creates the schema from scratch.
4. Review all SQL Editor output. Stop if there is an error; do not bypass constraints or disable RLS.
5. Deploy the Edge Function `grain-gateway` and set `GRAINGUARD_ENCRYPTION_KEY` to a securely generated base64-encoded 32-byte key. Do not lose this key; existing encrypted provider credentials cannot be decrypted if it is lost.
6. Enter Supabase Project URL and anon/publishable key in the app's Settings. No service-role key belongs in the browser.

The Edge Function is deployed with `verify_jwt = false` because it handles both public webhooks and signed-in admin actions. Admin actions validate the user's Supabase Auth JWT and organisation role inside the function. Do not remove this validation or expose the function's service key.

### Configure communication providers

Use the **Communication & Community Intelligence Centre** after the app is connected to Supabase and the organisation owner/admin has signed in. It displays the correct callback URLs for that Supabase project. The organisation enters its own provider IDs and keys there.

- **USSD:** Save the provider-assigned service code(s), Africa's Talking username and API key. Copy the displayed `/webhooks/ussd` URL into the callback setting for each allocated service code in the provider dashboard. Test by dialling the actual code. The system cannot purchase or allocate a short code on the organisation's behalf.
- **Email:** Configure the receiving address/domain, Mailgun US/EU region, private API key and webhook signing key. Save, then select **Create / verify inbound route**. This calls Mailgun's Routes API. Ensure the Mailgun domain's receiving MX records are active and send a real test email. Outbound acknowledgements use the Mailgun API key and sender address.
- **SMS:** Save the Africa's Talking username/API key and sender ID if approved. Run **Check setup**, then deliver a real test SMS to an international-format number. This release sends SMS notifications but does not receive inbound SMS as community reports.
- **WhatsApp:** Save the Meta App ID/secret, verify token, WhatsApp Business Account ID, phone number ID and system-user access token. Select **Register Meta subscriptions**, then complete remaining webhook products/fields, app review and permissions in the Meta Developer dashboard. Register/verify the business phone with Meta and send a real inbound/outbound test.
- **Facebook / Instagram:** Save Page ID, Instagram professional account ID and a Page access token. Register Meta subscriptions; complete the relevant Page and Instagram webhook fields and permissions in Meta Developer dashboard. Send actual inbox tests from a non-admin account. Messaging is subject to Meta's policies, supported conversation window and app permissions.
- **Telegram:** Create a bot with BotFather, enter its token and a strong webhook secret, then save/register. GrainGuard calls Telegram `setWebhook`; test by sending a message to the bot.
- **Social handles:** Save HTTPS profile URLs. They appear as contact links on the public reporting portal. X, TikTok and LinkedIn DMs are not automatically ingested in this version.

A channel becomes **Connected** only after the backend receives an authenticated provider event or confirms a supported webhook registration; an entered URL or saved key alone is not treated as proof of message delivery.

## Staff onboarding and warehouses

1. The first user creates the organisation and becomes its Owner. The database automatically creates a default Main Warehouse.
2. Create warehouse records for other sites. Use distinct codes, correct country codes, IANA time zones (for example `Africa/Nairobi`, `Europe/London`, `America/New_York`), locations and contacts.
3. Invite each staff member by their own email and assign an organisation role. Invitation codes are time-limited and must be shared privately.
4. Before creating the first warehouse assignment, agree which staff need access to which sites. Once the first assignment is added, assign all non-admin members to one or more sites or they will have no warehouse-level records.
5. Test with one account for each role and site before migrating live batches.

## Hardware commissioning

The ESP32 firmware is included in `hardware/GrainGuard_ESP32.ino`. Use the assembly/BOM documents and check sensor breakout voltage requirements. Compile against the stated libraries, connect physical sensors, and compare each sensor to independently calibrated reference instruments at several points. Record sensor serials, locations, calibration status, date and operator. Browser USB Serial/BLE is available only in supported HTTPS Chromium environments with device permission.

Do not treat firmware compilation or a green connection icon as proof of measurement accuracy. A physical unit must be independently checked before operational decisions depend on it.

## Release validation

The source was statically reviewed for page structure, duplicate IDs, JavaScript syntax and package integrity in the build environment. The following cannot be confirmed from this ZIP alone:

- Supabase SQL migration success on the organisation's exact V1.3 database.
- Supabase Edge Function deployment, environment secrets and end-to-end JWT/RLS testing.
- Provider approval, API credential validity, USSD service-code allocation, inbound routing, social webhook verification or actual delivery.
- ESP32 compilation, sensor wiring, calibration, field performance and environmental suitability.
- International data-protection review, contracts, data residency and service-level commitments.

Use the commissioning checklist and record sign-off before live operation. Keep a manual operational fallback during the pilot.

## Critical limitations

- Browser offline cache uses unencrypted localStorage. It is not a secure mobile database, cannot be remotely wiped on another device and should not be used from a shared/public browser profile.
- The app is not ISO/SOC 2 certified, not a food-safety certification tool and not independently security-audited by this release.
- No fan/relay/actuator control, firmware-over-the-air update, automatic grain drying, aflatoxin detection or laboratory testing is implemented.
- CO₂ is a storage-headspace trend signal only; it does not detect aflatoxins or prove mould/food safety. Ambient RH is not grain moisture.
- The ventilation planner is advisory and requires physical inputs plus a reviewed crop-specific EMC data set. Do not use it as the sole basis for ventilation or commercial decisions.
- Audit events capture selected application actions but are not a tamper-proof regulatory record. Offline actions and device-local data may not appear in the cloud audit trail.
- Email invitations are not automatically delivered by the app; the owner shares invitation codes securely. Configure Supabase Auth SMTP separately for account verification/password emails.
- Provider rate limits, pricing, sender registration, API reviews, messaging windows, supported countries and cross-border data terms are controlled by those providers, not by GrainGuard.

## Repository map

```text
index.html
README.md
SECURITY.md
CHANGELOG.md
supabase/
  schema.sql
  config.toml
  functions/grain-gateway/index.ts
hardware/
  GrainGuard_ESP32.ino
  README.md
  ASSEMBLY-GUIDE-V1.1.md
  BOM-AND-TEST-CHECKLIST.md
docs/
  INTERNATIONAL-DEPLOYMENT-V2.0.md
  ORGANISATION-OPERATIONS-V2.0.md
  FIELD-PILOT-PROTOCOL.md
  KNOWN-LIMITATIONS-V2.0.md
.github/workflows/
  pages.yml
  deploy-edge.yml
```

## Scientific positioning

GrainGuard combines existing approaches to grain-storage monitoring with site-aware management and transparent decision gating. It does not claim sensor technology or aeration as a novel invention. The research question is whether a distributed, evidence-aware workflow can improve visibility, response time and documentation for grain-store operators. That claim must be tested in a field pilot.

Useful background references:
- FAO grain storage fundamentals: https://www.fao.org/4/x5065e/x5065E04.htm
- FAO controlled ventilation: https://www.fao.org/4/x5065e/x5065E0a.htm
- FAO fungi and mycotoxins: https://www.fao.org/4/x5065e/x5065E0c.htm
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Edge Function secrets: https://supabase.com/docs/guides/functions/secrets
- Africa's Talking USSD: https://developers.africastalking.com/docs/ussd/overview
- Mailgun Routes: https://documentation.mailgun.com/docs/mailgun/api-reference/openapi-final/tag/Routes/
- Meta Webhooks: https://developers.facebook.com/docs/graph-api/webhooks/
- Telegram Bot API: https://core.telegram.org/bots/api

## Licence

MIT for the original project source unless a file or third-party dependency specifies otherwise. Third-party libraries, provider APIs, modules and cited material retain their separate licence and commercial terms. This is not a warranty or certification of the application or hardware.


### Centralised multi-warehouse operation (V2.0.1)
All warehouse teams use the same deployed GrainGuard URL. Their individually authenticated records are stored in one organisation cloud database with a warehouse identifier. Owners/Admins have an all-warehouse headquarters view; site staff are restricted by assigned warehouse membership and database RLS. The Overview includes a per-warehouse stock/telemetry panel and receives live Supabase Realtime updates. Select a single warehouse before connecting hardware or using the ventilation planner. See `docs/ORGANISATION-OPERATIONS-V2.0.md` for the workflow and acceptance test.
