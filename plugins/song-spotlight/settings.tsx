import {
	clearCache,
	parseLink,
	parsers,
	renderSong,
	services,
	validateSong,
} from '@song-spotlight/api/handlers'
import { sid } from '@song-spotlight/api/util'
import { getAssetIdByName } from '@valenced/assets'
import Page from '@valenced/components/Page'
import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Linking, ScrollView } from 'react-native'
import {
	currentUserId,
	deleteData,
	getData,
	removeToken,
	SongLimit,
	saveData,
	toast,
	useAuthorized,
	useCache,
} from './api'
import { openOAuth2Modal } from './modules'
import { ServiceIcons, takePending } from './songs'
import type { RenderSongInfo } from '@song-spotlight/api/handlers'
import type { Song, UserData } from '@song-spotlight/api/structs'

const {
	AlertActionButton,
	AlertModal,
	Button,
	ContextMenu,
	IconButton,
	Stack,
	TableRow,
	TableRowGroup,
	TextInput,
} = Design

const PlusIcon = getAssetIdByName('PlusMediumIcon')
const UploadIcon = getAssetIdByName('UploadIcon')
const CopyIcon = getAssetIdByName('CopyIcon')
const DoorExitIcon = getAssetIdByName('DoorExitIcon')
const TrashIcon = getAssetIdByName('TrashIcon')
const LinkIcon = getAssetIdByName('LinkIcon')
const MoreIcon = getAssetIdByName('MoreHorizontalIcon')!

const ids = (data: UserData) => data.map(sid).join(',')

export default function SettingsComponent() {
	const authorized = useAuthorized()
	const userId = currentUserId()
	const saved = useCache(state =>
		userId ? state.users[userId]?.data : undefined,
	)
	const [draft, setDraft] = useState(takePending)
	const [busy, setBusy] = useState(false)

	const data = draft ?? saved
	const modified = !!draft && ids(draft) !== ids(saved ?? [])

	useEffect(() => {
		if (!authorized) return
		setBusy(true)
		getData()
			.catch(() => {})
			.finally(() => setBusy(false))
	}, [userId, authorized])

	const save = () => {
		if (!draft) return
		setBusy(true)
		saveData(draft)
			.then(() => {
				setDraft(undefined)
				toast('Updated songs!')
			})
			.catch(() => {})
			.finally(() => setBusy(false))
	}

	const move = (index: number, by: number) => {
		if (!data) return
		const next = [...data]
		const [song] = next.splice(index, 1)
		next.splice(index + by, 0, song!)
		setDraft(next)
	}

	return (
		<ScrollView keyboardShouldPersistTaps="handled">
			<Page>
				<TableRowGroup title="Your songs">
					{!authorized ? (
						<TableRow label="Authorize first to manage your songs" />
					) : !data ? (
						<TableRow label={<ActivityIndicator size="small" />} />
					) : (
						<>
							{data.map((song, index) => (
								<SongRow
									key={sid(song)}
									song={song}
									disabled={busy}
									onMoveUp={index > 0 ? () => move(index, -1) : undefined}
									onMoveDown={
										index < data.length - 1 ? () => move(index, 1) : undefined
									}
									onRemove={() => {
										setDraft(data.filter(item => sid(item) !== sid(song)))
										toast('Removed song!')
									}}
								/>
							))}
							{data.length < SongLimit && (
								<TableRow
									label="Add song"
									icon={<TableRow.Icon source={PlusIcon} />}
									disabled={busy}
									onPress={() => openAddSong(data, setDraft)}
								/>
							)}
						</>
					)}
				</TableRowGroup>
				{modified && (
					<Stack direction="horizontal" spacing={8}>
						<Button
							grow
							variant="secondary"
							text="Discard"
							disabled={busy}
							onPress={() => setDraft(undefined)}
						/>
						<Button
							grow
							text="Update"
							loading={busy}
							disabled={busy}
							onPress={save}
						/>
					</Stack>
				)}
				{authorized && data && (
					<TableRowGroup>
						<TableRow
							label="Import from clipboard"
							icon={<TableRow.Icon source={UploadIcon} />}
							disabled={busy}
							onPress={() => {
								if (!data.length) return importSongs(setDraft)
								confirm({
									key: 'import',
									title: 'Are you sure?',
									content: 'This will overwrite your current songs.',
									confirmText: 'Import',
									onConfirm: () => importSongs(setDraft),
								})
							}}
						/>
						<TableRow
							label="Copy to clipboard"
							icon={<TableRow.Icon source={CopyIcon} />}
							onPress={() => {
								Clipboard.setString(JSON.stringify(data))
								toast('Copied song data to clipboard!')
							}}
						/>
					</TableRowGroup>
				)}
				<TableRowGroup title="Authorization">
					{authorized ? (
						<>
							<TableRow
								label="Log out"
								subLabel="Log out of Song Spotlight"
								icon={<TableRow.Icon source={DoorExitIcon} />}
								disabled={busy}
								onPress={() =>
									confirm({
										key: 'log-out',
										title: 'Log out',
										content:
											'Are you sure you want to log out of Song Spotlight?',
										confirmText: 'Log out',
										onConfirm: () => {
											removeToken()
											setDraft(undefined)
											toast('Successfully logged out.')
										},
									})
								}
							/>
							<TableRow
								label="Delete songs"
								subLabel="Permanently delete your songs"
								variant="danger"
								icon={<TableRow.Icon source={TrashIcon} variant="danger" />}
								disabled={busy}
								onPress={() =>
									confirm({
										key: 'delete-songs',
										title: 'Delete songs',
										content:
											'Are you sure you want to permanently delete all of your songs?',
										confirmText: 'Delete',
										destructive: true,
										onConfirm: () => {
											setBusy(true)
											deleteData()
												.then(() => {
													removeToken()
													setDraft(undefined)
													toast('Successfully deleted songs.')
												})
												.catch(() => {})
												.finally(() => setBusy(false))
										},
									})
								}
							/>
						</>
					) : (
						<TableRow
							label="Authorize"
							icon={<TableRow.Icon source={LinkIcon} />}
							arrow
							onPress={openOAuth2Modal}
						/>
					)}
					<TableRow
						label="Clear link cache"
						icon={<TableRow.Icon source={LinkIcon} />}
						onPress={() => {
							clearCache()
							toast('Cleared link cache!')
						}}
					/>
				</TableRowGroup>
			</Page>
		</ScrollView>
	)
}

