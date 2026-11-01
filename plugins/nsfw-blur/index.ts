import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { before } from '@valenced/patcher'
import type { DiscordModules } from '@valenced/discord/types'

interface MessageContent {
	message?: {
		channel_id?: string
		attachments?: { spoiler?: boolean }[]
	}
	options?: {
		inlineEmbedMedia?: boolean
		shouldObscureSpoiler?: boolean
	}
}

type CreateMessageContent = (
	content: MessageContent,
	...rest: unknown[]
) => unknown

export default plugin({
	start({ cleanup }) {
		const ChannelStore = Stores.ChannelStore as DiscordModules.Flux.Store<{
			getChannel(id: string): { isNSFW(): boolean } | undefined
		}>

		cleanup(
			getModules(
				withName<CreateMessageContent>('createMessageContent'),
				module => {
					if (!('default' in module) || typeof module.default !== 'function')
						return

					cleanup(
						before(
							module as { default: CreateMessageContent },
							'default',
							args => {
								const { message, options } = args[0] ?? {}
								if (!message?.channel_id || !options) return args
								if (!ChannelStore.getChannel(message.channel_id)?.isNSFW())
									return args

								options.inlineEmbedMedia = false
								options.shouldObscureSpoiler = true
								for (const attachment of message.attachments ?? [])
									attachment.spoiler = true

								return args
							},
						),
					)
				},
			),
		)
	},
})
