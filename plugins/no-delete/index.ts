import { onFluxEventDispatched, Stores } from '@valenced/discord/flux'
import SettingsComponent from './settings'
import type { DiscordModules } from '@valenced/discord/types'

export interface Settings {
	timestamps: boolean
	twelveHour: boolean
	ignoreBots: boolean
	ignoredUsers: string[]
}

export const DefaultSettings: Settings = {
	timestamps: false,
	twelveHour: false,
	ignoreBots: false,
	ignoredUsers: [],
}

interface DeletePayload {
	id: string
	channelId: string
}

interface MessageRecord {
	state: string
	flags: number
	author: { id: string; bot?: boolean }
}

const EphemeralFlag = 1 << 6

// AbortCodes.AUTOMOD_MESSAGE_BLOCKED, shows the error body's message as the notice
const AutomodMessageBlocked = 200000

// MessageDataType.SEND, so dismissing the notice deletes the message locally
const MessageDataSend = 0

const MessageStore = () =>
	Stores.MessageStore as DiscordModules.Flux.Store<{
		getMessage(channelId: string, messageId: string): MessageRecord | undefined
	}>

const pad = (n: number, length = 2) => String(n).padStart(length, '0')

function formatTime(date: Date, twelveHour: boolean) {
	const hours = date.getHours()
	const time = `${pad(twelveHour ? hours % 12 || 12 : hours)}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(Math.floor(date.getMilliseconds() / 10))}`
	return twelveHour ? `${time} ${hours < 12 ? 'am' : 'pm'}` : time
}

// Messages already kept, whose next delete (dismissing the notice, or the gateway confirming your own delete) goes through
const kept = new Set<string>()

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DefaultSettings },
	start({ cleanup, jsonStorage: storage }) {
		const settings = (): Settings => ({
			...DefaultSettings,
			...(storage.cache as Partial<Settings> | undefined),
		})

		cleanup(
			onFluxEventDispatched<DeletePayload>('MESSAGE_DELETE', payload => {
				const { id, channelId } = payload
				if (kept.delete(id)) return payload

				const record = MessageStore().getMessage(channelId, id)
				// Unsent and ephemeral messages are dismissed, not deleted
				if (record?.state !== 'SENT' || record.flags & EphemeralFlag)
					return payload

				const { timestamps, twelveHour, ignoreBots, ignoredUsers } = settings()
				if (
					ignoredUsers.includes(record.author.id) ||
					(ignoreBots && record.author.bot)
				)
					return payload

				kept.add(id)

				let message = 'This message was deleted'
				if (timestamps) message += ` (${formatTime(new Date(), twelveHour)})`

				// Shown as an automod notice under the message, which stays in the store
				return {
					type: 'MESSAGE_EDIT_FAILED_AUTOMOD',
					messageData: {
						type: MessageDataSend,
						message: { channelId, nonce: id },
					},
					errorResponseBody: { code: AutomodMessageBlocked, message },
				} as unknown as typeof payload
			}),
			() => kept.clear(),
		)
	},
	SettingsComponent,
})
