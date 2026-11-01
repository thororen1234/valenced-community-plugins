import { ToastActionCreators } from '@valenced/discord/actions'
import { Stores } from '@valenced/discord/flux'
import { create } from 'zustand'
import type { UserData } from '@song-spotlight/api/structs'
import type { JsonStorage } from '@valenced/json-storage'

export const ApiUrl = 'https://dc.songspotlight.nexpid.xyz/'
export const ClientId = '1157745434140344321'
export const RedirectUri = `${ApiUrl}api/auth/authorize`
export const SongLimit = 6

export interface Token {
	access: string
	refresh: string
}

export interface Settings {
	tokens: Record<string, Token>
}

export const DefaultSettings: Settings = { tokens: {} }

let storage: JsonStorage<Settings>

export function setStorage(value: JsonStorage<Settings>) {
	storage = value
}

type UserStore = { getCurrentUser(): { id: string } | undefined }

export function currentUserId() {
	return (Stores.UserStore as unknown as UserStore)?.getCurrentUser()?.id
}

export function getToken() {
	const id = currentUserId()
	return id ? storage.cache?.tokens?.[id] : undefined
}

export function setToken(access: string, refresh: string) {
	const id = currentUserId()
	if (id) storage.set({ tokens: { [id]: { access, refresh } } })
}

export function removeToken() {
	const id = currentUserId()
	const { [id ?? '']: _, ...tokens } = storage.cache?.tokens ?? {}
	storage.set({ tokens }, true)
}

export function useAuthorized() {
	const tokens = storage.use()?.tokens
	const id = currentUserId()
	return !!(id && tokens?.[id])
}

interface Cached {
	data: UserData
	at?: string
}

export const useCache = create<{ users: Record<string, Cached> }>(() => ({
	users: {},
}))

function setCached(userId: string, value?: Cached) {
	useCache.setState(({ users }) => {
		const { [userId]: _, ...rest } = users
		return { users: value ? { ...rest, [userId]: value } : rest }
	})
}

export function toast(
	text: string,
	variant: 'success' | 'critical' = 'success',
) {
	ToastActionCreators.open('SONG_SPOTLIGHT', { text, variant })
}

let refreshing: Promise<boolean> | undefined

function refreshAccessToken() {
	const token = getToken()
	if (!token) return Promise.resolve(false)

	refreshing ??= fetch(`${ApiUrl}api/auth/refresh`, {
		method: 'POST',
		headers: { 'X-Refresh-Token': token.refresh },
		body: token.access,
	})
		.then(async res => {
			if (!res.ok) return false
			setToken(await res.text(), token.refresh)
			return true
		})
		.catch(() => false)
		.finally(() => {
			refreshing = undefined
		})

	return refreshing
}

export async function authFetch(
	url: string,
	options: RequestInit & { headers?: Record<string, string> } = {},
	retried = false,
): Promise<Response | null> {
	const token = getToken()
	let res: Response
	try {
		res = await fetch(url, {
			...options,
			headers: {
				...options.headers,
				...(token && { authorization: token.access }),
			},
		})
	} catch (error) {
		toast(`Song Spotlight: ${error}`, 'critical')
		throw error
	}

	if (res.ok) return res
	if (res.status === 304) return null

	const text = await res.text()
	if (res.status === 401) {
		if (!retried && (await refreshAccessToken()))
			return authFetch(url, options, true)

		removeToken()
		toast('Unauthorized, try logging out and back in again.', 'critical')
	} else {
		toast(
			!text.includes('<body>') && res.status >= 400
				? `Song Spotlight: ${text}`
				: `Song Spotlight fetch error at ${new URL(url).pathname}`,
			'critical',
		)
	}

	throw new Error(text)
}

async function fetchData(userId: string, path: string) {
	const cached = useCache.getState().users[userId]
	const res = await authFetch(`${ApiUrl}${path}`, {
		headers: cached?.at ? { 'if-modified-since': cached.at } : {},
	})
	if (!res) return cached?.data

	const data: UserData | null = await res.json()
	setCached(userId, {
		data: data ?? [],
		at: res.headers.get('last-modified') ?? undefined,
	})
	return data ?? []
}

export function getData() {
	const id = currentUserId()
	if (!id) return Promise.resolve(undefined)
	return fetchData(id, 'api/data')
}

export function listData(userId: string) {
	if (userId === currentUserId()) return getData()
	return fetchData(userId, `api/data/${userId}`)
}

export async function saveData(data: UserData) {
	await authFetch(`${ApiUrl}api/data`, {
		method: 'PUT',
		body: JSON.stringify(data),
		headers: { 'content-type': 'application/json' },
	})

	const id = currentUserId()
	if (id) setCached(id, { data, at: new Date().toUTCString() })
}

export async function deleteData() {
	await authFetch(`${ApiUrl}api/data`, { method: 'DELETE' })

	const id = currentUserId()
	if (id) setCached(id)
}
