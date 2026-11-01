/// <reference types="@valenced/types/plugins/settings.plugins" />
import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { instead } from '@valenced/patcher'
import { DefaultSettings, setStorage } from './api'
import { findModules } from './modules'
import ProfileSongs from './ProfileSongs'
import SettingsComponent from './settings'
import { setOpenSettings } from './songs'
import type { FC } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import type { Settings } from './api'

type AboutMeCard = FC<{ userId: string; style?: StyleProp<ViewStyle> }>

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DefaultSettings },
	start({ cleanup, jsonStorage, plugin, pluginSettings }) {
		setStorage(jsonStorage)
		setOpenSettings(() => pluginSettings.openPluginSettings(plugin.manifest.id))

		cleanup(
			...findModules(),
			getModuleWithImportedPath<{ default: AboutMeCard }>(
				'modules/user_profile/native/UserProfileAboutMeCard.tsx',
				module => {
					cleanup(
						instead(module, 'default', function (args, original) {
							const ret = Reflect.apply(original, this, args)
							const { userId, style } = args[0]
							return (
								<>
									<ProfileSongs userId={userId} style={style} />
									{ret}
								</>
							)
						}),
					)
				},
			),
		)
	},
	SettingsComponent,
})
