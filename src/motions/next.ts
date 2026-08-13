import {CheckIf, isInViewport, visibilityCheck} from 'html-vision/visibility.js'
import {fastTravelDefaults} from '../fast-travel.js'
import {HighlightManager, NavigationStyle} from '../index.js'
import type {MotionOptions, MotionOptionsInput} from '../options.js'
import {
	Anchor,
	defaultRelativeOptions,
	getAnchorPoint,
	getClosestElement,
	GetClosestElementOptions,
	RelativeResolution,
	WithAnchorOption,
	WithRectOverrideOption,
} from '../relative-selection.js'

/**
 * Highlight next element after the currently highlighted one.
 *
 * It uses the navigation style you set in the global options
 * unless you override it here.
 */
export function next(
	this: HighlightManager,
	motionOptions?: MotionOptionsInput,
) {
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
			anchor: Anchor.CENTER_RIGHT,
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
		return
	}

	let scrollStrategy = this._options.scroll

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
					const i = elements.indexOf(found)
					this.highlight(i, i /*, {scroll: undefined}*/)
					break
				}
			}
		}

		this.highlight(0)
		return
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
				RelativeResolution.INDEX_BASED ||
				((options.fastTravel!.relativeResolution ===
					RelativeResolution.INDEX_BASED_OR_DIG ||
					options.fastTravel!.relativeResolution ===
						RelativeResolution.INDEX_BASED_OR_DIG_OR_CLOSEST) &&
					!(currAnchorPoint.y > 0 && currAnchorPoint.y < window.innerHeight))))
	) {
		let nextIndex = -1

		if (shouldFastTravel) {
			if (options.relativeOptions.debug) {
				console.log('DELEGATING FAST TRAVEL TO INDEX-BASED')
			}
			const candidates = elements.slice(currIndex + 1)
			let found: HTMLElement | undefined

			for (const check of fastTravelChecks!) {
				found = candidates.find((el) => visibilityCheck(el, check))

				if (found) {
					// scrollStrategy = undefined
					nextIndex = elements.indexOf(found)
					break
				}
			}
		}

		if (nextIndex === -1) {
			nextIndex = this._options.loop
				? (currIndex + options.step) % len
				: Math.min(len - 1, currIndex + options.step)
		}

		this.highlight(nextIndex, nextIndex, {
			scroll: scrollStrategy,
		})
		return
	}

	const alsoSelectXElementsBehind = 10 // you can tweak this
	const candidates = elements.slice(
		Math.max(0, currIndex - alsoSelectXElementsBehind),
	)
	// TODO: probably should exclude the element itself?
	// normally not because getClosestElement already exclude it from the candidates
	let closest: HTMLElement | undefined

	if (shouldFastTravel) {
		let searchClosestOptions: DeepPartial<
			GetClosestElementOptions & WithAnchorOption & WithRectOverrideOption
		> = {}
		switch (options.fastTravel!.relativeResolution) {
			case RelativeResolution.INDEX_BASED_OR_DIG:
			case RelativeResolution.INDEX_BASED_OR_DIG_OR_CLOSEST:
				searchClosestOptions = {
					...options.relativeOptions,
					rectOverride: {
						left: 0,
						right: 10,
					},
					dig: {
						...options.relativeOptions.dig,
						untilOffscreen: true,
					},
				}
				break
			case RelativeResolution.CLOSEST:
				searchClosestOptions = {
					...options.relativeOptions,
					maxDistance: Infinity,
					dig: {},
				}
				break
		}

		for (const check of fastTravelChecks!) {
			closest = getClosestElement(
				currEl,
				candidates.filter((el) => visibilityCheck(el, check)),
				searchClosestOptions,
			)

			if (closest) {
				// scrollStrategy = undefined
				break
			}
		}
	} else {
		closest = getClosestElement(currEl, candidates, options.relativeOptions)
	}

	if (
		!closest &&
		shouldFastTravel &&
		options.fastTravel!.relativeResolution ===
			RelativeResolution.INDEX_BASED_OR_DIG_OR_CLOSEST
	) {
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
				// scrollStrategy = undefined
				break
			}
		}
	}

	if (!closest) {
		// options.noRelativeCallback?.(this.getInfo({internal: true}))
		return false
	}

	const nextIndex = elements.indexOf(closest)

	this.highlight(nextIndex, nextIndex, {
		scroll: scrollStrategy,
	})
	return true
}
