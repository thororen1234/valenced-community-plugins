export const Services = ['lastfm', 'librefm', 'listenbrainz'] as const
export type Service = (typeof Services)[number]

export interface Credentials {
	username: string
	key: string
}

export interface Track {
	name: string
	artist: string
	album: string
	albumArt?: string
	duration?: number
}

export const ServiceInfo: Record<
	Service,
	{ name: string; keyLabel: string; keyRequired: boolean; keyUrl: string }
> = {
	lastfm: {
		name: 'Last.fm',
		keyLabel: 'API key',
		keyRequired: true,
		keyUrl: 'https://www.last.fm/api/account/create',
	},
	librefm: {
		name: 'Libre.fm',
		keyLabel: 'API key',
		keyRequired: true,
		keyUrl: 'https://libre.fm/api/account/create',
	},
	listenbrainz: {
		name: 'ListenBrainz',
		keyLabel: 'User token (optional)',
		keyRequired: false,
		keyUrl: 'https://listenbrainz.org/settings/',
	},
}

const AudioscrobblerUrls = {
	lastfm: 'https://ws.audioscrobbler.com/2.0/',
	librefm: 'https://libre.fm/2.0/',
}
const ListenBrainzUrl = 'https://api.listenbrainz.org/1'

const DefaultCoverHash = '2a96cbd8b46e442fc41c2b86b821562f'

const AudioscrobblerErrors: Record<number, string> = {
	6: 'User not found',
	10: 'Invalid API key',
	11: 'Service offline',
	16: 'Service temporarily unavailable',
	26: 'API key suspended',
	29: 'Rate limit exceeded',
}

async function request<T>(url: string, init?: RequestInit) {
	const response = await fetch(url, init)
	const data = await response.json().catch(() => undefined)

	if (data?.error) {
		const message =
			AudioscrobblerErrors[data.error] ?? data.message ?? data.error
		throw new Error(`${message}`)
	}
	if (!response.ok) throw new Error(`HTTP ${response.status}`)

	return data as T
}

interface AudioscrobblerTrack {
	name: string
	artist: { name?: string; '#text'?: string }
	album: { '#text'?: string }
	image?: { size: string; '#text': string }[]
	'@attr'?: { nowplaying?: string | boolean }
}

async function audioscrobbler<T>(
	service: 'lastfm' | 'librefm',
	params: Record<string, string>,
) {
	const query = new URLSearchParams({ ...params, format: 'json' })
	return request<T>(`${AudioscrobblerUrls[service]}?${query}`)
}

async function fetchAudioscrobblerTrack(
	service: 'lastfm' | 'librefm',
	{ username, key }: Credentials,
) {
	const { recenttracks } = await audioscrobbler<{
		recenttracks?: { track?: AudioscrobblerTrack[] }
	}>(service, {
		method: 'user.getrecenttracks',
		user: username,
		api_key: key,
		limit: '1',
		extended: '1',
	})

	const track = recenttracks?.track?.[0]
	if (String(track?.['@attr']?.nowplaying) !== 'true') return null

	const artist = track!.artist.name ?? track!.artist['#text'] ?? ''
	const cover = track!.image?.find(image => image.size === 'large')?.['#text']

	return {
		name: track!.name,
		artist,
		album: track!.album['#text'] ?? '',
		albumArt: cover && !cover.includes(DefaultCoverHash) ? cover : undefined,
		duration: await audioscrobbler<{ track?: { duration?: string } }>(service, {
			method: 'track.getInfo',
			track: track!.name,
			artist,
			api_key: key,
		})
			.then(info => Number(info.track?.duration) / 1000 || undefined)
			.catch(() => undefined),
	} satisfies Track
}

interface ListenBrainzListen {
	track_metadata: {
		artist_name: string
		track_name: string
		release_name?: string
		additional_info?: { duration_ms?: number; release_mbid?: string }
	}
}

async function fetchListenBrainzTrack({ username, key }: Credentials) {
	const { payload } = await request<{
		payload?: { listens?: ListenBrainzListen[] }
	}>(
		`${ListenBrainzUrl}/user/${encodeURIComponent(username)}/playing-now`,
		key ? { headers: { Authorization: `Token ${key}` } } : undefined,
	)

	const metadata = payload?.listens?.[0]?.track_metadata
	if (!metadata) return null

	const { duration_ms, release_mbid } = metadata.additional_info ?? {}

	return {
		name: metadata.track_name,
		artist: metadata.artist_name,
		album: metadata.release_name ?? '',
		albumArt: release_mbid
			? `https://coverartarchive.org/release/${release_mbid}/front-500`
			: undefined,
		duration: duration_ms ? duration_ms / 1000 : undefined,
	} satisfies Track
}

export function fetchNowPlaying(
	service: Service,
	credentials: Credentials,
): Promise<Track | null> {
	return service === 'listenbrainz'
		? fetchListenBrainzTrack(credentials)
		: fetchAudioscrobblerTrack(service, credentials)
}

export async function testCredentials(
	service: Service,
	credentials: Credentials,
) {
	if (!credentials.username) throw new Error('Username is not set')
	if (ServiceInfo[service].keyRequired && !credentials.key)
		throw new Error(`${ServiceInfo[service].keyLabel} is not set`)

	if (service === 'listenbrainz') {
		if (credentials.key) {
			const { valid } = await request<{ valid?: boolean }>(
				`${ListenBrainzUrl}/validate-token`,
				{ headers: { Authorization: `Token ${credentials.key}` } },
			)
			if (!valid) throw new Error('Invalid user token')
		}

		await request(
			`${ListenBrainzUrl}/user/${encodeURIComponent(credentials.username)}/listen-count`,
		)
		return
	}

	await audioscrobbler(service, {
		method: 'user.getinfo',
		user: credentials.username,
		api_key: credentials.key,
	})
}
