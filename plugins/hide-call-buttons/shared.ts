export interface Settings {
	upHideVoiceButton: boolean
	dmHideCallButton: boolean
	dmHideVideoButton: boolean
	hideVCVideoButton: boolean
	friendsHideCallButton: boolean
}

export const DefaultSettings: Settings = {
	upHideVoiceButton: true,
	dmHideCallButton: false,
	dmHideVideoButton: false,
	hideVCVideoButton: false,
	friendsHideCallButton: false,
}
