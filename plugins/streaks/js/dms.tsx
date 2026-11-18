import { getAssetIdByName } from '@valenced/assets'
import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { cloneElement, isValidElement } from 'react'
import { Image, View } from 'react-native'
import { useStore } from 'zustand/react'
import { colorFor, storage, streaks } from './store'
import type { FC, ReactElement, ReactNode } from 'react'

interface ContentProps {
	channel: { isDM(): boolean; recipients?: string[] }
}

const FireIcon = getAssetIdByName('FireIcon')

function StreakBadge({ userId }: { userId: string }) {
	const streak = useStore(streaks, state => state[userId])
	storage?.use(x => 'colors' in x)

	if (!streak || streak.count < 1) return null
	const color = colorFor(streak)

	return (
		<View
			style={{
				flexDirection: 'row',
				alignItems: 'center',
				gap: 2,
				marginLeft: 4,
			}}
		>
			{FireIcon != null && (
				<Image
					source={FireIcon}
					style={{ width: 16, height: 16, tintColor: color }}
				/>
			)}
			<Design.Text variant={'body-xs/semibold' as never} style={{ color }}>
				{streak.count}
			</Design.Text>
		</View>
	)
}

function insertBadge(tree: ReactNode, badge: ReactElement): ReactNode {
	if (!isValidElement<{ children?: ReactNode }>(tree)) return tree

	const { children } = tree.props
	if (!Array.isArray(children)) return tree

	if (
		children.some(
			child => isValidElement<object>(child) && 'userName' in child.props,
		)
	)
		return cloneElement(tree, undefined, ...children, badge)

	let changed = false
	const next = children.map(child => {
		const result = insertBadge(child, badge)
		if (result !== child) changed = true
		return result
	})

	return changed ? cloneElement(tree, undefined, ...next) : tree
}

export function patchDMList(cleanup: (...fns: (() => unknown)[]) => void) {
	return getModules(
		withName<FC<ContentProps>>('MessagesItemChannelContent'),
		mod => {
			const module = mod as { default: FC<ContentProps> }
			cleanup(
				instead(module, 'default', function (args, orig) {
					const tree = Reflect.apply(orig, this, args) as ReactNode
					const { channel } = args[0]
					const userId = channel?.isDM() ? channel.recipients?.[0] : undefined
					if (!userId) return tree

					return insertBadge(
						tree,
						<StreakBadge key="streaks" userId={userId} />,
					)
				}),
			)
		},
		{ returnNamespace: true },
	)
}
