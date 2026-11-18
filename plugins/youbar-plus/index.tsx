import { getAssetIdByName } from '@valenced/assets'
import { Design } from '@valenced/discord/design'
import { RootNavigationRef } from '@valenced/discord/modules/main_tabs_v2'
import { getModules, lookupModule } from '@valenced/modules/finders'
import {
	createFilterGenerator,
	FilterScopes,
	withProps,
} from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { useReRender } from '@valenced/utils/react'
import { useEffect } from 'react'
import SettingsComponent from './settings'
import { DefaultSettings, listeners } from './shared'
import type { JsonStorage } from '@valenced/json-storage'
import type { Filter, FilterGenerator } from '@valenced/modules/finders/filters'
import type {
	ComponentProps,
	ComponentType,
	FC,
	MemoExoticComponent,
	ReactElement,
	ReactNode,
} from 'react'
import type { Settings } from './shared'

const { IconButton } = Design

let storage: JsonStorage<Settings>
let buttons: ButtonConfig[]

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: DefaultSettings,
	},
	start({ cleanup, jsonStorage, plugin }) {
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}

		storage = jsonStorage

		buttons = [
			{
				key: 'showSettingsButton',
				icon: getAssetIdByName('SettingsIcon'),
				label: 'User Settings',
				onPress() {
					RootNavigationRef.getRootNavigationRef()?.navigate('settings')
				},
			},
			{
				key: 'showFavoritesButton',
				icon: getAssetIdByName('StarIcon'),
				label: 'Favorites',
				onPress() {
					transitionToGuild('@favorites')
				},
			},
			{
				key: 'showDMButton',
				icon: getAssetIdByName('ChatIcon'),
				label: 'Direct Messages',
				onPress() {
					transitionToGuild('@me')
				},
			},
		]

		cleanup(
			() => listeners.clear(),
			getModules(
				withMemoizedComponentName('YouBarNotificationsButton'),
				YouBarNotificationsButton => {
					if (!YouBarNotificationsButton?.type) return

					cleanup(
						instead(YouBarNotificationsButton, 'type', renderYouBarButton),
					)
				},
			),
		)
	},
	stop({ plugin }) {
		plugin.requireReload()
	},
	SettingsComponent,
})

function renderYouBarButton(args: Parameters<FC>, orig: FC) {
	const rerender = useReRender()

	useEffect(() => {
		listeners.add(rerender)
		return () => {
			listeners.delete(rerender)
		}
	}, [rerender])

	const settings = {
		...DefaultSettings,
		...storage.cache,
	}

	const res = orig(...args) as YouBarButtonElement
	if (!res?.props?.children) return res

	const Container = res.type
	const originalProps = res.props.children.props

	return (
		<>
			{buttons.map(
				button =>
					settings[button.key] &&
					button.icon != null && (
						<Container key={`youbar-${button.key}`}>
							<IconButton
								accessibilityLabel={button.label}
								variant={originalProps.variant ?? 'tertiary'}
								size={originalProps.size ?? 'sm'}
								icon={button.icon}
								onPress={button.onPress}
							/>
						</Container>
					),
			)}
			{res}
		</>
	)
}

function transitionToGuild(guildId: string) {
	lookupModule(
		withProps<TransitionModule>('transitionToGuild'),
	)[0]?.transitionToGuild(guildId)
}

type WithMemoizedComponentName = FilterGenerator<
	<P = object>(
		name: string,
	) => Filter<{
		Result: MemoExoticComponent<FC<P>>
		Scopes: [typeof FilterScopes.Initialized]
	}>
>

const withMemoizedComponentName = createFilterGenerator(
	([name], _, exports) => exports?.type?.name === name,
	([name]) => `memoizedComponentName(${name})`,
	FilterScopes.Initialized,
) as WithMemoizedComponentName

type IconButtonProps = ComponentProps<typeof IconButton>

type YouBarButtonElement = ReactElement<
	{
		children?: ReactElement<IconButtonProps>
	},
	ComponentType<{ children?: ReactNode }>
>

interface TransitionModule {
	transitionToGuild(guildId: string, channelId?: string): void
}

interface ButtonConfig {
	key: keyof Settings
	icon?: number
	label: string
	onPress(): void
}
