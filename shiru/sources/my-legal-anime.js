const API_BASE = 'https://nekobt.to/api/v1';
const API_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c3IiOiIxMDEwMjg4ODc0NDIyMCIsInZlciI6MSwidHlwIjoxLCJpYXQiOjE3NzUxNTQwMzIsImV4cCI6MTgwNjY5MDAzMn0.S20XpYWhZIpZjOjXKpd2q_cSOejH7rukIHh4nvyauhE';

class AbstractSource {
  anitomyscript = globalThis.anitomyscript;
}

function normalizeTitle(title = '') {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function toDate(value) {
  const d = value ? new Date(value) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function fakeHash(input) {
  let hash = 0;
  const str = String(input || 'fallback');
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0').repeat(5).slice(0, 40);
}

async function apiRequest(path, options = {}) {
  const method = options.method || 'GET';
  const body = options.body;

  const response = await fetch(API_BASE + path, {
    method,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      cookie: 'ssid=' + API_KEY
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include'
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (response.status === 401) {
    throw new Error('401 Unauthorized: missing or invalid API key');
  }

  if (response.status === 429) {
    const retryAfter = data && data.retry_after ? data.retry_after : 'unknown';
    throw new Error('429 Rate limited: retry after ' + retryAfter + ' seconds');
  }

  if (response.status === 400) {
    const details = data && data.message ? data.message : JSON.stringify((data && data.errors) || data || {});
    throw new Error('400 Invalid data: ' + details);
  }

  if (!response.ok) {
    throw new Error('HTTP ' + response.status + ': ' + response.statusText);
  }

  if (data && data.error === true) {
    throw new Error(data.message || 'API returned error=true');
  }

  return data;
}

function buildQueries(options) {
  const titles = unique([
    options && options.media && options.media.title && options.media.title.romaji,
    options && options.media && options.media.title && options.media.title.english,
    options && options.media && options.media.title && options.media.title.native,
    ...((options && options.titles) || [])
  ]);
  return titles.map(normalizeTitle).filter(Boolean);
}

function parseEpisodeNumber(value) {
  if (typeof value === 'number') return value;
  const match = String(value || '').match(/(\d+)/);
  return match ? Number(match[1]) : undefined;
}

function parseAudioFlags(mediaItem = {}, torrentItem = {}) {
  const blob = normalizeTitle([
    mediaItem.title,
    mediaItem.english_title,
    mediaItem.romaji_title,
    torrentItem.release_name,
    torrentItem.name,
    ...((torrentItem.tags) || [])
  ].join(' '));

  const audio = [];
  if (blob.includes('eng') || blob.includes('english dub') || blob.includes('dub')) audio.push('eng');
  if (blob.includes('jpn') || blob.includes('japanese') || blob.includes('dual audio')) audio.push('jpn');

  return {
    audio: unique(audio),
    dualAudio: blob.includes('dual audio') || (audio.includes('eng') && audio.includes('jpn'))
  };
}

function scoreResult(mediaItem, torrentItem, options, mode) {
  let score = 0;
  const wantedEpisode = options && options.episode;
  const haystack = normalizeTitle([
    mediaItem && mediaItem.title,
    mediaItem && mediaItem.english_title,
    mediaItem && mediaItem.romaji_title,
    torrentItem && torrentItem.release_name,
    torrentItem && torrentItem.name,
    ...((torrentItem && torrentItem.tags) || [])
  ].join(' '));

  for (const q of buildQueries(options)) {
    if (haystack.includes(q)) score += 100;
  }

  const episode = parseEpisodeNumber((torrentItem && torrentItem.episode) || (mediaItem && mediaItem.episode_number));
  if (typeof wantedEpisode === 'number' && episode === wantedEpisode) score += 200;

  if (mode === 'batch' && ((torrentItem && torrentItem.is_batch) || Array.isArray(torrentItem && torrentItem.episodes))) {
    score += 120;
  }

  if (mode === 'movie' && normalizeTitle((mediaItem && mediaItem.type) || '').includes('movie')) {
    score += 120;
  }

  const audioFlags = parseAudioFlags(mediaItem, torrentItem);
  if (audioFlags.audio.includes('eng')) score += 40;
  if (audioFlags.audio.includes('jpn')) score += 20;
  if (audioFlags.dualAudio) score += 30;

  return score;
}

function mapToResult(mediaItem, torrentItem, mode, score) {
  const link = torrentItem.magnet || torrentItem.stream_url || torrentItem.download_url || torrentItem.url;
  const episode = parseEpisodeNumber(torrentItem.episode || mediaItem.episode_number);

  return {
    title: torrentItem.release_name || torrentItem.name || mediaItem.title,
    link,
    id: String(torrentItem.id || mediaItem.id),
    seeders: Number(torrentItem.seeders || 0),
    leechers: Number(torrentItem.leechers || 0),
    downloads: Number(torrentItem.downloads || 0),
    accuracy: score >= 250 ? 'high' : score >= 120 ? 'medium' : 'low',
    hash: torrentItem.info_hash || fakeHash(link || torrentItem.id || mediaItem.id),
    size: Number(torrentItem.size || torrentItem.size_bytes || 0),
    date: toDate(torrentItem.created_at || torrentItem.updated_at || mediaItem.created_at),
    type: mode === 'batch' ? 'batch' : 'best'
  };
}

async function fetchMediaDetails(mediaId) {
  const mediaDetails = await apiRequest('/media/' + mediaId);
  return mediaDetails && mediaDetails.data ? mediaDetails.data : mediaDetails;
}

async function fetchTorrentSearch(query) {
  const result = await apiRequest('/torrents/search?query=' + encodeURIComponent(query));
  if (Array.isArray(result && result.data)) return result.data;
  if (Array.isArray(result && result.results)) return result.results;
  if (Array.isArray(result)) return result;
  return [];
}

async function searchCatalog(options, mode) {
  const queries = buildQueries(options);
  const query = queries[0];
  if (!query) return [];

  const search = await apiRequest('/media/search?query=' + encodeURIComponent(query));
  const mediaResults = Array.isArray(search && search.data)
    ? search.data
    : Array.isArray(search && search.results)
      ? search.results
      : Array.isArray(search)
        ? search
        : [];

  const torrentSearchResults = await fetchTorrentSearch(query);
  const combined = [];

  for (const mediaItem of mediaResults.slice(0, 10)) {
    const mediaId = mediaItem && mediaItem.id;
    if (!mediaId) continue;

    try {
      const media = await fetchMediaDetails(mediaId);
      const embeddedTorrents = Array.isArray(media && media.torrents)
        ? media.torrents
        : Array.isArray(media && media.releases)
          ? media.releases
          : Array.isArray(media && media.items)
            ? media.items
            : [];

      const torrents = embeddedTorrents.length ? embeddedTorrents : torrentSearchResults;

      for (const torrent of torrents) {
        const score = scoreResult(media, torrent, options, mode);
        const result = mapToResult(media, torrent, mode, score);
        if (result.link && score > 0) combined.push(result);
      }
    } catch {
      // ignore broken media entries
    }
  }

  return combined.sort((a, b) => {
    const accuracyRank = { high: 3, medium: 2, low: 1 };
    return (accuracyRank[b.accuracy] - accuracyRank[a.accuracy]) || (b.seeders - a.seeders);
  });
}

export default new class NekobtSource extends AbstractSource {
  url = API_BASE;

  async validate() {
    try {
      const me = await apiRequest('/users/@me');
      return me && me.error === false;
    } catch {
      return false;
    }
  }

  async single(options) {
    return searchCatalog(options, 'single');
  }

  async batch(options) {
    return searchCatalog(options, 'batch');
  }

  async movie(options) {
    return searchCatalog(options, 'movie');
  }
}();