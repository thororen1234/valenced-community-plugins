import { renderSong } from '@song-spotlight/api/handlers'
import { sid } from '@song-spotlight/api/util'
import { getAssetIdByName } from '@valenced/assets'
import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { proxify } from '@valenced/utils/proxy'
import { useEffect, useRef, useState } from 'react'
import { Image, Linking, Pressable, ScrollView, View } from 'react-native'
import { currentUserId, listData, toast, useAuthorized, useCache } from './api'
import { PreviewSound, UserProfileCard } from './modules'
import { formatDuration, ServiceIcons, stealSong } from './songs'
import type {
	RenderInfoEntryBased,
	RenderSongInfo,
} from '@song-spotlight/api/handlers'
import type { Song } from '@song-spotlight/api/structs'
import type { StyleProp, ViewStyle } from 'react-native'

const { ContextMenu, IconButton, Stack, Text } = Design

const PlayIcon = getAssetIdByName('PlayIcon')!
const PauseIcon = getAssetIdByName('PauseIcon')!
const SkipForwardIcon = getAssetIdByName('SkipForwardIcon')!

// Spotify previews are louder
const SpotifyVolume = 0.25
const DefaultVolume = 0.4

const EntryHeight = 36
const VisibleEntries = 3

interface Playing {
	playing: string | null
	setPlaying(key: string | null): void
}

export default function ProfileSongs({
	userId,
	style,
}: {
	userId: string
	style?: StyleProp<ViewStyle>
}) {
	const authorized = useAuthorized()
	const data = useCache(state => state.users[userId]?.data)
	const [playing, setPlaying] = useState<string | null>(null)

	useEffect(() => {
		if (!authorized) return
		if (userId === currentUserId() && useCache.getState().users[userId]) return
		listData(userId).catch(() => {})
	}, [userId, authorized])

	if (!authorized || !data?.length || !UserProfileCard) return null

	return (
		<UserProfileCard title="Song Spotlight" style={style}>
			<Stack spacing={8}>
				{data.map(song => (
					<ProfileSong
						key={sid(song)}
						song={song}
						playing={playing}
						setPlaying={setPlaying}
					/>
				))}
			</Stack>
		</UserProfileCard>
	)
}

function ProfileSong({ song, playing, setPlaying }: { song: Song } & Playing) {
	const styles = useStyles()
	const id = sid(song)
	const [render, setRender] = useState<RenderSongInfo | false | null>(null)

	useEffect(() => {
		setRender(null)
		renderSong(song).then(
			value => setRender(value ?? false),
			() => setRender(false),
		)
	}, [id])

	const entries = !render
		? []
		: render.form === 'single'
			? [render.single]
			: render.list
	const urls = [
		...new Set(
			entries.flatMap(entry =>
				entry.audio?.previewUrl ? [entry.audio.previewUrl] : [],
			),
		),
	]

	// Keyed by song too, so the same preview in two cards doesn't play twice
	const prefix = `${id}\n`
	const current = playing?.startsWith(prefix)
		? playing.slice(prefix.length)
		: null

	const [loaded, setLoaded] = useState<Record<string, boolean>>({})
	const sounds = useRef(new Map<string, PreviewSound>())

	const nextLoaded = (after: string | null) =>
		urls
			.slice(after ? urls.indexOf(after) + 1 : 0)
			.find(url => sounds.current.get(url)?.loaded)

	const play = (url: string | undefined) =>
		setPlaying(url ? prefix + url : null)

	useEffect(() => {
		const map = new Map<string, PreviewSound>()
		setLoaded({})
		for (const url of urls) {
			map.set(
				url,
				new PreviewSound(
					url,
					song.service === 'spotify' ? SpotifyVolume : DefaultVolume,
					value => setLoaded(prev => ({ ...prev, [url]: value })),
					() => play(nextLoaded(url)),
				),
			)
		}
		sounds.current = map

		return () => {
			for (const sound of map.values()) sound.destroy()
		}
	}, [urls.join('\n')])

	useEffect(() => {
		for (const [url, sound] of sounds.current) {
			if (url === current) {
				if (!sound.playing) sound.play()
			} else if (sound.playing) sound.stop()
		}
	}, [current, loaded])

	if (render === false) return null

	const info = render || null
	const anyLoaded = urls.some(url => loaded[url])
	const allResolved = urls.every(url => url in loaded)

	return (
		<View style={[styles.card, !info && styles.loading]}>
			<View style={[styles.service, !info && styles.hidden]}>
				<Image source={ServiceIcons[song.service]} style={styles.serviceIcon} />
			</View>
			<Stack
				direction="horizontal"
				spacing={12}
				style={[styles.header, !info && styles.hidden]}
			>
				<ContextMenu
					title={info?.label ?? ''}
					triggerOnLongPress
					items={[
						{
							label: 'Steal song',
							IconComponent: lookupGeneratedIconComponent('PlusMediumIcon'),
							action: () => stealSong(song),
						},
						{
							label: 'Copy link',
							IconComponent: lookupGeneratedIconComponent('LinkIcon'),
							action: () => {
								if (!info) return
								Clipboard.setString(info.link)
								toast('Copied link to clipboard!')
							},
						},
					]}
				>
					{props => (
						<Pressable
							{...props}
							onPress={() => info && Linking.openURL(info.link)}
						>
							<Image
								source={{ uri: info?.thumbnailUrl }}
								style={styles.thumbnail}
							/>
						</Pressable>
					)}
				</ContextMenu>
				<View style={styles.titles}>
					<Stack direction="horizontal" spacing={8} align="center">
						<Text
							variant="text-md/bold"
							color="text-default"
							lineClamp={1}
							style={styles.shrink}
						>
							{info?.label}
						</Text>
						{info?.form === 'single' && info.explicit && <Explicit />}
					</Stack>
					<Text variant="text-md/normal" color="text-muted" lineClamp={1}>
						{info?.sublabel}
					</Text>
				</View>
				<Stack
					direction="horizontal"
					spacing={8}
					align="flex-end"
					style={styles.controls}
				>
					{info?.form === 'single' && (
						<Text variant="text-md/medium" color="text-muted">
							{info.single.audio
								? formatDuration(info.single.audio.duration)
								: '-:--'}
						</Text>
					)}
					{info?.form === 'list' && (
						<IconButton
							variant="secondary"
							size="sm"
							icon={SkipForwardIcon}
							disabled={!anyLoaded}
							onPress={() => play(nextLoaded(current))}
						/>
					)}
					<IconButton
						variant="secondary"
						size="sm"
						icon={current ? PauseIcon : PlayIcon}
						loading={!!urls.length && !allResolved}
						disabled={!anyLoaded}
						onPress={() =>
							current ? setPlaying(null) : play(nextLoaded(null))
						}
					/>
				</Stack>
			</Stack>
			{info?.form === 'list' && (
				<ScrollView
					nestedScrollEnabled
					style={styles.entries}
					contentContainerStyle={styles.entriesContent}
				>
					{info.list.map((entry, index) => (
						<Entry
							key={entry.link}
							entry={entry}
							index={index}
							current={current}
							loaded={!!entry.audio && !!loaded[entry.audio.previewUrl]}
							onPress={url => (url === current ? setPlaying(null) : play(url))}
						/>
					))}
				</ScrollView>
			)}
		</View>
	)
}

