export interface Settings {
	showDMButton: boolean
	showFavoritesButton: boolean
	showSettingsButton: boolean
}

export const DefaultSettings: Settings = {
	showDMButton: false,
	showFavoritesButton: false,
	showSettingsButton: true,
}

export const listeners = new Set<() => void>()
