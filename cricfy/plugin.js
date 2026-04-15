(function() {
    /**
     * @type {import('@skystream/sdk').Manifest}
     */
    // var manifest is injected at runtime

    registerSettings([
        { id: 'enabledProviders', name: 'Enabled Provider IDs (comma-separated)', type: 'input', default: '' }
    ]);

    const CRICFY_FIREBASE_API_KEY = '__CRICFY_FIREBASE_API_KEY__';
    const CRICFY_FIREBASE_APP_ID = '__CRICFY_FIREBASE_APP_ID__';
    const CRICFY_FIREBASE_PROJECT_NUMBER = '__CRICFY_FIREBASE_PROJECT_NUMBER__';
    const CRICIFY_PROVIDER_SECRET1 = '__CRICIFY_PROVIDER_SECRET1__';
    const CRICIFY_PROVIDER_SECRET2 = '__CRICIFY_PROVIDER_SECRET2__';
    const REMOTE_PACKAGE_NAME = 'com.cricfy.tv';

    const HEADERS = {
        'Accept': '*/*',
        'Cache-Control': 'no-cache, no-store',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    let cachedBaseUrl = null;

    function getEnabledProviderSet() {
        if (typeof settings === 'undefined' || !settings || !settings.enabledProviders) return null;
        const raw = String(settings.enabledProviders || '').trim();
        if (!raw) return null;
        const ids = raw.split(',').map(function(v){ return String(v || '').trim(); }).filter(Boolean);
        if (!ids.length) return null;
        return new Set(ids);
    }

    function filterProvidersBySettings(providers) {
        const enabled = getEnabledProviderSet();
        if (!enabled) return providers;
        const picked = providers.filter(function(p){ return enabled.has(String(p.id)); });
        return picked.length ? picked : providers;
    }

    function clean(text) { return String(text || '').trim(); }
    function parseJsonSafe(text, fallback) { try { return JSON.parse(text); } catch (_) { return fallback; } }
    function rawToBytes(raw) { const out = []; for (let i = 0; i < raw.length; i++) out.push(raw.charCodeAt(i) & 255); return out; }
    function bytesToRaw(bytes) { return bytes.map(function(b){ return String.fromCharCode(b & 255); }).join(''); }
    function bytesToB64(bytes) { return btoa(bytesToRaw(bytes)); }
    function b64ToBytes(b64) {
        const c = clean(b64).replace(/-/g, '+').replace(/_/g, '/');
        const p = c + '='.repeat((4 - (c.length % 4)) % 4);
        return rawToBytes(atob(p));
    }
    function hexToBytes(hex) {
        const s = clean(hex).replace(/-/g, '').toLowerCase();
        if (!/^[0-9a-f]+$/.test(s) || s.length % 2 !== 0) return null;
        const out = [];
        for (let i = 0; i < s.length; i += 2) out.push(parseInt(s.slice(i, i + 2), 16));
        return out;
    }
    function normalizeDrmHex(v) {
        const s = clean(v);
        if (!s || s.toLowerCase() === 'null') return null;
        const hex = s.replace(/-/g, '');
        if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) return hex.toLowerCase();
        try { return b64ToBytes(s).map(function(x){ return ('0' + x.toString(16)).slice(-2); }).join(''); } catch (_) { return null; }
    }
    function hexToB64Url(hex) {
        const b = hexToBytes(hex);
        if (!b) return null;
        return bytesToB64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function parseSecretPair(secret) {
        const p = clean(secret).split(':');
        if (p.length !== 2) return null;
        const keyBytes = hexToBytes(p[0]);
        const ivBytes = hexToBytes(p[1]);
        if (!keyBytes || !ivBytes) return null;
        return { keyB64: bytesToB64(keyBytes), ivB64: bytesToB64(ivBytes) };
    }

    async function decryptCricfy(content) {
        const text = clean(content);
        if (!text) return '';
        if (text.startsWith('{') || text.startsWith('[') || text.startsWith('#EXTM3U')) return text;

        const secrets = [clean(CRICIFY_PROVIDER_SECRET1), clean(CRICIFY_PROVIDER_SECRET2)].filter(Boolean);
        const normalized = text.replace(/\s+/g, '');
        for (let i = 0; i < secrets.length; i++) {
            const pair = parseSecretPair(secrets[i]);
            if (!pair) continue;
            try {
                const dec = await crypto.decryptAES(normalized, pair.keyB64, pair.ivB64);
                if (!dec) continue;
                const d = clean(dec);
                if (d.startsWith('{') || d.startsWith('[') || d.includes('http') || d.includes('#EXTM3U')) return dec;
            } catch (_) {}
        }
        return text;
    }

    async function fetchRemoteEntries(packageName, apiKey, appId, projectNumber) {
        if (!apiKey || !appId || !projectNumber) return null;
        const url = 'https://firebaseremoteconfig.googleapis.com/v1/projects/' + projectNumber + '/namespaces/firebase:fetch';
        const appInstanceId = Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
        const body = JSON.stringify({
            appInstanceId: appInstanceId,
            appInstanceIdToken: '',
            appId: appId,
            countryCode: 'US',
            languageCode: 'en-US',
            platformVersion: '30',
            timeZone: 'UTC',
            appVersion: '5.0',
            appBuild: '50',
            packageName: packageName,
            sdkVersion: '22.1.0',
            analyticsUserProperties: {}
        });
        const res = await http_post(url, {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Android-Package': packageName,
            'X-Goog-Api-Key': apiKey,
            'X-Google-GFE-Can-Retry': 'yes'
        }, body);
        const parsed = parseJsonSafe(res.body, {});
        return parsed && parsed.entries ? parsed.entries : null;
    }

    async function getBaseUrl() {
        if (cachedBaseUrl) return cachedBaseUrl;
        const entries = await fetchRemoteEntries(
            REMOTE_PACKAGE_NAME,
            clean(CRICFY_FIREBASE_API_KEY),
            clean(CRICFY_FIREBASE_APP_ID),
            clean(CRICFY_FIREBASE_PROJECT_NUMBER)
        );
        const remote = entries ? (entries.cric_api2 || entries.cric_api1 || '') : '';
        cachedBaseUrl = clean(remote || manifest.baseUrl).replace(/\/+$/, '');
        return cachedBaseUrl;
    }

    async function fetchProviders() {
        const base = await getBaseUrl();
        const res = await http_get(base + '/cats.txt', HEADERS);
        const decrypted = await decryptCricfy(res.body || '');
        const list = parseJsonSafe(decrypted, []);
        if (!Array.isArray(list)) return [];
        return list.filter(function(p){ return p && p.catLink && String(p.catLink).trim() && String(p.catLink).trim().toLowerCase() !== 'null' && String(p.catLink).trim().toLowerCase() !== 'ok'; })
            .map(function(p){ return { id: p.id, title: p.title || 'Provider', image: p.image || '', catLink: p.catLink }; });
    }

    async function fetchLiveEvents() {
        const base = await getBaseUrl();
        const res = await http_get(base + '/categories/live-events.txt', HEADERS);
        const decrypted = await decryptCricfy(res.body || '');
        const list = parseJsonSafe(decrypted, []);
        if (!Array.isArray(list)) return [];
        return list.filter(function(e){ return Number(e.publish || 0) === 1; });
    }

    function parseProviderDateTime(text) {
        const input = clean(text);
        if (!input) return NaN;
        const m = input.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s+([+-])(\d{2})(\d{2})$/);
        if (!m) return NaN;
        const year = Number(m[1]);
        const month = Number(m[2]);
        const day = Number(m[3]);
        const hour = Number(m[4]);
        const minute = Number(m[5]);
        const second = Number(m[6]);
        const sign = m[7] === '-' ? -1 : 1;
        const tzHour = Number(m[8]);
        const tzMinute = Number(m[9]);
        const offsetMinutes = sign * (tzHour * 60 + tzMinute);
        return Date.UTC(year, month - 1, day, hour, minute, second) - (offsetMinutes * 60 * 1000);
    }

    function createDisplayTitle(event) {
        const info = event && event.eventInfo ? event.eventInfo : {};
        if (info.teamA && info.teamB) {
            if (info.teamA === info.teamB) return String(info.teamA);
            return String(info.teamA) + ' vs ' + String(info.teamB);
        }
        return event && event.title ? event.title : 'Live Event';
    }

    function isEventLive(event) {
        const info = event && event.eventInfo ? event.eventInfo : null;
        if (!info) return false;
        const now = Date.now();
        const startTime = parseProviderDateTime(info.startTime);
        const endTime = parseProviderDateTime(info.endTime);
        if (!Number.isNaN(endTime) && now >= endTime) return false;
        if (!Number.isNaN(startTime) && now >= startTime) return true;
        return false;
    }

    function isEventEnded(event) {
        const info = event && event.eventInfo ? event.eventInfo : null;
        if (!info) return false;
        const endTime = parseProviderDateTime(info.endTime);
        return !Number.isNaN(endTime) && Date.now() >= endTime;
    }

    function eventStatus(event) {
        const info = event && event.eventInfo ? event.eventInfo : null;
        if (!info) return '';
        try {
            const now = Date.now();
            const s = parseProviderDateTime(info.startTime);
            const e = parseProviderDateTime(info.endTime);
            if (!Number.isNaN(e) && now >= e) return '[ENDED]';
            if (!Number.isNaN(s) && now >= s) return '[LIVE]';
            if (!Number.isNaN(s) && now < s) return '[UPCOMING]';
        } catch (_) {}
        return '';
    }

    function formatMatchTime(text) {
        const ts = parseProviderDateTime(text);
        if (Number.isNaN(ts)) return '';
        try {
            return new Date(ts).toLocaleString('en-US', {
                month: 'short',
                day: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        } catch (_) {
            return '';
        }
    }

    function matchCard(event) {
        const i = event.eventInfo || {};
        let u = 'https://live-card-png.cricify.workers.dev/?title=' + encodeURIComponent(i.eventName || event.title || 'Live Event');
        u += '&teamA=' + encodeURIComponent(i.teamA || 'Team A');
        u += '&teamB=' + encodeURIComponent(i.teamB || 'Team B');
        if (i.teamAFlag) u += '&teamAImg=' + encodeURIComponent(i.teamAFlag);
        if (i.teamBFlag) u += '&teamBImg=' + encodeURIComponent(i.teamBFlag);
        if (i.eventLogo) u += '&eventLogo=' + encodeURIComponent(i.eventLogo);
        const formattedTime = formatMatchTime(i.startTime);
        if (formattedTime) u += '&time=' + encodeURIComponent(formattedTime);
        u += '&isLive=' + String(isEventLive(event));
        u += '&isEnded=' + String(isEventEnded(event));
        return u;
    }

    function parseM3U(content) {
        const lines = String(content || '').split(/\r?\n/);
        const channels = [];
        let cur = null;
        let pending = { headers: {}, userAgent: '', cookie: '', key: '', keyid: '', licenseUrl: '', drmKeys: {} };

        lines.forEach(function(raw) {
            const line = raw.trim();
            if (!line) return;
            if (line.startsWith('#EXTINF')) {
                const t = line.match(/,(.*)$/); const g = line.match(/group-title="([^"]*)"/); const l = line.match(/tvg-logo="([^"]*)"/);
                cur = {
                    title: t ? t[1].trim() : 'Unknown', group: g ? g[1] : 'Uncategorized', poster: l ? l[1] : '',
                    headers: Object.assign({}, pending.headers), userAgent: pending.userAgent, cookie: pending.cookie,
                    key: pending.key, keyid: pending.keyid, licenseUrl: pending.licenseUrl, drmKeys: Object.assign({}, pending.drmKeys)
                };
                pending = { headers: {}, userAgent: '', cookie: '', key: '', keyid: '', licenseUrl: '', drmKeys: {} };
                return;
            }
            if (line.startsWith('#EXTHTTP:')) {
                const o = parseJsonSafe(line.replace(/^#EXTHTTP:/i, ''), {});
                if (o.cookie) pending.cookie = o.cookie;
                if (o['user-agent']) pending.userAgent = o['user-agent'];
                return;
            }
            if (line.startsWith('#EXTVLCOPT:')) {
                const ua = line.match(/http-user-agent=(.*)$/i);
                const rf = line.match(/http-referrer=(.*)$/i) || line.match(/http-referer=(.*)$/i);
                if (ua && ua[1]) pending.userAgent = ua[1].replace(/"/g, '').trim();
                if (rf && rf[1]) pending.headers['Referer'] = rf[1].replace(/"/g, '').trim();
                return;
            }
            if (line.startsWith('#KODIPROP:inputstream.adaptive.license_key=')) {
                const v = line.replace(/^#KODIPROP:inputstream\.adaptive\.license_key=/i, '').trim();
                if (/^https?:\/\//i.test(v)) pending.licenseUrl = v;
                else if (v.startsWith('{')) {
                    const j = parseJsonSafe(v, {}); const map = {}; const keys = Array.isArray(j.keys) ? j.keys : [];
                    keys.forEach(function(k){ const kid = normalizeDrmHex(k && k.kid); const key = normalizeDrmHex(k && k.k); if (kid && key) map[kid] = key; });
                    pending.drmKeys = map; const first = Object.keys(map)[0]; if (first) { pending.keyid = first; pending.key = map[first]; }
                } else {
                    const p = v.includes(':') ? v.split(':') : (v.includes(',') ? v.split(',') : []);
                    if (p.length === 2) { pending.keyid = normalizeDrmHex(p[0]) || ''; pending.key = normalizeDrmHex(p[1]) || ''; }
                }
                return;
            }
            if (!line.startsWith('#') && cur) {
                let u = line; const parts = line.split('|'); const headers = Object.assign({}, cur.headers);
                if (parts.length > 1) {
                    u = parts[0];
                    parts.slice(1).join('|').split('&').forEach(function(kv){ const i = kv.indexOf('='); if (i < 0) return; const k = kv.slice(0, i).trim(); const v = kv.slice(i + 1).trim(); if (!k) return; const lk = k.toLowerCase(); if (lk === 'referer' || lk === 'referrer') headers['Referer'] = v; else if (lk === 'origin') headers['Origin'] = v; else headers[k] = v; });
                }
                channels.push({ title: cur.title, group: cur.group, poster: cur.poster, url: u, headers: headers, userAgent: cur.userAgent, cookie: cur.cookie, key: cur.key, keyid: cur.keyid, licenseUrl: cur.licenseUrl, drmKeys: cur.drmKeys });
                cur = null;
            }
        });
        return channels;
    }

    async function fetchPlaylistChannels(link) {
        const res = await http_get(link, HEADERS);
        const raw = clean(res.body || '');
        const dec = await decryptCricfy(raw);
        const text = dec && dec.length ? dec : raw;
        return parseM3U(text);
    }

    async function getHome(cb) {
        try {
            // const providers = filterProvidersBySettings(await fetchProviders());
            const events = await fetchLiveEvents();
            const data = {};
            // providers.forEach(function(p){
            //     data[p.title] = [new MultimediaItem({ title: p.title, url: JSON.stringify({ kind: 'provider', provider: p }), posterUrl: p.image || '', type: 'livestream', description: p.catLink || '' })];
            // });
            const grouped = {};
            events.forEach(function(e){ const cat = (e.eventInfo && e.eventInfo.eventCat) || e.cat || 'Other'; if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(e); });
            Object.keys(grouped).forEach(function(cat){
                const sorted = grouped[cat].slice().sort(function(a, b) {
                    return Number(isEventLive(b)) - Number(isEventLive(a));
                });
                data['Live ' + cat] = sorted.map(function(e){
                    const i = e.eventInfo || {};
                    const t = createDisplayTitle(e);
                    const status = eventStatus(e);
                    const poster = matchCard(e);
                    return new MultimediaItem({ title: (status ? status + ' ' : '') + t, url: JSON.stringify({ kind: 'event', event: e, title: t, poster: poster }), posterUrl: poster, type: 'livestream', description: i.eventName || e.title });
                });
            });
            cb({ success: true, data: data });
        } catch (e) {
            cb({ success: false, errorCode: 'HOME_ERROR', message: String(e && e.message ? e.message : e) });
        }
    }

    async function search(query, cb) {
        try {
            const q = String(query || '').toLowerCase();
            const events = await fetchLiveEvents();
            const out = [];
            events.forEach(function(e){ const i=e.eventInfo||{}; const t=createDisplayTitle(e); const s=(e.title+' '+(i.teamA||'')+' '+(i.teamB||'')+' '+(i.eventName||'')+' '+(i.eventType||'')).toLowerCase(); if (s.includes(q)) { const status = eventStatus(e); out.push(new MultimediaItem({ title:(status ? status + ' ' : '') + t, url: JSON.stringify({ kind:'event', event:e, title:t, poster:matchCard(e) }), posterUrl: matchCard(e), type:'livestream' })); } });
            cb({ success: true, data: out });
        } catch (_) {
            cb({ success: true, data: [] });
        }
    }

    async function load(url, cb) {
        try {
            const payload = parseJsonSafe(url, null);
            if (!payload) return cb({ success: false, errorCode: 'PARSE_ERROR', message: 'Invalid payload' });

            if (payload.kind === 'provider') {
                const provider = payload.provider;
                const channels = await fetchPlaylistChannels(provider.catLink);
                const eps = channels.map(function(ch, idx){
                    return new Episode({ name: ch.title || ('Channel ' + (idx + 1)), season: 1, episode: idx + 1, posterUrl: ch.poster || provider.image || '', url: JSON.stringify({ kind: 'channel', channel: ch, providerTitle: provider.title }) });
                });
                return cb({ success: true, data: new MultimediaItem({ title: provider.title, url: url, posterUrl: provider.image || '', description: provider.catLink || '', type: 'livestream', episodes: eps }) });
            }

            if (payload.kind === 'event') {
                const e = payload.event || {}; const i = e.eventInfo || {};
                let plot = '';
                if (i.eventType) plot += 'Type: ' + i.eventType + '\n';
                if (i.eventName) plot += 'Event: ' + i.eventName + '\n';
                if (i.startTime) plot += 'Start: ' + i.startTime + '\n';
                const serverCount = Array.isArray(e.formats) ? e.formats.length : 0;
                plot += '\nAvailable Servers: ' + String(serverCount);
                return cb({ success: true, data: new MultimediaItem({ title: payload.title || e.title || 'Live Event', url: url, posterUrl: payload.poster || e.image || '', description: plot, type: 'livestream', episodes: [new Episode({ name: 'Watch Live', season: 1, episode: 1, url: url, posterUrl: payload.poster || e.image || '' })] }) });
            }

            if (payload.kind === 'channel') {
                const ch = payload.channel;
                return cb({ success: true, data: new MultimediaItem({ title: ch.title || 'Channel', url: url, posterUrl: ch.poster || '', description: ch.group || payload.providerTitle || '', type: 'livestream', episodes: [new Episode({ name: 'Watch Live', season: 1, episode: 1, url: url, posterUrl: ch.poster || '' })] }) });
            }

            cb({ success: false, errorCode: 'PARSE_ERROR', message: 'Unknown payload kind' });
        } catch (e) {
            cb({ success: false, errorCode: 'LOAD_ERROR', message: String(e && e.message ? e.message : e) });
        }
    }

    async function fetchEventStreams(event) {
        const base = await getBaseUrl();
        const slug = clean(event.slug || '').toLowerCase();
        if (!slug) return [];
        const res = await http_get(base + '/channels/' + slug + '.txt', HEADERS);
        const dec = await decryptCricfy(res.body || '');
        const obj = parseJsonSafe(dec, null);
        if (obj && Array.isArray(obj.streamUrls)) return obj.streamUrls;
        return [];
    }

    function parseStreamLink(link) {
        const parts = String(link || '').split('|');
        const url = parts[0] || '';
        const headers = {};
        if (parts.length > 1) {
            parts.slice(1).join('|').split('&').forEach(function(kv){ const i = kv.indexOf('='); if (i < 0) return; const k = kv.slice(0, i).trim(); const v = kv.slice(i + 1).trim(); if (!k) return; const lk = k.toLowerCase(); if (lk === 'user-agent') headers['User-Agent'] = v; else if (lk === 'referer' || lk === 'referrer') headers['Referer'] = v; else if (lk === 'origin') headers['Origin'] = v; else if (lk === 'cookie') headers['Cookie'] = v; else headers[k] = v; });
        }
        return { url: url, headers: headers };
    }

    async function loadStreams(url, cb) {
        try {
            const payload = parseJsonSafe(url, null);
            if (!payload) return cb({ success: false, errorCode: 'PARSE_ERROR', message: 'Invalid stream payload' });

            if (payload.kind === 'event') {
                const streams = await fetchEventStreams(payload.event || {});
                const out = [];
                streams.forEach(function(s, idx){
                    const parsed = parseStreamLink(s.link || '');
                    if (!parsed.url) return;
                    const r = new StreamResult({ url: parsed.url, source: s.title || ('Server ' + (idx + 1)), headers: parsed.headers });
                    if ((String(s.type || '') === '7' || String(parsed.url || '').toLowerCase().includes('.mpd')) && s.api && String(s.api).includes(':')) {
                        const p = String(s.api).split(':');
                        const kidHex = normalizeDrmHex(p[0]);
                        const keyHex = normalizeDrmHex(p[1]);
                        if (kidHex && keyHex) {
                            r.drmKid = hexToB64Url(kidHex) || kidHex;
                            r.drmKey = hexToB64Url(keyHex) || keyHex;
                        }
                    }
                    out.push(r);
                });
                return cb({ success: true, data: out });
            }

            if (payload.kind === 'channel') {
                const ch = payload.channel || {};
                const headers = Object.assign({}, ch.headers || {});
                if (ch.userAgent) headers['User-Agent'] = ch.userAgent;
                if (ch.cookie) headers['Cookie'] = ch.cookie;
                const r = new StreamResult({ url: ch.url, source: payload.providerTitle || 'Cricfy', headers: headers });
                if (String(ch.url || '').toLowerCase().includes('.mpd')) {
                    const keyHex = normalizeDrmHex(ch.key);
                    const kidHex = normalizeDrmHex(ch.keyid);
                    if (keyHex && kidHex) {
                        r.drmKey = hexToB64Url(keyHex) || keyHex;
                        r.drmKid = hexToB64Url(kidHex) || kidHex;
                    } else if (ch.licenseUrl) {
                        r.licenseUrl = String(ch.licenseUrl);
                    }
                }
                return cb({ success: true, data: [r] });
            }

            cb({ success: false, errorCode: 'PARSE_ERROR', message: 'Unsupported kind for streams' });
        } catch (e) {
            cb({ success: false, errorCode: 'STREAM_ERROR', message: String(e && e.message ? e.message : e) });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
