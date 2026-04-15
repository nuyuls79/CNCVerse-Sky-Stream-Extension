(function() {
    /**
     * @type {import('@skystream/sdk').Manifest}
     */
    // var manifest is injected at runtime

    const DEFAULT_SECRET_LAYER1 = atob("__MOVIEBOX_DEFAULT_SECRET_LAYER1_B64__");
    const ALT_SECRET_LAYER1 = atob("__MOVIEBOX_ALT_SECRET_LAYER1_B64__");
    const DEVICE_ID = randomHex(32);

    const HOME_KEYS = [
        ["4516404531735022304", "Trending"],
        ["5692654647815587592", "Trending in Cinema"],
        ["414907768299210008", "Bollywood"],
        ["3859721901924910512", "South Indian"],
        ["8019599703232971616", "Hollywood"],
        ["4741626294545400336", "Top Series This Week"],
        ["8434602210994128512", "Anime"],
        ["1255898847918934600", "Reality TV"],
        ["4903182713986896328", "Indian Drama"],
        ["7878715743607948784", "Korean Drama"],
        ["8788126208987989488", "Chinese Drama"],
        ["3910636007619709856", "Western TV"],
        ["5177200225164885656", "Turkish Drama"],
        ["1|1", "Movies"],
        ["1|2", "Series"],
        ["1|1006", "Anime"],
        ["1|1;country=India", "Indian (Movies)"],
        ["1|2;country=India", "Indian (Series)"],
        ["1|1;classify=Hindi dub;country=United States", "USA (Movies)"],
        ["1|2;classify=Hindi dub;country=United States", "USA (Series)"],
        ["1|1;country=Japan", "Japan (Movies)"],
        ["1|2;country=Japan", "Japan (Series)"],
        ["1|1;country=China", "China (Movies)"],
        ["1|2;country=China", "China (Series)"],
        ["1|1;country=Philippines", "Philippines (Movies)"],
        ["1|2;country=Philippines", "Philippines (Series)"],
        ["1|1;country=Thailand", "Thailand(Movies)"],
        ["1|2;country=Thailand", "Thailand(Series)"],
        ["1|1;country=Nigeria", "Nollywood (Movies)"],
        ["1|2;country=Nigeria", "Nollywood (Series)"],
        ["1|1;country=Korea", "South Korean (Movies)"],
        ["1|2;country=Korea", "South Korean (Series)"],
        ["1|1;classify=Hindi dub;genre=Action", "Action (Movies)"],
        ["1|1;classify=Hindi dub;genre=Crime", "Crime (Movies)"],
        ["1|1;classify=Hindi dub;genre=Comedy", "Comedy (Movies)"],
        ["1|1;classify=Hindi dub;genre=Romance", "Romance (Movies)"],
        ["1|2;classify=Hindi dub;genre=Crime", "Crime (Series)"],
        ["1|2;classify=Hindi dub;genre=Comedy", "Comedy (Series)"],
        ["1|2;classify=Hindi dub;genre=Romance", "Romance (Series)"]
    ];

    function parseJsonSafe(text, fallback) {
        try { return JSON.parse(text); } catch (_) { return fallback; }
    }

    function randomHex(len) {
        const chars = "0123456789abcdef";
        let out = "";
        for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
        return out;
    }

    function randomBrandModel() {
        const models = {
            Samsung: ["SM-S918B", "SM-A528B", "SM-M336B"],
            Xiaomi: ["2201117TI", "M2012K11AI", "Redmi Note 11"],
            OnePlus: ["LE2111", "CPH2449", "IN2023"],
            Google: ["Pixel 6", "Pixel 7", "Pixel 8"],
            Realme: ["RMX3085", "RMX3360", "RMX3551"]
        };
        const brands = Object.keys(models);
        const brand = brands[Math.floor(Math.random() * brands.length)];
        const modelList = models[brand];
        const model = modelList[Math.floor(Math.random() * modelList.length)];
        return { brand: brand, model: model };
    }

    function kotlinBrandModelString() {
        const bm = randomBrandModel();
        return "BrandModel(brand=" + bm.brand + ", model=" + bm.model + ")";
    }

    function defaultLayer1(useAlt) {
        return useAlt ? ALT_SECRET_LAYER1 : DEFAULT_SECRET_LAYER1;
    }

    function typeFromSubject(subjectType) {
        return Number(subjectType) === 2 || Number(subjectType) === 7 ? "series" : "movie";
    }

    function cleanTitle(title) {
        return String(title || "").split("[")[0].trim();
    }

    function mapActorFromStaff(staff) {
        if (!staff || String(staff.staffType) !== "1") return null;
        const name = String(staff.name || "").trim();
        if (!name) return null;
        return new Actor({
            name: name,
            image: staff.avatarUrl || undefined,
            role: staff.character || undefined
        });
    }

    function mapRecommendationItem(item, fallbackType) {
        if (!item) return null;
        const subjectId = item.subjectId || item.id || item.redirectId;
        const title = cleanTitle(item.title || item.name);
        if (!subjectId || !title) return null;
        const cover = item.cover && item.cover.url
            ? item.cover.url
            : (item.coverImage || item.poster || item.posterUrl || undefined);
        return new MultimediaItem({
            title: title,
            url: JSON.stringify({ subjectId: String(subjectId), subjectType: item.subjectType || 1 }),
            posterUrl: cover,
            type: typeFromSubject(item.subjectType || fallbackType || 1),
            score: Number(item.imdbRatingValue || item.score) || undefined
        });
    }

    function extractRecommendations(data, fallbackType) {
        const candidates = [];
        const pools = [
            data && data.recommendations,
            data && data.recommendList,
            data && data.relatedSubjects,
            data && data.similarSubjects,
            data && data.titbits,
            data && data.subjects
        ];
        pools.forEach(function(pool) {
            if (Array.isArray(pool)) candidates.push.apply(candidates, pool);
        });
        const seen = {};
        const out = [];
        for (let i = 0; i < candidates.length; i++) {
            const rec = mapRecommendationItem(candidates[i], fallbackType);
            if (!rec) continue;
            const recPayload = parseJsonSafe(rec.url, {});
            const recId = recPayload && recPayload.subjectId ? String(recPayload.subjectId) : "";
            if (!recId || seen[recId]) continue;
            seen[recId] = true;
            out.push(rec);
        }
        return out;
    }

    function extractSubjectId(inputUrl) {
        const payload = parseJsonSafe(inputUrl, null);
        if (payload && payload.subjectId) return String(payload.subjectId);
        const text = String(inputUrl || "");
        const looseMatch = text.match(/subjectId\s*[:=]\s*"?([^",}\s]+)"?/i);
        if (looseMatch && looseMatch[1]) return looseMatch[1];
        const queryMatch = text.match(/[?&]subjectId=([^&]+)/i);
        if (queryMatch && queryMatch[1]) return decodeURIComponent(queryMatch[1]);
        return text.split("/").pop() || "";
    }

    function buildMboxClientInfo(brand, model) {
        return JSON.stringify({
            package_name: "com.community.mbox.in",
            version_name: "3.0.03.0529.03",
            version_code: 50020042,
            os: "android",
            os_version: "16",
            device_id: DEVICE_ID,
            install_store: "ps",
            gaid: "d7578036d13336cc",
            brand: brand,
            model: model,
            system_language: "en",
            net: "NETWORK_WIFI",
            region: "IN",
            timezone: "Asia/Calcutta",
            sp_code: ""
        });
    }

    function buildOneroomClientInfo(brand, model) {
        return JSON.stringify({
            package_name: "com.community.oneroom",
            version_name: "3.0.13.0325.03",
            version_code: 50020088,
            os: "android",
            os_version: "13",
            install_ch: "ps",
            device_id: DEVICE_ID,
            install_store: "ps",
            gaid: "1b2212c1-dadf-43c3-a0c8-bd6ce48ae22d",
            brand: model,
            model: brand,
            system_language: "en",
            net: "NETWORK_WIFI",
            region: "US",
            timezone: "Asia/Calcutta",
            sp_code: "",
            "X-Play-Mode": "1",
            "X-Idle-Data": "1",
            "X-Family-Mode": "0",
            "X-Content-Mode": "0"
        });
    }

    function toRawUtf8(str) {
        return unescape(encodeURIComponent(str));
    }

    function generateXClientToken() {
        const ts = String(Date.now());
        return ts + "," + md5Hex(ts.split("").reverse().join(""));
    }

    function canonical(method, accept, contentType, url, body, ts) {
        let path = "/";
        let rawQuery = "";
        try {
            const u = new URL(url);
            path = u.pathname || "/";
            rawQuery = (u.search || "").replace(/^\?/, "");
        } catch (_) {
            const text = String(url || "");
            const schemeIdx = text.indexOf("://");
            let start = 0;
            if (schemeIdx >= 0) {
                const hostStart = schemeIdx + 3;
                const slash = text.indexOf("/", hostStart);
                start = slash >= 0 ? slash : text.length;
            }
            const pathAndQuery = text.slice(start) || "/";
            const qIdx = pathAndQuery.indexOf("?");
            if (qIdx >= 0) {
                path = pathAndQuery.slice(0, qIdx) || "/";
                rawQuery = pathAndQuery.slice(qIdx + 1);
            } else {
                path = pathAndQuery || "/";
            }
        }

        const paramsByKey = {};
        rawQuery.split("&").forEach(function(part) {
            if (!part) return;
            const i = part.indexOf("=");
            const k = i >= 0 ? part.slice(0, i) : part;
            const v = i >= 0 ? part.slice(i + 1) : "";
            if (!Object.prototype.hasOwnProperty.call(paramsByKey, k)) paramsByKey[k] = [];
            paramsByKey[k].push(v);
        });
        const keys = Object.keys(paramsByKey).sort();
        const query = [];
        keys.forEach(function(k) {
            paramsByKey[k].forEach(function(v) { query.push(k + "=" + v); });
        });
        const canonicalUrl = query.length ? (path + "?" + query.join("&")) : path;
        let bodyLength = "";
        let bodyHash = "";
        if (body !== null && body !== undefined) {
            const raw = toRawUtf8(String(body));
            bodyLength = String(raw.length);
            bodyHash = md5Hex(raw.length > 102400 ? raw.slice(0, 102400) : raw);
        }
        return String(method).toUpperCase() + "\n"
            + (accept || "") + "\n"
            + (contentType || "") + "\n"
            + bodyLength + "\n"
            + ts + "\n"
            + bodyHash + "\n"
            + canonicalUrl;
    }

    function generateXTrSignature(method, accept, contentType, url, body, useAlt) {
        const ts = Date.now();
        const keyRaw = atob(defaultLayer1(!!useAlt));
        const message = toRawUtf8(canonical(method, accept, contentType, url, body, ts));
        const sigRaw = hmacMd5Raw(keyRaw, message);
        return ts + "|2|" + btoa(sigRaw);
    }

    function withTimeout(promise, ms, fallbackValue) {
        let timer = null;
        const timeoutPromise = new Promise(function(resolve) {
            timer = setTimeout(function() { resolve(fallbackValue); }, ms);
        });
        return Promise.race([promise, timeoutPromise]).then(function(result) {
            if (timer) clearTimeout(timer);
            return result;
        }).catch(function() {
            if (timer) clearTimeout(timer);
            return fallbackValue;
        });
    }

    async function fetchHomeSection(sectionKey, sectionName) {
        const perPage = 15;
        const isList = sectionKey.indexOf("|") >= 0;
        const endpoint = isList
            ? (manifest.baseUrl + "/wefeed-mobile-bff/subject-api/list")
            : (manifest.baseUrl + "/wefeed-mobile-bff/tab/ranking-list?tabId=0&categoryType=" + encodeURIComponent(sectionKey) + "&page=1&perPage=" + perPage);

        const mainParts = sectionKey.split(";")[0].split("|");
        const options = {};
        sectionKey.split(";").slice(1).forEach(function(chunk) {
            const idx = chunk.indexOf("=");
            if (idx < 0) return;
            options[chunk.slice(0, idx)] = chunk.slice(idx + 1);
        });
        const payload = JSON.stringify({
            page: Number(mainParts[0] || 1) || 1,
            perPage: perPage,
            channelId: mainParts[1] || "",
            classify: options.classify || "All",
            country: options.country || "All",
            year: options.year || "All",
            genre: options.genre || "All",
            sort: options.sort || "ForYou"
        });
        const bm = randomBrandModel();
        const baseHeaders = {
            "user-agent": "com.community.mbox.in/50020042 (Linux; U; Android 16; en_IN; " + bm.model + "; Build/BP22.250325.006; Cronet/133.0.6876.3)",
            "accept": "application/json",
            "content-type": "application/json",
            "connection": "keep-alive",
            "x-client-token": generateXClientToken(),
            "x-client-info": buildMboxClientInfo(bm.brand, bm.model),
            "x-client-status": "0"
        };
        const response = isList
            ? await http_post(endpoint, Object.assign({}, baseHeaders, {
                "x-tr-signature": generateXTrSignature("POST", "application/json", "application/json; charset=utf-8", endpoint, payload, false),
                "x-play-mode": "2"
            }), payload)
            : await http_get(endpoint, Object.assign({}, baseHeaders, {
                "x-tr-signature": generateXTrSignature("GET", "application/json", "application/json", endpoint, null, false)
            }));
        const root = parseJsonSafe(response.body, {});
        const items = (((root || {}).data || {}).items) || (((root || {}).data || {}).subjects) || [];
        return [sectionName, items.map(function(item) {
            const title = String(item.title || "").split("[")[0].trim();
            const subjectId = item.subjectId ? String(item.subjectId) : "";
            if (!title || !subjectId) return null;
            return new MultimediaItem({
                title: title,
                url: JSON.stringify({ subjectId: subjectId, subjectType: item.subjectType || 1 }),
                posterUrl: item.cover && item.cover.url ? item.cover.url : "",
                type: typeFromSubject(item.subjectType),
                score: Number(item.imdbRatingValue) || undefined
            });
        }).filter(Boolean)];
    }

    async function getHome(cb) {
        try {
            const sections = {};
            const sectionResults = await Promise.all(HOME_KEYS.map(function(pair) {
                return withTimeout(fetchHomeSection(pair[0], pair[1]), 4500, [pair[1], []]);
            }));
            sectionResults.forEach(function(section) {
                if (section && section[1] && section[1].length) sections[section[0]] = section[1];
            });
            cb({ success: true, data: sections });
        } catch (e) {
            cb({ success: false, errorCode: "HOME_ERROR", message: String(e && e.message ? e.message : e) });
        }
    }

    async function search(query, cb) {
        try {
            const endpoint = manifest.baseUrl + "/wefeed-mobile-bff/subject-api/search/v2";
            const payload = JSON.stringify({ page: 1, perPage: 20, keyword: String(query || "") });
            const bm = randomBrandModel();
            const xClientToken = generateXClientToken();
            const xTrSignature = generateXTrSignature("POST", "application/json", "application/json", endpoint, payload, false);
            const headers = {
                "user-agent": "com.community.mbox.in/50020042 (Linux; U; Android 16; en_IN; sdk_gphone64_x86_64; Build/BP22.250325.006; Cronet/133.0.6876.3)",
                "accept": "application/json",
                "content-type": "application/json",
                "connection": "keep-alive",
                "x-client-token": xClientToken,
                "x-tr-signature": xTrSignature,
                "x-client-info": JSON.stringify({
                    package_name: "com.community.mbox.in",
                    version_name: "3.0.03.0529.03",
                    version_code: 50020042,
                    os: "android",
                    os_version: "16",
                    device_id: DEVICE_ID,
                    install_store: "ps",
                    gaid: "d7578036d13336cc",
                    brand: "google",
                    model: kotlinBrandModelString(),
                    system_language: "en",
                    net: "NETWORK_WIFI",
                    region: "IN",
                    timezone: "Asia/Calcutta",
                    sp_code: ""
                }),
                "x-client-status": "0"
            };

            const res = await http_post(endpoint, headers, payload);
            const root = parseJsonSafe(res.body, {});
            const results = (((root || {}).data || {}).results) || [];
            const searchList = [];
            const seen = {};

            results.forEach(function(group) {
                var subjects = (group && Array.isArray(group.subjects)) ? group.subjects : [];
                subjects.forEach(function(subject) {
                    if (!subject || !subject.subjectId) return;
                    var sid = String(subject.subjectId);
                    if (!sid || seen[sid]) return;
                    seen[sid] = true;
                    searchList.push(new MultimediaItem({
                        title: subject.title || "Unknown",
                        url: sid,
                        posterUrl: subject.cover && subject.cover.url ? subject.cover.url : "",
                        type: typeFromSubject(subject.subjectType),
                        score: Number(subject.imdbRatingValue) || undefined
                    }));
                });
            });
            cb({ success: true, data: searchList });
        } catch (e) {
            cb({ success: false, errorCode: "DEBUG_ERROR", message: String(e && e.message ? e.message : e) });
        }
    }

    async function getSubject(subjectId, useOneRoom, token) {
        const bm = randomBrandModel();
        const url = manifest.baseUrl + "/wefeed-mobile-bff/subject-api/get?subjectId=" + encodeURIComponent(subjectId);
        const mboxClientInfo = JSON.stringify({
            package_name: "com.community.mbox.in",
            version_name: "3.0.03.0529.03",
            version_code: 50020042,
            os: "android",
            os_version: "16",
            device_id: DEVICE_ID,
            install_store: "ps",
            gaid: "d7578036d13336cc",
            brand: "google",
            model: "sdk_gphone64_x86_64",
            system_language: "en",
            net: "NETWORK_WIFI",
            region: "IN",
            timezone: "Asia/Calcutta",
            sp_code: ""
        });
        const headers = {
            "Authorization": token ? ("Bearer " + token) : "",
            "user-agent": useOneRoom
                ? ("com.community.oneroom/50020088 (Linux; U; Android 13; en_US; " + bm.model + "; Build/TQ3A.230901.001; Cronet/145.0.7582.0)")
                : ("com.community.mbox.in/50020042 (Linux; U; Android 16; en_IN; sdk_gphone64_x86_64; Build/BP22.250325.006; Cronet/133.0.6876.3)"),
            "accept": "application/json",
            "content-type": "application/json",
            "connection": "keep-alive",
            "x-client-token": generateXClientToken(),
            "x-tr-signature": generateXTrSignature("GET", "application/json", "application/json", url, null, false),
            "x-client-info": useOneRoom ? buildOneroomClientInfo(bm.brand, bm.model) : mboxClientInfo,
            "x-client-status": "0"
        };
        if (!useOneRoom) headers["x-play-mode"] = "2";
        return await http_get(url, headers);
    }

    async function load(url, cb) {
        try {
            const payload = parseJsonSafe(url, {});
            const subjectId = extractSubjectId(url);
            if (!subjectId) return cb({ success: false, errorCode: "INVALID_ID", message: "Missing subject id" });
            const res = await getSubject(subjectId, false, null);
            const data = (parseJsonSafe(res.body, {}).data) || null;
            if (!data) {
                const inferredType = typeFromSubject(payload.subjectType || 1);
                const streamPayload = JSON.stringify({ subjectId: subjectId, se: 0, ep: 0 });
                if (inferredType === "movie") {
                    return cb({ success: true, data: new MultimediaItem({
                        title: payload.title || "MovieBox",
                        url: streamPayload,
                        type: "movie",
                        episodes: [new Episode({ name: "Full Movie", season: 1, episode: 1, url: streamPayload })]
                    }) });
                }
                return cb({ success: true, data: new MultimediaItem({
                    title: payload.title || "MovieBox",
                    url: url,
                    type: "series",
                    episodes: [new Episode({ name: "Episode 1", season: 1, episode: 1, url: JSON.stringify({ subjectId: subjectId, se: 1, ep: 1 }) })]
                }) });
            }
            const title = cleanTitle(data.title || "Unknown");
            const poster = data.cover && data.cover.url ? data.cover.url : "";
            const description = data.description || "";
            const year = /^\d{4}/.test(String(data.releaseDate || "")) ? Number(String(data.releaseDate).slice(0, 4)) : undefined;
            const type = typeFromSubject(data.subjectType || 1);
            const cast = (Array.isArray(data.staffList) ? data.staffList : []).map(mapActorFromStaff).filter(Boolean);
            const recommendations = extractRecommendations(data, data.subjectType || 1);
            if (type === "movie") {
                const streamPayload = JSON.stringify({ subjectId: subjectId, se: 0, ep: 0 });
                return cb({ success: true, data: new MultimediaItem({
                    title: title, url: streamPayload, posterUrl: poster, description: description, type: "movie", year: year,
                    cast: cast,
                    recommendations: recommendations,
                    episodes: [new Episode({ name: "Full Movie", season: 1, episode: 1, url: streamPayload, posterUrl: poster })]
                }) });
            }
            const episodes = [];
            const allSubjectIds = [subjectId];
            (Array.isArray(data.dubs) ? data.dubs : []).forEach(function(dub) {
                if (dub && dub.subjectId) {
                    const sid = String(dub.subjectId);
                    if (allSubjectIds.indexOf(sid) < 0) allSubjectIds.push(sid);
                }
            });
            const seen = {};
            for (let i = 0; i < allSubjectIds.length; i++) {
                const sid = allSubjectIds[i];
                const seasonUrl = manifest.baseUrl + "/wefeed-mobile-bff/subject-api/season-info?subjectId=" + encodeURIComponent(sid);
                const seasonRes = await http_get(seasonUrl, {
                    "accept": "application/json",
                    "content-type": "application/json",
                    "x-client-token": generateXClientToken(),
                    "x-tr-signature": generateXTrSignature("GET", "application/json", "application/json", seasonUrl, null, false)
                });
                const seasons = ((((parseJsonSafe(seasonRes.body, {}) || {}).data) || {}).seasons) || [];
                seasons.forEach(function(se) {
                    const sn = Number(se && se.se ? se.se : 1) || 1;
                    const maxEp = Number(se && se.maxEp ? se.maxEp : 1) || 1;
                    for (let ep = 1; ep <= maxEp; ep++) {
                        const key = sn + ":" + ep;
                        if (seen[key]) continue;
                        seen[key] = true;
                        episodes.push(new Episode({
                            name: "S" + sn + "E" + ep,
                            season: sn,
                            episode: ep,
                            url: JSON.stringify({ subjectId: subjectId, se: sn, ep: ep }),
                            posterUrl: poster
                        }));
                    }
                });
            }
            if (!episodes.length) episodes.push(new Episode({ name: "Episode 1", season: 1, episode: 1, url: JSON.stringify({ subjectId: subjectId, se: 1, ep: 1 }), posterUrl: poster }));
            cb({ success: true, data: new MultimediaItem({
                title: title,
                url: url,
                posterUrl: poster,
                description: description,
                type: "series",
                year: year,
                cast: cast,
                recommendations: recommendations,
                episodes: episodes
            }) });
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: String(e && e.message ? e.message : e) });
        }
    }

    async function loadStreams(url, cb) {
        try {
            const payload = parseJsonSafe(url, {});
            const subjectId = payload.subjectId ? String(payload.subjectId) : "";
            const se = Number(payload.se || 0) || 0;
            const ep = Number(payload.ep || 0) || 0;
            if (!subjectId) return cb({ success: false, errorCode: "INVALID_ID", message: "Missing subject id" });

            const subjectRes = await getSubject(subjectId, true, null);
            const xUserHeader = (subjectRes.headers || {})["x-user"] || (subjectRes.headers || {})["X-User"];
            const token = xUserHeader ? (parseJsonSafe(xUserHeader, {}).token || null) : null;
            const data = parseJsonSafe(subjectRes.body, {}).data || {};
            const sources = [[subjectId, "Original"]];
            (Array.isArray(data.dubs) ? data.dubs : []).forEach(function(d) {
                if (!d || !d.subjectId) return;
                const sid = String(d.subjectId);
                if (sid !== subjectId) sources.push([sid, String(d.lanName || "dub")]);
            });

            const results = [];
            for (let i = 0; i < sources.length; i++) {
                const sid = sources[i][0];
                const lang = String(sources[i][1] || "Audio").replace(/dub/ig, "Audio");
                const playUrl = manifest.baseUrl + "/wefeed-mobile-bff/subject-api/play-info?subjectId=" + encodeURIComponent(sid) + "&se=" + se + "&ep=" + ep;
                const bm = randomBrandModel();
                const headers = {
                    "Authorization": token ? ("Bearer " + token) : "",
                    "user-agent": "com.community.oneroom/50020088 (Linux; U; Android 13; en_US; " + bm.model + "; Build/TQ3A.230901.001; Cronet/145.0.7582.0)",
                    "accept": "application/json",
                    "content-type": "application/json",
                    "connection": "keep-alive",
                    "x-client-token": generateXClientToken(),
                    "x-tr-signature": generateXTrSignature("GET", "application/json", "application/json", playUrl, null, false),
                    "x-client-info": buildOneroomClientInfo(bm.brand, bm.model),
                    "x-client-status": "0"
                };
                const playRes = await http_get(playUrl, headers);
                const streams = ((((parseJsonSafe(playRes.body, {}) || {}).data) || {}).streams) || [];
                streams.forEach(function(stream) {
                    if (!stream || !stream.url) return;
                    const streamHeaders = { "Referer": manifest.baseUrl };
                    if (stream.signCookie) streamHeaders["Cookie"] = String(stream.signCookie);
                    results.push(new StreamResult({
                        url: String(stream.url),
                        source: "MovieBox " + lang + " " + qualityLabel(stream.resolutions),
                        headers: streamHeaders
                    }));
                });
            }
            cb({ success: true, data: results });
        } catch (e) {
            cb({ success: false, errorCode: "STREAM_ERROR", message: String(e && e.message ? e.message : e) });
        }
    }

    function qualityLabel(resolutionText) {
        const t = String(resolutionText || "");
        if (t.indexOf("2160") >= 0) return "2160p";
        if (t.indexOf("1440") >= 0) return "1440p";
        if (t.indexOf("1080") >= 0) return "1080p";
        if (t.indexOf("720") >= 0) return "720p";
        if (t.indexOf("480") >= 0) return "480p";
        return "Auto";
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;

    function md5Hex(s) { return hex(md5Raw(toRawUtf8(s))); }

    function hmacMd5Raw(key, msg) {
        let bkey = rstr2binl(key);
        if (bkey.length > 16) bkey = binlMd5(bkey, key.length * 8);
        const ipad = [], opad = [];
        for (let i = 0; i < 16; i++) {
            ipad[i] = (bkey[i] || 0) ^ 0x36363636;
            opad[i] = (bkey[i] || 0) ^ 0x5c5c5c5c;
        }
        const hash = binlMd5(ipad.concat(rstr2binl(msg)), 512 + msg.length * 8);
        return binl2rstr(binlMd5(opad.concat(hash), 512 + 128));
    }

    function md5Raw(s) { return binl2rstr(binlMd5(rstr2binl(s), s.length * 8)); }
    function hex(s) { const h = "0123456789abcdef"; let o = ""; for (let i = 0; i < s.length; i++) { const x = s.charCodeAt(i); o += h[(x >>> 4) & 15] + h[x & 15]; } return o; }
    function add(x, y) { const l = (x & 65535) + (y & 65535); return (((x >>> 16) + (y >>> 16) + (l >>> 16)) << 16) | (l & 65535); }
    function rol(n, c) { return (n << c) | (n >>> (32 - c)); }
    function cmn(q, a, b, x, s, t) { return add(rol(add(add(a, q), add(x, t)), s), b); }
    function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
    function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
    function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
    function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
    function binlMd5(x, len) {
        x[len >> 5] |= 128 << (len % 32); x[(((len + 64) >>> 9) << 4) + 14] = len;
        let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
        for (let i = 0; i < x.length; i += 16) {
            const oa = a, ob = b, oc = c, od = d;
            a = ff(a, b, c, d, x[i], 7, -680876936); d = ff(d, a, b, c, x[i + 1], 12, -389564586); c = ff(c, d, a, b, x[i + 2], 17, 606105819); b = ff(b, c, d, a, x[i + 3], 22, -1044525330);
            a = ff(a, b, c, d, x[i + 4], 7, -176418897); d = ff(d, a, b, c, x[i + 5], 12, 1200080426); c = ff(c, d, a, b, x[i + 6], 17, -1473231341); b = ff(b, c, d, a, x[i + 7], 22, -45705983);
            a = ff(a, b, c, d, x[i + 8], 7, 1770035416); d = ff(d, a, b, c, x[i + 9], 12, -1958414417); c = ff(c, d, a, b, x[i + 10], 17, -42063); b = ff(b, c, d, a, x[i + 11], 22, -1990404162);
            a = ff(a, b, c, d, x[i + 12], 7, 1804603682); d = ff(d, a, b, c, x[i + 13], 12, -40341101); c = ff(c, d, a, b, x[i + 14], 17, -1502002290); b = ff(b, c, d, a, x[i + 15], 22, 1236535329);
            a = gg(a, b, c, d, x[i + 1], 5, -165796510); d = gg(d, a, b, c, x[i + 6], 9, -1069501632); c = gg(c, d, a, b, x[i + 11], 14, 643717713); b = gg(b, c, d, a, x[i], 20, -373897302);
            a = gg(a, b, c, d, x[i + 5], 5, -701558691); d = gg(d, a, b, c, x[i + 10], 9, 38016083); c = gg(c, d, a, b, x[i + 15], 14, -660478335); b = gg(b, c, d, a, x[i + 4], 20, -405537848);
            a = gg(a, b, c, d, x[i + 9], 5, 568446438); d = gg(d, a, b, c, x[i + 14], 9, -1019803690); c = gg(c, d, a, b, x[i + 3], 14, -187363961); b = gg(b, c, d, a, x[i + 8], 20, 1163531501);
            a = gg(a, b, c, d, x[i + 13], 5, -1444681467); d = gg(d, a, b, c, x[i + 2], 9, -51403784); c = gg(c, d, a, b, x[i + 7], 14, 1735328473); b = gg(b, c, d, a, x[i + 12], 20, -1926607734);
            a = hh(a, b, c, d, x[i + 5], 4, -378558); d = hh(d, a, b, c, x[i + 8], 11, -2022574463); c = hh(c, d, a, b, x[i + 11], 16, 1839030562); b = hh(b, c, d, a, x[i + 14], 23, -35309556);
            a = hh(a, b, c, d, x[i + 1], 4, -1530992060); d = hh(d, a, b, c, x[i + 4], 11, 1272893353); c = hh(c, d, a, b, x[i + 7], 16, -155497632); b = hh(b, c, d, a, x[i + 10], 23, -1094730640);
            a = hh(a, b, c, d, x[i + 13], 4, 681279174); d = hh(d, a, b, c, x[i], 11, -358537222); c = hh(c, d, a, b, x[i + 3], 16, -722521979); b = hh(b, c, d, a, x[i + 6], 23, 76029189);
            a = hh(a, b, c, d, x[i + 9], 4, -640364487); d = hh(d, a, b, c, x[i + 12], 11, -421815835); c = hh(c, d, a, b, x[i + 15], 16, 530742520); b = hh(b, c, d, a, x[i + 2], 23, -995338651);
            a = ii(a, b, c, d, x[i], 6, -198630844); d = ii(d, a, b, c, x[i + 7], 10, 1126891415); c = ii(c, d, a, b, x[i + 14], 15, -1416354905); b = ii(b, c, d, a, x[i + 5], 21, -57434055);
            a = ii(a, b, c, d, x[i + 12], 6, 1700485571); d = ii(d, a, b, c, x[i + 3], 10, -1894986606); c = ii(c, d, a, b, x[i + 10], 15, -1051523); b = ii(b, c, d, a, x[i + 1], 21, -2054922799);
            a = ii(a, b, c, d, x[i + 8], 6, 1873313359); d = ii(d, a, b, c, x[i + 15], 10, -30611744); c = ii(c, d, a, b, x[i + 6], 15, -1560198380); b = ii(b, c, d, a, x[i + 13], 21, 1309151649);
            a = ii(a, b, c, d, x[i + 4], 6, -145523070); d = ii(d, a, b, c, x[i + 11], 10, -1120210379); c = ii(c, d, a, b, x[i + 2], 15, 718787259); b = ii(b, c, d, a, x[i + 9], 21, -343485551);
            a = add(a, oa); b = add(b, ob); c = add(c, oc); d = add(d, od);
        }
        return [a, b, c, d];
    }
    function rstr2binl(input) { const out = []; out[(input.length >> 2) - 1] = undefined; for (let i = 0; i < out.length; i++) out[i] = 0; for (let i = 0; i < input.length * 8; i += 8) out[i >> 5] |= (input.charCodeAt(i / 8) & 255) << (i % 32); return out; }
    function binl2rstr(input) { let out = ""; for (let i = 0; i < input.length * 32; i += 8) out += String.fromCharCode((input[i >> 5] >>> (i % 32)) & 255); return out; }
})();
