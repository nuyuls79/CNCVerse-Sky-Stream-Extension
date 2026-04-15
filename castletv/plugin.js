(function() {
	/**
	 * @type {import('@skystream/sdk').Manifest}
	 */
	// var manifest is injected at runtime

	const MAIN_URL = String((manifest && manifest.baseUrl) || 'https://api.hlowb.com').replace(/\/+$/, '');
	const BASE_HEADERS = {
		'Accept': '*/*',
		'Cache-Control': 'no-cache, no-store',
		'User-Agent': 'okhttp/4.9.0'
	};
	const CASTLE_SUFFIX = '__CASTLE_SUFFIX__';

	function parseJsonSafe(text, fallback) {
		try { return JSON.parse(text); } catch (_) { return fallback; }
	}

	function clean(text) {
		return String(text || '').trim();
	}

	function quoteLargeInts(text) {
		return String(text || '').replace(/(:\s*)(\d{16,})/g, '$1"$2"');
	}

	function parseJsonPreserveBigInt(text, fallback) {
		try { return JSON.parse(quoteLargeInts(text)); } catch (_) { return fallback; }
	}

	function rawToBytes(raw) {
		const out = [];
		for (let i = 0; i < raw.length; i++) out.push(raw.charCodeAt(i) & 255);
		return out;
	}

	function bytesToRaw(bytes) {
		return bytes.map(function(b) { return String.fromCharCode(b & 255); }).join('');
	}

	function bytesToB64(bytes) {
		return btoa(bytesToRaw(bytes));
	}

	function utf8ToBytes(text) {
		try {
			const encoded = encodeURIComponent(String(text || '')).replace(/%([0-9A-F]{2})/gi, function(_, h) {
				return String.fromCharCode(parseInt(h, 16));
			});
			return rawToBytes(encoded);
		} catch (_) {
			return rawToBytes(String(text || ''));
		}
	}

	function normalizeCipher(payload) {
		const text = clean(payload);
		if (!text) return '';
		if (text[0] === '{' || text[0] === '[') {
			const root = parseJsonSafe(text, null);
			if (root && root.data && typeof root.data === 'string') return clean(root.data);
			return text;
		}
		return text;
	}

	function looksLikeJson(text) {
		const t = clean(text);
		return t.startsWith('{') || t.startsWith('[') || t.indexOf('"code"') >= 0 || t.indexOf('"data"') >= 0;
	}

	function deriveAesKey(apiKeyB64) {
		let keyBytes = [];
		try {
			keyBytes = rawToBytes(atob(clean(apiKeyB64)));
		} catch (_) {
			keyBytes = [];
		}

		const suffixBytes = utf8ToBytes(CASTLE_SUFFIX);
		const keyMaterial = keyBytes.concat(suffixBytes);
		if (keyMaterial.length < 16) {
			const out = keyMaterial.slice();
			while (out.length < 16) out.push(0);
			return out;
		}
		if (keyMaterial.length > 16) return keyMaterial.slice(0, 16);
		return keyMaterial;
	}

	async function decryptData(payload, apiKeyB64) {
		const cipher = normalizeCipher(payload);
		if (!cipher) return '';
		if (looksLikeJson(cipher)) return cipher;

		try {
			const aesKey = deriveAesKey(apiKeyB64);
			const keyB64 = bytesToB64(aesKey);
			const decrypted = await crypto.decryptAES(cipher, keyB64, keyB64);
			if (typeof decrypted !== 'string') return '';
			return decrypted;
		} catch (_) {
			return '';
		}
	}

	async function getSecurityKey(retries) {
		const maxRetries = Number(retries || 3) || 3;
		const url = MAIN_URL + '/v0.1/system/getSecurityKey/1?channel=IndiaA&clientType=1&lang=en-US';
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				const res = await http_get(url, BASE_HEADERS);
				const json = parseJsonSafe(res && res.body ? res.body : '', null);
				if (json && Number(json.code) === 200 && json.data) {
					let cookie = '';
					if (res && res.headers) {
						cookie = res.headers['set-cookie'] || res.headers['Set-Cookie'] || '';
						if (Array.isArray(cookie)) cookie = cookie.join('; ');
					}
					return { key: String(json.data), cookie: clean(cookie) || null };
				}
			} catch (_) {}
		}
		return { key: null, cookie: null };
	}

	function mapType(movieType) {
		const t = Number(movieType || 0);
		return t === 1 || t === 3 || t === 5 ? 'series' : 'movie';
	}

	async function fetchHomeRows(page) {
		const sec = await getSecurityKey(3);
		if (!sec.key) return [];
		const url = MAIN_URL + '/film-api/v0.1/category/home?channel=IndiaA&clientType=1&lang=en-US&locationId=1001&mode=1&packageName=com.external.castle&page=' + encodeURIComponent(String(page || 1)) + '&size=17';

		try {
			const res = await http_get(url, BASE_HEADERS);
			const text = res && res.body ? res.body : '';
			const decryptedJson = await decryptData(text, sec.key);
			if (!decryptedJson) return [];
			const root = parseJsonPreserveBigInt(decryptedJson, {});
			const rows = (((root || {}).data || {}).rows) || [];
			if (!Array.isArray(rows)) return [];

			return rows.map(function(row) {
				const contents = Array.isArray(row && row.contents) ? row.contents : [];
				return {
					name: clean((row && row.name) || 'Trending'),
					contents: contents.map(function(c) {
						const id = c && c.redirectId !== undefined && c.redirectId !== null ? String(c.redirectId) : '';
						if (!id) return null;
						return new MultimediaItem({
							title: clean(c.title || 'Untitled'),
							posterUrl: c.coverImage || '',
							url: JSON.stringify({ id: id }),
							type: mapType(c.movieType)
						});
					}).filter(Boolean)
				};
			}).filter(function(r) { return r.contents.length > 0; });
		} catch (_) {
			return [];
		}
	}

	async function searchItems(query) {
		const sec = await getSecurityKey(3);
		if (!sec.key) return [];
		const url = MAIN_URL + '/film-api/v1.1.0/movie/searchByKeyword?channel=IndiaA&clientType=1&keyword=' + encodeURIComponent(String(query || '')) + '&lang=en-US&mode=1&packageName=com.external.castle&page=1&size=30';

		try {
			const res = await http_get(url, BASE_HEADERS);
			const decryptedJson = await decryptData(res && res.body ? res.body : '', sec.key);
			if (!decryptedJson) return [];
			const root = parseJsonPreserveBigInt(decryptedJson, {});
			const rows = (((root || {}).data || {}).rows) || [];
			if (!Array.isArray(rows)) return [];
			return rows.map(function(row) {
				return new MultimediaItem({
					title: clean(row && row.title || 'Unknown'),
					posterUrl: (row && (row.coverVerticalImage || row.coverHorizontalImage)) || '',
					url: JSON.stringify({ id: String((row && row.id) || '') }),
					type: mapType(row && row.movieType)
				});
			}).filter(function(item) {
				const parsed = parseJsonSafe(item.url, {});
				return parsed && parsed.id;
			});
		} catch (_) {
			return [];
		}
	}

	async function fetchMovieDetailsWithKey(id, key) {
		const url = MAIN_URL + '/film-api/v1.9.9/movie?channel=IndiaA&clientType=1&lang=en-US&movieId=' + encodeURIComponent(String(id)) + '&packageName=com.external.castle';
		try {
			const res = await http_get(url, BASE_HEADERS);
			const decryptedJson = await decryptData(res && res.body ? res.body : '', key);
			if (!decryptedJson) return null;
			const root = parseJsonPreserveBigInt(decryptedJson, {});
			return (root || {}).data || null;
		} catch (_) {
			return null;
		}
	}

	async function buildDetails(id) {
		const sec = await getSecurityKey(3);
		if (!sec.key) return null;

		const d = await fetchMovieDetailsWithKey(id, sec.key);
		if (!d) return null;

		const episodes = [];
		if (Array.isArray(d.seasons) && d.seasons.length > 1) {
			const seasonPromises = d.seasons.map(async function(season) {
				if (!season || !season.movieId) return [];
				const sData = await fetchMovieDetailsWithKey(String(season.movieId), sec.key);
				const eps = Array.isArray(sData && sData.episodes) ? sData.episodes : [];
				return eps.map(function(ep) {
					return {
						id: String((ep && ep.id) || ''),
						title: clean(ep && ep.title || 'Episode'),
						number: Number(ep && ep.number || 1) || 1,
						season: Number(season && season.number || 1) || 1,
						coverImage: (ep && ep.coverImage) || '',
						sourceMovieId: String(season.movieId),
						tracks: (Array.isArray(ep && ep.tracks) ? ep.tracks : []).map(function(t) {
							return {
								languageId: t && t.languageId,
								name: (t && (t.languageName || t.abbreviate)) || 'Audio',
								isDefault: Boolean(t && t.isDefault),
								existIndividualVideo: Boolean(t && t.existIndividualVideo)
							};
						})
					};
				}).filter(function(ep) { return ep.id; });
			});
			(await Promise.all(seasonPromises)).forEach(function(eps) {
				episodes.push.apply(episodes, eps);
			});
		} else if (Array.isArray(d.episodes)) {
			d.episodes.forEach(function(ep) {
				const idText = String((ep && ep.id) || '');
				if (!idText) return;
				episodes.push({
					id: idText,
					title: clean(ep && ep.title || 'Episode'),
					number: Number(ep && ep.number || 1) || 1,
					season: Number(d && d.seasonNumber || 1) || 1,
					coverImage: (ep && ep.coverImage) || '',
					sourceMovieId: String(d.id),
					tracks: (Array.isArray(ep && ep.tracks) ? ep.tracks : []).map(function(t) {
						return {
							languageId: t && t.languageId,
							name: (t && (t.languageName || t.abbreviate)) || 'Audio',
							isDefault: Boolean(t && t.isDefault),
							existIndividualVideo: Boolean(t && t.existIndividualVideo)
						};
					})
				});
			});
		}

		episodes.sort(function(a, b) {
			return (Number(a.season || 0) - Number(b.season || 0)) || (Number(a.number || 0) - Number(b.number || 0));
		});

		return {
			id: String(d.id),
			title: clean(d.title || 'Unknown'),
			description: d.briefIntroduction || '',
			coverImage: d.coverVerticalImage || d.coverHorizontalImage || '',
			backgroundImage: d.coverHorizontalImage || '',
			year: d.publishTime ? new Date(d.publishTime).getFullYear() : undefined,
			score: Number(d.score || 0) || undefined,
			episodes: episodes,
			seasons: (Array.isArray(d.seasons) ? d.seasons : []).map(function(s) {
				return {
					id: String((s && s.movieId) || ''),
					number: Number(s && s.number || 1) || 1,
					name: 'Season ' + String((s && s.number) || 1)
				};
			}),
			tags: Array.isArray(d.tags) ? d.tags : [],
			actors: (Array.isArray(d.actors) ? d.actors : []).map(function(a) {
				return { name: a && a.name || '', image: a && a.avatar || '' };
			}),
			movieType: mapType(d.movieType)
		};
	}

	function qualityLabelFromResolution(resolution) {
		const r = Number(resolution || 0);
		if (r === 3) return '1080p';
		if (r === 2) return '720p';
		if (r === 1) return '480p';
		return String(r || 'Auto') + 'p';
	}

	async function fetchStreamUrl(movieId, episodeId, languageId) {
		const sec = await getSecurityKey(3);
		if (!sec.key) return null;

		const details = await fetchMovieDetailsWithKey(movieId, sec.key);
		const episodes = (details && Array.isArray(details.episodes)) ? details.episodes : [];

		let targetEpisode = episodes.find(function(ep) {
			return String((ep && ep.id) || '') === String(episodeId || '');
		});
		if (!targetEpisode && episodes.length) targetEpisode = episodes[0];
		if (targetEpisode && targetEpisode.id) episodeId = String(targetEpisode.id);

		const tracks = (targetEpisode && Array.isArray(targetEpisode.tracks)) ? targetEpisode.tracks : [];
		const hasIndividual = tracks.some(function(t) { return Boolean(t && t.existIndividualVideo); });

		const trackPlan = [];
		if (languageId) {
			trackPlan.push({ languageId: languageId, name: 'provided' });
		} else if (!hasIndividual && tracks.length) {
			trackPlan.push({ languageId: tracks[0].languageId, name: tracks[0].languageName || tracks[0].abbreviate || 'default' });
		} else if (tracks.length) {
			tracks.forEach(function(t) {
				trackPlan.push({ languageId: t.languageId, name: t.languageName || t.abbreviate || 'audio' });
			});
		} else {
			trackPlan.push({ languageId: undefined, name: 'no-track' });
		}

		const resolutions = [3, 2, 1];
		const collectedQualities = [];
		let bestVideoUrl = null;
		const cookieHeader = clean(sec.cookie) || 'hd=on';

		for (let i = 0; i < trackPlan.length; i++) {
			const track = trackPlan[i];
			for (let j = 0; j < resolutions.length; j++) {
				const resolution = resolutions[j];
				const url = MAIN_URL + '/film-api/v2.0.1/movie/getVideo2?clientType=1&packageName=com.external.castle&channel=IndiaA&lang=en-US';
				const body = {
					mode: '1',
					appMarket: 'GuanWang',
					clientType: '1',
					woolUser: 'false',
					apkSignKey: 'ED0955EB04E67A1D9F3305B95454FED485261475',
					androidVersion: '13',
					movieId: String(movieId),
					episodeId: String(episodeId),
					isNewUser: 'true',
					resolution: String(resolution),
					packageName: 'com.external.castle'
				};
				if (track.languageId !== undefined && track.languageId !== null && String(track.languageId) !== '') {
					body.languageId = String(track.languageId);
				}

				try {
					const res = await http_post(url, {
						'Content-Type': 'application/json; charset=utf-8',
						'User-Agent': 'okhttp/4.9.0',
						'Cookie': cookieHeader
					}, JSON.stringify(body));

					const decryptedJson = await decryptData(res && res.body ? res.body : '', sec.key);
					if (!decryptedJson) continue;
					const data = ((parseJsonPreserveBigInt(decryptedJson, {}) || {}).data) || null;
					if (!data || !data.videoUrl) continue;

					const quality = qualityLabelFromResolution(resolution);
					collectedQualities.push({ quality: quality, url: String(data.videoUrl), language: track.name || 'Audio' });
					if (!bestVideoUrl) bestVideoUrl = String(data.videoUrl);
				} catch (_) {}
			}
		}

		if (!bestVideoUrl) return null;
		return {
			videoUrl: bestVideoUrl,
			qualities: collectedQualities,
			headers: { 'Referer': MAIN_URL }
		};
	}

	async function getHome(cb) {
		try {
			const rows = await fetchHomeRows(1);
			const sections = {};
			rows.forEach(function(row) {
				if (!row || !row.name || !Array.isArray(row.contents) || !row.contents.length) return;
				sections[row.name] = row.contents;
			});
			cb({ success: true, data: sections });
		} catch (e) {
			cb({ success: false, errorCode: 'HOME_ERROR', message: String(e && e.message ? e.message : e) });
		}
	}

	async function search(query, cb) {
		try {
			const items = await searchItems(query);
			cb({ success: true, data: items });
		} catch (e) {
			cb({ success: false, errorCode: 'SEARCH_ERROR', message: String(e && e.message ? e.message : e) });
		}
	}

	async function load(urlData, cb) {
		try {
			const payload = parseJsonSafe(urlData, {});
			const id = payload && payload.id ? String(payload.id) : clean(urlData);
			if (!id) return cb({ success: false, errorCode: 'INVALID_ID', message: 'Missing content id' });

			const details = await buildDetails(id);
			if (!details) return cb({ success: false, errorCode: 'LOAD_ERROR', message: 'Unable to load Castle details' });

			const eps = Array.isArray(details.episodes) ? details.episodes : [];
			const mappedEpisodes = eps.map(function(ep, idx) {
				const preferredTrack = (Array.isArray(ep.tracks) ? ep.tracks : []).find(function(t) { return t && t.isDefault; }) || (Array.isArray(ep.tracks) ? ep.tracks[0] : null);
				return new Episode({
					name: ep.title || ('Episode ' + String(idx + 1)),
					season: Number(ep.season || 1) || 1,
					episode: Number(ep.number || (idx + 1)) || (idx + 1),
					url: JSON.stringify({
						movieId: String(ep.sourceMovieId || details.id),
						episodeId: String(ep.id),
						languageId: preferredTrack && preferredTrack.languageId !== undefined ? Number(preferredTrack.languageId) : undefined
					}),
					posterUrl: ep.coverImage || details.coverImage || ''
				});
			}).filter(Boolean);

			let itemType = details.movieType;
			if (!itemType) itemType = mappedEpisodes.length > 1 ? 'series' : 'movie';

			const finalEpisodes = mappedEpisodes.length ? mappedEpisodes : [new Episode({
				name: 'Full Movie',
				season: 1,
				episode: 1,
				url: JSON.stringify({ movieId: details.id, episodeId: details.id }),
				posterUrl: details.coverImage || ''
			})];

			cb({
				success: true,
				data: new MultimediaItem({
					title: details.title,
					url: JSON.stringify({ id: details.id }),
					posterUrl: details.coverImage || '',
					backgroundUrl: details.backgroundImage || details.coverImage || '',
					description: details.description || '',
					year: details.year,
					score: details.score,
					type: itemType,
					episodes: finalEpisodes
				})
			});
		} catch (e) {
			cb({ success: false, errorCode: 'LOAD_ERROR', message: String(e && e.message ? e.message : e) });
		}
	}

	async function loadStreams(urlData, cb) {
		try {
			const payload = parseJsonSafe(urlData, {});
			const movieId = payload && payload.movieId ? String(payload.movieId) : '';
			const episodeId = payload && payload.episodeId ? String(payload.episodeId) : movieId;
			const languageId = payload && payload.languageId !== undefined ? Number(payload.languageId) : undefined;
			if (!movieId || !episodeId) {
				return cb({ success: false, errorCode: 'INVALID_ID', message: 'Missing movie or episode id' });
			}

			const stream = await fetchStreamUrl(movieId, episodeId, languageId);
			if (!stream || !stream.videoUrl) {
				return cb({ success: false, errorCode: 'STREAM_ERROR', message: 'No stream found' });
			}

			const headers = Object.assign({}, stream.headers || {});
			const results = [];

			const seen = new Set();
			(Array.isArray(stream.qualities) ? stream.qualities : []).forEach(function(q) {
				if (!q || !q.url) return;
				const key = String(q.url) + '|' + String(q.quality || 'Auto') + '|' + String(q.language || 'Audio');
				if (seen.has(key)) return;
				seen.add(key);
				results.push(new StreamResult({
					url: String(q.url),
					source: 'CastleTV ' + String(q.language || 'Audio') + ' ' + String(q.quality || 'Auto'),
					headers: headers
				}));
			});

			if (!results.length) {
				results.push(new StreamResult({
					url: String(stream.videoUrl),
					source: 'CastleTV Auto',
					headers: headers
				}));
			}

			cb({ success: true, data: results });
		} catch (e) {
			cb({ success: false, errorCode: 'STREAM_ERROR', message: String(e && e.message ? e.message : e) });
		}
	}

	globalThis.getHome = getHome;
	globalThis.search = search;
	globalThis.load = load;
	globalThis.loadStreams = loadStreams;
})();
