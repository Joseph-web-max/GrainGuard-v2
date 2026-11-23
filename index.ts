import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const publishableKeys = (() => { try { return JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}'); } catch { return {}; } })();
const secretKeys = (() => { try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'); } catch { return {}; } })();
const PUBLISHABLE_KEY = publishableKeys.default || Deno.env.get('SUPABASE_ANON_KEY') || '';
const SERVICE_KEY = secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ENCRYPTION_KEY = Deno.env.get('GRAINGUARD_ENCRYPTION_KEY') || '';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature-256, x-telegram-bot-api-secret-token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' } });
}
function text(body: string, status = 200) {
  return new Response(body, { status, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } });
}
function b64(bytes: Uint8Array) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
function unb64(value: string) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
async function sha256(value: string) { return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))); }
async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
  return [...sig].map(x => x.toString(16).padStart(2, '0')).join('');
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0; for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
function adminClient(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Supabase Edge Function secrets are incomplete.');
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
function encryptionKeyBytes() {
  if (!ENCRYPTION_KEY) throw new Error('GRAINGUARD_ENCRYPTION_KEY has not been set in Supabase Edge Function secrets.');
  const bytes = unb64(ENCRYPTION_KEY);
  if (bytes.length !== 32) throw new Error('GRAINGUARD_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  return bytes;
}
async function encryptSecrets(value: Record<string, string>) {
  const key = await crypto.subtle.importKey('raw', encryptionKeyBytes(), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(value))));
  return `${b64(iv)}.${b64(cipher)}`;
}
async function decryptSecrets(value: string): Promise<Record<string, string>> {
  const [ivText, cipherText] = value.split('.');
  if (!ivText || !cipherText) throw new Error('Encrypted integration credentials are malformed.');
  const key = await crypto.subtle.importKey('raw', encryptionKeyBytes(), 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivText) }, key, unb64(cipherText));
  return JSON.parse(new TextDecoder().decode(plain));
}
async function getChannel(admin: SupabaseClient, orgId: string, channelType: string) {
  const { data, error } = await admin.from('communication_channels').select('*').eq('organization_id', orgId).eq('channel_type', channelType).maybeSingle();
  if (error) throw error;
  return data;
}
async function getSecrets(admin: SupabaseClient, channelId: string): Promise<Record<string, string>> {
  const { data, error } = await admin.from('integration_secrets').select('encrypted_payload').eq('channel_id', channelId).maybeSingle();
  if (error) throw error;
  return data?.encrypted_payload ? await decryptSecrets(data.encrypted_payload) : {};
}
async function requireUser(req: Request, admin: SupabaseClient, orgId: string, allowed: string[] = ['owner', 'admin']) {
  const auth = req.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token || !PUBLISHABLE_KEY) throw new Error('Sign in with an organisation account first.');
  const userClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) throw new Error('Your sign-in session is invalid or expired.');
  const { data: membership, error } = await admin.from('organization_members').select('role').eq('organization_id', orgId).eq('user_id', userData.user.id).maybeSingle();
  if (error) throw error;
  if (!membership || !allowed.includes(membership.role)) throw new Error('You do not have permission to manage this organisation integration.');
  return { user: userData.user, role: membership.role };
}
function normalisePhone(value: unknown) {
  const phone = String(value || '').replace(/[\s().-]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : '';
}
async function matchWarehouse(admin: SupabaseClient, orgId: string, locationText: string) {
  const { data } = await admin.from('warehouses').select('id,name,code,city,region,is_default').eq('organization_id', orgId).eq('status', 'active');
  const haystack = locationText.toLowerCase();
  if (!haystack) return data?.find((w: any) => w.is_default)?.id || null;
  const match = (data || []).find((w: any) => [w.name, w.code, w.city, w.region].filter(Boolean).some((v: string) => haystack.includes(String(v).toLowerCase())));
  return match?.id || null;
}
async function createCommunityReport(admin: SupabaseClient, input: Record<string, unknown>, channelId?: string) {
  const orgId = String(input.organizationId || '');
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) throw new Error('A valid organisation identifier is required.');
  const { data: org, error: orgError } = await admin.from('organizations').select('id,name,public_reporting_enabled').eq('id', orgId).maybeSingle();
  if (orgError) throw orgError;
  if (!org || (input.source === 'website' && !org.public_reporting_enabled)) throw new Error('Public reporting is not enabled for this organisation.');
  const message = String(input.message || '').trim();
  if (message.length < 3 || message.length > 8000) throw new Error('Report description must be between 3 and 8,000 characters.');
  const source = String(input.source || 'website');
  const allowedSources = ['website','ussd','email','sms','whatsapp','facebook','instagram','telegram','x','staff'];
  if (!allowedSources.includes(source)) throw new Error('Unsupported report source.');
  const locationText = String(input.locationText || '').trim().slice(0, 180);
  const warehouseId = input.warehouseId ? String(input.warehouseId) : await matchWarehouse(admin, orgId, locationText);
  const ref = `GG-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${crypto.randomUUID().slice(0,6).toUpperCase()}`;
  const category = String(input.category || 'general').slice(0,80);
  const priority = ['low','normal','high','urgent'].includes(String(input.priority)) ? String(input.priority) : 'normal';
  const row = {
    organization_id: orgId,
    warehouse_id: warehouseId,
    reference_code: ref,
    source,
    external_message_id: input.externalMessageId ? String(input.externalMessageId).slice(0,220) : null,
    sender_name: String(input.senderName || '').slice(0,100) || null,
    sender_contact: String(input.senderContact || '').slice(0,80) || null,
    sender_email: String(input.senderEmail || '').slice(0,180) || null,
    subject: String(input.subject || '').slice(0,240) || null,
    category,
    message,
    location_text: locationText || null,
    priority,
    status: 'new',
  };
  const { data, error } = await admin.from('community_reports').insert(row).select('id,reference_code,organization_id,warehouse_id,created_at').single();
  if (error) {
    if (error.code === '23505' && row.external_message_id) {
      const { data: existing } = await admin.from('community_reports').select('id,reference_code,organization_id,warehouse_id,created_at').eq('organization_id', orgId).eq('source', source).eq('external_message_id', row.external_message_id).maybeSingle();
      if (existing) return { ...existing, _duplicate: true };
    }
    throw error;
  }
  await admin.from('community_report_updates').insert({ organization_id: orgId, report_id: data.id, actor_id: null, update_type: 'system', message: `Received from ${source}.`, is_public: false });
  if (channelId) await admin.from('communication_channels').update({ last_message_at: new Date().toISOString(), connection_state: 'connected', last_error: null, updated_at: new Date().toISOString() }).eq('id', channelId);
  return { ...data, _duplicate: false };
}
async function rateLimit(admin: SupabaseClient, req: Request, orgId: string) {
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const key = await sha256(orgId + '|' + ip + '|' + (req.headers.get('user-agent') || ''));
  const { data, error } = await admin.rpc('grain_consume_community_rate_limit', { p_rate_key: key, p_max_hits: 12 });
  if (error) throw error;
  if (!data) throw new Error('Too many submissions from this connection. Please try again later.');
}
async function saveChannel(admin: SupabaseClient, orgId: string, type: string, displayName: string, config: Record<string, unknown>, secrets: Record<string, unknown>) {
  const types = ['ussd','email','sms','meta','telegram','social_links'];
  if (!types.includes(type)) throw new Error('Unsupported communication channel.');
  if (type === 'ussd') {
    const incoming = (((config.serviceCodes as unknown[]) || [config.serviceCode]) as unknown[]).map(x => String(x).replace(/\s/g, '')).filter(Boolean);
    const { data: otherChannels, error: channelError } = await admin.from('communication_channels').select('organization_id,config').eq('channel_type','ussd').neq('organization_id',orgId);
    if (channelError) throw channelError;
    const collision = (otherChannels || []).some((c:any) => ((c.config?.serviceCodes || [c.config?.serviceCode]) as unknown[]).some((code:any) => incoming.includes(String(code).replace(/\s/g,''))));
    if (collision) throw new Error('One of these USSD codes is already registered to another GrainGuard organisation. A service code must identify one organisation only.');
  }
  if (type === 'email') {
    const address=String(config.receivingAddress||'').trim().toLowerCase();
    if(address){
      const {data:others,error}=await admin.from('communication_channels').select('organization_id,config').eq('channel_type','email').neq('organization_id',orgId);
      if(error)throw error;
      if((others||[]).some((x:any)=>String(x.config?.receivingAddress||'').trim().toLowerCase()===address))throw new Error('This inbound email address is already assigned to another GrainGuard organisation. Use a unique receiving address for each organisation.');
    }
  }
  if (type === 'meta') {
    const identityFields=['whatsappPhoneNumberId','whatsappBusinessAccountId','pageId','instagramAccountId'];
    const incoming=identityFields.map(k=>String(config[k]||'').trim()).filter(Boolean);
    if(incoming.length){
      const {data:others,error}=await admin.from('communication_channels').select('organization_id,config').eq('channel_type','meta').neq('organization_id',orgId);
      if(error)throw error;
      const collision=(others||[]).some((x:any)=>identityFields.some(k=>{const value=String(config[k]||'').trim();return !!value&&value===String(x.config?.[k]||'').trim();}));
      if(collision)throw new Error('A WhatsApp number, Business Account, Facebook Page or Instagram account ID is already assigned to another GrainGuard organisation. Each provider asset must route to one organisation only.');
    }
  }
  if (type === 'telegram') {
    const existing=await getChannel(admin,orgId,'telegram');
    const ownSecrets=existing?await getSecrets(admin,existing.id):{};
    const effectiveToken=String((secrets||{}).botToken||ownSecrets.botToken||'').trim();
    if(effectiveToken){
      const {data:others,error}=await admin.from('communication_channels').select('id,organization_id').eq('channel_type','telegram').neq('organization_id',orgId);
      if(error)throw error;
      for(const other of others||[]){const otherSecrets=await getSecrets(admin,other.id);if(otherSecrets.botToken&&otherSecrets.botToken===effectiveToken)throw new Error('This Telegram bot token is already assigned to another GrainGuard organisation. Use a separate bot for each organisation.');}
    }
  }
  const incomingSecrets = Object.fromEntries(Object.entries(secrets || {}).filter(([,value]) => typeof value === 'string' && value.trim()).map(([key,value]) => [key,String(value).trim().slice(0,5000)])) as Record<string,string>;
  if (Object.keys(incomingSecrets).length) encryptionKeyBytes();
  const cleanConfig: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config || {})) {
    if (typeof value === 'string') cleanConfig[key] = value.slice(0, 2000);
    else if (Array.isArray(value)) cleanConfig[key] = value.slice(0, 30).map(x => String(x).slice(0, 300));
    else if (typeof value === 'boolean' || value === null) cleanConfig[key] = value;
  }
  const { data, error } = await admin.from('communication_channels').upsert({ organization_id: orgId, channel_type: type, display_name: displayName.slice(0, 100), enabled: true, config: cleanConfig, connection_state: 'saved', last_error: null, updated_at: new Date().toISOString() }, { onConflict: 'organization_id,channel_type' }).select('*').single();
  if (error) throw error;
  if (Object.keys(incomingSecrets).length) {
    const previous = await getSecrets(admin, data.id);
    const encrypted_payload = await encryptSecrets({ ...previous, ...incomingSecrets });
    const { error: secretError } = await admin.from('integration_secrets').upsert({ channel_id: data.id, organization_id: orgId, encrypted_payload, key_version: 1, updated_at: new Date().toISOString() });
    if (secretError) throw secretError;
  }
  const pending = ['ussd','email','meta','sms'].includes(type) ? 'awaiting_provider' : 'saved';
  await admin.from('communication_channels').update({ connection_state: pending }).eq('id', data.id);
  return { channelId: data.id, connection_state: pending };
}
async function testChannel(admin: SupabaseClient, orgId: string, type: string) {
  const c = await getChannel(admin, orgId, type);
  if (!c) throw new Error('Save this channel configuration first.');
  if (!c.enabled) throw new Error('This channel is disabled. Enable it before running a provider test.');
  const secrets = await getSecrets(admin, c.id);
  const cfg = c.config || {};
  let connected = false, message = 'Configuration is saved. Complete provider-side callback setup, then wait for a real inbound event.';
  if (type === 'ussd') {
    const codes = (cfg.serviceCodes || [cfg.serviceCode]).filter(Boolean);
    if (!codes.length || !cfg.username || !secrets.apiKey || !secrets.callbackToken) throw new Error('USSD requires allocated code(s), Africa\'s Talking username, API key and a callback token.');
    message = 'USSD details and callback URL are ready. Africa\'s Talking must have the callback URL saved against each allocated service code; a real dial-in event will change status to Connected.';
  } else if (type === 'email') {
    if (!cfg.receivingAddress || !cfg.receivingDomain || !secrets.mailgunSigningKey) throw new Error('Email inbound requires receiving address, Mailgun domain and webhook signing key.');
    if (secrets.mailgunApiKey) {
      const apiBase = cfg.region === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
      const res = await fetch(`${apiBase}/v4/domains/${encodeURIComponent(cfg.receivingDomain)}`, { headers: { Authorization: 'Basic ' + btoa('api:' + secrets.mailgunApiKey) } });
      if (!res.ok) throw new Error('Mailgun could not verify the configured domain/API key. Check domain region and credentials.');
      connected = false; message = 'Mailgun domain and API credentials were verified. The inbound route is not yet end-to-end confirmed; configure the Mailgun Route and send a real test email. Status remains Awaiting provider until an inbound message is received.';
    } else message = 'Inbound address and signing key are saved. Add the Mailgun API key to verify the domain and enable outbound email replies.';
  } else if (type === 'sms') {
    if (!cfg.username || !secrets.apiKey) throw new Error('SMS requires Africa\'s Talking username and API key.');
    const base = cfg.username === 'sandbox' ? 'https://api.sandbox.africastalking.com' : 'https://api.africastalking.com';
    const res = await fetch(base + '/version1/user', { headers: { apiKey: secrets.apiKey, Accept: 'application/json' } });
    if (!res.ok) throw new Error('Africa\'s Talking account check failed. Verify username, API key and environment.');
    connected = false; message = 'Africa\'s Talking API credentials were accepted. This check does not prove SMS delivery. Confirm sender ID, country permissions and send a real test message; status remains Awaiting provider until delivery is observed.';
  } else if (type === 'meta') {
    if (!secrets.appSecret || !secrets.verifyToken) throw new Error('Meta webhook requires App Secret and Verify Token.');
    const token = secrets.whatsappAccessToken || secrets.pageAccessToken;
    if (!token) throw new Error('Add a WhatsApp system-user token or Facebook Page access token to verify API access.');
    const version = String(cfg.graphVersion || 'v27.0');
    const res = await fetch(`https://graph.facebook.com/${version}/me?fields=id,name`, { headers: { Authorization: `Bearer ${token}` } });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error?.message || 'Meta rejected the supplied access token.');
    connected = false; message = 'Meta access token was accepted. Configure the GrainGuard webhook, verify token and subscribe the required WhatsApp/Messenger/Instagram fields; status remains Awaiting provider until a signed inbound event is received.';
  } else if (type === 'telegram') {
    if (!secrets.botToken || !secrets.webhookSecret) throw new Error('Telegram requires bot token and webhook secret.');
    const res = await fetch(`https://api.telegram.org/bot${secrets.botToken}/getMe`);
    const result = await res.json().catch(() => ({}));
    if (!res.ok || !result.ok) throw new Error(result.description || 'Telegram bot token validation failed.');
    connected = false; message = `Telegram bot verified: @${result.result.username}. Register its webhook to receive messages; the webhook will be marked Connected after registration.`;
  } else if (type === 'social_links') {
    const links = Object.values(cfg).filter(v => typeof v === 'string' && /^https:\/\//i.test(v));
    if (!links.length) throw new Error('Add at least one valid HTTPS social profile link.');
    connected = false; message = `${links.length} public social link(s) are saved. These are contact links, not direct inbox integrations; status remains Saved.`;
  }
  const connection_state = type === 'social_links' ? 'saved' : (connected ? 'connected' : 'awaiting_provider');
  await admin.from('communication_channels').update({ connection_state, last_error: null, updated_at: new Date().toISOString() }).eq('id', c.id);
  return { connection_state, message };
}
async function registerMailgunRoute(admin: SupabaseClient, orgId: string) {
  const c = await getChannel(admin, orgId, 'email');
  if (!c) throw new Error('Save inbound email settings first.');
  const cfg = c.config || {}, secrets = await getSecrets(admin, c.id);
  const address = String(cfg.receivingAddress || '').trim().toLowerCase();
  const domain = String(cfg.receivingDomain || '').trim().toLowerCase();
  if (!address || !domain || !secrets.mailgunApiKey || !secrets.mailgunSigningKey) throw new Error('Email route creation requires receiving address, Mailgun domain, API key and webhook signing key.');
  if (!address.endsWith('@'+domain)) throw new Error('The receiving email address must use the configured Mailgun receiving domain.');
  const apiBase = cfg.region === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
  const auth = { Authorization: 'Basic ' + btoa('api:' + secrets.mailgunApiKey) };
  const listRes = await fetch(`${apiBase}/v3/routes?limit=100`, { headers: auth });
  if (!listRes.ok) throw new Error('Mailgun route listing failed. Check API credentials and region.');
  const list = await listRes.json().catch(()=>({}));
  const expression = `match_recipient('${address.replace(/'/g, "\\'")}')`;
  const forwardAction = `forward('${SUPABASE_URL}/functions/v1/grain-gateway/webhooks/mailgun')`;
  const items = Array.isArray(list.items) ? list.items : [];
  const existing = items.find((route:any) => route.expression === expression && (route.actions||[]).some((a:string) => String(a).includes('/webhooks/mailgun')));
  if (!existing) {
    const form = new URLSearchParams();
    form.set('priority','5'); form.set('description',`GrainGuard inbound reports · ${orgId}`); form.set('expression',expression);
    form.append('action',forwardAction); form.append('action','stop()');
    const createRes = await fetch(`${apiBase}/v3/routes`, { method:'POST', headers:{...auth,'Content-Type':'application/x-www-form-urlencoded'}, body:form.toString() });
    const result = await createRes.json().catch(()=>({}));
    if (!createRes.ok) throw new Error(result.message || result.error || 'Mailgun rejected route creation. Check domain receiving DNS and route permissions.');
  }
  await admin.from('communication_channels').update({connection_state:'awaiting_provider',last_error:null,updated_at:new Date().toISOString()}).eq('id',c.id);
  return {connection_state:'awaiting_provider',message:existing?'The matching Mailgun inbound route already exists. Send a test email to confirm delivery.':'Mailgun inbound route created. Send a test email to confirm the signed webhook reaches GrainGuard.'};
}
async function registerMetaWebhooks(admin: SupabaseClient, orgId: string) {
  const c = await getChannel(admin, orgId, 'meta');
  if (!c) throw new Error('Save Meta / WhatsApp settings first.');
  const cfg = c.config || {}, secrets = await getSecrets(admin, c.id);
  if (!secrets.appSecret || !secrets.verifyToken) throw new Error('Meta App Secret and webhook Verify Token are required.');
  const version = /^v\d+\.\d+$/.test(String(cfg.graphVersion || '')) ? String(cfg.graphVersion) : 'v27.0';
  const registered: string[] = [], errors: string[] = [];
  if (cfg.appId && cfg.pageId && secrets.appSecret) {
    try {
      const appTokenRes = await fetch(`https://graph.facebook.com/${version}/oauth/access_token?client_id=${encodeURIComponent(String(cfg.appId))}&client_secret=${encodeURIComponent(secrets.appSecret)}&grant_type=client_credentials`);
      const appTokenData = await appTokenRes.json().catch(()=>({}));
      if (!appTokenRes.ok || !appTokenData.access_token) throw new Error(appTokenData.error?.message || 'Could not obtain Meta app token');
      const form = new URLSearchParams({object:'page',callback_url:`${SUPABASE_URL}/functions/v1/grain-gateway/webhooks/meta`,fields:'messages,messaging_postbacks',verify_token:secrets.verifyToken,include_values:'true'});
      const subRes = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(String(cfg.appId))}/subscriptions`,{method:'POST',headers:{Authorization:`Bearer ${appTokenData.access_token}`,'Content-Type':'application/x-www-form-urlencoded'},body:form.toString()});
      const subData = await subRes.json().catch(()=>({}));
      if (!subRes.ok || subData.error) throw new Error(subData.error?.message || 'Page webhook subscription failed');
      registered.push('Meta app · Page messages webhook');
      if (cfg.instagramAccountId) {
        const igForm = new URLSearchParams({object:'instagram',callback_url:`${SUPABASE_URL}/functions/v1/grain-gateway/webhooks/meta`,fields:'messages,messaging_postbacks',verify_token:secrets.verifyToken,include_values:'true'});
        const igRes = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(String(cfg.appId))}/subscriptions`,{method:'POST',headers:{Authorization:`Bearer ${appTokenData.access_token}`,'Content-Type':'application/x-www-form-urlencoded'},body:igForm.toString()});
        const igData = await igRes.json().catch(()=>({}));
        if (!igRes.ok || igData.error) errors.push('Instagram app webhook: '+(igData.error?.message||'subscription failed; complete it in the Meta Developer dashboard'));
        else registered.push('Meta app · Instagram messages webhook');
      }
    } catch(e) { errors.push('Meta app webhook: '+(e instanceof Error?e.message:'registration failed')); }
  }
  if (cfg.whatsappBusinessAccountId && secrets.whatsappAccessToken) {
    const res = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(String(cfg.whatsappBusinessAccountId))}/subscribed_apps`, { method:'POST', headers:{Authorization:`Bearer ${secrets.whatsappAccessToken}`} });
    const body = await res.json().catch(()=>({}));
    if (res.ok && !body.error) registered.push('WhatsApp Business Account'); else errors.push('WhatsApp: '+(body.error?.message||'subscription failed'));
  }
  if (cfg.pageId && secrets.pageAccessToken) {
    const url = `https://graph.facebook.com/${version}/${encodeURIComponent(String(cfg.pageId))}/subscribed_apps?subscribed_fields=messages,messaging_postbacks`;
    const res = await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${secrets.pageAccessToken}`} });
    const body = await res.json().catch(()=>({}));
    if (res.ok && !body.error) registered.push('Facebook Page'); else errors.push('Facebook Page: '+(body.error?.message||'subscription failed'));
  }
  if (!registered.length) throw new Error(errors.join(' · ') || 'Add a WhatsApp Business Account ID/token or Facebook Page ID/Page token before registering subscriptions.');
  await admin.from('communication_channels').update({connection_state:'awaiting_provider',last_error:errors.length?errors.join(' · '):null,updated_at:new Date().toISOString()}).eq('id',c.id);
  return {connection_state:'awaiting_provider',registered,errors,message:`Provider subscriptions requested for: ${registered.join(', ')}. Now set the callback URL and verify token in the Meta Developer dashboard, enable the relevant Webhooks fields, and send a real test message. A signed inbound event will mark the channel Connected.`};
}
async function registerTelegramWebhook(admin: SupabaseClient, orgId: string) {
  const c = await getChannel(admin, orgId, 'telegram');
  if (!c) throw new Error('Save Telegram bot settings first.');
  const secrets = await getSecrets(admin, c.id);
  if (!secrets.botToken || !secrets.webhookSecret) throw new Error('Telegram bot token and webhook secret are required.');
  const endpoint = `${SUPABASE_URL}/functions/v1/grain-gateway/webhooks/telegram?org_id=${encodeURIComponent(orgId)}`;
  const res = await fetch(`https://api.telegram.org/bot${secrets.botToken}/setWebhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: endpoint, secret_token: secrets.webhookSecret, allowed_updates: ['message','channel_post'] }) });
  const result = await res.json().catch(() => ({}));
  if (!res.ok || !result.ok) throw new Error(result.description || 'Telegram setWebhook request failed.');
  await admin.from('communication_channels').update({ connection_state: 'connected', last_error: null, updated_at: new Date().toISOString() }).eq('id', c.id);
  return { connection_state: 'connected', message: 'Telegram webhook registered at ' + endpoint };
}
async function mailgunNotify(admin: SupabaseClient, orgId: string, report: any, message: string) {
  const c = await getChannel(admin, orgId, 'email'); if (!c || !c.enabled) return false;
  const secrets = await getSecrets(admin, c.id); const cfg = c.config || {};
  if (!secrets.mailgunApiKey || !cfg.receivingDomain || !cfg.senderAddress || !report.sender_email) return false;
  const form = new FormData(); form.set('from', String(cfg.senderAddress)); form.set('to', String(report.sender_email)); form.set('subject', `GrainGuard ${report.reference_code} · Report update`); form.set('text', message);
  const apiBase = cfg.region === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
  const res = await fetch(`${apiBase}/v3/${encodeURIComponent(cfg.receivingDomain)}/messages`, { method: 'POST', headers: { Authorization: 'Basic ' + btoa('api:' + secrets.mailgunApiKey) }, body: form });
  if (!res.ok) throw new Error('Mailgun rejected the outgoing email notification.'); return true;
}
async function metaWhatsAppNotify(admin: SupabaseClient, orgId: string, report: any, message: string) {
  const c = await getChannel(admin, orgId, 'meta'); if (!c || !c.enabled) return false;
  const secrets = await getSecrets(admin, c.id), cfg = c.config || {};
  const recipient = String(report.sender_contact || '').replace(/\D/g, '');
  if (!secrets.whatsappAccessToken || !cfg.whatsappPhoneNumberId || recipient.length < 8) return false;
  const version = /^v\d+\.\d+$/.test(String(cfg.graphVersion || '')) ? String(cfg.graphVersion) : 'v27.0';
  const res = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(String(cfg.whatsappPhoneNumberId))}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${secrets.whatsappAccessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: recipient, type: 'text', text: { preview_url: false, body: message.slice(0, 4000) } })
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(result.error?.message || 'Meta rejected the WhatsApp notification.');
  return true;
}
async function metaSocialNotify(admin: SupabaseClient, orgId: string, report: any, message: string) {
  const c = await getChannel(admin, orgId, 'meta'); if (!c || !c.enabled) return false;
  const secrets = await getSecrets(admin, c.id), cfg = c.config || {};
  const recipient = String(report.sender_contact || '').trim();
  const version = /^v\d+\.\d+$/.test(String(cfg.graphVersion || '')) ? String(cfg.graphVersion) : 'v27.0';
  if (!secrets.pageAccessToken || !recipient) return false;
  let endpoint = '', body: Record<string, unknown>;
  if (report.source === 'facebook' && cfg.pageId) {
    endpoint = `https://graph.facebook.com/${version}/${encodeURIComponent(String(cfg.pageId))}/messages`;
    body = { recipient: { id: recipient }, messaging_type: 'RESPONSE', message: { text: message.slice(0, 2000) } };
  } else if (report.source === 'instagram' && cfg.instagramAccountId) {
    endpoint = `https://graph.facebook.com/${version}/${encodeURIComponent(String(cfg.instagramAccountId))}/messages`;
    body = { recipient: { id: recipient }, message: { text: message.slice(0, 1000) } };
  } else return false;
  const res = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${secrets.pageAccessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await res.json().catch(() => ({}));
  if (!res.ok || result.error) throw new Error(result.error?.message || `Meta ${report.source} messaging request failed.`);
  return true;
}
async function telegramNotify(admin: SupabaseClient, orgId: string, report: any, message: string) {
  const c = await getChannel(admin, orgId, 'telegram'); if (!c || !c.enabled) return false;
  const secrets = await getSecrets(admin, c.id), chatId = String(report.sender_contact || '').trim();
  if (!secrets.botToken || !chatId) return false;
  const res = await fetch(`https://api.telegram.org/bot${secrets.botToken}/sendMessage`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ chat_id:chatId, text:message.slice(0,4000) }) });
  const result = await res.json().catch(() => ({}));
  if (!res.ok || !result.ok) throw new Error(result.description || 'Telegram message delivery failed.');
  return true;
}
async function atNotify(admin: SupabaseClient, orgId: string, report: any, message: string) {
  const c = await getChannel(admin, orgId, 'sms'); if (!c || !c.enabled) return false;
  const secrets = await getSecrets(admin, c.id), cfg = c.config || {};
  const phone = normalisePhone(report.sender_contact);
  if (!secrets.apiKey || !cfg.username || !phone) return false;
  const form = new URLSearchParams({ username: String(cfg.username), to: phone, message });
  if (cfg.senderId) form.set('from', String(cfg.senderId));
  const base = cfg.username === 'sandbox' ? 'https://api.sandbox.africastalking.com' : 'https://api.africastalking.com';
  const res = await fetch(base + '/version1/messaging', { method: 'POST', headers: { apiKey: secrets.apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
  const result = await res.json().catch(() => ({}));
  const recipient = result.SMSMessageData?.Recipients?.[0];
  if (!res.ok || (recipient && recipient.status !== 'Success')) throw new Error(recipient?.status || 'Africa\'s Talking rejected the SMS notification.');
  return true;
}
async function handleUssd(admin: SupabaseClient, req: Request) {
  const form = await req.formData();
  const serviceCode = String(form.get('serviceCode') || form.get('service_code') || '').replace(/\s/g, '');
  const phone = String(form.get('phoneNumber') || form.get('phone_number') || '');
  const sessionId = String(form.get('sessionId') || '');
  const userText = String(form.get('text') || '').trim();
  const { data: channels, error } = await admin.from('communication_channels').select('id,organization_id,config').eq('channel_type', 'ussd').eq('enabled', true);
  if (error) throw error;
  const channel = (channels || []).find((c: any) => (c.config.serviceCodes || [c.config.serviceCode]).some((code: string) => String(code).replace(/\s/g,'') === serviceCode));
  if (!channel) return text('END This service code is not yet registered with GrainGuard.');
  const ussdSecrets=await getSecrets(admin,channel.id), suppliedToken=new URL(req.url).searchParams.get('token')||'';
  if(!ussdSecrets.callbackToken||!safeEqual(ussdSecrets.callbackToken,suppliedToken)) return text('END This service is not authorised. Please contact the organisation.',401);
  const parts = userText ? userText.split('*') : [];
  if (!parts.length) return text('CON Welcome to GrainGuard\n1. Report grain spoilage\n2. Report pests / insects\n3. Report facility damage\n4. Request an inspection\n5. Report grain quality concern\n6. Check report status');
  if (parts[0] === '6') {
    if (!parts[1]) return text('CON Enter your report reference number:');
    const { data: found } = await admin.from('community_reports').select('reference_code,status,sender_contact').eq('organization_id', channel.organization_id).eq('reference_code', parts[1].trim().toUpperCase()).maybeSingle();
    if (!found) return text('END Report reference was not found. Contact the organisation for help.');
    if (found.sender_contact && normalisePhone(found.sender_contact) && normalisePhone(found.sender_contact) !== normalisePhone(phone)) return text('END The report contact does not match this phone number.');
    return text(`END ${found.reference_code}: ${found.status}. Thank you.`);
  }
  const categories: Record<string,string> = { '1':'grain_spoilage','2':'pests','3':'facility_damage','4':'inspection_request','5':'grain_quality' };
  if (!categories[parts[0]]) return text('END Invalid selection. Please dial the code again.');
  if (parts.length < 2) return text('CON Enter town, county or warehouse location:');
  if (parts.length < 3) return text('CON Briefly describe what you observed:');
  const message = parts.slice(2).join(' ').trim();
  if (message.length < 3) return text('CON Please enter a little more detail:');
  const rateKey=await sha256(`${channel.organization_id}|ussd|${phone||sessionId||'unknown'}`);
  const {data:allowed,error:limitError}=await admin.rpc('grain_consume_community_rate_limit',{p_rate_key:rateKey,p_max_hits:5});
  if(limitError)throw limitError;
  if(!allowed)return text('END You have reached the report limit for this hour. Please contact the organisation if the issue is urgent.');
  const report = await createCommunityReport(admin, { organizationId: channel.organization_id, source: 'ussd', senderContact: phone, category: categories[parts[0]], priority: 'normal', locationText: parts[1], message: message.slice(0, 2000), externalMessageId: sessionId || undefined }, channel.id);
  return text(`END Report received. Reference: ${report.reference_code}. Thank you for helping protect stored grain.`);
}
async function handleMailgun(admin: SupabaseClient, req: Request) {
  const form = await req.formData();
  const recipient = String(form.get('recipient') || '').toLowerCase();
  const { data: channels, error } = await admin.from('communication_channels').select('*').eq('channel_type','email').eq('enabled',true);
  if (error) throw error;
  const c = (channels || []).find((x: any) => String(x.config.receivingAddress || '').toLowerCase() === recipient);
  if (!c) return json({ error: 'Receiving address is not configured.' }, 404);
  const secrets = await getSecrets(admin, c.id);
  const timestamp = String(form.get('timestamp') || ''), token = String(form.get('token') || ''), signature = String(form.get('signature') || '');
  if (!secrets.mailgunSigningKey || !timestamp || !token || !signature) return json({ error: 'Mailgun signature credentials are missing.' }, 401);
  const age = Math.abs(Date.now()/1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 900) return json({ error: 'Mailgun webhook is outside the allowed timestamp window.' }, 401);
  const expected = await hmacHex(secrets.mailgunSigningKey, timestamp + token);
  if (!safeEqual(expected.toLowerCase(),signature.toLowerCase())) return json({ error: 'Mailgun webhook signature is invalid.' }, 401);
  const sender = String(form.get('from') || form.get('sender') || '');
  const email = (sender.match(/<([^>]+)>/)?.[1] || sender).trim().toLowerCase();
  const report = await createCommunityReport(admin, { organizationId:c.organization_id, source:'email', senderName:sender.replace(/<.*?>/,'').trim(), senderEmail:email, subject:String(form.get('subject')||'').slice(0,240), category:'email_report', locationText:'', message:String(form.get('stripped-text')||form.get('body-plain')||form.get('body-html')||'').replace(/<[^>]*>/g,' ').trim().slice(0,8000) || 'Email received without a plain-text body.', externalMessageId:token }, c.id);
  if (!report._duplicate && email) {
    try { await mailgunNotify(admin,c.organization_id,report,`Thank you. GrainGuard received your email report. Reference: ${report.reference_code}. Our team will review it.`); }
    catch (notifyError) { console.warn('Email acknowledgement could not be sent:',notifyError); }
  }
  return json({ accepted:true, reference_code:report.reference_code });
}
function metaEntryIds(payload: any) {
  const result: string[]=[];
  for (const entry of payload.entry || []) { if (entry.id) result.push(String(entry.id)); for (const ch of entry.changes || []) { if (ch.value?.metadata?.phone_number_id) result.push(String(ch.value.metadata.phone_number_id)); } }
  return result;
}
async function metaVerifyCandidates(admin: SupabaseClient) {
  const { data, error } = await admin.from('communication_channels').select('*').eq('channel_type','meta').eq('enabled',true);
  if (error) throw error; return data || [];
}
async function handleMetaGet(admin: SupabaseClient, url: URL) {
  const mode=url.searchParams.get('hub.mode'), token=url.searchParams.get('hub.verify_token')||'', challenge=url.searchParams.get('hub.challenge')||'';
  if (mode!=='subscribe'||!token||!challenge) return text('Forbidden',403);
  for (const c of await metaVerifyCandidates(admin)) { const sec=await getSecrets(admin,c.id); if(sec.verifyToken && safeEqual(sec.verifyToken,token)) return text(challenge); }
  return text('Forbidden',403);
}
async function handleMetaPost(admin: SupabaseClient, req: Request) {
  const raw = await req.text();
  let payload: any; try { payload=JSON.parse(raw); } catch { return json({error:'Invalid JSON'},400); }
  const signature=(req.headers.get('x-hub-signature-256')||'').replace(/^sha256=/,'');
  if (!signature) return json({error:'Meta signature header is missing.'},401);
  const ids=metaEntryIds(payload);
  const candidates=(await metaVerifyCandidates(admin)).filter((c:any)=>{
    const cfg=c.config||{};return ids.some(id=>[cfg.pageId,cfg.instagramAccountId,cfg.whatsappPhoneNumberId,cfg.whatsappBusinessAccountId].filter(Boolean).map(String).includes(id));
  });
  let accepted:any=null;
  for (const c of candidates) { const sec=await getSecrets(admin,c.id); if(!sec.appSecret)continue; const expected=await hmacHex(sec.appSecret,raw); if(safeEqual(expected.toLowerCase(),signature.toLowerCase())){accepted={channel:c,secrets:sec};break;} }
  if (!accepted) return json({error:'Meta webhook signature could not be verified for a configured organisation.'},401);
  const channel=accepted.channel, object=String(payload.object||'');
  for (const entry of payload.entry||[]) {
    if (object==='whatsapp_business_account') {
      for (const change of entry.changes||[]) for (const msg of change.value?.messages||[]) {
        const body=msg.text?.body||msg.button?.text||`WhatsApp message type: ${msg.type||'unknown'}`;
        const contact=change.value?.contacts?.find((x:any)=>x.wa_id===msg.from)?.profile?.name||'';
        const report=await createCommunityReport(admin,{organizationId:channel.organization_id,source:'whatsapp',externalMessageId:msg.id,senderName:contact,senderContact:msg.from,subject:'WhatsApp message',category:'social_message',message:body,locationText:''},channel.id);
        if (!report._duplicate) {
          try { await metaWhatsAppNotify(admin,channel.organization_id,report,`Thank you. GrainGuard received your message. Reference: ${report.reference_code}. Our team will review it.`); }
          catch (notifyError) { console.warn('WhatsApp acknowledgement could not be sent:',notifyError); }
        }
      }
    } else {
      const source=object==='instagram'?'instagram':'facebook';
      for (const event of entry.messaging||[]) if(event.message && !event.message.is_echo) {
        const body=event.message.text||`Social message attachment: ${Object.keys(event.message.attachments||{}).join(', ')||'message'}`;
        const who=event.sender?.id||'';
        const report=await createCommunityReport(admin,{organizationId:channel.organization_id,source,externalMessageId:event.message.mid||event.timestamp?.toString(),senderName:who?`Account ${who}`:'Social user',senderContact:who,subject:`${source} message`,category:'social_message',message:body,locationText:''},channel.id);
        if (!report._duplicate && who) {
          try { await metaSocialNotify(admin,channel.organization_id,report,`Thank you. GrainGuard received your message. Reference: ${report.reference_code}. Our team will review it.`); }
          catch (notifyError) { console.warn(`${source} acknowledgement could not be sent:`,notifyError); }
        }
      }
    }
  }
  return json({received:true});
}
async function handleTelegram(admin: SupabaseClient, req: Request, url: URL) {
  const orgId=url.searchParams.get('org_id')||'';
  const c=await getChannel(admin,orgId,'telegram'); if(!c||!c.enabled) return json({error:'Telegram organisation channel is not enabled.'},404);
  const secrets=await getSecrets(admin,c.id);
  const supplied=req.headers.get('x-telegram-bot-api-secret-token')||'';
  if(!secrets.webhookSecret||!safeEqual(secrets.webhookSecret,supplied)) return json({error:'Telegram webhook secret is invalid.'},401);
  const update=await req.json(); const msg=update.message||update.channel_post;
  if(!msg?.text) return json({received:true,ignored:true});
  const from=msg.from||{}, chat=msg.chat||{};
  const report=await createCommunityReport(admin,{organizationId:orgId,source:'telegram',externalMessageId:String(msg.message_id)+'-'+String(chat.id),senderName:[from.first_name,from.last_name].filter(Boolean).join(' ')||'Telegram user',senderContact:String(chat.id||from.id||''),senderEmail:'',subject:'Telegram community message',category:'social_message',message:String(msg.text).slice(0,8000),locationText:''},c.id);
  if (secrets.botToken && chat.id && !report._duplicate) {
    await fetch(`https://api.telegram.org/bot${secrets.botToken}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat.id,text:`Thank you. GrainGuard received your message. Reference: ${report.reference_code}.`})}).catch(()=>{});
  }
  return json({received:true,reference_code:report.reference_code});
}
async function main(req: Request) {
  if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  if(!SUPABASE_URL||!SERVICE_KEY) return json({error:'GrainGuard gateway is not provisioned. Configure Supabase Edge Function secrets.'},503);
  const admin=adminClient(), url=new URL(req.url), path=url.pathname.toLowerCase();
  try {
    if(path.endsWith('/health')||url.searchParams.get('action')==='health') return json({service:'GrainGuard Communication Gateway',status:'online',time:new Date().toISOString(),encryption_ready:!!ENCRYPTION_KEY});
    if(path.endsWith('/webhooks/ussd')) return req.method==='POST'?await handleUssd(admin,req):text('Method not allowed',405);
    if(path.endsWith('/webhooks/mailgun')) return req.method==='POST'?await handleMailgun(admin,req):json({error:'Method not allowed'},405);
    if(path.endsWith('/webhooks/meta')) return req.method==='GET'?await handleMetaGet(admin,url):req.method==='POST'?await handleMetaPost(admin,req):json({error:'Method not allowed'},405);
    if(path.endsWith('/webhooks/telegram')) return req.method==='POST'?await handleTelegram(admin,req,url):json({error:'Method not allowed'},405);
    if(req.method!=='POST') return json({error:'Use POST for this action.'},405);
    const body=await req.json(),action=String(body.action||''),orgId=String(body.organizationId||'');
    if(action==='public.report') {
      await rateLimit(admin,req,String(body.payload?.organizationId||orgId));
      const payload={...(body.payload||{}),organizationId:body.payload?.organizationId||orgId,source:'website'};
      const report=await createCommunityReport(admin,payload);
      return json({accepted:true,reference_code:report.reference_code,created_at:report.created_at});
    }
    if(action==='config.save') {
      await requireUser(req,admin,orgId,['owner','admin']);
      const saved=await saveChannel(admin,orgId,String(body.channelType||''),String(body.displayName||'GrainGuard channel'),body.config||{},body.secrets||{});
      return json({saved:true,...saved});
    }
    if(action==='config.test') {
      await requireUser(req,admin,orgId,['owner','admin']);
      return json(await testChannel(admin,orgId,String(body.channelType||'')));
    }
    if(action==='config.set_enabled') {
      await requireUser(req,admin,orgId,['owner','admin']);
      const channelType=String(body.channelType||''),enabled=body.enabled===true;
      const {error}=await admin.from('communication_channels').update({enabled,connection_state:enabled?'saved':'disabled',last_error:null,updated_at:new Date().toISOString()}).eq('organization_id',orgId).eq('channel_type',channelType);
      if(error)throw error;
      return json({saved:true,enabled,connection_state:enabled?'saved':'disabled'});
    }
    if(action==='config.delete') {
      await requireUser(req,admin,orgId,['owner','admin']);
      const channelType=String(body.channelType||'');
      const {error}=await admin.from('communication_channels').delete().eq('organization_id',orgId).eq('channel_type',channelType);
      if(error)throw error;
      return json({deleted:true,channelType});
    }
    if(action==='telegram.register') {
      await requireUser(req,admin,orgId,['owner','admin']);
      return json(await registerTelegramWebhook(admin,orgId));
    }
    if(action==='meta.register') {
      await requireUser(req,admin,orgId,['owner','admin']);
      return json(await registerMetaWebhooks(admin,orgId));
    }
    if(action==='email.register_route') {
      await requireUser(req,admin,orgId,['owner','admin']);
      return json(await registerMailgunRoute(admin,orgId));
    }
    if(action==='notify.report') {
      await requireUser(req,admin,orgId,['owner','admin','operator']);
      const {data:report,error}=await admin.from('community_reports').select('*').eq('organization_id',orgId).eq('id',body.reportId).maybeSingle();
      if(error)throw error;if(!report)throw new Error('Community report not found.');
      const message=String(body.message||'').trim().slice(0,3000);if(message.length<2)throw new Error('Enter a notification message.');
      let sent=false;
      if (report.source==='whatsapp' && report.sender_contact) sent=await metaWhatsAppNotify(admin,orgId,report,message);
      if (!sent && ['facebook','instagram'].includes(report.source) && report.sender_contact) sent=await metaSocialNotify(admin,orgId,report,message);
      if (!sent && report.source==='telegram' && report.sender_contact) sent=await telegramNotify(admin,orgId,report,message);
      if (!sent && report.sender_email) sent=await mailgunNotify(admin,orgId,report,message);
      if (!sent && report.sender_contact && !['facebook','instagram','telegram'].includes(report.source)) sent=await atNotify(admin,orgId,report,message);
      return json({accepted:sent,message:sent?'Notification accepted by the configured provider.':'No matching configured outbound channel and recipient contact were available, or the provider messaging window/permissions do not allow a reply.'});
    }
    return json({error:'Unknown GrainGuard gateway action.'},404);
  } catch(e) {
    const message=e instanceof Error?e.message:'Unexpected gateway error';
    const status=/too many submissions/i.test(message)?429:/sign in|permission|session|unauthorized/i.test(message)?401:400;
    return json({error:message},status);
  }
}

Deno.serve(main);
