(function () {
    /**
     * @type {import('@skystream/sdk').Manifest}
     */
    // var manifest is injected at runtime

    const BASE_URL = 'https://net22.cc';
    const PLAY_URL = 'https://net52.cc';

    const COMMON_HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const MOBILE_COMMON_HEADERS = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-IN,en-US;q=0.9,en;q=0.8',
        'Cache-Control': 'max-age=0',
        'Connection': 'keep-alive',
        'sec-ch-ua': '"Not(A:Brand";v="8", "Chromium";v="144", "Android WebView";v="144"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Android"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 5 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/144.0.7559.132 Safari/537.36 /OS.Gatu v3.0',
        'X-Requested-With': 'XMLHttpRequest'
    };

    const PROVIDERS = {
        'NETFLIX': {
            id: 'NETFLIX',
            ott: 'nf',
            baseUrl: BASE_URL,
            playUrl: PLAY_URL,
            homePath: '/home',
            searchPath: '/search.php',
            postPath: '/post.php',
            episodesPath: '/episodes.php',
            playlistPath: '/playlist.php',
            usePlayHandshake: true,
            includeUserToken: true,
            poster: function (id) { return 'https://imgcdn.kim/poster/v/' + id + '.jpg'; },
            background: function (id) { return 'https://imgcdn.kim/poster/h/' + id + '.jpg'; },
            episodePoster: function (id) { return 'https://imgcdn.kim/epimg/150/' + id + '.jpg'; }
        },
        'PRIME VIDEO': {
            id: 'PRIME VIDEO',
            ott: 'pv',
            baseUrl: PLAY_URL,
            playUrl: PLAY_URL,
            homePath: '/pv/homepage.php',
            searchPath: '/pv/search.php',
            postPath: '/pv/post.php',
            episodesPath: '/pv/episodes.php',
            playlistPath: '/pv/playlist.php',
            usePlayHandshake: true,
            includeUserToken: true,
            poster: function (id) { return 'https://imgcdn.kim/pv/v/' + id + '.jpg'; },
            background: function (id) { return 'https://imgcdn.kim/pv/h/' + id + '.jpg'; },
            episodePoster: function (id) { return 'https://imgcdn.kim/pvepimg/150/' + id + '.jpg'; }
        },
        'HOTSTAR': {
            id: 'HOTSTAR',
            ott: 'hs',
            baseUrl: PLAY_URL,
            playUrl: PLAY_URL,
            homePath: '/mobile/home?app=1',
            searchPath: '/mobile/hs/search.php',
            postPath: '/mobile/hs/post.php',
            episodesPath: '/mobile/hs/episodes.php',
            playlistPath: '/mobile/hs/playlist.php',
            usePlayHandshake: true,
            includeUserToken: true,
            poster: function (id) { return 'https://imgcdn.kim/hs/v/' + id + '.jpg'; },
            background: function (id) { return 'https://imgcdn.kim/hs/h/' + id + '.jpg'; },
            episodePoster: function (id) { return 'https://imgcdn.kim/hsepimg/150/' + id + '.jpg'; }
        },
        'DISNEY PLUS': {
            id: 'DISNEY PLUS',
            ott: 'dp',
            baseUrl: PLAY_URL,
            playUrl: PLAY_URL,
            homePath: '/mobile/home?app=1',
            searchPath: '/mobile/hs/search.php',
            postPath: '/mobile/hs/post.php',
            episodesPath: '/mobile/hs/episodes.php',
            playlistPath: '/mobile/hs/playlist.php',
            usePlayHandshake: true,
            includeUserToken: true,
            poster: function (id) { return 'https://imgcdn.kim/hs/v/' + id + '.jpg'; },
            background: function (id) { return 'https://imgcdn.kim/hs/h/' + id + '.jpg'; },
            episodePoster: function (id) { return 'https://imgcdn.kim/hsepimg/150/' + id + '.jpg'; }
        }
    };

    let cachedCookie = '';
    let lastBypassTime = 0;

    function clean(v) { return String(v || '').trim(); }
    function parseJsonSafe(text, fb) { try { return JSON.parse(text); } catch (_) { return fb; } }
    function unixTs() { return Math.floor(Date.now() / 1000); }

    function cfg() {
        const pid = clean((manifest && manifest.providerId) || '').toUpperCase();
        return PROVIDERS[pid] || PROVIDERS['NETFLIX'];
    }

    function providerHeaders(provider) {
        const pid = clean(provider && provider.id).toUpperCase();
        return (pid === 'HOTSTAR' || pid === 'DISNEY PLUS') ? MOBILE_COMMON_HEADERS : COMMON_HEADERS;
    }

    function proxiedImage(url) {
        if (!url) return '';
        return 'https://wsrv.nl/?url=' + encodeURIComponent(url) + '&w=500';
    }

    function parseSetCookie(raw) {
        let txt = raw;
        if (Array.isArray(txt)) txt = txt.join('; ');
        txt = clean(txt);
        if (!txt) return '';
        const m = txt.match(/t_hash_t=([^;]+)/i);
        return m && m[1] ? decodeURIComponent(m[1]) : '';
    }

    async function delay(ms) {
        await new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    async function bypass(provider) {
        const reqHeaders = providerHeaders(provider);
        if (cachedCookie && Date.now() - lastBypassTime < 30 * 60 * 1000) return cachedCookie;
        for (let i = 0; i < 5; i++) {
            try {
                const res = await http_post(PLAY_URL + '/tv/p.php', Object.assign({}, reqHeaders, { 'X-Requested-With': 'XMLHttpRequest' }), '');
                const body = clean(res && res.body || '');
                if (body.indexOf('"r":"n"') >= 0 || body.indexOf('"r": "n"') >= 0) {
                    const hash = parseSetCookie((res && res.headers && (res.headers['set-cookie'] || res.headers['Set-Cookie'])) || '');
                    if (hash) {
                        cachedCookie = hash;
                        lastBypassTime = Date.now();
                        return cachedCookie;
                    }
                }
            } catch (_) { }
            await delay(1000);
        }
        throw new Error('Failed to bypass authentication');
    }

    async function cookieString(provider) {
        const hash = await bypass(provider);
        const parts = ['t_hash_t=' + hash, 'ott=' + provider.ott, 'hd=on'];
        if (provider.includeUserToken) parts.push('user_token=233123f803cf02184bf6c67e149cdd50');
        return parts.join('; ');
    }

    function parseNetflixRows(html, provider) {
        const sections = {};
        const rowRegex = /<div[^>]*class="[^"]*lolomoRow[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*lolomoRow[^"]*"[^>]*>|$)/g;
        let rowMatch;
        while ((rowMatch = rowRegex.exec(html)) !== null) {
            const rowHtml = rowMatch[1];
            let title = 'Trending';
            const titleMatch = rowHtml.match(/<div class="row-header-title">([\s\S]*?)<\/div>/) || rowHtml.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
            if (titleMatch) title = clean(titleMatch[1].replace(/<[^>]*>/g, '')) || 'Trending';

            const items = [];
            const seen = {};
            const imgRegex = /<img[^>]*class="[^"]*lazy[^"]*"[^>]*data-src="([^"]+)"/g;
            let imgMatch;
            while ((imgMatch = imgRegex.exec(rowHtml)) !== null) {
                const imgSrc = imgMatch[1];
                const id = clean(imgSrc).split('/').pop().split('.')[0];
                if (!id || seen[id]) continue;
                seen[id] = true;
                items.push(new MultimediaItem({
                    title: ' ',
                    url: JSON.stringify({ provider: provider.id, id: id }),
                    posterUrl: proxiedImage(provider.poster(id)),
                    type: 'movie'
                }));
            }
            if (items.length > 0) sections[title] = items;
        }
        return sections;
    }

    function parseTrayRows(html, provider) {
        const sections = {};
        const globalRegex = /<(h2|span|div|p)[^>]*class="[^"]*(tray-title|mobile-tray-title|title|tray-title-container)[^"]*"[^>]*>([\s\S]*?)<\/\1>|data-post="([^"]+)"/ig;

        let currentTitle = 'Trending';
        let gMatch;
        while ((gMatch = globalRegex.exec(html)) !== null) {
            if (gMatch[3]) {
                const titleText = clean(gMatch[3].replace(/<[^>]*>/g, ''));
                if (titleText && titleText.length > 2 && titleText.length < 50 && titleText.indexOf('{') === -1) {
                    currentTitle = titleText;
                }
            } else if (gMatch[4]) {
                const id = clean(gMatch[4]);
                if (!id || id.indexOf("'") >= 0 || id.indexOf('+') >= 0) continue;
                if (!sections[currentTitle]) sections[currentTitle] = [];
                if (!sections[currentTitle].some(function (it) {
                    const parsed = parseJsonSafe(it.url, {});
                    return parsed && parsed.id === id;
                })) {
                    sections[currentTitle].push(new MultimediaItem({
                        title: ' ',
                        url: JSON.stringify({ provider: provider.id, id: id }),
                        posterUrl: proxiedImage(provider.poster(id)),
                        type: 'movie'
                    }));
                }
            }
        }
        return sections;
    }

    async function fetchPagedEpisodes(provider, seriesId, seasonId, page, episodes, cookieStr) {
        let pg = page;
        while (true) {
            try {
                const epUrl = provider.baseUrl + provider.episodesPath + '?s=' + encodeURIComponent(seasonId) + '&series=' + encodeURIComponent(seriesId) + '&t=' + unixTs() + '&page=' + pg;
                const res = await http_get(epUrl, Object.assign({}, providerHeaders(provider), { Cookie: cookieStr }));
                const data = parseJsonSafe(res.body, {});
                (Array.isArray(data.episodes) ? data.episodes : []).forEach(function (ep) {
                    episodes.push(new Episode({
                        name: clean(ep.t) || 'Episode',
                        season: parseInt(String(ep.s || '').replace('S', ''), 10) || 1,
                        episode: parseInt(String(ep.ep || '').replace('E', ''), 10) || 1,
                        url: JSON.stringify({ provider: provider.id, kind: 'play', id: clean(ep.id), title: clean(ep.t) || 'Episode' }),
                        posterUrl: proxiedImage(provider.episodePoster(clean(ep.id)))
                    }));
                });
                if (Number(data.nextPageShow || 0) === 0) break;
                pg++;
            } catch (_) {
                break;
            }
        }
    }

    async function getHome(cb) {
        try {
            const provider = cfg();
            const cookieStr = await cookieString(provider);
            const headers = Object.assign({}, providerHeaders(provider), {
                Referer: provider.id === 'NETFLIX'
                    ? (provider.baseUrl + '/')
                    : (provider.baseUrl + '/mobile/home?app=1'),
                Cookie: cookieStr,
                'X-Requested-With': 'XMLHttpRequest'
            });

            if (provider.id === 'PRIME VIDEO') {
                const primeHeaders = Object.assign({}, headers, { Referer: BASE_URL + '/home' });
                const res = await http_get(provider.baseUrl + provider.homePath, primeHeaders);
                const root = parseJsonSafe(res.body, {});
                const out = {};
                (Array.isArray(root.post) ? root.post : []).forEach(function (group) {
                    const name = clean(group.cate) || 'Trending';
                    const ids = clean(group.ids).split(',').map(clean).filter(Boolean);
                    if (!ids.length) return;
                    out[name] = ids.map(function (id) {
                        return new MultimediaItem({
                            title: ' ',
                            url: JSON.stringify({ provider: provider.id, id: id }),
                            posterUrl: provider.poster(id),
                            type: 'movie'
                        });
                    });
                });
                return cb({ success: true, data: out });
            }

            const res = await http_get(provider.baseUrl + provider.homePath, headers);
            const html = String(res.body || '');
            const data = provider.id === 'NETFLIX' ? parseNetflixRows(html, provider) : parseTrayRows(html, provider);
            cb({ success: true, data: data });
        } catch (e) {
            cb({ success: false, errorCode: 'HOME_ERROR', message: String(e && e.message || e) });
        }
    }

    async function search(query, cb) {
        try {
            const provider = cfg();
            const cookieStr = await cookieString(provider);
            const url = provider.baseUrl + provider.searchPath + '?s=' + encodeURIComponent(query) + '&t=' + unixTs();
            const referer = provider.id === 'NETFLIX' ? provider.baseUrl + '/tv/home' : BASE_URL + '/home';
            const res = await http_get(url, Object.assign({}, providerHeaders(provider), { Referer: referer, Cookie: cookieStr }));
            const data = parseJsonSafe(res.body, {});
            const list = (data.searchResult || []).map(function (item) {
                return new MultimediaItem({
                    title: clean(item.t) || 'Title',
                    url: JSON.stringify({ provider: provider.id, id: clean(item.id) }),
                    posterUrl: proxiedImage(provider.poster(clean(item.id))),
                    type: 'movie'
                });
            });
            cb({ success: true, data: list });
        } catch (e) {
            cb({ success: false, errorCode: 'SEARCH_ERROR', message: String(e && e.message || e) });
        }
    }

    async function load(urlData, cb) {
        try {
            const payload = parseJsonSafe(urlData, null);
            if (!payload || !payload.id) return cb({ success: false, errorCode: 'PARSE_ERROR', message: 'Invalid payload' });

            const provider = PROVIDERS[clean(payload.provider).toUpperCase()] || cfg();
            const cookieStr = await cookieString(provider);
            const postUrl = provider.baseUrl + provider.postPath + '?id=' + encodeURIComponent(payload.id) + '&t=' + unixTs();
            const referer = BASE_URL + '/tv/home';
            const res = await http_get(postUrl, Object.assign({}, providerHeaders(provider), { Referer: referer, Cookie: cookieStr }));
            const data = parseJsonSafe(res.body, {});

            const episodes = [];
            if (Array.isArray(data.episodes) && data.episodes.length > 0 && data.episodes[0]) {
                data.episodes.forEach(function (ep) {
                    episodes.push(new Episode({
                        name: clean(ep.t) || 'Episode',
                        season: parseInt(String(ep.s || '').replace('S', ''), 10) || 1,
                        episode: parseInt(String(ep.ep || '').replace('E', ''), 10) || 1,
                        url: JSON.stringify({ provider: provider.id, kind: 'play', id: clean(ep.id), title: clean(ep.t) || clean(data.title) || 'Title' }),
                        posterUrl: proxiedImage(provider.episodePoster(clean(ep.id)))
                    }));
                });
                if (Number(data.nextPageShow || 0) === 1 && data.nextPageSeason) {
                    await fetchPagedEpisodes(provider, payload.id, data.nextPageSeason, 2, episodes, cookieStr);
                }
                if (Array.isArray(data.season) && data.season.length > 1) {
                    for (let i = 0; i < data.season.length - 1; i++) {
                        if (data.season[i] && data.season[i].id) {
                            await fetchPagedEpisodes(provider, payload.id, data.season[i].id, 1, episodes, cookieStr);
                        }
                    }
                }
            } else {
                episodes.push(new Episode({
                    name: clean(data.title) || 'Watch',
                    season: 1,
                    episode: 1,
                    url: JSON.stringify({ provider: provider.id, kind: 'play', id: payload.id, title: clean(data.title) || 'Watch' }),
                    posterUrl: proxiedImage(provider.poster(payload.id))
                }));
            }

            cb({
                success: true,
                data: new MultimediaItem({
                    title: clean(data.title) || 'Title',
                    url: JSON.stringify({ provider: provider.id, id: payload.id }),
                    posterUrl: proxiedImage(provider.poster(payload.id)),
                    backgroundPosterUrl: proxiedImage(provider.background(payload.id)),
                    description: clean(data.desc),
                    type: episodes.length > 1 ? 'tvseries' : 'movie',
                    year: parseInt(data.year, 10) || undefined,
                    episodes: episodes
                })
            });
        } catch (e) {
            cb({ success: false, errorCode: 'LOAD_ERROR', message: String(e && e.message || e) });
        }
    }

    async function loadPrimeStreams(provider, payload) {
        const cookieStr = await cookieString(provider);
        const playlistUrl = provider.baseUrl + provider.playlistPath + '?id=' + encodeURIComponent(payload.id) + '&t=' + encodeURIComponent(payload.title || '') + '&tm=' + unixTs();
        const res = await http_get(playlistUrl, Object.assign({}, COMMON_HEADERS, { Referer: provider.baseUrl + '/home', Cookie: cookieStr, 'X-Requested-With': 'XMLHttpRequest' }));
        const playlist = parseJsonSafe(res.body, []);
        const out = [];
        (Array.isArray(playlist) ? playlist : []).forEach(function (item) {
            (Array.isArray(item.sources) ? item.sources : []).forEach(function (src, i) {
                let fullUrl = String(src.file || '').replace('/tv/', '/');
                if (!/^https?:\/\//i.test(fullUrl)) {
                    if (!fullUrl.startsWith('/')) fullUrl = '/' + fullUrl;
                    fullUrl = provider.playUrl + fullUrl;
                }
                out.push(new StreamResult({
                    url: fullUrl,
                    source: 'PrimeVideo [' + (clean(src.label) || ('S' + (i + 1))) + ']',
                    type: 'hls',
                    headers: {
                        Referer: provider.playUrl + '/',
                        Cookie: cookieStr,
                        'User-Agent': COMMON_HEADERS['User-Agent']
                    }
                }));
            });
        });
        return out;
    }

    async function loadHandshakeStreams(provider, payload) {
        const globalHash = await bypass(provider);
        const cookieStrInitial = 't_hash_t=' + globalHash + '; ott=' + provider.ott + '; hd=on';
        const handshakeHeaders = {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
            'Referer': BASE_URL + '/',
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json, text/plain, */*',
            'Connection': 'keep-alive'
        };

        const playPostRes = await http_post(BASE_URL + '/play.php', Object.assign({}, handshakeHeaders, {
            'Content-Type': 'application/x-www-form-urlencoded',
            Cookie: cookieStrInitial
        }), 'id=' + encodeURIComponent(payload.id));

        const playJson = parseJsonSafe(playPostRes.body, {});
        const h = clean(playJson.h);
        const iframeUrl = provider.playUrl + '/play.php?id=' + encodeURIComponent(payload.id) + '&' + h;

        const iframeRes = await http_get(iframeUrl, {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-GB,en;q=0.9',
            'Connection': 'keep-alive',
            'Host': 'net52.cc',
            'Referer': BASE_URL + '/',
            'sec-ch-ua': '"Chromium";v="142", "Brave";v="142", "Not_A Brand";v="99"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Linux"',
            'Sec-Fetch-Dest': 'iframe',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'cross-site',
            'Sec-Fetch-Storage-Access': 'none',
            'Sec-Fetch-User': '?1',
            'Sec-GPC': '1',
            'Upgrade-Insecure-Requests': '1',
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
            Cookie: cookieStrInitial
        });

        const tokenMatch = String(iframeRes.body || '').match(/data-h="([^"]+)"/);
        const token = tokenMatch ? tokenMatch[1] : '';
        if (!token) throw new Error('Handshake failed: token not found');

        const playlistUrl = provider.playUrl + provider.playlistPath + '?id=' + encodeURIComponent(payload.id) + '&t=' + encodeURIComponent(payload.title || '') + '&tm=' + unixTs() + '&h=' + encodeURIComponent(token);
        const listRes = await http_get(playlistUrl, Object.assign({}, handshakeHeaders, { Referer: provider.playUrl + '/', Cookie: cookieStrInitial }));
        const playlist = parseJsonSafe(listRes.body, []);
        const out = [];

        (Array.isArray(playlist) ? playlist : []).forEach(function (item) {
            (Array.isArray(item.sources) ? item.sources : []).forEach(function (src) {
                let fullUrl = String(src.file || '').replace('/tv/', '/');
                if (!fullUrl.startsWith('/')) fullUrl = '/' + fullUrl;
                const finalUrl = provider.playUrl + '/' + fullUrl.replace(/^\/+/, '');

                const inMatch = String(src.file || '').match(/[?&]in=([^&]+)/);
                const streamHash = inMatch ? decodeURIComponent(inMatch[1]) : globalHash;
                const streamCookie = 't_hash_t=' + streamHash + '; ott=' + provider.ott + '; hd=on';

                const proxifiedUrl = 'MAGIC_PROXY_v2' + btoa(JSON.stringify({
                    url: finalUrl,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
                        'Referer': provider.playUrl + '/',
                        'Cookie': streamCookie,
                        'sec-ch-ua': '"Chromium";v="142", "Brave";v="142", "Not_A Brand";v="99"',
                        'sec-ch-ua-mobile': '?0',
                        'sec-ch-ua-platform': '"Linux"',
                        'Accept': '*/*',
                        'Accept-Encoding': 'identity',
                        'Connection': 'keep-alive'
                    },
                    options: {
                        mirrorHosts: ['net52.cc', 'net22.cc', 'nm-cdn', 'top'],
                        keepCookies: ['t_hash_t', 'ott', 'hd'],
                        referer: provider.playUrl + '/'
                    }
                }));

                out.push(new StreamResult({
                    url: proxifiedUrl,
                    source: 'NetMirror [' + clean(src.label || 'Auto') + ']',
                    type: 'hls',
                    headers: {}
                }));
            });
        });

        return out;
    }

    async function loadStreams(dataStr, cb) {
        try {
            const payload = parseJsonSafe(dataStr, null);
            if (!payload || !payload.id) return cb({ success: false, errorCode: 'PARSE_ERROR', message: 'Invalid stream payload' });
            const provider = PROVIDERS[clean(payload.provider).toUpperCase()] || cfg();

            let results = [];
            if (provider.usePlayHandshake) {
                try {
                    results = await loadHandshakeStreams(provider, payload);
                } catch (e) {
                    if (provider.id === 'PRIME VIDEO') {
                        results = await loadPrimeStreams(provider, payload);
                    } else {
                        throw e;
                    }
                }
                if ((!results || results.length === 0) && provider.id === 'PRIME VIDEO') {
                    results = await loadPrimeStreams(provider, payload);
                }
            } else {
                results = await loadPrimeStreams(provider, payload);
            }

            cb({ success: true, data: results });
        } catch (e) {
            cb({ success: false, errorCode: 'STREAM_ERROR', message: String(e && e.message || e) });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
