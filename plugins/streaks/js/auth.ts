import { AUTHORIZE_URL, CLIENT_ID, setToken } from './store'

interface Request {
	url: string
	query?: Record<string, string>
	body?: unknown
}

export interface HTTP {
	get<T = unknown>(request: Request): Promise<{ body?: T }>
	post<T = unknown>(request: Request): Promise<{ body?: T }>
}

export let http: HTTP | undefined

export function setHTTP(value: HTTP | undefined) {
	http = value
}

export async function reauthorize() {
	if (!http) throw new Error('Enable the Streaks plugin first.')

	const { body } = await http.get<{ application?: { id?: string } }[]>({
		url: '/oauth2/tokens',
		query: { application_ids: CLIENT_ID },
	})
	if (!body?.some(token => token.application?.id === CLIENT_ID))
		throw new Error('Streaks is no longer authorized.')

	await authorize()
}

export async function authorize() {
	if (!http) throw new Error('Enable the Streaks plugin first.')

	const { body } = await http.post<{ location?: string }>({
		url: '/oauth2/authorize',
		query: {
			client_id: CLIENT_ID,
			response_type: 'code',
			redirect_uri: AUTHORIZE_URL,
			scope: 'identify',
		},
		body: { permissions: '0', authorize: true, integration_type: 0 },
	})

	const code = body?.location?.match(/[?&]code=([^&]+)/)?.[1]
	if (!code) throw new Error('Discord did not return a code.')

	const res = await fetch(`${AUTHORIZE_URL}?code=${code}`)
	if (!res.ok) throw new Error(`Streaks API returned ${res.status}`)

	const { access_token: token } = await res.json()
	if (!token) throw new Error('Streaks API did not return a token.')
	await setToken(token)
}
