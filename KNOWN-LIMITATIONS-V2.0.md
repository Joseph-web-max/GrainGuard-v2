# GrainGuard V2.0 — known limitations and commissioning boundaries

This document distinguishes implemented code from provider- or field-dependent capabilities.

## Implemented in the source release

- Multi-organisation workspaces and organisation roles (Owner/Admin/Operator/Viewer).
- Multi-warehouse database and UI model; warehouse selectors, site-specific data views and optional staff-to-site assignments.
- Shared community report inbox for public web reports, Africa's Talking USSD callbacks, Mailgun inbound email, Meta WhatsApp/Facebook/Instagram webhooks and Telegram bot messages.
- Outbound channel replies for Mailgun email, Africa's Talking SMS, WhatsApp Cloud API, Meta Messenger/Instagram and Telegram bot messaging, subject to credentials and provider policies.
- Provider credential encryption server-side with AES-GCM; webhook signature/secret checks; basic public intake rate limits.
- Public social links, diagnostics, site/report audit events and operator guidance.

## Requires organisation/provider provisioning

- Supabase project, database migration, function deployment, function secret and Auth/SMTP setup.
- Actual USSD short code allocation and callback mapping at provider.
- Mailgun domain, MX receiving DNS, valid API/signing credentials and an end-to-end test.
- Africa's Talking SMS account, sender approval and delivered test message.
- Meta Developer app, business assets, IDs, tokens, webhook subscriptions, permission approvals/app review and actual test message.
- Telegram bot and secret webhook registration.
- Site assignments, staff accounts, site records and public portal activation.

## Not included or not certified

- Incoming two-way SMS conversion to community reports. SMS is outbound notification only.
- Automated X/TikTok/LinkedIn inbox ingestion or replies. Their URLs are public contact links only.
- Universal social inbox API for every social platform.
- Automated invitation-code delivery by email. Admins share codes; Supabase SMTP handles account confirmation/password reset.
- Attachment ingestion/storage for every provider. Social media attachments are represented as message metadata; inbound email body is processed but attachments are not persisted as managed evidence objects.
- File/object storage with virus scanning, content moderation, document retention or malware sandboxing.
- Dedicated mobile apps, remote wipe, encrypted browser cache, SSO/SAML, SCIM provisioning, SIEM integration, external key management or per-field data-loss prevention.
- A tamper-proof regulatory audit trail, SOC 2/ISO 27001 certification, independent penetration test or legal compliance attestation.
- Firmware-over-the-air provisioning, remote device management, multi-probe sensor network guarantee or fan/relay/actuator control.
- Aflatoxin/mycotoxin detection, laboratory classification, grain-safety certification or commercial grading guarantee.

## Field and scientific boundaries

- CO₂ is a headspace trend indicator and must not be described as an aflatoxin or mycotoxin sensor.
- Ambient relative humidity is not grain moisture. Grain moisture must be measured with suitable calibrated equipment or laboratory methods.
- Condition score and alerts are rule-based indicators; they are not proven probabilities or diagnostic outputs.
- EMC values are only as reliable as their source, crop applicability, temperature/RH domain, equilibrium assumptions and review. The app does not independently validate user-entered tables.
- One probe does not represent an entire silo or bulk grain mass. A site-specific probe placement and sampling plan is required.
- Ventilation output is advisory. No automatic control or fail-safe actuator design is included.

## Production readiness statement

The V2.0 source can be deployed to a private organisation-owned environment, but it is not a preconfigured, connected international service. This build has not been tested against a customer's cloud project, provider accounts, production data or physical hardware. The organisation must complete the deployment and acceptance tests in `INTERNATIONAL-DEPLOYMENT-V2.0.md` and sign off security, data protection, provider connectivity, hardware calibration and operating procedures before production reliance.
