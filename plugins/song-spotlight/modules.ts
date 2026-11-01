import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { Platform } from 'react-native'
import { ClientId, getData, RedirectUri, setToken, toast } from './api'
import type { FC, ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'

interface DiscordSound {
	volume: number
	ensureSound(): Promise<{ _duration: number }>
	play(): void
	stop(): void
}

type DiscordSoundConstructor = new (
	url: string,
	name: string,
	volume: number,
	outputChannel: string,
) => DiscordSound

interface ApplicationUtils {
	openOAuth2Modal(props: {
		clientId: string
		scopes: string[]
		integrationType: number
		permissions: bigint
		responseType: string
		redirectUri: string
		callback(result: { location?: string }): void
	}): void
}

export let UserProfileCard:
	| FC<{
			title: string
			style?: StyleProp<ViewStyle>
			children: ReactNode
	  }>
	| undefined

let MobileAudioSound: DiscordSoundConstructor | undefined
let applicationUtils: ApplicationUtils | undefined

export function findModules() {
	return [
		getModuleWithImportedPath<{ default: NonNullable<typeof UserProfileCard> }>(
			'modules/user_profile/native/UserProfileCard.tsx',
			module => {
				UserProfileCard = module.default
			},
		),
		getModules(
			withProps<{ MobileAudioSound: DiscordSoundConstructor }>(
				'MobileAudioSound',
			),
			module => {
				MobileAudioSound = module.MobileAudioSound
			},
		),
		getModules(
			withProps<ApplicationUtils & { installApplication: unknown }>(
				'openOAuth2Modal',
				'installApplication',
			),
			module => {
				applicationUtils = module
			},
		),
	]
}

export function openOAuth2Modal() {
	applicationUtils?.openOAuth2Modal({
		clientId: ClientId,
		scopes: ['applications.commands', 'identify'],
		// USER_INSTALL
		integrationType: 1,
		permissions: 0n,
		responseType: 'code',
		redirectUri: RedirectUri,
		async callback({ location }) {
			if (!location) return
			try {
				const res = await fetch(location)
				const access = await res.text()
				if (!res.ok) throw new Error(access)

				const refresh = res.headers.get('X-Refresh-Token')
				if (!access || !refresh) throw new Error('Missing token in response')

				setToken(access, refresh)
				toast('Successfully authorized!')
				getData().catch(() => {})
			} catch (error) {
				toast(`Song Spotlight: ${error}`, 'critical')
			}
		},
	})
}

export class PreviewSound {
	private sound?: DiscordSound
	private timeout?: ReturnType<typeof setTimeout>
	private duration = 0
	loaded = false
	playing = false

	constructor(
		url: string,
		volume: number,
		onLoad: (loaded: boolean) => void,
		private onEnd: () => void,
	) {
		if (!MobileAudioSound) {
			onLoad(false)
			return
		}

		// "vibing_wumpus" maps to the media usage
		this.sound = new MobileAudioSound(url, 'vibing_wumpus', volume, 'default')
		this.sound.volume = volume
		this.sound.ensureSound().then(
			({ _duration }) => {
				// iOS reports seconds, Android milliseconds
				this.duration = Platform.OS === 'ios' ? _duration * 1000 : _duration
				this.loaded = _duration > 0
				onLoad(this.loaded)
			},
			() => onLoad(false),
		)
	}

	play() {
		if (!this.sound || !this.loaded) return
		this.sound.play()
		this.playing = true

		clearTimeout(this.timeout)
		this.timeout = setTimeout(() => {
			this.stop()
			this.onEnd()
		}, this.duration)
	}

	stop() {
		clearTimeout(this.timeout)
		if (!this.sound || !this.playing) return
		this.playing = false
		// Releases the sound, play() loads it again
		this.sound.stop()
	}

	destroy() {
		clearTimeout(this.timeout)
		if (this.sound && this.loaded) this.sound.stop()
	}
}
