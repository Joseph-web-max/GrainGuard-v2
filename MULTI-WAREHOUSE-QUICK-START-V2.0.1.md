# GrainGuard V2.0.1 — Multi-Warehouse Quick Start

## The operating model

All sites use **one GrainGuard website** and one organisation workspace in Supabase. Each staff member signs in with an individual account. Warehouse access is assigned to that user; there is no separate website or separate database for Warehouse 001, 002, 003, etc.

## Headquarters

1. Sign in using an organisation Owner or Admin account.
2. Open **Warehouses & Sites** and create each location with a unique site code (for example `001`, `002`, `003`), name, country and location.
3. Assign staff to the warehouse(s) they are responsible for. Give only the permissions they need.
4. Return to the Overview page. Owner/Admin accounts default to **All warehouses**.
5. Use the network table to compare active batches, recorded stock, latest grain temperature and sensor freshness. Select **Open warehouse** to inspect an individual site. Use **All warehouses** to return to the network view.
6. Use **Refresh network** to request a fresh cloud sync. The status label reports whether the Supabase Realtime channel is connected.

## Warehouse staff

1. Open the same website address as headquarters.
2. Sign in using your own account. Do not share accounts.
3. An administrator must assign your account to the correct warehouse before you enter operational records.
4. Confirm the warehouse shown in the site selector before saving batches, moisture results, lab validations or connecting a sensor.
5. Enter and save records as normal. When internet and cloud access are available, they are written to the shared organisation database and headquarters receives updates through Supabase Realtime.

## Live updates and offline behaviour

- **Online:** successful cloud writes become available to authorised users at headquarters and other sites. Realtime updates are near-real-time, subject to the device connection and Supabase service.
- **Realtime disconnected:** users can select **Refresh network** to fetch current cloud records. The Overview shows the connection state; it must not be described as live while the status is disconnected.
- **Offline:** records saved into the local pending queue remain on that device until internet is restored and upload succeeds. Headquarters cannot see a local-only record before it reaches the cloud. Do not clear browser data or uninstall/reset the device while unsynchronised records remain.
- **Hardware:** select one specific warehouse before connecting a USB/Bluetooth sensor. Do not connect hardware while **All warehouses** is selected. Register each device to its intended site and test a reading before unattended operation.

## Required commissioning test (before real use)

1. Back up the existing Supabase project and apply the supplied `supabase/schema.sql` migration using the deployment procedure.
2. Confirm that `grain_readings`, `grain_batches`, `grain_moisture_records`, `lab_validation_records`, `community_reports` and `warehouses` are enabled for Supabase Realtime. The schema attempts to add the relevant operational tables to the `supabase_realtime` publication; verify this in the project's Supabase dashboard.
3. Create two test warehouses, `001` and `002`, in one organisation.
4. Create two separate test staff accounts and assign one to each site. Confirm each staff member sees only their assigned site(s), while the Owner/Admin sees both.
5. Enter a distinct test batch in each warehouse while online. Confirm the headquarters overview shows both sites, separate quantities and correct site names. Open each warehouse and verify its records.
6. Add a test reading to each warehouse. Confirm the temperature/freshness column reports the correct latest reading for each site.
7. Disconnect one test device from the internet, create a test record, reconnect it, and verify that the pending record syncs once. Confirm headquarters sees it only after the cloud upload succeeds.
8. Test a staff user attempting to access an unassigned warehouse. Confirm the database denies the operation, not merely the user interface.
9. Remove test data or clearly mark it as test data before operational handover.

## Important boundaries

- This package does not create or host a Supabase project, provision staff email accounts, deploy the website to GitHub Pages, or obtain internet/USSD provider services.
- Automatic cross-site synchronisation requires the deployed website, the correct Supabase URL and public anon key, the supplied database schema/migration, valid staff accounts, and working internet connectivity.
- The overview uses cloud records loaded by the current application sync. Plan retention, pagination and archival before the organisation exceeds the app's current per-table loading limit.
- A successful static code check is not a substitute for the commissioning test above against the organisation's own Supabase project, accounts and hardware.
