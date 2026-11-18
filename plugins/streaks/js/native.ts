import { callNativeMethodSync } from '@valenced/modules/native'

export function putAuthors(authors: Record<string, string>) {
	callNativeMethodSync('thororen.streaks.authors', [JSON.stringify(authors)])
}

export function setBadges(badges: Record<string, [number, number]>) {
	callNativeMethodSync('thororen.streaks.badges', [JSON.stringify(badges)])
}

export function clearBadges() {
	callNativeMethodSync('thororen.streaks.clear', [])
}

declare module '@valenced/modules/native' {
	interface NativeMethods {
		'thororen.streaks.authors': [[json: string], null]
		'thororen.streaks.badges': [[json: string], null]
		'thororen.streaks.clear': [[], null]
	}
}
