import { ToastActionCreators } from '@valenced/discord/actions'
import { Stores } from '@valenced/discord/flux'
import { createStore } from 'zustand/vanilla'
import { reauthorize } from './auth'
import type { DiscordModules } from '@valenced/discord/types'
import type { JsonStorage } from '@valenced/json-storage'

export const API_URL = 'https://streaks.equicord.org/api'
export const AUTHORIZE_URL = `${API_URL}/authorize`
export const CLIENT_ID = '1243063117852835941'

export interface Colors {
	elite: string
	diamond: string
	platinum: string
	gold: string
	silver: string
	bronze: string
	default: string
}

export interface Settings {
	tokens: Record<string, string>
	colors: Colors
}

export const DefaultSettings: Settings = {
	tokens: {},
	colors: {
		elite: '#9b39fe',
		diamond: '#f7409c',
		platinum: '#856bfe',
		gold: '#f75340',
		silver: '#f57b0b',
		bronze: '#b08d57',
		default: '#f59e0b',
	},
}

export const Tiers: [keyof Colors, number, string][] = [
	['elite', 100, 'Elite'],
	['diamond', 60, 'Diamond'],
	['platinum', 45, 'Platinum'],
	['gold', 30, 'Gold'],
	['silver', 14, 'Silver'],
	['bronze', 7, 'Bronze'],
	['default', 1, 'Default'],
]

export interface RemoteStreak {
	id: string
	user_a_id: string
	user_b_id: string
	count: number
	last_streak_date: string | null
	user_a_today: boolean
	user_b_today: boolean
	today_date: string | null
	timezone_a?: string
	timezone_b?: string
	timezone_a_known?: boolean
	timezone_b_known?: boolean
	user_a_activity_date?: string | null
	user_b_activity_date?: string | null
	user_a_today_date?: string | null
	user_b_today_date?: string | null
	complete_today?: boolean
	timezone?: string
}

export const streaks = createStore<Record<string, RemoteStreak>>(() => ({}))

export let storage: JsonStorage<Settings> | undefined

export function setStorage(value: JsonStorage<Settings> | undefined) {
	storage = value
}

export const localTimezone =
	Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

export function currentUserId() {
	return (
		Stores.UserStore as DiscordModules.Flux.Store<{
			getCurrentUser(): { id: string } | undefined
		}>
	).getCurrentUser()?.id
}

export function getToken() {
	const id = currentUserId()
	return id ? storage?.cache?.tokens?.[id] : undefined
}

export async function setToken(token: string | undefined) {
	const id = currentUserId()
	if (!id || !storage) return
	const current = { ...DefaultSettings, ...(await storage.get()) }
	const tokens = { ...current.tokens }
	if (token) tokens[id] = token
	else delete tokens[id]
	await storage.set({ ...current, tokens }, true)
}

let reauthorizing: Promise<void> | undefined

async function request(
	path: string,
	init?: RequestInit,
	retried = false,
): Promise<any> {
	const token = getToken()
	if (!token) return

	const res = await fetch(`${API_URL}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
	})

	if (res.status === 401) {
		if (!retried) {
			if (getToken() === token) {
				reauthorizing ??= reauthorize()
					.catch(() => {})
					.finally(() => {
						reauthorizing = undefined
					})
				await reauthorizing
			}
			if (getToken() && getToken() !== token) return request(path, init, true)
		}
		if (getToken() !== token) return
		await setToken(undefined)
		streaks.setState({}, true)
		ToastActionCreators.open('STREAKS_EXPIRED', {
			text: 'Streaks login expired. Log in again in the Streaks settings.',
			variant: 'critical',
		})
		return
	}

	if (!res.ok) throw new Error(`Streaks API returned ${res.status}`)
	return res.json()
}

export async function fetchStreaks() {
	const data: RemoteStreak[] | undefined = await request('/streaks')
	if (!data) return

	const me = currentUserId()
	const map: Record<string, RemoteStreak> = {}
	for (const streak of data)
		map[streak.user_a_id === me ? streak.user_b_id : streak.user_a_id] = streak
	streaks.setState(map, true)
}

export async function updateStreak(recipientId: string, senderId: string) {
	const streak: RemoteStreak | undefined = await request(
		`/streaks/${recipientId}`,
		{
			method: 'POST',
			body: JSON.stringify({ sender_id: senderId, timezone: localTimezone }),
		},
	)
	if (streak) streaks.setState({ [recipientId]: streak })
}

export async function refreshStreak(recipientId: string) {
	const streak: RemoteStreak | undefined = await request(
		`/streaks/${recipientId}`,
	)
	if (streak) streaks.setState({ [recipientId]: streak })
}

export function dateInTimezone(timezone: string, date = new Date()) {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(date)
	const part = (type: string) =>
		parts.find(item => item.type === type)?.value ?? ''
	return `${part('year')}-${part('month')}-${part('day')}`
}

export function didUserSendToday(streak: RemoteStreak, isA: boolean) {
	const timezone = isA ? streak.timezone_a : streak.timezone_b
	const activityDate = isA
		? streak.user_a_activity_date
		: streak.user_b_activity_date
	const flag = isA ? streak.user_a_today : streak.user_b_today
	const reportedDate = isA ? streak.user_a_today_date : streak.user_b_today_date
	const today = dateInTimezone(timezone || localTimezone)
	if (activityDate) return activityDate === today
	return flag && (reportedDate || streak.today_date) === today
}

export function colorFor(streak: RemoteStreak) {
	const active =
		didUserSendToday(streak, true) && didUserSendToday(streak, false)
	if (!active) return '#9ca3af'

	const colors = { ...DefaultSettings.colors, ...storage?.cache?.colors }
	return colors[Tiers.find(([, min]) => streak.count >= min)![0]]
}
