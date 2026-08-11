import {$$} from 'html-vision/queries.js'
import {scrollIntoView, ScrollStrategy} from 'html-vision/scroll.js'
import {CheckIf, isInViewport, visibilityCheck} from 'html-vision/visibility.js'
import {fastTravelDefaults} from './fast-travel.js'
import {
	defaultOptions,
	mergeOptions,
	MotionOptions,
	Options,
	OptionsInput,
} from './options.js'
import {
	Anchor,
	defaultRelativeOptions,
	getAnchorPoint,
	getClosestElement,
	GetClosestElementOptions,
	RelativeResolution,
} from './relative-selection.js'
import {sleep} from './utils.js'

declare global {
	type DeepPartial<T> = {
		[P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
	}
	type DeepRequired<T> = {
		[P in keyof T]-?: T[P] extends object ? DeepRequired<T[P]> : T[P]
	}
}

// Local array of all declared highlighters for id control.
const highlighters: HighlightManager<any>[] = []

let globalBeforeHighlight: (() => void) | undefined
export function setGlobalBeforeHighlight(fct: () => void) {
	globalBeforeHighlight = fct
}

export type NavigationStyle =
	| 'index-based'
	/**
	 * Experimental
	 */
	| 'relative-to'

export interface HighlightInfo {
	elements: HTMLElement[]
	highlightIndexStart: number
	highlightIndexEnd: number
	highlightElements: HTMLElement[]
	/**
	 * First element of highlightElements if there is one
	 */
	highlightElement: HTMLElement | undefined
	highlightContent: string | undefined
}

export interface HighlightOptions {
	/**
	 * Should we unhighlight all highlighted elements before highlighting the next one
	 *
	 * @default true
	 */
	unhighlightAll: boolean

	scroll?: Partial<ScrollStrategy> | undefined
}

export class HighlightManager<T = {}> {
	#options: Options<T>

	#ss: CSSStyleSheet

	#id: number

	constructor(
		protected selector: string,
		options?: OptionsInput<T>,
	) {
		this.#id = highlighters.push(this)

		this.#options = mergeOptions(defaultOptions, options)
		console.log(this.#options)

		/* stylesheet */
		this.#ss = new CSSStyleSheet()
		let applyTo: Document | ShadowRoot // element to apply stylesheet to
		if (
			this.#options.applyStyleSheetTo === document.documentElement ||
			!(this.#options.applyStyleSheetTo instanceof HTMLElement) ||
			this.#options.applyStyleSheetTo.shadowRoot === null
		) {
			applyTo = document
		} else {
			applyTo = (this.#options.applyStyleSheetTo as HTMLElement).shadowRoot!
		}
		applyTo.adoptedStyleSheets.push(this.#ss)
		// this.#ss.replaceSync(`[highlight] {${css}}`);
		this.replaceCSS(this.#options.css)
	}

	replaceCSS(css: string) {
		this.#options.css = css
		this.#ss.replaceSync(
			`[highlight${this.#id}] {${css}} [highlight${this.#id}]:hover {${css}} [highlight${this.#id}] * {color: ${this.#options.highlightTextColor} !important;}`,
		)
	}

	#highlightWhenAvailablePromiseWR:
		PromiseWithResolvers<HTMLElement> | undefined

	highlightWhenAvailable(
		index = 0,
		{
			checkSpeedMs = 1000,
			timeout = 5000,
		}: {
			checkSpeedMs?: number
			timeout?: number
		} = {},
	) {
		// cancel any existing run
		this.cancelHighlightWhenAvailable('restarted')

		const wr = Promise.withResolvers<HTMLElement>()
		this.#highlightWhenAvailablePromiseWR = wr
		;(async () => {
			const start = Date.now()

			while (this.#highlightWhenAvailablePromiseWR === wr) {
				// TODO: should shadows be an class option ?
				const els = $$(this.selector, {shadows: true})
				const el = els[index]

				if (el) {
					this.highlight(
						index,
						index,
						// TODO: should we uncomment
						// {
						// 	scrollStrategy: undefined, // Disable scrolling on first highlight
						// },
					)
					wr.resolve(el)
					this.#highlightWhenAvailablePromiseWR = undefined
					return
				}

				if (timeout > 0 && Date.now() - start >= timeout) {
					this.cancelHighlightWhenAvailable('timeout')
					return
				}

				await sleep(checkSpeedMs)
			}
		})()

		return wr.promise
	}

	cancelHighlightWhenAvailable(reason: unknown = 'canceled') {
		if (this.#highlightWhenAvailablePromiseWR) {
			this.#highlightWhenAvailablePromiseWR.reject(reason)
			this.#highlightWhenAvailablePromiseWR = undefined
		}
	}

	getInfo(
		options: {
			/**
			 * If true, will not run the getInfo middleware to process faster.
			 *
			 * @default false
			 */
			internal?: boolean
		} = {},
	): HighlightInfo & T {
		options.internal ??= false

		// console.log(this.selector)
		const elements = $$(this.selector, {shadows: true}).filter((el, i) =>
			this.#options.atomicSelection(el, i),
		)
		const highlightElements = elements.filter((el) =>
			el.hasAttribute(`highlight${this.#id}`),
		)
		// const highlightIndexStart = elements.findIndex((el) =>
		// 	el.hasAttribute('highlight'),
		// );

		// if (!highlightElements || highlightElements.length === 0) {
		// 	console.warn("The highlighted element couldn't be found")
		// 	return {
		// 		highlightIndexStart: -1,
		// 		highlightIndexEnd: -1,
		// 		elements: []
		// 	}
		// }

		const highlightIndexStart = highlightElements.length
			? elements.indexOf(highlightElements[0]!)
			: -1
		const highlightIndexEnd = highlightElements.length
			? elements.indexOf(highlightElements[highlightElements.length - 1]!)
			: -1
		if (highlightElements.length === 1) {
			// const highlightElement = elements[highlightIndex];
		}
		const highlightContent = highlightElements
			// TODO: should prob change that ariaLabel (for lens into a customizable content getter)
			.map((el) => el.ariaLabel || el.innerText?.trim() || '')
			.join('')
		// highlightElement?.innerText.trim();

		const base: HighlightInfo = {
			elements,
			// highlightIndex,
			highlightIndexStart,
			highlightIndexEnd,
			highlightElements,
			highlightElement: highlightElements[0],
			highlightContent,
		}

		let extra = {} as T

		if (!options.internal) {
			extra = this.#options.getInfoMiddleware?.(base) ?? ({} as T)
		}

		return {...base, ...extra}
	}

	unhighlightAll(elements?: HTMLElement[]) {
		if (!elements) {
			elements = this.getInfo({internal: true}).elements
		}
		elements.forEach((el) => el.removeAttribute(`highlight${this.#id}`))
	}

	highlightAll() {
		const {elements} = this.getInfo({internal: true})
		this.highlight(0, elements.length - 1, {unhighlightAll: false})
	}
	// alias
	selectAll = this.highlightAll.bind(this)

	/**
	 * @returns {boolean} true if the highlight succeeded, false otherwise.
	 */
	highlight(
		start: number,
		end?: number,
		options?: Partial<HighlightOptions>,
	): boolean {
		const _options: HighlightOptions = {
			unhighlightAll: true,
			...options,
		}

		if (end === undefined) {
			end = start
		}

		if (start > end) {
			return false
			// const tmp = start
			// start = end
			// end = tmp
		}

		const {elements, highlightIndexStart, highlightIndexEnd} = this.getInfo({
			internal: true,
		})
		// console.log(elements)

		if (highlightIndexStart === start && highlightIndexEnd === end) {
			return false
		}
		// console.log(highlightIndexStart, highlightIndexEnd, start, end)

		globalBeforeHighlight?.()
		this.#options.beforeHighlight?.()
		// playClick()

		if (_options.unhighlightAll) {
			this.unhighlightAll(elements)
		}

		const elementsToHighlight = elements.slice(start, end + 1)
		if (elementsToHighlight.length === 0) {
			return false
		}

		const scrollStrategy =
			'scroll' in _options ? _options.scroll : this.#options.scroll
		if (scrollStrategy) {
			scrollIntoView(elementsToHighlight[0]!, scrollStrategy)
		}

		elementsToHighlight.forEach((el) =>
			el.setAttribute(`highlight${this.#id}`, ''),
		)
		// elements[index]?.setAttribute('highlight', '');
		if (this.#options.focusElementOnHighlight) {
			elementsToHighlight[elementsToHighlight.length - 1]!.focus({
				preventScroll: true,
				// focusVisible: false
			})
		}

		if (this.#options.onSelectionChange) {
			this.#options.onSelectionChange(this.getInfo({internal: true}))
		}

		return true
	}

	/**
	 * Highlight previous element prior to the currently highlighted one.
	 *
	 * It uses the navigation style you set in the global options
	 * unless you override it here.
	 */
	previous(options?: {
		/**
		 * Navigation style to use for this call.
		 *
		 * @default this.#options.navigationStyle
		 */
		navigationStyle?: 'index-based' | 'relative-to'

		/**
		 * Only for "index-based" mode.
		 *
		 * @default 1
		 */
		step?: number

		/**
		 * Only for "relative-to" mode.
		 */
		relativeOptions?: Partial<
			Omit<GetClosestElementOptions, 'anchor'> & {
				/**
				 * Anchor point of the reference element from which to calculate the
				 * distance to candidate elements.
				 *
				 * @default Anchor.CENTER_LEFT
				 */
				anchor: Anchor
			}
		>

		/**
		 * Only for "relative-to" mode.
		 *
		 * A callback to execute in case no relative element was found.
		 */
		noRelativeCallback?: (info: HighlightInfo) => void
	}) {
		const {
			navigationStyle = this.#options.navigationStyle,
			step = 1,
			noRelativeCallback,
		} = options ?? {}

		const relativeOptions: GetClosestElementOptions = {
			...defaultRelativeOptions,
			...this.#options.relativeOptions,
			anchor: Anchor.CENTER_LEFT,
			...options?.relativeOptions,
		}
		if (relativeOptions.debug) {
			console.log(relativeOptions)
		}

		const {elements, highlightIndexStart, highlightIndexEnd} = this.getInfo({
			internal: true,
		})

		let scrollStrategy = this.#options.scroll

		let fastTravelChecks: CheckIf[] | undefined
		if (this.#options.fastTravel) {
			fastTravelChecks = this.#options.fastTravel.toElementThat
				? Array.isArray(this.#options.fastTravel.toElementThat)
					? this.#options.fastTravel.toElementThat
					: [this.#options.fastTravel.toElementThat]
				: []

			if (this.#options.fastTravel.fallback) {
				fastTravelChecks = [
					...fastTravelChecks,
					this.#options.fastTravel.fallback,
				]
			}
		}

		const len = elements.length
		if (len === 0) {
			this.highlight(-1)
			return
		}

		// const currIndex =
		// 	highlightIndexStart !== highlightIndexEnd
		// 		? highlightIndexStart + 1
		// 		: highlightIndexStart
		const currIndex =
			highlightIndexStart !== highlightIndexEnd
				? Math.floor((highlightIndexStart + highlightIndexEnd) / 2)
				: highlightIndexStart

		if (currIndex === -1) {
			if (fastTravelChecks) {
				let found: HTMLElement | undefined

				for (const check of fastTravelChecks) {
					found = elements.findLast((el) => visibilityCheck(el, check))

					if (found) {
						const i = elements.indexOf(found)
						this.highlight(i, i, {scroll: undefined})
						return
					}
				}

				// if (found) {
				// 	const i = elements.indexOf(found)
				// 	this.highlight(i, i, {scroll: undefined})
				// 	return
				// }
			}

			this.highlight(this.#options.loop ? len - 1 : 0)
			return
		}

		const currEl = elements[currIndex]!
		const currIsVisible = isInViewport(currEl)
		const currRect = currEl.getBoundingClientRect()
		const currIsBelowOrAfter =
			currRect.top > window.innerHeight || currRect.left > window.innerWidth

		if (navigationStyle === 'index-based') {
			let previousIndex = -1

			if (fastTravelChecks && !currIsVisible && currIsBelowOrAfter) {
				const candidates = elements.slice(0, currIndex).reverse()
				let found: HTMLElement | undefined

				for (const check of fastTravelChecks) {
					found = candidates.find((el) => visibilityCheck(el, check))

					if (found) {
						scrollStrategy = undefined
						previousIndex = elements.indexOf(found)
						break
					}
				}

				// if (found) {
				// 	scrollStrategy = undefined
				// 	previousIndex = elements.indexOf(found)
				// }
			}

			if (previousIndex === -1) {
				previousIndex = this.#options.loop
					? (currIndex - step + len) % len
					: Math.max(0, currIndex - step)
			}

			this.highlight(previousIndex, previousIndex, {
				scroll: scrollStrategy,
			})
			return
		}

		const alsoSelectXElementsAfter = 10 // you can tweak this
		const candidates = elements.slice(
			0,
			currIndex + 1 + alsoSelectXElementsAfter,
		)
		// TODO: probably should exclude the element itself?
		let closest: HTMLElement | undefined

		if (fastTravelChecks && !currIsVisible && currIsBelowOrAfter) {
			for (const check of fastTravelChecks) {
				closest = getClosestElement(
					currEl,
					candidates.filter((el) => visibilityCheck(el, check)),
					{
						...relativeOptions,
						fromRectOverride: {
							left: window.innerWidth - 10,
							right: window.innerWidth,
						},
						// TODO: set the dig
					},
				)

				if (closest) {
					scrollStrategy = undefined
					break
				}
			}
		} else {
			closest = getClosestElement(currEl, candidates, relativeOptions)
		}

		if (!closest) {
			noRelativeCallback?.(this.getInfo({internal: true}))
			return
		}

		const previousIndex = elements.indexOf(closest)

		this.highlight(previousIndex, previousIndex, {
			scroll: scrollStrategy,
		})
	}

	/**
	 * Highlight next element after the currently highlighted one.
	 *
	 * It uses the navigation style you set in the global options
	 * unless you override it here.
	 */
	next(motionOptions?: DeepPartial<MotionOptions>) {
		const options: MotionOptions = {
			...motionOptions,
			navigationStyle:
				motionOptions?.navigationStyle ?? this.#options.navigationStyle,
			step: motionOptions?.step ?? 1,

			fastTravel: {
				...fastTravelDefaults,
				...this.#options.fastTravel,
				...motionOptions?.fastTravel,
			},

			relativeOptions: {
				...defaultRelativeOptions,
				...this.#options.relativeOptions,
				anchor: Anchor.CENTER_RIGHT,
				...motionOptions?.relativeOptions,
				dig: {
					...defaultRelativeOptions.dig,
					...this.#options.relativeOptions.dig,
					...motionOptions?.relativeOptions?.dig,
				},
			},

			noRelativeCallback: motionOptions?.noRelativeCallback,
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
			// console.log({
			// 	navigationStyle,
			// 	step,
			// 	noRelativeCallback,
			// 	relativeOptions,
			// 	fastTravel,
			// })
		}

		const {elements, highlightIndexStart, highlightIndexEnd} = this.getInfo({
			internal: true,
		})

		let scrollStrategy = this.#options.scroll

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

		const len = elements.length
		if (len === 0) {
			this.highlight(-1)
			return
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
						this.highlight(i, i, {scroll: undefined})
						break
					}
				}

				// if (found) {
				// 	const i = elements.indexOf(found)
				// 	this.highlight(i, i, {scroll: undefined})
				// 	return
				// }
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
		const currIsAfterScreen = currRect.left > window.innerWidth
		const currAnchorPoint = getAnchorPoint(
			currRect,
			options.relativeOptions.anchor,
		)

		let shouldFastTravel =
			options.fastTravel &&
			!currIsVisible &&
			(currIsAboveScreen || (currIsBeforeScreen && !currIsBelowScreen))

		if (
			options.navigationStyle === 'index-based' ||
			// That's for delegating the fast travel to index-based when it is unecessary to use relative motion
			(options.navigationStyle === 'relative-to' &&
				shouldFastTravel &&
				options.fastTravel!.relativeResolution ===
					RelativeResolution.INDEX_BASED_FALLBACK &&
				!(currAnchorPoint.y > 0 && currAnchorPoint.y < window.innerHeight))
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
						scrollStrategy = undefined
						nextIndex = elements.indexOf(found)
						break
					}
				}

				// if (found) {
				// 	scrollStrategy = undefined
				// 	nextIndex = elements.indexOf(found)
				// }
			}

			if (nextIndex === -1) {
				nextIndex = this.#options.loop
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
		let closest: HTMLElement | undefined

		if (shouldFastTravel) {
			switch (options.fastTravel!.relativeResolution) {
				case RelativeResolution.INDEX_BASED_FALLBACK:
					break
				case RelativeResolution.CLOSEST:
					for (const check of fastTravelChecks!) {
						closest = getClosestElement(
							currEl,
							candidates.filter((el) => visibilityCheck(el, check)),
							{
								...options.relativeOptions,
								fromRectOverride: {
									left: 0,
									right: 10,
								},
								dig: {untilOffscreen: true},
							},
						)

						if (closest) {
							scrollStrategy = undefined
							break
						}
					}
					break
			}
		} else {
			closest = getClosestElement(currEl, candidates, options.relativeOptions)
		}

		if (!closest) {
			options.noRelativeCallback?.(this.getInfo({internal: true}))
			return
		}

		const nextIndex = elements.indexOf(closest)

		this.highlight(nextIndex, nextIndex, {
			scroll: scrollStrategy,
		})
	}

	up(options?: {
		/**
		 * Navigation style to use for this call.
		 *
		 * @default this.#options.navigationStyle
		 */
		navigationStyle?: 'index-based' | 'relative-to'

		/**
		 * Only for "index-based" mode.
		 *
		 * @default 1
		 */
		step?: number

		/**
		 * Only for "relative-to" mode.
		 */
		relativeOptions?: Partial<
			Omit<GetClosestElementOptions, 'anchor'> & {
				/**
				 * Anchor point of the reference element from which to calculate the
				 * distance to candidate elements.
				 *
				 * @default Anchor.TOP_CENTER
				 */
				anchor: Anchor
			}
		>

		/**
		 * Only for "relative-to" mode.
		 *
		 * A callback to execute in case no relative element was found.
		 */
		noRelativeCallback?: (info: HighlightInfo) => void
	}) {
		const {
			navigationStyle = this.#options.navigationStyle,
			step = 1,
			noRelativeCallback,
		} = options ?? {}

		if (navigationStyle === 'index-based') {
			this.previous(options)
			return
		}

		const relativeOptions: GetClosestElementOptions = {
			...defaultRelativeOptions,
			...this.#options.relativeOptions,
			anchor: Anchor.TOP_CENTER,
			...options?.relativeOptions,
		}
		if (relativeOptions.debug) {
			console.log(relativeOptions)
		}

		const {elements, highlightIndexStart, highlightIndexEnd} = this.getInfo({
			internal: true,
		})

		let scrollStrategy = this.#options.scroll

		let fastTravelChecks: CheckIf[] | undefined
		if (this.#options.fastTravel) {
			fastTravelChecks = this.#options.fastTravel.toElementThat
				? Array.isArray(this.#options.fastTravel.toElementThat)
					? this.#options.fastTravel.toElementThat
					: [this.#options.fastTravel.toElementThat]
				: []

			if (this.#options.fastTravel.fallback) {
				fastTravelChecks = [
					...fastTravelChecks,
					this.#options.fastTravel.fallback,
				]
			}
		}

		const len = elements.length
		if (len === 0) {
			this.highlight(-1)
			return
		}

		// const currIndex =
		// 	highlightIndexStart !== highlightIndexEnd
		// 		? highlightIndexStart + 1
		// 		: highlightIndexStart
		const currIndex =
			highlightIndexStart !== highlightIndexEnd
				? Math.floor((highlightIndexStart + highlightIndexEnd) / 2)
				: highlightIndexStart

		if (currIndex === -1) {
			if (fastTravelChecks) {
				let found: HTMLElement | undefined

				for (const check of fastTravelChecks) {
					found = elements.findLast((el) => visibilityCheck(el, check))

					if (found) {
						const i = elements.indexOf(found)
						this.highlight(i, i, {scroll: undefined})
						return
					}
				}

				// if (found) {
				// 	const i = elements.indexOf(found)
				// 	this.highlight(i, i, {scroll: undefined})
				// 	return
				// }
			}

			this.highlight(this.#options.loop ? len - 1 : 0)
			return
		}

		const currEl = elements[currIndex]!
		const currIsVisible = isInViewport(currEl)
		const currRect = currEl.getBoundingClientRect()
		const currIsBelowOrAfter =
			currRect.top > window.innerHeight || currRect.left > window.innerWidth

		const alsoSelectXElementsAfter = 10 // you can tweak this
		const candidates = elements.slice(
			0,
			currIndex + 1 + alsoSelectXElementsAfter,
		)
		// TODO: probably should exclude the element itself?
		let closest: HTMLElement | undefined

		if (fastTravelChecks && !currIsVisible && currIsBelowOrAfter) {
			if (!relativeOptions.outerOffset && !relativeOptions.dig.step) {
				throw new Error(
					'Either outerOffset or dig.step must be set to fast travel in relative-to mode.',
				)
			}
			for (const check of fastTravelChecks) {
				closest = getClosestElement(
					currEl,
					candidates.filter((el) => visibilityCheck(el, check)),
					{
						...relativeOptions,
						fromRectOverride: {
							top: window.innerHeight - 10,
							bottom: window.innerHeight,
						},
						dig: {
							...relativeOptions.dig,
							count: 500,
							// window.innerHeight /
							// (relativeOptions.outerOffset || relativeOptions.dig.step),
						},
					},
				)

				if (closest) {
					scrollStrategy = undefined
					break
				}
			}
		} else {
			closest = getClosestElement(currEl, candidates, relativeOptions)
		}

		if (!closest) {
			noRelativeCallback?.(this.getInfo({internal: true}))
			return
		}

		const previousIndex = elements.indexOf(closest)

		this.highlight(previousIndex, previousIndex, {
			scroll: scrollStrategy,
		})
	}

	// down(options?: {
	// 	/**
	// 	 * Navigation style to use for this call.
	// 	 *
	// 	 * @default this.#options.navigationStyle
	// 	 */
	// 	navigationStyle?: 'index-based' | 'relative-to'
	//
	// 	/**
	// 	 * Only for "index-based" mode.
	// 	 *
	// 	 * @default 1
	// 	 */
	// 	step?: number
	//
	// 	/**
	// 	 * Only for "relative-to" mode.
	// 	 */
	// 	relativeOptions?: Omit<GetClosestElementOptions, 'anchor'> & {
	// 		/**
	// 		 * Anchor point of the reference element from which to calculate the
	// 		 * distance to candidate elements.
	// 		 *
	// 		 * @default Anchor.BOTTOM_CENTER
	// 		 */
	// 		anchor: Anchor
	// 	}
	//
	// 	/**
	// 	 * Only for "relative-to" mode.
	// 	 *
	// 	 * A callback to execute in case no relative element was found.
	// 	 */
	// 	noRelativeCallback?: (info: hlm.HighlightInfo) => void
	// }) {
	// 	const {
	// 		navigationStyle = this.#options.navigationStyle,
	// 		step = 1,
	// 		noRelativeCallback,
	// 	} = options ?? {}
	//
	// 	if (navigationStyle === 'index-based') {
	// 		this.next(options)
	// 		return
	// 	}
	//
	// 	const relativeOptions: GetClosestElementOptions = {
	// 		...defaultRelativeOptions,
	// 		...this.#options.relativeOptions,
	// 		anchor: Anchor.BOTTOM_CENTER,
	// 		...options?.relativeOptions,
	// 	}
	// 	if (relativeOptions.debug) {
	// 		console.log(relativeOptions)
	// 	}
	//
	// 	const {elements, highlightIndexStart, highlightIndexEnd} = this.getInfo({
	// 		internal: true,
	// 	})
	//
	// 	let scrollStrategy = this.#options.scroll
	//
	// 	let fastTravelChecks: CheckIf[] | undefined
	// 	if (this.#options.fastTravel) {
	// 		fastTravelChecks = this.#options.fastTravel.toElementThat
	// 			? Array.isArray(this.#options.fastTravel.toElementThat)
	// 				? this.#options.fastTravel.toElementThat
	// 				: [this.#options.fastTravel.toElementThat]
	// 			: []
	//
	// 		if (this.#options.fastTravel.fallback) {
	// 			fastTravelChecks = [
	// 				...fastTravelChecks,
	// 				this.#options.fastTravel.fallback,
	// 			]
	// 		}
	// 	}
	//
	// 	const len = elements.length
	// 	if (len === 0) {
	// 		this.highlight(-1)
	// 		return
	// 	}
	//
	// 	// const currIndex =
	// 	// 	highlightIndexStart !== highlightIndexEnd
	// 	// 		? highlightIndexEnd - 1
	// 	// 		: highlightIndexEnd
	// 	const currIndex =
	// 		highlightIndexStart !== highlightIndexEnd
	// 			? Math.floor((highlightIndexStart + highlightIndexEnd) / 2)
	// 			: highlightIndexEnd
	//
	// 	if (currIndex === -1) {
	// 		if (fastTravelChecks) {
	// 			let found: HTMLElement | undefined
	//
	// 			for (const check of fastTravelChecks) {
	// 				found = elements.find((el) => visibilityCheck(el, check))
	//
	// 				if (found) {
	// 					const i = elements.indexOf(found)
	// 					this.highlight(i, i, {scroll: undefined})
	// 					break
	// 				}
	// 			}
	//
	// 			// if (found) {
	// 			// 	const i = elements.indexOf(found)
	// 			// 	this.highlight(i, i, {scroll: undefined})
	// 			// 	return
	// 			// }
	// 		}
	//
	// 		this.highlight(0)
	// 		return
	// 	}
	//
	// 	const currEl = elements[currIndex]!
	// 	const currIsVisible = isInViewport(currEl)
	// 	const currRect = currEl.getBoundingClientRect()
	// 	const currIsAboveScreen = currRect.bottom < 0
	// 	const currIsBeforeScreen = currRect.right < 0
	// 	const currIsBelowScreen = currRect.top > window.innerHeight
	// 	const currIsAfterScreen = currRect.left > window.innerWidth
	// 	const currAnchorPoint = getAnchorPoint(currRect, relativeOptions.anchor)
	//
	// 	let shouldFastTravel =
	// 		fastTravelChecks &&
	// 		!currIsVisible &&
	// 		(currIsAboveScreen || (currIsBeforeScreen && !currIsBelowScreen))
	//
	// 	if (
	// 		// That's for delegating the fast travel to index-based when it is unecessary to use relative motion
	// 		(navigationStyle === 'relative-to' &&
	// 			shouldFastTravel &&
	// 			currIsAboveScreen) ||
	// 		(currIsAboveScreen &&
	// 			!(currAnchorPoint.x > 0 && currAnchorPoint.x < window.innerWidth))
	// 	) {
	// 		if (relativeOptions.debug) {
	// 			console.log('DELEGATING FAST TRAVEL TO INDEX-BASED')
	// 		}
	// 		this.next({
	// 			navigationStyle: 'index-based',
	// 			...options,
	// 		})
	//
	// 		if (shouldFastTravel) {
	// 			const candidates = elements.slice(currIndex + 1)
	// 			let found: HTMLElement | undefined
	//
	// 			for (const check of fastTravelChecks!) {
	// 				found = candidates.find((el) => visibilityCheck(el, check))
	//
	// 				if (found) {
	// 					scrollStrategy = undefined
	// 					nextIndex = elements.indexOf(found)
	// 					break
	// 				}
	// 			}
	//
	// 			// if (found) {
	// 			// 	scrollStrategy = undefined
	// 			// 	nextIndex = elements.indexOf(found)
	// 			// }
	// 		}
	//
	// 		if (nextIndex === -1) {
	// 			nextIndex = this.#options.loop
	// 				? (currIndex + step) % len
	// 				: Math.min(len - 1, currIndex + step)
	// 		}
	//
	// 		this.highlight(nextIndex, nextIndex, {
	// 			scroll: scrollStrategy,
	// 		})
	// 		return
	// 	}
	//
	// 	const alsoSelectXElementsBehind = 10 // you can tweak this
	// 	const candidates = elements.slice(
	// 		Math.max(0, currIndex - alsoSelectXElementsBehind),
	// 	)
	// 	// TODO: probably should exclude the element itself?
	// 	let closest: HTMLElement | undefined
	//
	// 	if (shouldFastTravel) {
	// 		for (const check of fastTravelChecks!) {
	// 			closest = getClosestElement(
	// 				currEl,
	// 				candidates.filter((el) => visibilityCheck(el, check)),
	// 				{
	// 					...relativeOptions,
	// 					fromRectOverride: {
	// 						left: 0,
	// 						right: 10,
	// 					},
	// 					dig: {untilOffscreen: true},
	// 				},
	// 			)
	//
	// 			if (closest) {
	// 				scrollStrategy = undefined
	// 				break
	// 			}
	// 		}
	// 	} else {
	// 		closest = getClosestElement(currEl, candidates, relativeOptions)
	// 	}
	//
	// 	if (!closest) {
	// 		noRelativeCallback?.(this.getInfo({internal: true}))
	// 		return
	// 	}
	//
	// 	const nextIndex = elements.indexOf(closest)
	//
	// 	this.highlight(nextIndex, nextIndex, {
	// 		scroll: scrollStrategy,
	// 	})
	// }

	extendLeftHighlight(step = 1) {
		const {highlightIndexStart, highlightIndexEnd} = this.getInfo({
			internal: true,
		})
		const newStart = Math.max(0, highlightIndexStart - step)
		this.highlight(newStart, highlightIndexEnd, {unhighlightAll: false})
	}
	reduceLeftHighlight(step = 1) {
		const {elements, highlightIndexStart, highlightIndexEnd} = this.getInfo({
			internal: true,
		})
		// TODO: should prob change the min to end index
		const newStart = Math.min(elements.length - 1, highlightIndexStart + step)
		this.highlight(newStart, highlightIndexEnd)
	}

	extendRightHighlight(step = 1) {
		const {elements, highlightIndexStart, highlightIndexEnd} = this.getInfo({
			internal: true,
		})
		const newEnd = Math.min(elements.length - 1, highlightIndexEnd + step)
		this.highlight(highlightIndexStart, newEnd, {unhighlightAll: false})
	}

	reduceRightHighlight(step = 1) {
		const {highlightIndexStart, highlightIndexEnd} = this.getInfo({
			internal: true,
		})
		// TODO: should prob change the max to end index
		const newEnd = Math.max(0, highlightIndexEnd - step)
		this.highlight(highlightIndexStart, newEnd)
	}

	highlightLast() {
		const {elements} = this.getInfo({internal: true})

		if (elements.length === 0) {
			this.highlight(-1, -1)
			return
		}

		this.highlight(elements.length - 1, elements.length - 1)
	}

	setLoop(value: boolean) {
		this.#options.loop = value
	}
}

/**
 * Deprecated alias, use `HighlightManager` instead
 *
 * dev note: It was a casing mistake.
 *
 * @deprecated
 */
export class HighLightManager<
	TOptions = {},
> extends HighlightManager<TOptions> {}

export {Anchor, ScrollStrategy}
