import type {CheckIf} from 'html-vision/visibility.js'
import {RelativeResolution} from './relative-selection.js'

export interface FastTravelOptions {
	/**
	 * @default (is) => is('fully-visible')
	 */
	toElementThat: CheckIf | CheckIf[] | undefined

	/**
	 * if `toElementThat` fails to find a candidate, use a fallback check
	 *
	 * @default (is) => is('partially-visible')
	 */
	fallback: CheckIf | undefined

	/**
	 * @default RelativeResolution.INDEX_BASED_CLOSEST
	 */
	relativeResolution: RelativeResolution | `${RelativeResolution}`

	/**
	 * TODO: TO IMPLEMENT
	 *
	 * @deprecated Not yet implemented
	 */
	bothWays?: boolean
}

export const fastTravelDefaults: FastTravelOptions = {
	toElementThat: (is) => is('fully-visible'),
	fallback: (is) => is('partially-visible'),
	relativeResolution: RelativeResolution.INDEX_BASED_OR_DIG_OR_CLOSEST,
}

export function resolveFastTravelOptions(
	options?: Partial<FastTravelOptions>,
	overrides?: Partial<FastTravelOptions>,
): FastTravelOptions {
	return {
		...fastTravelDefaults,
		...options,
		...overrides,
	}
}
