import { getAssetIdByName } from '@valenced/assets'
import Page from '@valenced/components/Page'
import TableRowAssetIcon from '@valenced/components/TableRowAssetIcon'
import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { useState } from 'react'
import { ScrollView } from 'react-native'
import { DefaultSettings } from '.'
import type { DiscordModules } from '@valenced/discord/types'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { ImageSourcePropType } from 'react-native'
import type { Settings } from '.'

const {
	AlertActionButton,
	AlertModal,
	Button,
	IconButton,
	Stack,
	TableRow,
	TableRowGroup,
	TableSwitchRow,
	TextInput,
} = Design

type Props = ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>

interface User {
	username: string
	getAvatarURL(guildId: undefined, size: number): number | string
}

const UserStore = () =>
	Stores.UserStore as DiscordModules.Flux.Store<{
		getUser(id: string): User | undefined
	}>

function UserRow({ id, onRemove }: { id: string; onRemove(): void }) {
	const user = UserStore().getUser(id)
	const avatar = user?.getAvatarURL(undefined, 32)

	return (
		<TableRow
			icon={
				avatar === undefined ? (
					<TableRowAssetIcon name="UserIcon" />
				) : (
					<TableRow.Icon
						source={
							(typeof avatar === 'number'
								? avatar
								: { uri: avatar }) as ImageSourcePropType
						}
					/>
				)
			}
			label={user?.username ?? id}
			subLabel={user ? id : undefined}
			trailing={
				<IconButton
					icon={getAssetIdByName('TrashIcon')!}
					variant="secondary"
					size="sm"
					onPress={onRemove}
				/>
			}
		/>
	)
}

export default function SettingsComponent({
	api: { jsonStorage: storage },
}: Props) {
	const setting = <K extends keyof Settings>(key: K): Settings[K] =>
		storage.use(x => key in x)?.[key] ?? DefaultSettings[key]

	const timestamps = setting('timestamps')
	const twelveHour = setting('twelveHour')
	const ignoreBots = setting('ignoreBots')
	const ignoredUsers = setting('ignoredUsers')

	const [input, setInput] = useState('')
	const [error, setError] = useState('')

	const addUser = () => {
		const id = input.trim()
		if (!/^\d{17,20}$/.test(id)) return setError('Enter a valid user ID')
		if (ignoredUsers.includes(id)) return setError('User is already ignored')

		storage.set({ ignoredUsers: [...ignoredUsers, id] })
		setInput('')
		setError('')
	}

	const clearUsers = () =>
		AlertActionCreators.openAlert(
			'thororen.no-delete.clear-users',
			<AlertModal
				title="Clear ignored users?"
				content={`This removes ${ignoredUsers.length} user${ignoredUsers.length === 1 ? '' : 's'} from the list.`}
				actions={
					<>
						<AlertActionButton
							variant="destructive"
							text="Clear"
							onPress={() => storage.set({ ignoredUsers: [] })}
						/>
						<AlertActionButton variant="secondary" text="Cancel" />
					</>
				}
			/>,
		)

	return (
		<ScrollView keyboardShouldPersistTaps="handled">
			<Page>
				<Stack spacing={24}>
					<TableRowGroup title="Display">
						<TableSwitchRow
							icon={<TableRowAssetIcon name="ClockIcon" />}
							label="Show the time of deletion"
							value={timestamps}
							onValueChange={timestamps => storage.set({ timestamps })}
						/>
						<TableSwitchRow
							icon={<TableRowAssetIcon name="ClockIcon" />}
							label="Use 12-hour time"
							value={twelveHour}
							onValueChange={twelveHour => storage.set({ twelveHour })}
						/>
					</TableRowGroup>
					<TableRowGroup title="Ignore">
						<TableSwitchRow
							icon={<TableRowAssetIcon name="RobotIcon" />}
							label="Bots"
							value={ignoreBots}
							onValueChange={ignoreBots => storage.set({ ignoreBots })}
						/>
					</TableRowGroup>
					<Stack>
						<TextInput
							label="Ignore user by ID"
							placeholder="User ID"
							value={input}
							onChange={setInput}
							status={error ? 'error' : 'default'}
							errorMessage={error || undefined}
						/>
						<Button
							variant="secondary"
							size="sm"
							icon={getAssetIdByName('PlusSmallIcon')}
							text="Add user"
							onPress={addUser}
						/>
					</Stack>
					{ignoredUsers.length > 0 && (
						<TableRowGroup title="Ignored users">
							{ignoredUsers.map(id => (
								<UserRow
									key={id}
									id={id}
									onRemove={() =>
										storage.set({
											ignoredUsers: ignoredUsers.filter(user => user !== id),
										})
									}
								/>
							))}
							<TableRow
								variant="danger"
								icon={<TableRowAssetIcon name="TrashIcon" variant="danger" />}
								label="Clear ignored users"
								onPress={clearUsers}
							/>
						</TableRowGroup>
					)}
				</Stack>
			</Page>
		</ScrollView>
	)
}