function Entry({
	entry,
	index,
	current,
	loaded,
	onPress,
}: {
	entry: RenderInfoEntryBased
	index: number
	current: string | null
	loaded: boolean
	onPress(url: string): void
}) {
	const styles = useStyles()
	const url = entry.audio?.previewUrl

	return (
		<Pressable
			disabled={!loaded}
			onPress={() => url && onPress(url)}
			style={[styles.entry, !loaded && styles.dimmed]}
		>
			<View style={styles.entryIndex}>
				{url && url === current ? (
					<Image source={PauseIcon} style={styles.pauseIcon} />
				) : (
					<Text variant="text-md/medium" color="text-default">
						{index + 1}
					</Text>
				)}
			</View>
			<View style={styles.shrink}>
				<Text variant="text-sm/medium" color="text-default" lineClamp={1}>
					{entry.label}
				</Text>
				<Stack direction="horizontal" spacing={4} align="center">
					{entry.explicit && <Explicit />}
					<Text
						variant="text-sm/normal"
						color="text-muted"
						lineClamp={1}
						style={styles.shrink}
					>
						{entry.sublabel}
					</Text>
				</Stack>
			</View>
		</Pressable>
	)
}

function Explicit() {
	const styles = useStyles()
	return (
		<View style={styles.explicit}>
			<Text variant="text-xs/bold" color="text-muted">
				E
			</Text>
		</View>
	)
}

const useStyles = proxify(() => {
	const { colors } = Tokens.default
	return Design.createStyles({
		card: {
			backgroundColor: colors.BACKGROUND_MOD_MUTED,
			borderColor: colors.BORDER_MUTED,
			borderWidth: 1,
			borderRadius: 10,
		},
		loading: {
			borderColor: colors.BACKGROUND_MOD_MUTED,
		},
		hidden: {
			opacity: 0,
		},
		header: {
			padding: 10,
		},
		thumbnail: {
			width: 64,
			height: 64,
			borderRadius: 8,
		},
		titles: {
			flexShrink: 1,
			flexGrow: 1,
		},
		shrink: {
			flexShrink: 1,
		},
		controls: {
			alignSelf: 'flex-end',
		},
		service: {
			position: 'absolute',
			top: 0,
			right: 0,
			width: 24,
			height: 24,
			borderBottomLeftRadius: 9,
			borderTopRightRadius: 10,
			backgroundColor: colors.BORDER_MUTED,
			justifyContent: 'center',
			alignItems: 'center',
			zIndex: 1,
		},
		serviceIcon: {
			width: 18,
			height: 18,
			tintColor: colors.INTERACTIVE_ICON_DEFAULT,
		},
		explicit: {
			width: 16,
			height: 16,
			borderRadius: 4,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: colors.BORDER_MUTED,
		},
		entries: {
			height: EntryHeight * VisibleEntries + 4 * (VisibleEntries - 1) + 10 * 2,
			borderTopColor: colors.BORDER_MUTED,
			borderTopWidth: 1,
		},
		entriesContent: {
			padding: 10,
			gap: 4,
		},
		entry: {
			height: EntryHeight,
			flexDirection: 'row',
			alignItems: 'center',
			gap: 8,
		},
		entryIndex: {
			width: 24,
			alignItems: 'center',
			justifyContent: 'center',
		},
		pauseIcon: {
			width: 18,
			height: 18,
			tintColor: colors.INTERACTIVE_ICON_DEFAULT,
		},
		dimmed: {
			opacity: 0.5,
		},
	})
})
