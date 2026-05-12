(function () {
    /**
     * LayarKaca21 JS Provider Port
     * Ported from Cloudstream Kotlin provider
     */

    const BASE_URL = 'https://tv8.lk21official.cc';

    const TMDB_API =
        'https://api.themoviedb.org/3/search/multi?api_key=1865f43a0549ca50d341dd9ab8b29f49&query=';

    const HEADERS = {
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: BASE_URL + '/',
        Origin: BASE_URL
    };

    function clean(v) {
        return String(v || '').trim();
    }

    function parseJsonSafe(text, fb) {
        try {
            return JSON.parse(text);
        } catch (_) {
            return fb;
        }
    }

    function fixUrl(url) {
        if (!url) return '';
        if (/^https?:\/\//i.test(url)) return url;
        if (url.startsWith('//')) return 'https:' + url;
        if (!url.startsWith('/')) url = '/' + url;
        return BASE_URL + url;
    }

    function getCleanTitle(title) {
        let cleanTitle = clean(title);

        cleanTitle = cleanTitle.replace(
            /nonton serial|nonton film|nonton|sub indo|di lk21|lk21|layarkaca21/gi,
            ''
        );

        cleanTitle = cleanTitle.replace(/\bseason\s*\d+.*/i, '');

        cleanTitle = cleanTitle.replace(/\(\d{4}\)/g, '');

        return clean(cleanTitle);
    }

    function fixPosterUrl(url) {
        if (!url) return '';

        let out = String(url);

        if (out.startsWith('//')) out = 'https:' + out;

        out = out.split('?')[0];

        out = out.replace(/-\d{2,4}x\d{2,4}/g, '');

        return out;
    }

    async function fetchTmdb(title, year) {
        try {
            const url = TMDB_API + encodeURIComponent(title);

            const res = await http_get(url, HEADERS);

            const data = parseJsonSafe(res.body, {});

            const results = Array.isArray(data.results)
                ? data.results
                : [];

            let match = results.find(function (it) {
                const d =
                    it.release_date ||
                    it.first_air_date ||
                    '';

                const y = parseInt(d.slice(0, 4), 10);

                return !year || !y || y === year;
            });

            if (!match) match = results[0];

            if (!match) return {};

            return {
                poster: match.poster_path
                    ? 'https://image.tmdb.org/t/p/w500' +
                      match.poster_path
                    : '',
                backdrop: match.backdrop_path
                    ? 'https://image.tmdb.org/t/p/original' +
                      match.backdrop_path
                    : ''
            };
        } catch (_) {
            return {};
        }
    }

    function extractAttr(tag, attr) {
        const r = new RegExp(attr + '="([^"]+)"', 'i').exec(tag);
        return r ? r[1] : '';
    }

    async function parseCard(cardHtml) {
        try {
            const hrefMatch =
                /<a[^>]+href="([^"]+)"/i.exec(cardHtml);

            if (!hrefMatch) return null;

            const href = fixUrl(hrefMatch[1]);

            const titleMatch =
                /<(?:h1|h2|h3|div)[^>]*(?:title|entry-title|poster-title)[^>]*>(.*?)<\/(?:h1|h2|h3|div)>/is.exec(
                    cardHtml
                );

            const rawTitle = clean(
                titleMatch
                    ? titleMatch[1].replace(/<[^>]+>/g, '')
                    : ''
            );

            if (!rawTitle) return null;

            const title = getCleanTitle(rawTitle);

            const imgMatch =
                /<img[^>]+(?:data-src|data-lazy-src|src)="([^"]+)"/i.exec(
                    cardHtml
                );

            const posterFallback = fixPosterUrl(
                imgMatch ? imgMatch[1] : ''
            );

            const yearMatch =
                /\b(19|20)\d{2}\b/.exec(cardHtml);

            const year = yearMatch
                ? parseInt(yearMatch[0], 10)
                : undefined;

            const tmdb = await fetchTmdb(title, year);

            const poster = tmdb.poster || posterFallback;

            const isSeries =
                /episode|season|series/i.test(cardHtml);

            return new MultimediaItem({
                title: title,
                url: href,
                posterUrl: poster,
                backgroundPosterUrl:
                    tmdb.backdrop || poster,
                type: isSeries ? 'tvseries' : 'movie',
                year: year
            });
        } catch (_) {
            return null;
        }
    }

    async function getHome(cb) {
        try {
            const res = await http_get(BASE_URL, HEADERS);

            const html = String(res.body || '');

            const sections = {};

            const sectionRegex =
                /<div[^>]+class="widget"[^>]+data-type="([^"]+)"[\s\S]*?<\/div>\s*<\/div>/gi;

            let sectionMatch;

            while (
                (sectionMatch = sectionRegex.exec(html)) !==
                null
            ) {
                const sectionHtml = sectionMatch[0];

                const sectionName =
                    sectionMatch[1]
                        .replace(/-/g, ' ')
                        .replace(/\b\w/g, function (m) {
                            return m.toUpperCase();
                        });

                const cards =
                    sectionHtml.match(
                        /<article[\s\S]*?<\/article>/gi
                    ) || [];

                const parsed = [];

                for (let i = 0; i < cards.length; i++) {
                    const item = await parseCard(cards[i]);

                    if (item) parsed.push(item);
                }

                if (parsed.length > 0) {
                    sections[sectionName] = parsed;
                }
            }

            cb({
                success: true,
                data: sections
            });
        } catch (e) {
            cb({
                success: false,
                errorCode: 'HOME_ERROR',
                message: String(e)
            });
        }
    }

    async function search(query, cb) {
        try {
            const url =
                'https://gudangvape.com/search.php?s=' +
                encodeURIComponent(query) +
                '&page=1';

            const res = await http_get(url, HEADERS);

            const json = parseJsonSafe(res.body, {});

            const out = [];

            const data = Array.isArray(json.data)
                ? json.data
                : [];

            for (let i = 0; i < data.length; i++) {
                const item = data[i];

                const title = getCleanTitle(item.title);

                const href = fixUrl(item.slug);

                const posterFallback = item.poster
                    ? 'https://poster.lk21.party/wp-content/uploads/' +
                      item.poster
                    : '';

                const tmdb = await fetchTmdb(
                    title,
                    item.year
                );

                out.push(
                    new MultimediaItem({
                        title: title,
                        url: href,
                        posterUrl:
                            tmdb.poster ||
                            fixPosterUrl(posterFallback),
                        backgroundPosterUrl:
                            tmdb.backdrop ||
                            tmdb.poster ||
                            fixPosterUrl(posterFallback),
                        type:
                            item.type &&
                            /series/i.test(item.type)
                                ? 'tvseries'
                                : 'movie',
                        year: item.year
                    })
                );
            }

            cb({
                success: true,
                data: out
            });
        } catch (e) {
            cb({
                success: false,
                errorCode: 'SEARCH_ERROR',
                message: String(e)
            });
        }
    }

    async function load(url, cb) {
        try {
            let currentUrl = fixUrl(url);

            let res = await http_get(
                currentUrl,
                HEADERS
            );

            let html = String(res.body || '');

            const redirectMatch =
                /<a[^>]+href="([^"]+)"[^>]*>(?:Buka Sekarang|Nontondrama)/i.exec(
                    html
                );

            if (redirectMatch) {
                currentUrl = fixUrl(redirectMatch[1]);

                res = await http_get(
                    currentUrl,
                    HEADERS
                );

                html = String(res.body || '');
            }

            const titleMatch =
                /<(?:h1|div)[^>]*(?:entry-title|page-title|movie-info)[^>]*>(.*?)<\/(?:h1|div)>/is.exec(
                    html
                );

            const rawTitle = clean(
                titleMatch
                    ? titleMatch[1].replace(/<[^>]+>/g, '')
                    : ''
            );

            const title = getCleanTitle(rawTitle);

            const plotMatch =
                /<div[^>]*(?:synopsis|entry-content)[^>]*>([\s\S]*?)<\/div>/i.exec(
                    html
                );

            const plot = clean(
                plotMatch
                    ? plotMatch[1].replace(/<[^>]+>/g, '')
                    : ''
            );

            const yearMatch =
                /\b(19|20)\d{2}\b/.exec(html);

            const year = yearMatch
                ? parseInt(yearMatch[0], 10)
                : undefined;

            const posterMatch =
                /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i.exec(
                    html
                );

            const fallbackPoster = fixPosterUrl(
                posterMatch ? posterMatch[1] : ''
            );

            const tmdb = await fetchTmdb(title, year);

            const episodes = [];

            const seasonJsonMatch =
                /<script[^>]+id="season-data"[^>]*>([\s\S]*?)<\/script>/i.exec(
                    html
                );

            if (seasonJsonMatch) {
                const seasonData = parseJsonSafe(
                    seasonJsonMatch[1],
                    {}
                );

                Object.keys(seasonData).forEach(
                    function (key) {
                        const arr = seasonData[key];

                        if (!Array.isArray(arr)) return;

                        arr.forEach(function (ep) {
                            episodes.push(
                                new Episode({
                                    name:
                                        ep.title ||
                                        'Episode',
                                    season: ep.s || 1,
                                    episode:
                                        ep.episode_no || 1,
                                    url: fixUrl(
                                        ep.slug || ''
                                    )
                                })
                            );
                        });
                    }
                );
            } else {
                const epRegex =
                    /<li[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi;

                let epMatch;

                while (
                    (epMatch = epRegex.exec(html)) !==
                    null
                ) {
                    episodes.push(
                        new Episode({
                            name: clean(
                                epMatch[2].replace(
                                    /<[^>]+>/g,
                                    ''
                                )
                            ),
                            url: fixUrl(epMatch[1])
                        })
                    );
                }
            }

            const isSeries = episodes.length > 0;

            cb({
                success: true,
                data: new MultimediaItem({
                    title: title,
                    url: currentUrl,
                    posterUrl:
                        tmdb.poster || fallbackPoster,
                    backgroundPosterUrl:
                        tmdb.backdrop ||
                        tmdb.poster ||
                        fallbackPoster,
                    description: plot,
                    type: isSeries
                        ? 'tvseries'
                        : 'movie',
                    year: year,
                    episodes: episodes
                })
            });
        } catch (e) {
            cb({
                success: false,
                errorCode: 'LOAD_ERROR',
                message: String(e)
            });
        }
    }

    async function extractDirectStreams(
        html,
        referer,
        results
    ) {
        const regex =
            /https?:\/\/[^"'\\ ]+\.(m3u8|mp4)(?:\?[^"' ]*)?/gi;

        let match;

        while ((match = regex.exec(html)) !== null) {
            const streamUrl = match[0];

            const isM3u8 =
                streamUrl.indexOf('.m3u8') >= 0;

            results.push(
                new StreamResult({
                    url: streamUrl,
                    source: 'LK21 VIP',
                    type: isM3u8 ? 'hls' : 'video',
                    headers: {
                        Referer: referer,
                        Origin:
                            new URL(referer).origin,
                        'User-Agent':
                            HEADERS['User-Agent']
                    }
                })
            );
        }
    }

    async function loadStreams(data, cb) {
        try {
            let currentUrl = fixUrl(data);

            let res = await http_get(
                currentUrl,
                HEADERS
            );

            let html = String(res.body || '');

            const redirectMatch =
                /<a[^>]+href="([^"]+)"[^>]*>(?:Buka Sekarang|Nontondrama)/i.exec(
                    html
                );

            if (redirectMatch) {
                currentUrl = fixUrl(redirectMatch[1]);

                res = await http_get(
                    currentUrl,
                    HEADERS
                );

                html = String(res.body || '');
            }

            const results = [];

            const urls = [];

            const playerRegex =
                /<a[^>]+(?:data-url|href)="([^"]+)"/gi;

            let p;

            while (
                (p = playerRegex.exec(html)) !== null
            ) {
                const u = fixUrl(p[1]);

                if (u && urls.indexOf(u) < 0)
                    urls.push(u);
            }

            const iframeRegex =
                /<iframe[^>]+src="([^"]+)"/gi;

            let f;

            while (
                (f = iframeRegex.exec(html)) !== null
            ) {
                const u = fixUrl(f[1]);

                if (u && urls.indexOf(u) < 0)
                    urls.push(u);
            }

            for (let i = 0; i < urls.length; i++) {
                const url = urls[i];

                try {
                    const r = await http_get(url, {
                        Referer: currentUrl,
                        'User-Agent':
                            HEADERS['User-Agent']
                    });

                    const iframeHtml = String(
                        r.body || ''
                    );

                    await extractDirectStreams(
                        iframeHtml,
                        url,
                        results
                    );

                    const nestedRegex =
                        /<iframe[^>]+src="([^"]+)"/gi;

                    let nested;

                    while (
                        (nested =
                            nestedRegex.exec(
                                iframeHtml
                            )) !== null
                    ) {
                        try {
                            const nestedUrl = fixUrl(
                                nested[1]
                            );

                            const nestedRes =
                                await http_get(
                                    nestedUrl,
                                    {
                                        Referer: url,
                                        'User-Agent':
                                            HEADERS[
                                                'User-Agent'
                                            ]
                                    }
                                );

                            await extractDirectStreams(
                                String(
                                    nestedRes.body ||
                                        ''
                                ),
                                nestedUrl,
                                results
                            );
                        } catch (_) {}
                    }
                } catch (_) {}
            }

            cb({
                success: true,
                data: results
            });
        } catch (e) {
            cb({
                success: false,
                errorCode: 'STREAM_ERROR',
                message: String(e)
            });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
