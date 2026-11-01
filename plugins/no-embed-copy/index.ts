import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after, instead } from '@valenced/patcher'
import { noop } from '@valenced/utils/callback'

interface MessagesHandlers {
	handleCopyText?(...args: unknown[]): unknown
}

export default plugin({
	start({ cleanup }) {
		cleanup(
			getModules(
				withProps<{
					MessagesHandlers: new (...args: never[]) => MessagesHandlers
				}>('MessagesHandlers'),
				module => {
					cleanup(
						after(module, 'MessagesHandlers', handlers => {
							if (typeof handlers?.handleCopyText === 'function')
								instead(
									handlers as Required<MessagesHandlers>,
									'handleCopyText',
									noop,
								)
							return handlers
						}),
					)
				},
				{ max: 1 },
			),
		)
	},
})
