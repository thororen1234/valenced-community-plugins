import Page from '@valenced/components/Page'
import TableRowAssetIcon from '@valenced/components/TableRowAssetIcon'
import { Design } from '@valenced/discord/design'
import { useEffect } from 'react'
import { DefaultSettings, listeners } from './shared'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings } from './shared'

const { TableRowGroup, TableSwitchRow } = Design

type Props = ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>

interface SettingItem {
	key: keyof Settings
	icon: string
	label: string
	subLabel: string
}

const SETTING_ITEMS: SettingItem[] = [
	{
		key: 'showSettingsButton',
		icon: 'SettingsIcon',
		label: 'Settings',
		subLabel: 'Show the Settings button in the YouBar.',
	},
	{
		key: 'showDMButton',
		icon: 'ChatIcon',
		label: 'Direct Messages',
		subLabel: 'Show the Direct Messages button in the YouBar.',
	},
	{
		key: 'showFavoritesButton',
		icon: 'StarIcon',
		label: 'Favorites',
		subLabel: 'Show the Favorites button in the YouBar.',
	},
]

export default function SettingsComponent({
	api: { jsonStorage: storage },
}: Props) {
	const settings = { ...DefaultSettings, ...storage.use() }

	useEffect(() => {
		return () => {
			for (const rerender of listeners) rerender()
		}
	}, [])

	return (
		<Page>
			<TableRowGroup title="Buttons">
				{SETTING_ITEMS.map(({ key, icon, label, subLabel }) => (
					<TableSwitchRow
						key={key}
						icon={<TableRowAssetIcon name={icon} />}
						label={label}
						subLabel={subLabel}
						value={settings[key]}
						onValueChange={value => {
							storage.set({ [key]: value })
						}}
					/>
				))}
			</TableRowGroup>
		</Page>
	)
}
