import { sid } from '@song-spotlight/api/util'
import { getAssetIdByName } from '@valenced/assets'
import { currentUserId, SongLimit, toast, useCache } from './api'
import { AppleMusicIcon, SoundcloudIcon, TidalIcon } from './icons'
import type { Song, UserData } from '@song-spotlight/api/structs'
import type { ImageSourcePropType } from 'react-native'

export const ServiceIcons: Record<string, ImageSourcePropType | undefined> = {
	spotify: getAssetIdByName('img_account_sync_spotify_light_and_dark'),
	soundcloud: SoundcloudIcon,
	applemusic: AppleMusicIcon,
	tidal: TidalIcon,
}

let pending: UserData | undefined
let openSettings = () => {}

export function setOpenSettings(fn: () => void) {
	openSettings = fn
}

export function takePending() {
	const data = pending
	pending = undefined
	return data
}

export function stealSong(song: Song) {
	const id = currentUserId()
	const data = (id && useCache.getState().users[id]?.data) || []
	if (data.length >= SongLimit)
		return toast('No space left on your profile!', 'critical')
	if (data.some(item => sid(item) === sid(song)))
		return toast("You've already added this song!", 'critical')

	pending = [...data, song]
	openSettings()
}

export function formatDuration(ms: number) {
	const seconds = Math.ceil(ms / 1000)
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
