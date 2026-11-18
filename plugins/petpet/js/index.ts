import { ToastActionCreators } from '@valenced/discord/actions'
import { getStore } from '@valenced/discord/flux'
import { FileModule } from '@valenced/discord/native'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'

// todo: type this
let token: any
let base: any
let UserStore: any
let unregister: (() => void) | undefined

type ApplicationCommand = any
type CommandsLib = {
	commands: { registerCommand: (cmd: ApplicationCommand) => () => void }
}

export enum ApplicationCommandOptionType {
	SUB_COMMAND = 1,
	SUB_COMMAND_GROUP,
	STRING,
	INTEGER,
	BOOLEAN,
	USER,
	CHANNEL,
	ROLE,
	MENTIONABLE,
	NUMBER,
	ATTACHMENT,
}

function getApiBase(): string {
	try {
		if (typeof base === 'string') {
			if (base.startsWith('//')) base = `https:${base}`
			if (base.startsWith('http') && base.includes('/api/')) return base
		}
	} catch {}
	return 'https://discord.com/api/v9'
}

async function fetchPetPetBase64(avatarUrl: string): Promise<string> {
	const endpoint = `https://api.popcat.xyz/pet?image=${encodeURIComponent(avatarUrl)}`
	const response = await fetch(endpoint)

	if (
		!response.ok ||
		response.headers.get('content-type')?.includes('application/json')
	) {
		throw new Error(`Failed to fetch petpet GIF: ${response.status}`)
	}

	const arrayBuffer = await response.arrayBuffer()
	const bytes = new Uint8Array(arrayBuffer)

	let binary = ''
	const len = bytes.byteLength
	for (let i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i])
	}

	return btoa(binary)
}

async function sendPetPetAttachment(
	channelId: string,
	base64Data: string,
): Promise<void> {
	const filename = 'petpet.gif'
	const tempPath = `rain/petpet/${Date.now()}-${Math.random().toString(16).slice(2)}.gif`

	const filePath = await FileModule.writeFile(
		'cache',
		tempPath,
		base64Data,
		'base64',
	)
	const uri = String(filePath).startsWith('file://')
		? String(filePath)
		: `file://${filePath}`

	if (!token) throw new Error('Unable to resolve authorization token.')

	const form = new FormData()
	form.append(
		'payload_json',
		JSON.stringify({
			content: '',
			channel_id: channelId,
			type: 0,
			attachments: [{ id: '0', filename }],
			nonce: Date.now().toString(),
		}),
	)
	form.append('files[0]', { uri, type: 'image/gif', name: filename } as any)

	try {
		const response = await fetch(
			`${getApiBase()}/channels/${channelId}/messages`,
			{
				method: 'POST',
				headers: { Authorization: token.getToken() },
				body: form,
			},
		)

		if (!response.ok) {
			throw new Error(`Discord REST API returned ${response.status}`)
		}
	} finally {
		setTimeout(() => {
			try {
				FileModule.removeFile('cache', tempPath)
			} catch {}
		}, 5000)
	}
}

export default plugin({
	start(api: any) {
		const { registerCommand } = (api.commands as CommandsLib).commands

		getStore('AuthenticationStore', store => {
			token = store
		})
		getModules(withProps('getAPIBaseURL', 'del'), exports => {
			base = exports.getAPIBaseURL()
		})
		getStore('UserStore', store => {
			UserStore = store
		})

		unregister = registerCommand(petPetCommand(api))
	},
	stop() {
		unregister?.()
	},
})

const petPetCommand = (api: any): ApplicationCommand => ({
	name: 'petpet',
	displayName: 'petpet',
	description: 'PetPet someone',
	displayDescription: 'PetPet someone',
	applicationId: '-1',
	inputType: 1,
	type: 1,
	shouldHide: () => false,
	options: [
		{
			name: 'user',
			description: 'The user (or their id) to be patted',
			type: ApplicationCommandOptionType.USER,
			required: true,
			displayName: 'user',
			displayDescription: 'The user (or their id) to be patted',
		},
	],
	execute: async (args: any, ctx: any) => {
		try {
			const user = await UserStore.getUser(args[0].value)
			const avatarUrl = user.avatar
				? user.getAvatarURL(128).replace('.webp', '.png')
				: `https://cdn.discordapp.com/embed/avatars/${(BigInt(user.id) >> 22n) % 6n}.png`

			const base64Gif = await fetchPetPetBase64(avatarUrl)

			await sendPetPetAttachment(ctx.channel.id, base64Gif)
		} catch (error) {
			api.plugin.reportError(error)
			ToastActionCreators.open('PETPET_ERROR', {
				text: `[PetPet]: ${error instanceof Error ? error.message : 'Failed to pet user.'}`,
				variant: 'critical',
			})
		}
	},
})
