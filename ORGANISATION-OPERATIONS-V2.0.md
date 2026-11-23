# GrainGuard V2.0 — Organisation operations guide

This guide is for headquarters administrators, warehouse managers, operators and community-report coordinators. Finish the technical commissioning runbook before entering operational records.

## Operating model

An organisation has one central workspace and one or more warehouses. The first warehouse is created automatically as **Main Warehouse**. Add other sites with unique site codes, country/region/city, address, time zone, coordinates and local contacts. Use the active-warehouse selector to focus the dashboard and all warehouse-dependent data pages; select **All warehouses** for a headquarters view.

Each staff member uses a separate account:

| Organisation role | Core permission |
|---|---|
| Owner | Full organisation and operational administration |
| Admin | Organisation administration and operational management |
| Operator | Record and edit assigned-site operational data and process community reports |
| Viewer | Read-only access to permitted organisation/site information |

Warehouse assignment is an additional restriction. Before any explicit warehouse assignment exists, non-admin organisation members retain access to all sites. As soon as the organisation creates its first assignment, each non-admin must be assigned to one or more warehouses. Owners/admins continue to manage the whole organisation. Assignments should be planned and checked before enabling this restriction in an active operation.

## Daily warehouse routine

1. Sign in using your own account. Confirm organisation, role and selected warehouse.
2. Check the ESP32 device status, device ID, firmware, last packet time and sensor health.
3. Check probe placement against the documented sampling plan. Record any movement or replacement.
4. Confirm the active batch, crop, variety, quantity, storage date and warehouse are correct.
5. Enter grain moisture independently with an approved crop-calibrated meter or laboratory result. Record method, sample ID, date and moisture basis.
6. Review condition flags. Treat them as inspection prompts rather than diagnoses. Record the action and responsible person in the organisation's procedures.
7. Check the cloud sync state. Do not delete pending records to dismiss an error. Retain a local backup and escalate errors to the system administrator.
8. Sign out and keep the workstation locked. Do not share user accounts or browser profiles.

## Headquarters routine

- Select **All warehouses** to review the network overview, then investigate flagged sites individually.
- Review warehouse statuses, site contacts, staff assignments and stale telemetry.
- Monitor the community inbox for unassigned reports, urgent priorities and aging incidents.
- Allocate each report to the correct warehouse and a responsible investigator; update status as work proceeds.
- Record internal notes separately from a public reply. Use the public reply action only when the relevant outbound provider is configured and the message is approved.
- Review activity logs and exports; reconcile cloud stock records and device data to source records.
- Confirm staff access when people change roles or leave the organisation.

## Community incident workflow

Incoming website, USSD, email, supported Meta inbox and Telegram messages are normalised into the same community report table. Each report has a unique reference code. A free-text location is matched to a warehouse only when the text contains a configured warehouse name, code, city or region; otherwise the report remains unassigned for triage.

Recommended process:

1. **Triage:** check reference, source, category, message, time and contact details. Do not assume the report is verified.
2. **Assign:** select the warehouse; set owner/responsible handler using the organisation's workflow.
3. **Investigate:** contact the reporter where possible, visit/inspect the site and obtain measurements/lab samples as required.
4. **Respond:** add an internal note for staff or a public reply for the reporter. Replies are delivered only where matching provider credentials and provider messaging permissions are valid.
5. **Resolve:** record the evidence and decision, then mark resolved or closed. Do not mark a safety issue resolved without the organisation's own verification process.
6. **Review:** analyse recurring locations, categories, response times and unresolved incidents.

The USSD flow is designed for feature phones. It collects a category, location and short description, returns a report reference and supports a basic status lookup. The public form and email/social inbox can collect richer details, but this release does not provide a public file-upload pipeline for all channels.

## Communications operations

The Communication Centre has separate setup for USSD, inbound/outbound email, outbound SMS, WhatsApp/Facebook/Instagram inboxes, Telegram and public social links. Keep the following distinctions clear:

- A saved provider key is not proof of an end-to-end connection.
- USSD codes are allocated by the telecom/provider. Generate and save the callback token, then configure the complete token-bearing callback URL at the provider's service-code settings. Keep that URL secret and store it in the approved vault.
- Mailgun inbound email requires active MX routing and an inbound route to the GrainGuard webhook. Outbound notification additionally requires a working sender/domain and Mailgun API key.
- Africa's Talking SMS is outbound-only in this release. It is used for notifications where a report has a valid phone contact.
- Meta messaging requires organisation-owned business assets, working access tokens, webhook subscriptions, relevant permissions and any required app review/advanced access. Messenger/Instagram replies are also subject to Meta messaging windows and policy.
- Telegram's save/register workflow configures the webhook using the supplied bot credentials.
- X, TikTok and LinkedIn are public profile links only; direct inbox ingestion is not included.

