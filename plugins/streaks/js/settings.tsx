import Page from '@valenced/components/Page'
import { ToastActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import { ScrollView } from 'react-native'
import { authorize } from './auth'
import {
	currentUserId,
	DefaultSettings,
	fetchStreaks,
	setToken,
	streaks,
	Tiers,
} from './store'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings } from './store'

const { Stack, TableRow, TableRowGroup, TableSwitchRow, TextInput } = Design

type Props = ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>

export default function SettingsComponent({
	api: { jsonStorage: storage },
}: Props) {
	const settings = storage.use()
	const colors = { ...DefaultSettings.colors, ...settings?.colors }
	const { showOnSelf, showOutsideDMs } = { ...DefaultSettings, ...settings }
	const id = currentUserId()
	const loggedIn = !!(id && settings?.tokens?.[id])
	const [busy, setBusy] = useState(false)

	const login = () => {
		setBusy(true)
		authorize()
			.then(fetchStreaks)
			.catch(error =>
				ToastActionCreators.open('STREAKS_LOGIN', {
					text: `Could not log in: ${error instanceof Error ? error.message : error}`,
					variant: 'critical',
				}),
			)
			.finally(() => setBusy(false))
	}

	const logout = () => {
		setToken(undefined)
		streaks.setState({}, true)
	}

	return (
		<ScrollView keyboardShouldPersistTaps="handled">
			<Page>
				<TableRowGroup>
					<TableRow
						label={
							loggedIn ? 'Log out of Streaks API' : 'Log in to Streaks API'
						}
						disabled={busy}
						onPress={loggedIn ? logout : login}
						arrow
					/>
				</TableRowGroup>
				<TableRowGroup>
					<TableSwitchRow
						label="Show on your own messages"
						value={showOnSelf}
						onValueChange={showOnSelf => storage.set({ showOnSelf })}
					/>
					<TableSwitchRow
						label="Show outside DMs"
						value={showOutsideDMs}
						onValueChange={showOutsideDMs => storage.set({ showOutsideDMs })}
					/>
				</TableRowGroup>
				<Stack>
					{Tiers.map(([key, min, name]) => (
						<TextInput
							key={key}
							label={`${name} (${min}+ days)`}
							defaultValue={colors[key]}
							placeholder={DefaultSettings.colors[key]}
							onChange={value =>
								storage.set({
									colors: {
										[key]: value.trim() || DefaultSettings.colors[key],
									},
								})
							}
						/>
					))}
				</Stack>
			</Page>
		</ScrollView>
	)
}
