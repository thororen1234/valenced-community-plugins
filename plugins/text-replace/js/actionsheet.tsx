import {
	ActionSheetActionCreators,
	ToastActionCreators,
} from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { isRule, setRules, storage } from '.'
import type { FC, ReactElement, ReactNode } from 'react'
import type { Rule } from '.'

const { ActionSheet, ActionSheetRow } = Design

type LongPressMessageActionSheet = FC<{ message: { content?: string } }>

type Element = ReactElement<{ children?: ReactNode }>

const JSON_CODEBLOCK_PATTERN = /^```(?:json)\n([\s\S]*?)```$/gm

export function patchMessageActionSheet(onError: (e: unknown) => void) {
	let unpatch: (() => void) | undefined

	const unsubscribe = getModules(
		withName<LongPressMessageActionSheet>('LongPressMessageActionSheet'),
		mod => {
			const module = mod as { default: LongPressMessageActionSheet }
			unpatch = instead(module, 'default', (args, Sheet) => {
				const tree = Reflect.apply(Sheet, undefined, args) as Element

				try {
					const rules = parseRules(args[0]?.message?.content)
					if (rules.length) addToActionSheet(tree, <ImportRows rules={rules} />)
				} catch (e) {
					onError(e)
				}

				return tree
			})
		},
		{ returnNamespace: true },
	)

	return () => {
		unsubscribe()
		unpatch?.()
	}
}

function parseRules(content: string | undefined) {
	if (!content) return []

	return [...content.matchAll(JSON_CODEBLOCK_PATTERN)]
		.map(m => {
			try {
				return JSON.parse(m[1]!)
			} catch {
				return null
			}
		})
		.filter(isRule)
}

function addToActionSheet(tree: unknown, group: ReactNode) {
	const sheet = findActionSheet(tree)
	if (!sheet) return

	sheet.props.children = [group, ...[sheet.props.children].flat()]
}

function findActionSheet(element: unknown): Element | undefined {
	if (!element || typeof element !== 'object') return
	if (Array.isArray(element)) {
		for (const child of element) {
			const found = findActionSheet(child)
			if (found) return found
		}
		return
	}

	const { type, props } = element as Element
	if (type === ActionSheet) return element as Element
	return findActionSheet(props?.children)
}

function ImportRows({ rules }: { rules: Rule[] }) {
	const DownloadIcon = lookupGeneratedIconComponent('DownloadIcon')

	return (
		<ActionSheetRow.Group>
			{rules.map((rule, i) => (
				<ActionSheetRow
					key={i}
					label={`Import Rule: ${rule.name}`}
					icon={<ActionSheetRow.Icon IconComponent={DownloadIcon} />}
					onPress={() => {
						ActionSheetActionCreators.hideActionSheet()
						setRules([
							...(storage.cache?.rules ?? []),
							{
								name: rule.name,
								match: rule.match,
								replace: rule.replace,
								flags: typeof rule.flags === 'string' ? rule.flags : '',
								regex: Boolean(rule.regex),
							},
						])
						ToastActionCreators.open('TEXT_REPLACE_IMPORTED', {
							text: `Imported ${rule.name}`,
							icon: DownloadIcon,
						})
					}}
				/>
			))}
		</ActionSheetRow.Group>
	)
}
