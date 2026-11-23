# Changelog

## V2.0 — Organisation & International Pilot Release

- Consolidated the V1.3 organisation pilot with multi-warehouse and cross-country site records.
- Added site-level staff assignment and warehouse-aware data access policies.
- Added a shared incident workflow for web, USSD, inbound email, Meta messaging and Telegram.
- Added configurable USSD/email/SMS/Meta/Telegram provider settings and secure backend credential storage.
- Added Mailgun inbound route registration, Meta webhook subscription requests and Telegram webhook registration.
- Added provider-based automatic acknowledgements and staff replies for supported messaging channels.
- Added public social profile links and clear separation between profile links and direct inbox integrations.
- Hardened community report-update RLS to respect warehouse assignment.
- Added admin-controlled member list RPC with email visibility restricted to Owner/Admin.
- Changed public reporting to disabled by default for new organisations until an owner/admin enables it.
- Added per-phone USSD rate limiting and duplicate-event handling for email/social/Telegram channels.
- Added the international deployment, communications configuration and organisation operations guides.

## V1.3 — Organisation Pilot

- Initial shared organisation workspaces, roles, invites, audit events and cloud sync protections.


## V2.0.1 — Centralised multi-warehouse dashboard

- Organisation owners and administrators now open the dashboard in **All warehouses** mode by default; site users see only the warehouses permitted by row-level security. The selected view is saved per user and organisation.
- Added a headquarters warehouse network panel with per-site active batch counts, stock totals, latest grain temperature, telemetry freshness and open community reports.
- Expanded Supabase Realtime subscriptions to readings, batches, moisture records, lab records, warehouses and community reports. Warehouse records entered at a site appear in the headquarters view while the authenticated cloud connection is active.
- Added a manual cloud refresh action and live connection indicator.
- Hardware telemetry now requires a specific warehouse selection in multi-site organisations; the all-warehouse dashboard cannot accidentally route sensor readings to an arbitrary site. Ventilation decision support also requires one selected warehouse to prevent mixing readings across sites.
- Enabled the relevant operational tables in the Supabase Realtime publication.
