import { getAssetIdByName } from '@valenced/assets'
import Page from '@valenced/components/Page'
import { ToastActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import { Linking, ScrollView } from 'react-native'
import {
	DefaultAppName,
	DefaultInterval,
	intervalFor,
	LibreFmMinInterval,
	MinInterval,
	withDefaults,
} from '.'
import { ServiceInfo, Services, testCredentials } from './services'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings } from '.'
import type { Service } from './services'

const {
	Button,
	IconButton,
	Stack,
	TableRadioGroup,
	TableRadioRow,
	TableRow,
	TableRowGroup,
	TableSwitchRow,
	TextInput,
} = Design

const TrashIcon = getAssetIdByName('TrashIcon')!

type Props = ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>

export default function SettingsComponent({
	api: { jsonStorage: storage },
}: Props) {
	const settings = withDefaults(storage.use())
	const { service, credentials, ignoredApps } = settings
	const info = ServiceInfo[service]
	const [testing, setTesting] = useState(false)
	const [intervalError, setIntervalError] = useState('')
	const [newApp, setNewApp] = useState('')

	const minInterval = service === 'librefm' ? LibreFmMinInterval : MinInterval

	const test = () => {
		setTesting(true)
		testCredentials(service, credentials[service])
			.then(
				() =>
					ToastActionCreators.open('MULTI_SCROBBLER_TEST', {
						text: `Connected to ${info.name}`,
						variant: 'success',
					}),
				error =>
					ToastActionCreators.open('MULTI_SCROBBLER_TEST', {
						text: `Could not connect to ${info.name}: ${error instanceof Error ? error.message : error}`,
						variant: 'critical',
					}),
			)
			.finally(() => setTesting(false))
	}

	const addApp = () => {
		const app = newApp.trim()
		if (!app || ignoredApps.includes(app)) return
		storage.set({ ignoredApps: [...ignoredApps, app] })
		setNewApp('')
	}

	const removeApp = (app: string) =>
		storage.set({ ignoredApps: ignoredApps.filter(other => other !== app) })

	return (
		<ScrollView keyboardShouldPersistTaps="handled">
			<Page>
				<TableRadioGroup
					title="Service"
					defaultValue={service}
					onChange={(service: Service) => storage.set({ service })}
				>
					{Services.map(service => (
						<TableRadioRow
							key={service}
							value={service}
							label={ServiceInfo[service].name}
						/>
					))}
				</TableRadioGroup>
				<Stack key={service}>
					<TextInput
						label={`${info.name} username`}
						defaultValue={credentials[service].username}
						onChange={username =>
							storage.set({ credentials: { [service]: { username } } })
						}
					/>
					<TextInput
						label={info.keyLabel}
						defaultValue={credentials[service].key}
						secureTextEntry
						onChange={key =>
							storage.set({ credentials: { [service]: { key } } })
						}
					/>
				</Stack>
				<TableRowGroup>
					<TableRow
						label="Test connection"
						subLabel={`Checks your ${info.name} username and ${info.keyLabel.toLowerCase()}.`}
						disabled={testing}
						onPress={test}
						arrow
					/>
					<TableRow
						label={`Get ${info.keyLabel.replace(' (optional)', '').toLowerCase()}`}
						subLabel={info.keyUrl}
						onPress={() => Linking.openURL(info.keyUrl)}
						arrow
					/>
				</TableRowGroup>
				<Stack>
					<TextInput
						label="Activity name"
						placeholder={DefaultAppName}
						defaultValue={settings.appName}
						description="Use {{artist}}, {{name}}, {{album}} or {{service}} to fill in the track."
						onChange={appName => storage.set({ appName })}
					/>
					<TextInput
						key={service}
						label="Check every (seconds)"
						placeholder={String(DefaultInterval)}
						defaultValue={String(intervalFor(settings))}
						status={intervalError ? 'error' : 'default'}
						errorMessage={intervalError || undefined}
						description={
							service === 'librefm'
								? `Libre.fm asks for at least ${LibreFmMinInterval} seconds.`
								: undefined
						}
						onChange={value => {
							const interval = Number(value)
							if (!Number.isInteger(interval) || interval < minInterval) {
								setIntervalError(
									`Must be a whole number of at least ${minInterval}`,
								)
								return
							}

							setIntervalError('')
							storage.set({ interval })
						}}
					/>
				</Stack>
				<TableRowGroup title="Activity">
					<TableSwitchRow
						label="Show as listening"
						subLabel="Shows “Listening to” instead of “Playing”."
						value={settings.listening}
						onValueChange={listening => storage.set({ listening })}
					/>
					<TableSwitchRow
						label="Show elapsed time"
						value={settings.showTimestamp}
						onValueChange={showTimestamp => storage.set({ showTimestamp })}
					/>
					<TableSwitchRow
						label="Show album in tooltip"
						value={settings.showAlbum}
						onValueChange={showAlbum => storage.set({ showAlbum })}
					/>
					<TableSwitchRow
						label="Show duration in tooltip"
						value={settings.showDuration}
						onValueChange={showDuration => storage.set({ showDuration })}
					/>
				</TableRowGroup>
				<Stack>
					<TextInput
						label="Ignored apps"
						description="Your music status is hidden while an activity with one of these names is shown."
						placeholder="Spotify"
						value={newApp}
						onChange={setNewApp}
						returnKeyType="done"
					/>
					<Button
						variant="secondary"
						size="sm"
						text="Add"
						disabled={!newApp.trim()}
						onPress={addApp}
					/>
				</Stack>
				{ignoredApps.length > 0 && (
					<TableRowGroup>
						{ignoredApps.map(app => (
							<TableRow
								key={app}
								label={app}
								trailing={
									<IconButton
										icon={TrashIcon}
										onPress={() => removeApp(app)}
										size="sm"
										variant="destructive"
									/>
								}
							/>
						))}
					</TableRowGroup>
				)}
			</Page>
		</ScrollView>
	)
}