If a provider rejects a message, use the channel's error state and provider dashboard to diagnose the credential, recipient format, permission, quota, sender ID or webhook issue. Maintain a telephone/manual incident route for urgent matters.

## Hardware, measurement and safety

Use the hardware assembly guide and BOM for exact board/sensor modules. Test each instrument against independent reference equipment before operational use and record calibration status and sensor placement. Grain moisture must come from a suitable calibrated grain meter or laboratory method. Ambient relative humidity is not grain moisture.

CO₂ readings are indicators of headspace trends only. They do not identify aflatoxin, mycotoxins, mould species or food safety. The condition score is an experimental rule-based indicator, not a spoilage probability. The ventilation planner is advisory, does not control fans and must not override the store's approved safety procedure. An operator must consider actual grain temperature, moisture, airflow design and validated EMC information.

## Data protection, backup and staff offboarding

The browser local cache is unencrypted localStorage. Use managed devices and separate browser/operating-system profiles. Do not run the app from a cybercafé, shared terminal or unmanaged public device. Removing a staff member blocks future cloud access but cannot erase their offline browser cache, exported files, screenshots or copies on other devices. Offboarding must include account/session revocation, device recovery/wipe, export review and access removal at connected providers.

Keep Supabase database backups and periodic access-controlled exports. Store exports only in approved organisation repositories with restricted access and retention controls. Choose the Supabase region and data-processing terms with the organisation's security/legal teams. GrainGuard V2.0 is not certified to any international security or data-protection framework by this release.

## First-week acceptance checklist

- [ ] Owner, backup admin, operators and viewers each use individual accounts.
- [ ] Organisation and each warehouse use correct identifiers, location and time zone.
- [ ] Staff can only see assigned warehouses after assignment mode is enabled.
- [ ] Site-specific batches, telemetry, moisture records and lab records remain separated.
- [ ] A single warehouse user cannot read another site's report updates.
- [ ] Viewer access is read-only; operator/admin/owner capabilities match the role matrix.
- [ ] Two accounts on separate devices see the same cloud records after sync.
- [ ] Public reporting is disabled until the organisation is ready, then tested and enabled.
- [ ] USSD, email, SMS, Meta and Telegram are tested separately if those channels will be used.
- [ ] At least one real community report enters the inbox and gets a reference code.
- [ ] Provider reply/acknowledgement is tested with a consenting external test account.
- [ ] Backup export and Supabase restore process are understood and recorded.
- [ ] Sensor readings are compared with reference instruments and hardware calibration is signed off.
- [ ] Manual incident and grain-storage fallback processes are documented.

Record tester, date, organisation, site, user role, browser, device firmware, sensor references, provider test IDs and all unresolved issues. Do not move to a wider rollout while an access-control, record-integrity or physical measurement acceptance test is failing.


## Provider-channel offboarding

Disabling a channel stops GrainGuard from processing its inbound events and sending outbound messages. Removing it deletes its encrypted GrainGuard credentials, but does not delete the external provider route, app subscription, service-code callback or bot webhook. An authorised administrator must also deactivate or remove those provider-side settings.


## One website, many warehouses (V2.0.1)

All warehouses use the **same GrainGuard website URL and the same organisation Supabase project/database**. Each staff member signs in with their own individual account. An organisation Owner/Admin opens the Overview in **All warehouses** mode by default and sees the consolidated network panel. A warehouse operator/manager sees only warehouse records allowed by the `warehouse_members` assignments and database Row Level Security. If assigned to one warehouse, that warehouse is selected automatically; if assigned to several, they can use the all-assigned-sites view.

When a user at Warehouse 001 saves a batch, moisture record, lab record or sensor reading while online and signed in, the app writes it to the shared organisation database with Warehouse 001's `warehouse_id`. The headquarters page receives the published database change through Supabase Realtime and refreshes its site table. Users do not upload or email spreadsheets between warehouses. The network panel's **Refresh network** action performs an explicit cloud reload if the realtime connection is interrupted.

**Hardware safety:** select the particular warehouse where the sensor is physically installed before connecting USB/Bluetooth. GrainGuard blocks accepting hardware readings while the all-warehouse view is selected in a multi-site organisation, preventing readings from being attached to an arbitrary warehouse. Ventilation decision support is also blocked in all-warehouse mode; choose one warehouse first.

**Offline behaviour:** entries may remain in the current browser's local pending queue until internet returns and are then retried. Another device or headquarters will not see a new item until it reaches the shared cloud database. The organisation should test offline queue recovery on its actual devices and network before relying on it operationally.

**Commissioning check:** create two test warehouses and two individual staff accounts. Assign one operator to Warehouse 001, enter a uniquely identifiable test batch, and confirm it appears in the Owner/Admin's All warehouses table with the correct site code and stock amount. Sign in as the Warehouse 002 operator and confirm Warehouse 001's batch is not visible. Repeat with a hardware reading and verify its warehouse_id. Remove test data only after the acceptance record is saved.
