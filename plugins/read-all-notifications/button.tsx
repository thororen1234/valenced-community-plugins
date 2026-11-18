import { getAssetIdByName } from '@valenced/assets'
import { Design } from '@valenced/discord/design'
import { StyleSheet, View } from 'react-native'
import { markAllAsRead } from './unread'
import type { ComponentType } from 'react'

const { IconButton } = Design

const EntryComponentName = 'GuildsBarAnimatedItemWrapper'
const DirectMessagesLabel = 'Direct Messages'

type EntryProps = Record<string, unknown>
type EntryComponent = ComponentType<EntryProps>

interface ComponentLike {
	displayName?: unknown
	name?: unknown
	type?: unknown
	render?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function isComponent(value: unknown): value is EntryComponent {
	return typeof value === 'function' || isRecord(value)
}

function getComponentName(type: unknown): string | undefined {
	if (!isComponent(type)) return undefined

	const { displayName, name, type: inner, render } = type as ComponentLike
	if (typeof displayName === 'string' && displayName) return displayName
	if (typeof name === 'string' && name) return name

	return getComponentName(inner) ?? getComponentName(render)
}

function ReadAllButton() {
	return (
		<View style={styles.container}>
			<IconButton
				accessibilityLabel="Mark all as read"
				variant="secondary"
				size="md"
				icon={getAssetIdByName('ChatCheckIcon')}
				onPress={markAllAsRead}
			/>
		</View>
	)
}

export function createDirectMessagesEntryPatcher() {
	const wrappers = new WeakMap<object, EntryComponent>()
	const wrapperTypes = new WeakSet<object>()
	let renderingWrapper = false

	function wrap(Original: EntryComponent): EntryComponent {
		const existing = wrappers.get(Original)
		if (existing) return existing

		function ReadAllDmWrapper(props: EntryProps) {
			renderingWrapper = true
			try {
				return (
					<>
						<Original {...props} />
						<ReadAllButton />
					</>
				)
			} finally {
				renderingWrapper = false
			}
		}

		wrappers.set(Original, ReadAllDmWrapper)
		wrapperTypes.add(ReadAllDmWrapper)
		return ReadAllDmWrapper
	}

	function isDirectMessagesEntry(
		type: unknown,
		props: unknown,
	): type is EntryComponent {
		return (
			!renderingWrapper &&
			isComponent(type) &&
			!wrapperTypes.has(type) &&
			isRecord(props) &&
			props.label === DirectMessagesLabel &&
			getComponentName(type) === EntryComponentName
		)
	}

	return function patchEntry<Args extends [unknown, unknown?, ...unknown[]]>(
		args: Args,
	): Args {
		const [type, props] = args
		if (isDirectMessagesEntry(type, props)) args[0] = wrap(type)
		return args
	}
}

const styles = StyleSheet.create({
	container: {
		alignItems: 'center',
		marginBottom: 2,
		marginTop: 6,
	},
})
