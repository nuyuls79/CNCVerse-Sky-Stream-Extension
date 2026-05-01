(function () {
    /**
     * @type {import('@skystream/sdk').Manifest}
     */
    // var manifest is injected at runtime

    const PROVIDERS = {
        'NETFLIX': { id: 'NETFLIX', ott: 'nf' },
        'PRIME VIDEO': { id: 'PRIME VIDEO', ott: 'pv' },
        'HOTSTAR': { id: 'HOTSTAR', ott: 'hs' },
    };

    const NEW_TV_BASE_HEADERS = {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Requested-With': 'NetmirrorNewTV v1.0',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0 /OS.GatuNewTV v1.0',
        'Accept': 'application/json, text/plain, */*'
    };

    const NEW_TV_DOMAINS = [
        'aHR0cHM6Ly9tb2JpbGVkZXRlY3RzLmNvbQ==',
        'aHR0cHM6Ly9tb2JpbGVkZXRlY3QuYXBw',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0LmFydA==',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0LmNj',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0LmNsaWNr',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0Lmluaw==',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0LmxpdmU=',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0LnBybw==',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0LnNob3A=',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0LnNpdGU=',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0LnNwYWNl',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0LnN0b3Jl',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0LnZpcA==',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0Lndpa2k=',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0Lnh5eg==',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0cy5hcnQ=',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0cy5jYw==',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0cy5pbmZv',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0cy5pbms=',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0cy5saXZl',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0cy5wcm8=',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0cy5zdG9yZQ==',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0cy50b3A=',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0cy54eXo='
    ];

    let resolvedApiUrl = '';

    function clean(v) { return String(v || '').trim(); }
    function parseJsonSafe(text, fb) { try { return JSON.parse(text); } catch (_) { return fb; } }

    function cfg() {
        const pid = clean((manifest && manifest.providerId) || '').toUpperCase();
        return PROVIDERS[pid] || PROVIDERS['NETFLIX'];
    }

    function decodeBase64(value) {
        return String(atob(String(value || '')));
    }

    async function resolveApiUrl() {
        if (resolvedApiUrl) return resolvedApiUrl;
        for (let i = 0; i < NEW_TV_DOMAINS.length; i++) {
            const base = decodeBase64(NEW_TV_DOMAINS[i]).replace(/\/+$/, '');
            try {
                const res = await http_get(base + '/checknewtv.php', NEW_TV_BASE_HEADERS);
                const data = parseJsonSafe(res.body, {});
                const tokenHash = clean(data && data.token_hash);
                if (tokenHash) {
                    resolvedApiUrl = decodeBase64(tokenHash).replace(/\/+$/, '');
                    return resolvedApiUrl;
                }
            } catch (_) { }
        }
        throw new Error('Failed to resolve NewTV API base URL');
    }

    function buildNewTvHeaders(ott, extra) {
        const headers = Object.assign({}, NEW_TV_BASE_HEADERS, { Ott: ott });
        const extras = extra || {};
        Object.keys(extras).forEach(function (k) { headers[k] = extras[k]; });
        return headers;
    }

    function buildPosterUrl(template, id) {
        if (!template) return '';
        if (String(template).indexOf('------------------') >= 0) {
            return String(template).replace('------------------', id);
        }
        return String(template).replace(/\/+$/, '') + '/' + id + '.jpg';
    }

    function toInt(value) {
        const num = parseInt(String(value || '').replace(/[^0-9]/g, ''), 10);
        return Number.isFinite(num) ? num : undefined;
    }

    function normalizeEpisode(ep) {
        if (!ep) return {};
        return {
            id: clean(ep.id),
            title: clean(ep.t),
            epNum: clean(ep.ep) || (Array.isArray(ep.info) ? clean(ep.info[0]) : ''),
            sNum: clean(ep.s) || (Array.isArray(ep.info) ? clean(ep.info[1]) : ''),
            time: clean(ep.time) || (Array.isArray(ep.info) ? clean(ep.info[2]) : ''),
            desc: clean(ep.ep_desc)
        };
    }

    async function getHome(cb) {
        try {
            const provider = cfg();
            const apiBase = await resolveApiUrl();
            const res = await http_get(
                apiBase + '/newtv/main.php',
                buildNewTvHeaders(provider.ott, { Page: 'all', Recentplay: '', Watchlist: '', Usertoken: '' })
            );
            const data = parseJsonSafe(res.body, {});
            const sections = {};
            (Array.isArray(data.post) ? data.post : []).forEach(function (category) {
                const ids = clean(category && category.ids).split(',').map(clean).filter(Boolean);
                const title = clean(category && category.cate) || 'Trending';
                const useHorizontal = clean(category && category.row) === 'h';
                const template = (useHorizontal ? data.imgcdn_h : data.imgcdn_v) || data.imgcdn_v || data.imgcdn_h;
                if (!ids.length) return;
                sections[title] = ids.map(function (id) {
                    return new MultimediaItem({
                        title: ' ',
                        url: JSON.stringify({ provider: provider.id, id: id }),
                        posterUrl: buildPosterUrl(template, id) || '',
                        type: 'movie'
                    });
                });
            });
            cb({ success: true, data: sections });
        } catch (e) {
            cb({ success: false, errorCode: 'HOME_ERROR', message: String(e && e.message || e) });
        }
    }

    async function search(query, cb) {
        try {
            const provider = cfg();
            const apiBase = await resolveApiUrl();
            const url = apiBase + '/newtv/search.php?s=' + encodeURIComponent(query);
            const res = await http_get(url, buildNewTvHeaders(provider.ott));
            const data = parseJsonSafe(res.body, {});
            const template = data.detailsimgcdn || data.imgcdn;
            const list = (Array.isArray(data.searchResult) ? data.searchResult : []).map(function (item) {
                const id = clean(item && item.id);
                return new MultimediaItem({
                    title: clean(item && item.t) || 'Title',
                    url: JSON.stringify({ provider: provider.id, id: id }),
                    posterUrl: buildPosterUrl(template, id) || '',
                    type: 'movie'
                });
            });
            cb({ success: true, data: list });
        } catch (e) {
            cb({ success: false, errorCode: 'SEARCH_ERROR', message: String(e && e.message || e) });
        }
    }

    async function getEpisodes(provider, title, seasonId, page, epPoster, seasonNum) {
        const apiBase = await resolveApiUrl();
        const episodes = [];
        let pg = page;
        while (true) {
            const url = apiBase + '/newtv/episodes.php?id=' + encodeURIComponent(seasonId) + '&page=' + pg;
            const res = await http_get(url, buildNewTvHeaders(provider.ott));
            const data = parseJsonSafe(res.body, {});
            (Array.isArray(data.episodes) ? data.episodes : []).forEach(function (rawEp) {
                const ep = normalizeEpisode(rawEp);
                if (!ep.id) return;
                episodes.push(new Episode({
                    name: ep.title || 'Episode',
                    season: seasonNum || toInt(ep.sNum) || 1,
                    episode: toInt(ep.epNum) || 1,
                    url: JSON.stringify({ provider: provider.id, kind: 'play', id: ep.id, title: title }),
                    posterUrl: buildPosterUrl(epPoster, ep.id) || ''
                }));
            });
            if (Number(data.nextPageShow || 0) !== 1) break;
            pg++;
        }
        return episodes;
    }

    async function load(urlData, cb) {
        try {
            const payload = parseJsonSafe(urlData, null);
            if (!payload || !payload.id) return cb({ success: false, errorCode: 'PARSE_ERROR', message: 'Invalid payload' });

            const provider = PROVIDERS[clean(payload.provider).toUpperCase()] || cfg();
            const apiBase = await resolveApiUrl();
            const postUrl = apiBase + '/newtv/post.php?id=' + encodeURIComponent(payload.id);
            const res = await http_get(postUrl, buildNewTvHeaders(provider.ott, { Lastep: '', Usertoken: '' }));
            const data = parseJsonSafe(res.body, {});

            const title = clean(data.title) || payload.id;
            const playbackId = clean(data.main_id) || payload.id;
            const isSeries = data.type === 't' || (Array.isArray(data.episodes) && data.episodes.some(function (e) { return e; }));

            const episodes = [];
            if (!isSeries) {
                episodes.push(new Episode({
                    name: title || 'Watch',
                    season: 1,
                    episode: 1,
                    url: JSON.stringify({ provider: provider.id, kind: 'play', id: playbackId, title: title }),
                    posterUrl: buildPosterUrl(data.main_poster, payload.id) || ''
                }));
            } else if (Array.isArray(data.episodes) && data.episodes.length > 0) {
                const seasons = Array.isArray(data.season) ? data.season : [];
                const selectedSeasonIdx = seasons.findIndex(function (s) { return s && s.selected === true; });
                const selectedSeasonId = selectedSeasonIdx >= 0
                    ? clean(seasons[selectedSeasonIdx] && seasons[selectedSeasonIdx].id)
                    : clean(data.nextPageSeason);
                const selectedSeasonNumber = selectedSeasonIdx >= 0 ? selectedSeasonIdx + 1 : undefined;

                data.episodes.filter(Boolean).forEach(function (rawEp) {
                    const ep = normalizeEpisode(rawEp);
                    if (!ep.id) return;
                    episodes.push(new Episode({
                        name: ep.title || 'Episode',
                        season: selectedSeasonNumber || toInt(ep.sNum) || 1,
                        episode: toInt(ep.epNum) || 1,
                        url: JSON.stringify({ provider: provider.id, kind: 'play', id: ep.id, title: title }),
                        posterUrl: buildPosterUrl(data.ep_poster, ep.id) || ''
                    }));
                });

                if (Number(data.nextPageShow || 0) === 1 && selectedSeasonId) {
                    episodes.push.apply(episodes, await getEpisodes(provider, title, selectedSeasonId, 2, data.ep_poster, selectedSeasonNumber));
                }

                for (let i = 0; i < seasons.length; i++) {
                    const seasonId = clean(seasons[i] && seasons[i].id);
                    if (!seasonId || seasonId === selectedSeasonId) continue;
                    const seasonNum = i + 1;
                    episodes.push.apply(episodes, await getEpisodes(provider, title, seasonId, 1, data.ep_poster, seasonNum));
                }
            }

            if (isSeries && episodes.length === 0 && Array.isArray(data.season) && data.season.length > 0) {
                for (let i = 0; i < data.season.length; i++) {
                    const seasonId = clean(data.season[i] && data.season[i].id);
                    if (!seasonId) continue;
                    const seasonNum = i + 1;
                    episodes.push.apply(episodes, await getEpisodes(provider, title, seasonId, 1, data.ep_poster, seasonNum));
                }
            }

            cb({
                success: true,
                data: new MultimediaItem({
                    title: title || 'Title',
                    url: JSON.stringify({ provider: provider.id, id: payload.id }),
                    posterUrl: buildPosterUrl(data.main_poster, payload.id) || '',
                    backgroundPosterUrl: buildPosterUrl(data.main_poster, payload.id) || '',
                    description: clean(data.desc),
                    type: isSeries ? 'tvseries' : 'movie',
                    year: toInt(data.year),
                    episodes: episodes
                })
            });
        } catch (e) {
            cb({ success: false, errorCode: 'LOAD_ERROR', message: String(e && e.message || e) });
        }
    }

    async function loadStreams(dataStr, cb) {
        try {
            const payload = parseJsonSafe(dataStr, null);
            if (!payload || !payload.id) return cb({ success: false, errorCode: 'PARSE_ERROR', message: 'Invalid stream payload' });
            const provider = PROVIDERS[clean(payload.provider).toUpperCase()] || cfg();
            const apiBase = await resolveApiUrl();
            const url = apiBase + '/newtv/player.php?id=' + encodeURIComponent(payload.id);
            const res = await http_get(url, buildNewTvHeaders(provider.ott, { Usertoken: '' }));
            const data = parseJsonSafe(res.body, {});
            if (clean(data.status) !== 'ok' || !clean(data.video_link)) {
                return cb({ success: false, errorCode: 'STREAM_ERROR', message: 'No stream available' });
            }
            const streams = [
                new StreamResult({
                    url: clean(data.video_link),
                    source: provider.id,
                    type: 'hls',
                    headers: { Referer: clean(data.referer) || apiBase }
                })
            ];
            cb({ success: true, data: streams });
        } catch (e) {
            cb({ success: false, errorCode: 'STREAM_ERROR', message: String(e && e.message || e) });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
