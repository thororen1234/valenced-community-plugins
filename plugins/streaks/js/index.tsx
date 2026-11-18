import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withName, withProps } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { getErrorStack } from '@valenced/utils/error'
import { processColor } from 'react-native'
import { setHTTP } from './auth'
import { patchDMList } from './dms'
import { clearBadges, putAuthors, setBadges } from './native'
import SettingsComponent from './settings'
import {
	colorFor,
	currentUserId,
	DefaultSettings,
	dateInTimezone,
	didUserSendToday,
	fetchStreaks,
	getToken,
	localTimezone,
	refreshStreak,
	setStorage,
	streaks,
	updateStreak,
} from './store'
import type { DiscordModules } from '@valenced/discord/types'
import type { HTTP } from './auth'
import type { RemoteStreak, Settings } from './store'

interface RowManager {
	prototype: {
		generate(row: unknown): MessageRow
	}
}

interface MessageRow {
	type?: number
	message?: {
		id?: string
		channelId?: string
		authorId?: string
	}
}

interface Channel {
	isDM(): boolean
	recipients: string[]
}

interface Message {
	author?: { id: string; bot?: boolean }
	timestamp: string
	state?: string
}

const MessageRowType = 1
const MaxRegistered = 2000

type ChannelStore = DiscordModules.Flux.Store<{
	getChannel(id: string): Channel | undefined
	getDMFromUserId(userId: string): string | undefined
}>

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

		setStorage(jsonStorage)

		let http: HTTP | undefined
		const ChannelStore = Stores.ChannelStore as ChannelStore

		const pushBadges = () => {
			const badges: Record<string, [number, number]> = {}
			for (const [userId, streak] of Object.entries(streaks.getState()))
				if (streak.count >= 1)
					badges[userId] = [
						streak.count,
						processColor(colorFor(streak)) as number,
					]

			try {
				setBadges(badges)
			} catch (e) {
				plugin.reportError(`Failed to send streaks: ${getErrorStack(e)}`)
			}
		}

		const backfill = async () => {
			const me = currentUserId()
			if (!me || !http) return

			for (const [recipientId, streak] of Object.entries(streaks.getState())) {
				const channelId = ChannelStore.getDMFromUserId(recipientId)
				if (!channelId || !ChannelStore.getChannel(channelId)?.isDM()) continue

				const meIsA = streak.user_a_id === me
				const timezoneA =
					streak.timezone_a ||
					(meIsA ? localTimezone : streak.timezone_b) ||
					localTimezone
				const timezoneB =
					streak.timezone_b ||
					(!meIsA ? localTimezone : streak.timezone_a) ||
					localTimezone
				const needsA = streak.user_a_activity_date !== dateInTimezone(timezoneA)
				const needsB = streak.user_b_activity_date !== dateInTimezone(timezoneB)
				if (!needsA && !needsB) continue

				try {
					const { body } = await http.get<Message[]>({
						url: `/channels/${channelId}/messages`,
						query: { limit: '100' },
					})

					const sentToday = new Set<string>()
					for (const message of body ?? []) {
						const authorId = message.author?.id
						if (authorId !== streak.user_a_id && authorId !== streak.user_b_id)
							continue
						const timezone =
							authorId === streak.user_a_id ? timezoneA : timezoneB
						const sentAt = new Date(message.timestamp)
						if (Number.isNaN(sentAt.getTime())) continue
						if (dateInTimezone(timezone, sentAt) === dateInTimezone(timezone))
							sentToday.add(authorId)
					}

					const sendA = needsA && sentToday.has(streak.user_a_id)
					const sendB = needsB && sentToday.has(streak.user_b_id)
					if (sendA) await updateStreak(recipientId, streak.user_a_id)
					if (sendB) await updateStreak(recipientId, streak.user_b_id)
					if (sendA || sendB) await refreshStreak(recipientId)
				} catch (e) {
					plugin.reportError(
						`Failed to sync recent streak messages: ${getErrorStack(e)}`,
					)
				}
			}
		}

		const load = () => {
			if (!getToken()) return
			fetchStreaks()
				.then(backfill)
				.catch(e =>
					plugin.reportError(`Failed to fetch streaks: ${getErrorStack(e)}`),
				)
		}

		const onConnectionOpen = () => {
			streaks.setState({}, true)
			load()
		}

		const onMessageCreate = ({
			optimistic,
			message,
			channelId,
		}: {
			optimistic?: boolean
			message: Message
			channelId: string
		}) => {
			if (optimistic || message.state === 'SENDING' || message.author?.bot)
				return
			if (!getToken()) return

			const channel = ChannelStore.getChannel(channelId)
			if (!channel?.isDM()) return

			const recipientId = channel.recipients[0]
			const authorId = message.author?.id
			if (!recipientId || !authorId) return

			const me = currentUserId()
			const cached: RemoteStreak | undefined = streaks.getState()[recipientId]
			const meIsA = cached?.user_a_id === me
			const myFlag = cached && didUserSendToday(cached, meIsA)
			const theirFlag = cached && didUserSendToday(cached, !meIsA)
			const cachedTimezone =
				cached && (meIsA ? cached.timezone_a : cached.timezone_b)
			const timezoneReported =
				cached && (meIsA ? cached.timezone_a_known : cached.timezone_b_known)
			const needsTimezone =
				!timezoneReported || !cachedTimezone || cachedTimezone !== localTimezone

			if (
				(authorId === me && (!myFlag || needsTimezone)) ||
				(authorId === recipientId && (!theirFlag || needsTimezone))
			)
				updateStreak(recipientId, authorId).catch(e =>
					plugin.reportError(`Failed to update streak: ${getErrorStack(e)}`),
				)
		}

		Dispatcher.subscribe('CONNECTION_OPEN', onConnectionOpen)
		Dispatcher.subscribe('MESSAGE_CREATE', onMessageCreate as never)

		const registered = new Map<
			string,
			{ key: string; self: boolean; dm: boolean }
		>()
		const authorFor = ({
			key,
			self,
			dm,
		}: {
			key: string
			self: boolean
			dm: boolean
		}) => {
			const settings = { ...DefaultSettings, ...jsonStorage.cache }
			if (self && !settings.showOnSelf) return ''
			if (!dm && !settings.showOutsideDMs) return ''
			return key
		}

		let shown = ''
		const onSettings = () => {
			pushBadges()
			const settings = { ...DefaultSettings, ...jsonStorage.cache }
			const next = `${settings.showOnSelf}:${settings.showOutsideDMs}`
			if (next === shown) return
			shown = next
			const authors: Record<string, string> = {}
			for (const [id, entry] of registered) authors[id] = authorFor(entry)
			if (registered.size) putAuthors(authors)
		}

		cleanup(
			() => {
				Dispatcher.unsubscribe('CONNECTION_OPEN', onConnectionOpen)
				Dispatcher.unsubscribe('MESSAGE_CREATE', onMessageCreate as never)
				setStorage(undefined)
				setHTTP(undefined)
				streaks.setState({}, true)
				clearBadges()
			},
			streaks.subscribe(pushBadges),
			jsonStorage.subscribe(onSettings),
			getModules(withProps<{ HTTP: HTTP }>('HTTP'), exports => {
				http = exports.HTTP
				setHTTP(exports.HTTP)
				load()
			}),
			// modules/messages/native/renderer/RowGenerator.tsx
			getModules(withName<RowManager>('RowManager'), ({ prototype }) => {
				cleanup(
					after(prototype, 'generate', row => {
						const message = row?.type === MessageRowType ? row.message : null
						if (!message?.id || !message.authorId || registered.has(message.id))
							return row

						const channel = message.channelId
							? ChannelStore.getChannel(message.channelId)
							: undefined
						const dm = !!channel?.isDM()
						const self = message.authorId === currentUserId()
						const key = self
							? dm
								? channel?.recipients[0]
								: undefined
							: message.authorId
						if (!key || !(key in streaks.getState())) return row

						if (registered.size >= MaxRegistered) registered.clear()
						const entry = { key, self, dm }
						registered.set(message.id, entry)
						const author = authorFor(entry)
						if (!author) return row

						try {
							putAuthors({ [message.id]: author })
						} catch (e) {
							plugin.reportError(
								`Failed to send message author: ${getErrorStack(e)}`,
							)
						}

						return row
					}),
				)
			}),
			patchDMList(cleanup),
		)
	},
	stop({ plugin }) {
		plugin.requireReload()
	},
	SettingsComponent,
})
