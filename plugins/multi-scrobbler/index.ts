import { Dispatcher } from '@valenced/discord/common/flux'
import { getStore, Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { fetchNowPlaying, ServiceInfo } from './services'
import SettingsComponent from './settings'
import type { DiscordModules } from '@valenced/discord/types'
import type { Credentials, Service, Track } from './services'

const ApplicationId = '1054951789318909972'

export const DefaultInterval = 5
export const MinInterval = 3
export const LibreFmMinInterval = 60

const SettingsDebounce = 1000

export const DefaultAppName = 'Music'

const ActivityType = { Playing: 0, Listening: 2 }

export interface Settings {
	service: Service
	credentials: Record<Service, Credentials>
	appName: string
	interval: number
	listening: boolean
	showTimestamp: boolean
	showAlbum: boolean
	showDuration: boolean
	ignoredApps: string[]
}

export const DefaultSettings: Settings = {
	service: 'lastfm',
	credentials: {
		lastfm: { username: '', key: '' },
		librefm: { username: '', key: '' },
		listenbrainz: { username: '', key: '' },
	},
	appName: DefaultAppName,
	interval: DefaultInterval,
	listening: true,
	showTimestamp: true,
	showAlbum: true,
	showDuration: true,
	ignoredApps: [],
}

export function withDefaults(value: Partial<Settings> | undefined): Settings {
	return {
		...DefaultSettings,
		...value,
		credentials: { ...DefaultSettings.credentials, ...value?.credentials },
	}
}

export function intervalFor({ service, interval }: Settings) {
	return Math.max(
		interval || DefaultInterval,
		service === 'librefm' ? LibreFmMinInterval : MinInterval,
	)
}

interface Activity {
	name: string
	type: number
	details: string
	state: string
	application_id: string
	flags: number
	status_display_type: number
	timestamps?: { start: number; end?: number }
	assets?: { large_image?: string; large_text?: string }
}

interface HttpModule {
	HTTP: {
		post(options: { url: string; body: unknown }): Promise<{ body: unknown }>
	}
	get: unknown
	post: unknown
	put: unknown
	patch: unknown
	del: unknown
}

type SelfPresenceStore = DiscordModules.Flux.Store<{
	getActivities(): { name?: string; application_id?: string }[]
}>

function formatDuration(seconds: number) {
	const minutes = Math.floor(seconds / 60)
	const rest = Math.floor(seconds % 60)
	return `${minutes}:${String(rest).padStart(2, '0')}`
}

function formatAppName({ appName, service }: Settings, track: Track) {
	const variables: Record<string, string> = {
		artist: track.artist,
		name: track.name,
		album: track.album,
		service: ServiceInfo[service].name,
	}

	return (
		appName.replace(/{{(\w+)}}/g, (match, key) => variables[key] ?? match) ||
		DefaultAppName
	)
}

function isIgnoredAppActive(ignoredApps: string[]) {
	if (!ignoredApps.length) return false

	const activities =
		(Stores.SelfPresenceStore as SelfPresenceStore)?.getActivities() ?? []

	return activities.some(
		({ name, application_id }) =>
			name &&
			application_id !== ApplicationId &&
			ignoredApps.some(app => name.toLowerCase().includes(app.toLowerCase())),
	)
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: DefaultSettings,
	},
	start({ cleanup, jsonStorage, logger }) {
		let http: HttpModule['HTTP'] | undefined
		const assets = new Map<string, string>()

		let playing: { key: string; start: number } | undefined
		let shown = false
		let stale = true

		let run = 0
		let timer: ReturnType<typeof setTimeout> | undefined
		let lastError: string | undefined
		let ready = false

		cleanup(
			getStore('LocalActivityStore', () => {
				ready = true
			}),
			getModules(
				withProps<HttpModule>('HTTP', 'get', 'post', 'put', 'patch', 'del'),
				({ HTTP }) => {
					http = HTTP
				},
			),
		)

		const setActivity = (activity: Activity | null) =>
			Dispatcher.dispatch({
				type: 'LOCAL_ACTIVITY_UPDATE',
				activity,
				pid: 2312,
				socketId: 'MultiScrobbler@Valenced',
			})

		const clear = () => {
			stale = true
			if (!shown) return
			shown = false
			setActivity(null)
		}

		const resolveAsset = async (url: string) => {
			const cached = assets.get(url)
			if (cached || !http) return cached

			const { body } = await http.post({
				url: `/applications/${ApplicationId}/external-assets`,
				body: { urls: [url] },
			})
			const path = (body as { external_asset_path?: string }[])?.[0]
				?.external_asset_path
			if (!path) return

			const asset = `mp:${path}`
			assets.set(url, asset)
			return asset
		}

		const buildActivity = async (settings: Settings, track: Track) => {
			const activity: Activity = {
				name: formatAppName(settings, track),
				type: settings.listening
					? ActivityType.Listening
					: ActivityType.Playing,
				details: track.name,
				state: track.artist,
				application_id: ApplicationId,
				flags: 0,
				status_display_type: 1,
			}

			if (settings.showTimestamp && playing) {
				activity.timestamps = { start: playing.start }
				if (track.duration)
					activity.timestamps.end = playing.start + track.duration * 1000
			}

			const largeText = [
				settings.showAlbum && track.album && `on ${track.album}`,
				settings.showDuration &&
					track.duration &&
					formatDuration(track.duration),
			]
				.filter(Boolean)
				.join(' • ')

			const largeImage =
				track.albumArt &&
				(await resolveAsset(track.albumArt).catch(error => {
					logger.warn(`Could not resolve album art: ${error}`)
					return undefined
				}))

			if (largeImage || largeText)
				activity.assets = {
					...(largeImage && { large_image: largeImage }),
					...(largeText && { large_text: largeText }),
				}

			return activity
		}

		const check = async (current: number) => {
			const settings = withDefaults(jsonStorage.cache as Partial<Settings>)
			const credentials = settings.credentials[settings.service]

			try {
				if (!credentials.username || isIgnoredAppActive(settings.ignoredApps))
					return clear()

				const track = await fetchNowPlaying(settings.service, credentials)
				if (current !== run) return
				lastError = undefined

				if (!track) {
					playing = undefined
					return clear()
				}

				const key = [
					settings.service,
					track.artist,
					track.name,
					track.album,
				].join('\n')
				if (playing?.key !== key) {
					playing = { key, start: Date.now() }
					stale = true
				}
				if (!stale || !ready) return

				const activity = await buildActivity(settings, track)
				if (current !== run) return

				setActivity(activity)
				shown = true
				stale = false
			} catch (error) {
				const message = String(error)
				if (message !== lastError)
					logger.error(
						`Could not get the playing track from ${ServiceInfo[settings.service].name}: ${message}`,
					)
				lastError = message
			} finally {
				if (current === run)
					timer = setTimeout(() => check(current), intervalFor(settings) * 1000)
			}
		}

		const restart = (delay: number) => {
			clearTimeout(timer)
			stale = true
			const current = ++run
			timer = setTimeout(() => check(current), delay)
		}

		restart(0)
		cleanup(jsonStorage.subscribe(() => restart(SettingsDebounce)))

		const onConnectionOpen = () => {
			stale = true
		}
		Dispatcher.subscribe('CONNECTION_OPEN', onConnectionOpen)

		cleanup(() => {
			Dispatcher.unsubscribe('CONNECTION_OPEN', onConnectionOpen)
			clearTimeout(timer)
			run++
			clear()
		})
	},
	SettingsComponent,
})