function SongRow({
	song,
	disabled,
	onMoveUp,
	onMoveDown,
	onRemove,
}: {
	song: Song
	disabled: boolean
	onMoveUp?: () => void
	onMoveDown?: () => void
	onRemove(): void
}) {
	const [render, setRender] = useState<RenderSongInfo | false | null>(null)

	useEffect(() => {
		setRender(null)
		renderSong(song).then(
			value => setRender(value ?? false),
			() => setRender(false),
		)
	}, [sid(song)])

	const items = [
		render && {
			label: 'Copy link',
			IconComponent: lookupGeneratedIconComponent('LinkIcon'),
			action: () => {
				Clipboard.setString(render.link)
				toast('Copied link to clipboard!')
			},
		},
		onMoveUp && {
			label: 'Move up',
			IconComponent: lookupGeneratedIconComponent('ArrowSmallUpIcon'),
			action: onMoveUp,
		},
		onMoveDown && {
			label: 'Move down',
			IconComponent: lookupGeneratedIconComponent('ArrowSmallDownIcon'),
			action: onMoveDown,
		},
		{
			label: 'Remove song',
			IconComponent: lookupGeneratedIconComponent('TrashIcon'),
			variant: 'destructive' as const,
			action: onRemove,
		},
	].filter(item => !!item)

	return (
		<TableRow
			label={render ? render.label : render === false ? '<err!>' : 'Loading...'}
			subLabel={render ? render.sublabel : undefined}
			labelLineClamp={1}
			subLabelLineClamp={1}
			icon={<TableRow.Icon source={ServiceIcons[song.service]} />}
			disabled={disabled}
			onPress={render ? () => Linking.openURL(render.link) : undefined}
			trailing={
				<ContextMenu title="Manage song" items={items}>
					{props => (
						<IconButton
							{...props}
							size="sm"
							variant="tertiary"
							icon={MoreIcon}
							disabled={disabled}
						/>
					)}
				</ContextMenu>
			}
		/>
	)
}

function openAddSong(data: UserData, setDraft: (data: UserData) => void) {
	const add = async (link: string) => {
		try {
			new URL(link)
		} catch {
			return toast('Input is not a valid URL', 'critical')
		}

		const song = await parseLink(link).catch(() => null)
		if (!song) return toast('Failed to fetch song!', 'critical')
		if (data.some(item => sid(item) === sid(song)))
			return toast("You've already added this song!", 'critical')

		setDraft([...data, song].slice(0, SongLimit))
	}

	AlertActionCreators.openAlert(
		'song-spotlight.add-song',
		<AddSongAlert onAdd={add} />,
	)
}

function AddSongAlert({ onAdd }: { onAdd(link: string): void }) {
	const [link, setLink] = useState('')

	return (
		<AlertModal
			title="Add a new song"
			content={`Song Spotlight supports these services: ${parsers.map(parser => parser.label).join(', ')}`}
			extraContent={
				<TextInput
					autoFocus
					clearable
					value={link}
					onChange={setLink}
					placeholder="https://open.spotify.com/track/..."
				/>
			}
			actions={
				<>
					<AlertActionButton
						text="Add song"
						disabled={!link.trim()}
						onPress={() => onAdd(link.trim())}
					/>
					<AlertActionButton variant="secondary" text="Cancel" />
				</>
			}
		/>
	)
}

function confirm({
	key,
	title,
	content,
	confirmText,
	destructive,
	onConfirm,
}: {
	key: string
	title: string
	content: string
	confirmText: string
	destructive?: boolean
	onConfirm(): void
}) {
	AlertActionCreators.openAlert(
		`song-spotlight.${key}`,
		<AlertModal
			title={title}
			content={content}
			actions={
				<>
					<AlertActionButton
						variant={destructive ? 'destructive' : 'primary'}
						text={confirmText}
						onPress={onConfirm}
					/>
					<AlertActionButton variant="secondary" text="Cancel" />
				</>
			}
		/>,
	)
}

async function importSongs(setDraft: (data: UserData) => void) {
	let json: unknown
	try {
		json = JSON.parse(await Clipboard.getString())
	} catch {
		return toast('No JSON in clipboard!', 'critical')
	}

	const isSong = (item: unknown): item is Song => {
		if (typeof item !== 'object' || !item || Array.isArray(item)) return false
		const { service, type, id } = item as Record<string, unknown>
		return (
			typeof id === 'string' &&
			services.some(
				({ name, types }) => name === service && types.includes(type as string),
			)
		)
	}

	if (!Array.isArray(json) || json.length > SongLimit || !json.every(isSong))
		return toast('Invalid Song Spotlight data in clipboard!', 'critical')

	const data = json.map(({ service, type, id }) => ({ service, type, id }))
	const valid = await Promise.all(
		data.map(song => validateSong(song).catch(() => false)),
	)
	if (!valid.every(Boolean))
		return toast('One or more imported songs were invalid', 'critical')

	setDraft(data)
	toast('Imported songs from clipboard!')
}
