# GrainGuard Security Policy — V2.0

## Reporting security issues

Do not publish credentials, access tokens, private operational records or site-sensitive information in a public issue. Contact the repository owner privately with a minimal reproducible description and affected version. Rotate any credential accidentally exposed.

## Required deployment controls

- Use an organisation-controlled private source repository and restrict repository administrators.
- Never commit Supabase `service_role`/secret keys, personal access tokens, provider API keys, webhook secrets, user passwords, Wi-Fi credentials or production data.
- The browser app may contain only the Supabase anon/publishable key. The Edge Function receives the service-role secret from Supabase's protected environment.
- Deploy `grain-gateway` with its function-level JWT setting as supplied. The function validates the caller JWT and organisation role for every admin operation; do not bypass or remove this validation.
- Set a random base64-encoded 32-byte `GRAINGUARD_ENCRYPTION_KEY` in Supabase Edge Function secrets. Back it up in the organisation's approved secrets vault with access restricted to designated administrators. Losing it makes stored provider credentials undecryptable. Rotate only with a planned decrypt/re-encrypt procedure.
- Treat the complete USSD callback URL (including its query-string token) as a secret. Store it in the approved secrets vault, limit who can view it, and replace the token at both GrainGuard and the telecom provider if it is exposed or lost.
- Provider secrets are encrypted by the Edge Function using AES-256-GCM and stored separately from public channel configuration. Do not log secret values or include them in provider test evidence.
- Keep RLS enabled on every organisation and operational table. Run the complete schema with a database owner, review migration output and test organisation/warehouse isolation using separate accounts.
- Use the supplied private webhook checks: Mailgun HMAC and freshness window, Meta `X-Hub-Signature-256`, Telegram webhook secret-token. Do not disable them to fix a provider callback.
- Public intake is rate-limited, but public endpoints still need provider-level quotas, monitoring, a privacy notice and operational abuse handling. Consider a WAF and additional bot controls for high-volume deployments.
- Use Supabase Auth SMTP, strong password policy and MFA where available. Each employee must use an individual account; do not share owner credentials or invitation codes publicly.
- Restrict Supabase dashboard, GitHub, domain registrar, social accounts and provider-console access to authorised administrators. Revoke access promptly during offboarding.
- Choose the database region, retention and cross-border data terms with the organisation's privacy/security/legal teams. No international compliance certification is implied by the code.

## Data and device handling

- Offline application data is kept in unencrypted browser `localStorage`. This is a known limitation. Use managed devices and separate operating-system/browser profiles; avoid public/shared computers.
- Removing a staff member revokes organisation cloud access. It cannot remotely erase the removed person's offline cache, exports, screenshots, browser backups or other devices. Offboarding must include device recovery/wipe and provider-session revocation.
- Maintain regular Supabase database backups and encrypted, access-controlled exports. Test restores. A browser JSON export is not a substitute for a database backup.
- Sensor values, timestamps, device identifiers, public messages and webhook content are untrusted inputs. Validate and verify; do not use them as sole evidence for safety or commercial decisions.
- Attachments from social providers are not stored as evidence files by this release. Do not assume media files are scanned, retained or available for later review.

## Operational boundaries

- Audit events capture selected online app operations; they are not tamper-proof, complete or independently certified.
- No automatic fan/actuator control, aflatoxin detection or grain-safety certification is included.
- Do not use GrainGuard as the sole basis for food-safety, health, regulatory, financial or commercial decisions.
- The source ZIP is not a penetration-test report, SOC 2/ISO 27001 certification, GDPR certification, service-level agreement or legal opinion.
