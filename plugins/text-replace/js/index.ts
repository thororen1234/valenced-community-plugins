import { ToastActionCreators } from '@valenced/discord/actions'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { before } from '@valenced/patcher'
import { patchMessageActionSheet } from './actionsheet'
import SettingsComponent from './settings'
import type { JsonStorage } from '@valenced/json-storage'

export interface Rule {
	name: string
	match: string
	flags: string
	replace: string
	regex: boolean
}

export interface Settings {
	rules: Rule[]
}

export let storage: JsonStorage<Settings>

export function setRules(rules: Rule[]) {
	return storage.set({ rules }, true)
}

export function isRule(value: any): value is Rule {
	return (
		value &&
		typeof value.name === 'string' &&
		typeof value.match === 'string' &&
		typeof value.replace === 'string'
	)
}

function applyRules(content: string, rules: Rule[]) {
	for (const rule of rules) {
		if (!rule.match) continue

		if (!rule.regex) {
			content = content.replaceAll(rule.match, rule.replace)
			continue
		}

		try {
			content = content.replace(
				new RegExp(rule.match, rule.flags),
				rule.replace,
			)
		} catch {
			ToastActionCreators.open('TEXT_REPLACE_INVALID_REGEX', {
				text: `Invalid regex in rule ${rule.name}`,
				variant: 'critical',
			})
		}
	}

	return content
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: { rules: [] },
	},
	start({ cleanup, jsonStorage, plugin }) {
		storage = jsonStorage

		cleanup(
			getModules(
				withProps<{
					sendMessage: (channelId: string, data: { content: string }) => any
					receiveMessage: unknown
				}>('sendMessage', 'receiveMessage'),
				MessageActionCreators => {
					cleanup(
						before(MessageActionCreators, 'sendMessage', args => {
							const rules = storage.cache?.rules
							if (rules?.length && typeof args[1]?.content === 'string')
								args[1].content = applyRules(args[1].content, rules)
							return args
						}),
					)
				},
			),
			patchMessageActionSheet(e => plugin.reportError(e)),
		)
	},
	SettingsComponent,
})
