import { getAssetIdByName } from '@valenced/assets'
import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { createFilterGenerator } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { cloneElement, isValidElement } from 'react'
import { Image, View } from 'react-native'
import { useStore } from 'zustand/react'
import { colorFor, storage, streaks } from './store'
import type {
	Filter,
	FilterGenerator,
	FilterScopes,
} from '@valenced/modules/finders/filters'
import type { FC, MemoExoticComponent, ReactElement, ReactNode } from 'react'

interface ContentProps {
	channel: { isDM(): boolean; recipients?: string[] }
}

type WithMemoizedName = FilterGenerator<
	<P = object>(
		name: string,
	) => Filter<{
		Result: MemoExoticComponent<FC<P>> & { type: FC<P> }
		Scopes: [typeof FilterScopes.Initialized]
	}>
>

const withMemoizedName = createFilterGenerator(
	([name], _, exports) => exports?.type?.name === name,
	([name]) => `memoizedName(${name})`,
) as WithMemoizedName

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
	if (!Array.isArray(children)) {
		const child = insertBadge(children, badge)
		return child === children ? tree : cloneElement(tree, undefined, child)
	}

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
		withMemoizedName<ContentProps>('MessagesItemChannelContent'),
		Content => {
			cleanup(
				instead(Content, 'type', function (args, orig) {
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
	)
}
