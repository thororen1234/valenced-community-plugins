import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { before } from '@valenced/patcher'

interface MediaManager {
	downloadMediaAsset(url: unknown, type?: unknown, ...rest: unknown[]): unknown
}

interface MediaShareActions {
	useMediaShareActions(props: any, ...rest: unknown[]): unknown
}

function parseURL(url: string): string | undefined {
	const path = url.split('/')
	const tenorIndex = path.findIndex(x => x.endsWith('.tenor.com'))
	if (tenorIndex === -1) return

	const [host, id, file] = path.slice(tenorIndex, tenorIndex + 3)
	if (!host || !id || !file) return

	return `https://${host}/${id.slice(0, -2)}AC/${file.split('.')[0]}.gif`
}

export default plugin({
	start({ cleanup }) {
		cleanup(
			getModules(
				withProps<MediaManager>('downloadMediaAsset'),
				MediaManager => {
					cleanup(
						before(MediaManager, 'downloadMediaAsset', args => {
							const url = args[0]
							if (typeof url !== 'string') return args

							const parsed = parseURL(url)
							if (parsed) {
								args[0] = parsed
								args[1] = 1
							}

							return args
						}),
					)
				},
				{ max: 1 },
			),
		)

		cleanup(
			getModules(
				withProps<MediaShareActions>('useMediaShareActions'),
				MediaShareActions => {
					cleanup(
						before(MediaShareActions, 'useMediaShareActions', args => {
							const source = args[0]?.source
							if (typeof source?.uri !== 'string') return args

							const parsed = parseURL(source.uri)
							if (parsed) {
								source.sourceURI = parsed
								delete source.videoURI
							}

							return args
						}),
					)
				},
				{ max: 1 },
			),
		)
	},
})
