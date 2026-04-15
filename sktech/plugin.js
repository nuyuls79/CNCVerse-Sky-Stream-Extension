(function() {
    /**
     * @type {import('@skystream/sdk').Manifest}
     */
    // var manifest is injected at runtime

    registerSettings([
        { id: 'enabledProviders', name: 'Enabled Provider IDs (comma-separated)', type: 'input', default: '' }
    ]);

    const SKTECH_FIREBASE_API_KEY = '__SKTECH_FIREBASE_API_KEY__';
    const SKTECH_FIREBASE_APP_ID = '__SKTECH_FIREBASE_APP_ID__';
    const SKTECH_FIREBASE_PROJECT_NUMBER = '__SKTECH_FIREBASE_PROJECT_NUMBER__';
    const SKLIVE_V23_KEY = '__SKLIVE_V23_KEY__';
    const SKLIVE_V23_IV = '__SKLIVE_V23_IV__';
    const SKLIVE_KEY = '__SKLIVE_KEY__';
    const SKLIVE_IV = '__SKLIVE_IV__';

    const HEADERS = {
        'Accept': '*/*',
        'Cache-Control': 'no-cache, no-store',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };
    const LOOKUP_TABLE_D = "\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\b\t\n\u000B\u000C\r\u000E\u000F" +
        "\u0010\u0011\u0012\u0013\u0014\u0015\u0016\u0017\u0018\u0019\u001A\u001B\u001C\u001D\u001E\u001F" +
        " !\"#$%&'()*+,-./" +
        "0123456789:;<=>?" +
        "@EGMNKABUVCDYHLI" +
        "FPOZQSRWTXJ[\\]^_" +
        "`egmnkabuvcdyhli" +
        "fpozqsrwtxj{|}~\u007F";

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

    function parseJsonSafe(text, fallback) { try { return JSON.parse(text); } catch (_) { return fallback; } }
    function clean(text) { return String(text || '').trim(); }
    function bytesToRaw(bytes) { return bytes.map(function(b){ return String.fromCharCode(b & 255); }).join(''); }
    function rawToBytes(raw) { const out=[]; for (let i=0;i<raw.length;i++) out.push(raw.charCodeAt(i)&255); return out; }
    function b64ToBytes(b64) {
        const c = clean(b64).replace(/-/g, '+').replace(/_/g, '/');
        const p = c + '='.repeat((4 - (c.length % 4)) % 4);
        return rawToBytes(atob(p));
    }
    function bytesToB64(bytes) { return btoa(bytesToRaw(bytes)); }
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
        try { return b64ToBytes(s).map(function(x){ return ('0'+x.toString(16)).slice(-2); }).join(''); } catch(_) { return null; }
    }
    function hexToB64Url(hex) {
        const b = hexToBytes(hex);
        if (!b) return null;
        return bytesToB64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
        const apiKey = clean(SKTECH_FIREBASE_API_KEY);
        const appId = clean(SKTECH_FIREBASE_APP_ID);
        const project = clean(SKTECH_FIREBASE_PROJECT_NUMBER);
        const entries = await fetchRemoteEntries('com.live.sktechtv', apiKey, appId, project);
        const remote = entries && entries.api_url ? clean(entries.api_url).replace(/\/+$/, '') : '';
        cachedBaseUrl = remote || clean(manifest.baseUrl).replace(/\/+$/, '');
        return cachedBaseUrl;
    }

    function customToStandardBase64(customB64) {
        let out = '';
        const s = String(customB64 || '');
        for (let i = 0; i < s.length; i++) {
            const code = s.charCodeAt(i);
            out += code < LOOKUP_TABLE_D.length ? LOOKUP_TABLE_D.charAt(code) : s.charAt(i);
        }
        return out;
    }

    async function decryptV23(encrypted) {
        const key = clean(SKLIVE_V23_KEY);
        const iv = clean(SKLIVE_V23_IV);
        if (!key || !iv) return null;
        try {
            const padded = encrypted.length % 4 ? encrypted + '='.repeat(4 - encrypted.length % 4) : encrypted;
            const inner = b64ToBytes(padded);
            for (let i = 0; i < inner.length - 1; i += 2) {
                const t = inner[i]; inner[i] = inner[i + 1]; inner[i + 1] = t;
            }
            inner.reverse();
            const ciphertext = b64ToBytes(bytesToRaw(inner));
            return await crypto.decryptAES(bytesToB64(ciphertext), bytesToB64(rawToBytes(key)), bytesToB64(rawToBytes(iv)));
        } catch (_) { return null; }
    }

    async function decryptLegacy(encrypted) {
        const keyHex = clean(SKLIVE_KEY);
        const ivHex = clean(SKLIVE_IV);
        if (!keyHex || !ivHex) return null;
        try {
            const standard = customToStandardBase64(encrypted);
            const decoded = bytesToRaw(b64ToBytes(standard));
            const reversed = decoded.split('').reverse().join('');
            const ciphertext = b64ToBytes(reversed);
            return await crypto.decryptAES(bytesToB64(ciphertext), bytesToB64(hexToBytes(keyHex)), bytesToB64(hexToBytes(ivHex)));
        } catch (_) { return null; }
    }

    async function decryptSKLive(content) {
        const text = clean(content);
        if (!text) return '';
        if (text.startsWith('{') || text.startsWith('[') || text.startsWith('#EXTM3U')) return text;
        const v23 = await decryptV23(text);
        const v23Text = typeof v23 === 'string' ? v23 : '';
        if (v23Text && (v23Text.startsWith('{') || v23Text.startsWith('[') || v23Text.includes('#EXTM3U'))) return v23Text;
        const legacy = await decryptLegacy(text);
        const legacyText = typeof legacy === 'string' ? legacy : '';
        if (legacyText && (legacyText.startsWith('{') || legacyText.startsWith('[') || legacyText.includes('#EXTM3U'))) return legacyText;
        return text;
    }

    function parseDateTime(d, t) {
        if (!d || !t) return null;
        const p = String(d).split('/');
        if (p.length !== 3) return null;
        return p[2] + '/' + p[1] + '/' + p[0] + ' ' + t + ' +0000';
    }

    async function fetchProviders() {
        const base = await getBaseUrl();
        const res = await http_get(base + '/categories.txt', HEADERS);
        const decrypted = await decryptSKLive(res.body || '');
        const wrappers = parseJsonSafe(decrypted, []);
        if (!Array.isArray(wrappers)) return [];
        const out = [];
        wrappers.forEach(function(w, idx) {
            const cat = parseJsonSafe(w && w.cat ? w.cat : '', null);
            if (!cat || cat.visible === false || !cat.api) return;
            out.push({ id: idx + 1, title: cat.name || ('Playlist ' + (idx + 1)), image: cat.logo || '', catLink: cat.api });
        });
        return out;
    }

    async function fetchLiveEvents() {
        const base = await getBaseUrl();
        const res = await http_get(base + '/events.txt', HEADERS);
        const decrypted = await decryptSKLive(res.body || '');
        const wrappers = parseJsonSafe(decrypted, []);
        if (!Array.isArray(wrappers)) return [];
        const out = [];
        wrappers.forEach(function(w, idx) {
            const e = parseJsonSafe(w && w.event ? w.event : '', null);
            if (!e || e.visible === false) return;
            const links = e.links || '';
            out.push({
                id: idx + 1,
                title: e.eventName || 'Event',
                image: e.eventLogo || '',
                slug: links ? String(links).replace(/\.txt$/i, '').replace(/\.m3u8?$/i, '') : ('event-' + (idx + 1)),
                cat: e.category || 'Other',
                eventInfo: {
                    teamA: e.teamAName || '',
                    teamB: e.teamBName || '',
                    teamAFlag: e.teamAFlag || '',
                    teamBFlag: e.teamBFlag || '',
                    eventCat: e.category || 'Other',
                    eventName: e.eventName || '',
                    eventLogo: e.eventLogo || '',
                    startTime: parseDateTime(e.date, e.time),
                    endTime: parseDateTime(e.end_date, e.end_time)
                },
                formats: Array.isArray(e.link_names) ? e.link_names.map(function(n){ return { title: n, webLink: e.links || '' }; }) : []
            });
        });
        return out;
    }

    function parseM3U(content) {
        const lines = String(content || '').split(/\r?\n/);
        const channels = [];
        let cur = null;
        let pending = { headers: {}, userAgent: '', cookie: '', key: '', keyid: '', licenseUrl: '', drmKeys: {} };

        function newCur(line) {
            const t = line.match(/,(.*)$/); const g = line.match(/group-title="([^"]*)"/); const l = line.match(/tvg-logo="([^"]*)"/);
            cur = {
                title: t ? t[1].trim() : 'Unknown', group: g ? g[1] : 'Uncategorized', poster: l ? l[1] : '',
                headers: Object.assign({}, pending.headers), userAgent: pending.userAgent, cookie: pending.cookie,
                key: pending.key, keyid: pending.keyid, licenseUrl: pending.licenseUrl, drmKeys: Object.assign({}, pending.drmKeys)
            };
            pending = { headers: {}, userAgent: '', cookie: '', key: '', keyid: '', licenseUrl: '', drmKeys: {} };
        }

        lines.forEach(function(raw) {
            const line = raw.trim(); if (!line) return;
            if (line.startsWith('#EXTINF')) return newCur(line);
            if (line.startsWith('#EXTHTTP:')) {
                const o = parseJsonSafe(line.replace(/^#EXTHTTP:/i, ''), {});
                if (o.cookie) pending.cookie = o.cookie; if (o['user-agent']) pending.userAgent = o['user-agent']; return;
            }
            if (line.startsWith('#EXTVLCOPT:')) {
                const ua = line.match(/http-user-agent=(.*)$/i); const rf = line.match(/http-referrer=(.*)$/i) || line.match(/http-referer=(.*)$/i);
                if (ua && ua[1]) pending.userAgent = ua[1].replace(/"/g, '').trim();
                if (rf && rf[1]) pending.headers['Referer'] = rf[1].replace(/"/g, '').trim();
                return;
            }
            if (line.startsWith('#KODIPROP:inputstream.adaptive.license_key=')) {
                const v = line.replace(/^#KODIPROP:inputstream\.adaptive\.license_key=/i, '').trim();
                if (/^https?:\/\//i.test(v)) pending.licenseUrl = v;
                else if (v.startsWith('{')) {
                    const j = parseJsonSafe(v, {}); const keys = Array.isArray(j.keys) ? j.keys : []; const map = {};
                    keys.forEach(function(k){ const kid = normalizeDrmHex(k && k.kid); const key = normalizeDrmHex(k && k.k); if (kid && key) map[kid] = key; });
                    pending.drmKeys = map; const first = Object.keys(map)[0]; if (first) { pending.keyid = first; pending.key = map[first]; }
                } else {
                    const p = v.includes(':') ? v.split(':') : (v.includes(',') ? v.split(',') : []);
                    if (p.length === 2) { pending.keyid = normalizeDrmHex(p[0]) || ''; pending.key = normalizeDrmHex(p[1]) || ''; }
                }
                return;
            }
            if (!line.startsWith('#') && cur) {
                let url = line; const parts = line.split('|'); const headers = Object.assign({}, cur.headers);
                if (parts.length > 1) {
                    url = parts[0];
                    parts.slice(1).join('|').split('&').forEach(function(kv){ const i = kv.indexOf('='); if (i < 0) return; const k = kv.slice(0,i).trim(); const v = kv.slice(i+1).trim(); if (!k) return; if (k.toLowerCase()==='referer'||k.toLowerCase()==='referrer') headers['Referer']=v; else if (k.toLowerCase()==='origin') headers['Origin']=v; else headers[k]=v; });
                }
                channels.push({ title: cur.title, group: cur.group, poster: cur.poster, url: url, headers: headers, userAgent: cur.userAgent, cookie: cur.cookie, key: cur.key, keyid: cur.keyid, licenseUrl: cur.licenseUrl, drmKeys: cur.drmKeys });
                cur = null;
            }
        });
        return channels;
    }

    async function fetchPlaylistChannels(link) {
        const res = await http_get(link, HEADERS);
        const raw = clean(res.body);
        const dec = await decryptSKLive(raw);
        const content = dec && dec.length ? dec : raw;
        return parseM3U(content);
    }

    function eventStatus(info) {
        try {
            const now = Date.now();
            const s = info && info.startTime ? Date.parse(String(info.startTime).replace(' +0000', 'Z').replace(/\//g, '-')) : NaN;
            const e = info && info.endTime ? Date.parse(String(info.endTime).replace(' +0000', 'Z').replace(/\//g, '-')) : NaN;
            if (!Number.isNaN(e) && now >= e) return '[ENDED]';
            if (!Number.isNaN(s) && now >= s) return '[LIVE]';
            if (!Number.isNaN(s) && now < s) return '[UPCOMING]';
        } catch (_) {}
        return '';
    }

    function matchCard(event) {
        const i = event.eventInfo || {};
        let u = 'https://live-card-png.cricify.workers.dev/?title=' + encodeURIComponent(i.eventName || event.title || 'Live Event');
        u += '&teamA=' + encodeURIComponent(i.teamA || 'A');
        u += '&teamB=' + encodeURIComponent(i.teamB || 'B');
        if (i.teamAFlag) u += '&teamAImg=' + encodeURIComponent(i.teamAFlag);
        if (i.teamBFlag) u += '&teamBImg=' + encodeURIComponent(i.teamBFlag);
        if (i.eventLogo) u += '&eventLogo=' + encodeURIComponent(i.eventLogo);
        if (i.startTime) u += '&time=' + encodeURIComponent(i.startTime);
        return u;
    }

    async function getHome(cb) {
        try {
            // const providers = filterProvidersBySettings(await fetchProviders());
            const events = await fetchLiveEvents();
            const data = {};
            // providers.forEach(function(p) {
            //     data[p.title] = [new MultimediaItem({ title: p.title, url: JSON.stringify({ kind: 'provider', provider: p }), posterUrl: p.image || '', type: 'livestream', description: p.catLink || '' })];
            // });
            const grouped = {};
            events.forEach(function(e){ const c = (e.eventInfo && e.eventInfo.eventCat) || e.cat || 'Other'; if (!grouped[c]) grouped[c] = []; grouped[c].push(e); });
            Object.keys(grouped).forEach(function(cat){
                data['Live ' + cat] = grouped[cat].map(function(e){
                    const i = e.eventInfo || {};
                    const t = i.teamA && i.teamB && i.teamA !== i.teamB ? (i.teamA + ' vs ' + i.teamB) : e.title;
                    const status = eventStatus(i);
                    const card = matchCard(e);
                    return new MultimediaItem({ title: (status ? status + ' ' : '') + t, url: JSON.stringify({ kind: 'event', event: e, poster: card, title: t }), posterUrl: card, type: 'livestream', description: i.eventName || e.title });
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
            const providers = filterProvidersBySettings(await fetchProviders());
            const events = await fetchLiveEvents();
            const out = [];
            providers.forEach(function(p){ if (String(p.title || '').toLowerCase().includes(q)) out.push(new MultimediaItem({ title: p.title, url: JSON.stringify({ kind:'provider', provider:p }), posterUrl: p.image || '', type: 'livestream' })); });
            events.forEach(function(e){ const i=e.eventInfo||{}; const t=(i.teamA&&i.teamB&&i.teamA!==i.teamB)?(i.teamA+' vs '+i.teamB):e.title; const s=(e.title+' '+(i.teamA||'')+' '+(i.teamB||'')+' '+(i.eventName||'')).toLowerCase(); if (s.includes(q)) out.push(new MultimediaItem({ title: t, url: JSON.stringify({kind:'event', event:e, poster:matchCard(e), title:t}), posterUrl: matchCard(e), type:'livestream' })); });
            cb({ success: true, data: out });
        } catch (_) { cb({ success: true, data: [] }); }
    }

    async function load(url, cb) {
        try {
            const payload = parseJsonSafe(url, null);
            if (!payload) return cb({ success: false, errorCode: 'PARSE_ERROR', message: 'Invalid payload' });
            if (payload.kind === 'provider') {
                const provider = payload.provider;
                const channels = await fetchPlaylistChannels(provider.catLink);
                const eps = channels.map(function(ch, idx){ return new Episode({ name: ch.title || ('Channel '+(idx+1)), season:1, episode:idx+1, posterUrl: ch.poster || provider.image || '', url: JSON.stringify({ kind:'channel', channel: ch, providerTitle: provider.title }) }); });
                return cb({ success: true, data: new MultimediaItem({ title: provider.title, url: url, posterUrl: provider.image || '', description: provider.catLink || '', type: 'livestream', episodes: eps }) });
            }
            if (payload.kind === 'event') {
                const event = payload.event || {}; const info = event.eventInfo || {};
                const plot = (info.eventName ? ('Event: ' + info.eventName + '\n') : '') + (info.startTime ? ('Start: ' + info.startTime) : '');
                return cb({ success: true, data: new MultimediaItem({ title: payload.title || event.title || 'Live Event', url: url, posterUrl: payload.poster || event.image || '', description: plot, type: 'livestream', episodes: [new Episode({ name:'Watch Live', season:1, episode:1, url:url, posterUrl: payload.poster || event.image || '' })] }) });
            }
            if (payload.kind === 'channel') {
                const ch = payload.channel;
                return cb({ success: true, data: new MultimediaItem({ title: ch.title || 'Channel', url: url, posterUrl: ch.poster || '', description: ch.group || payload.providerTitle || '', type: 'livestream', episodes: [new Episode({ name:'Watch Live', season:1, episode:1, url:url, posterUrl: ch.poster || '' })] }) });
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
        const res = await http_get(base + '/' + slug + '.txt', HEADERS);
        const dec = await decryptSKLive(res.body || '');
        const arr = parseJsonSafe(dec, []);
        return Array.isArray(arr) ? arr : [];
    }

    async function resolveTokenApi(tokenApiText) {
        const cfg = parseJsonSafe(tokenApiText, null);
        if (!cfg || !cfg.api) return null;
        const r = await http_get(cfg.api, HEADERS);
        const body = clean(r.body || '');
        if (!body) return null;
        if (cfg.link_key) {
            const j = parseJsonSafe(body, null);
            if (j && j[cfg.link_key]) return String(j[cfg.link_key]);
        }
        return body;
    }

    function parseStreamLink(link) {
        const parts = String(link || '').split('|');
        const url = parts[0] || '';
        const headers = {};
        if (parts.length > 1) {
            parts.slice(1).join('|').split('&').forEach(function(kv){ const i = kv.indexOf('='); if (i < 0) return; const k = kv.slice(0,i).trim(); const v = kv.slice(i+1).trim(); if (!k) return; const lk = k.toLowerCase(); if (lk==='user-agent') headers['User-Agent']=v; else if (lk==='referer'||lk==='referrer') headers['Referer']=v; else if (lk==='origin') headers['Origin']=v; else if (lk==='cookie') headers['Cookie']=v; else headers[k]=v; });
        }
        return { url: url, headers: headers };
    }

    async function loadStreams(url, cb) {
        try {
            const payload = parseJsonSafe(url, null);
            if (!payload) return cb({ success:false, errorCode:'PARSE_ERROR', message:'Invalid stream payload' });

            if (payload.kind === 'event') {
                const streams = await fetchEventStreams(payload.event || {});
                const out = [];
                for (let i = 0; i < streams.length; i++) {
                    const s = streams[i] || {};
                    let link = s.link || '';
                    if (!link && s.tokenApi) link = await resolveTokenApi(s.tokenApi);
                    if (!link) continue;
                    const parsed = parseStreamLink(link);
                    if (!parsed.url) continue;
                    const result = new StreamResult({ url: parsed.url, source: s.name || s.title || ('Server ' + (i + 1)), headers: parsed.headers });
                    if (String(parsed.url).toLowerCase().includes('.mpd') && s.api && String(s.api).includes(':')) {
                        const p = String(s.api).split(':');
                        const kidHex = normalizeDrmHex(p[0]); const keyHex = normalizeDrmHex(p[1]);
                        if (kidHex && keyHex) { result.drmKid = hexToB64Url(kidHex) || kidHex; result.drmKey = hexToB64Url(keyHex) || keyHex; }
                    }
                    out.push(result);
                }
                return cb({ success:true, data: out });
            }

            if (payload.kind === 'channel') {
                const ch = payload.channel || {};
                const headers = Object.assign({}, ch.headers || {});
                if (ch.userAgent) headers['User-Agent'] = ch.userAgent;
                if (ch.cookie) headers['Cookie'] = ch.cookie;
                const result = new StreamResult({ url: ch.url, source: payload.providerTitle || 'SKTech', headers: headers });
                if (String(ch.url || '').toLowerCase().includes('.mpd')) {
                    const keyHex = normalizeDrmHex(ch.key); const kidHex = normalizeDrmHex(ch.keyid);
                    if (keyHex && kidHex) { result.drmKey = hexToB64Url(keyHex) || keyHex; result.drmKid = hexToB64Url(kidHex) || kidHex; }
                    else if (ch.licenseUrl) result.licenseUrl = String(ch.licenseUrl);
                }
                return cb({ success:true, data:[result] });
            }

            cb({ success:false, errorCode:'PARSE_ERROR', message:'Unsupported kind for streams' });
        } catch (e) {
            cb({ success:false, errorCode:'STREAM_ERROR', message:String(e && e.message ? e.message : e) });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
