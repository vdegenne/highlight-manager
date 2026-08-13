import {CheckIf, isInViewport, visibilityCheck} from 'html-vision/visibility.js'
import {fastTravelDefaults} from '../fast-travel.js'
import {HighlightManager, NavigationStyle} from '../index.js'
import type {MotionOptions, MotionOptionsInput} from '../options.js'
import {
	Anchor,
	defaultRelativeOptions,
	getAnchorPoint,
	getClosestElement,
	RelativeResolution,
} from '../relative-selection.js'

export function down(
	this: HighlightManager,
	motionOptions?: MotionOptionsInput,
): boolean {
	const options: MotionOptions = {
		...motionOptions,
		navigationStyle:
			motionOptions?.navigationStyle ?? this._options.navigationStyle,
		step: motionOptions?.step ?? 1,

		fastTravel:
			this._options.fastTravel || motionOptions?.fastTravel
				? {
						...fastTravelDefaults,
						...this._options.fastTravel,
						...motionOptions?.fastTravel,
					}
				: undefined,

		relativeOptions: {
			...defaultRelativeOptions,
			...this._options.relativeOptions,
			...motionOptions?.relativeOptions,
			anchor: Anchor.BOTTOM_CENTER,
			dig: {
				...defaultRelativeOptions.dig,
				...this._options.relativeOptions.dig,
				...motionOptions?.relativeOptions?.dig,
			},
		},

		// noRelativeCallback: motionOptions?.noRelativeCallback,
	}

	// const {
	// 	navigationStyle = this.#options.navigationStyle,
	// 	step = 1,
	// 	noRelativeCallback,
	// } = options ?? {}
	//
	// const relativeOptions: GetClosestElementOptions = {
	// 	...defaultRelativeOptions,
	// 	...this.#options.relativeOptions,
	// 	anchor: Anchor.CENTER_RIGHT,
	// 	...options?.relativeOptions,
	// 	dig: {
	// 		...defaultRelativeOptions.dig,
	// 		...this.#options.relativeOptions.dig,
	// 		...options?.relativeOptions?.dig,
	// 	},
	// }
	//
	// // TODO: should prob turn this into undefined if explicitely not provided
	// const fastTravel: FastTravelOptions = {
	// 	...fastTravelDefaults,
	// 	...this.#options.fastTravel,
	// 	...options?.fastTravel,
	// }

	if (options.relativeOptions.debug) {
		// console.log(options)
	}

	const {elements, highlightIndexStart, highlightIndexEnd} = this.getInfo({
		internal: true,
	})

	const len = elements.length
	if (len === 0) {
		this.highlight(-1)
		return true
	}

	// let scrollStrategy = this._options.scroll

	let fastTravelChecks: CheckIf[] | undefined
	if (options.fastTravel) {
		fastTravelChecks = options.fastTravel.toElementThat
			? Array.isArray(options.fastTravel.toElementThat)
				? options.fastTravel.toElementThat
				: [options.fastTravel.toElementThat]
			: []

		if (options.fastTravel.fallback) {
			fastTravelChecks = [...fastTravelChecks, options.fastTravel.fallback]
		}
	}

	// const currIndex =
	// 	highlightIndexStart !== highlightIndexEnd
	// 		? highlightIndexEnd - 1
	// 		: highlightIndexEnd
	const currIndex =
		highlightIndexStart !== highlightIndexEnd
			? Math.floor((highlightIndexStart + highlightIndexEnd) / 2)
			: highlightIndexEnd

	if (currIndex === -1) {
		if (fastTravelChecks) {
			let found: HTMLElement | undefined

			for (const check of fastTravelChecks) {
				found = elements.find((el) => visibilityCheck(el, check))

				if (found) {
					this.highlight(elements.indexOf(found))
					return true
				}
			}
		}

		this.highlight(0)
		return true
	}

	const currEl = elements[currIndex]!
	const currIsVisible = isInViewport(currEl)
	const currRect = currEl.getBoundingClientRect()
	const currIsAboveScreen = currRect.bottom < 0
	const currIsBeforeScreen = currRect.right < 0
	const currIsBelowScreen = currRect.top > window.innerHeight
	// const currIsAfterScreen = currRect.left > window.innerWidth
	const currAnchorPoint = getAnchorPoint(
		currRect,
		options.relativeOptions.anchor,
	)

	const shouldFastTravel =
		options.fastTravel &&
		!currIsVisible &&
		(currIsAboveScreen || (currIsBeforeScreen && !currIsBelowScreen))

	if (
		options.navigationStyle === NavigationStyle.INDEX_BASED ||
		(options.navigationStyle === NavigationStyle.RELATIVE_TO && // delegating
			shouldFastTravel &&
			(options.fastTravel!.relativeResolution ===
				RelativeResolution.INDEX_BASED_OR_DIG ||
				options.fastTravel!.relativeResolution ===
					RelativeResolution.INDEX_BASED_OR_DIG_OR_CLOSEST) &&
			!(currAnchorPoint.x > 0 && currAnchorPoint.x < window.innerWidth))
	) {
		if (shouldFastTravel) {
			if (options.relativeOptions.debug) {
				console.log('DELEGATING FAST TRAVEL TO INDEX-BASED')
			}
			// TODO: next line is probably wrong (too fuzzy)
			const candidates = elements.slice(currIndex + 1)
			let found: HTMLElement | undefined

			for (const check of fastTravelChecks!) {
				found = candidates.find((el) => visibilityCheck(el, check))

				if (found) {
					this.highlight(elements.indexOf(found))
					return true
				}
			}
			if (
				options.navigationStyle === NavigationStyle.INDEX_BASED ||
				options.fastTravel!.relativeResolution ===
					RelativeResolution.INDEX_BASED
			) {
				return false
			}
		} else {
			this.highlight(
				this._options.loop
					? (currIndex + options.step) % len
					: Math.min(len - 1, currIndex + options.step),
			)
			return true
		}
	}

	// const alsoSelectXElementsBehind = 10 // you can tweak this
	// const candidates = elements.slice(
	// 	Math.max(0, currIndex - alsoSelectXElementsBehind),
	// )

	// Order elements around the current index to maximize the chance
	// of hitting the closest element faster.
	const candidates = elements
		.slice()
		.sort(
			(a, b) =>
				Math.abs(elements.indexOf(a) - currIndex) -
				Math.abs(elements.indexOf(b) - currIndex),
		)

	let closest: HTMLElement | undefined

	if (shouldFastTravel) {
		// DIG
		if (
			options.fastTravel!.relativeResolution ===
				RelativeResolution.INDEX_BASED_OR_DIG ||
			options.fastTravel!.relativeResolution ===
				RelativeResolution.INDEX_BASED_OR_DIG_OR_CLOSEST
		) {
			for (const check of fastTravelChecks!) {
				closest = getClosestElement(
					currEl,
					candidates.filter((el) => visibilityCheck(el, check)),
					{
						...options.relativeOptions,
						rectOverride: {
							top: 0,
							bottom: 10,
						},
						dig: {
							...options.relativeOptions.dig,
							untilOffscreen: true,
						},
					},
				)

				if (closest) {
					this.highlight(elements.indexOf(closest))
					return true
				}
			}
		}

		// OR CLOSEST
		if (
			options.fastTravel!.relativeResolution ===
			RelativeResolution.INDEX_BASED_OR_DIG_OR_CLOSEST
		)
			for (const check of fastTravelChecks!) {
				closest = getClosestElement(
					currEl,
					candidates.filter((el) => visibilityCheck(el, check)),
					{
						...options.relativeOptions,
						maxDistance: Infinity,
						dig: {},
					},
				)

				if (closest) {
					this.highlight(elements.indexOf(closest))
					return true
				}
			}

		return false // fast travel failed
	}

	// Normal navigation
	closest = getClosestElement(currEl, candidates, options.relativeOptions)

	if (closest) {
		this.highlight(elements.indexOf(closest))
		return true
	}

	return false // normal navigation failed
}
