import {$$} from 'html-vision/queries.js'
import {
	scrollIntoView,
	ScrollStrategy,
	scrollStrategyDefaults,
} from 'html-vision/scroll.js'
import {CheckIf, isInViewport, visibilityCheck} from 'html-vision/visibility.js'
import {
	Anchor,
	defaultRelativeOptions,
	getClosestElement,
	GetClosestElementOptions,
} from './relative-selection.js'
import {hlm} from './types.js'
import {sleep} from './utils.js'

const fastTravelDefaults: hlm.FastTravelOptions = {
	toElementThat: (is) => is('fully-visible'),
	fallback: (is) => is('partially-visible'),
}

const defaults: hlm.Options<any> = {
	atomicSelection(_element) {
		return true
	},
	// css: 'background-color: #cddc39a1 !important; color: black !important',
	// css: 'background-color: var(--md-sys-color-surface-container-highest) !important; color: var(--md-sys-color-on-surface) !important',
	css: 'background-color: var(--md-sys-color-primary-container) !important; color: var(--md-sys-color-on-primary-container) !important',
	// css: 'background-color: var(--md-sys-color-primary) !important; color: var(--md-sys-color-on-primary) !important',
	// css: 'background-color: var(--md-sys-color-outline-variant) !important; color: var(--md-sys-color-on-surface) !important',
	highlightTextColor: 'var(--md-sys-color-on-primary-container)',
	navigationStyle: 'index-based',
	relativeOptions: defaultRelativeOptions,
	loop: false,
	beforeHighlight: undefined,
	onSelectionChange: undefined,
	applyStyleSheetTo: document,
	scroll: undefined,
	fastTravel: fastTravelDefaults,
	focusElementOnHighlight: false,
} // satisfies Omit<Options<any>, 'getInfoMiddleware'>

// Local array of all declared highlighters for id control.
const highlighters: HighlightManager<any>[] = []

let globalBeforeHighlight: (() => void) | undefined
export function setGlobalBeforeHighlight(fct: () => void) {
	globalBeforeHighlight = fct
}

export class HighlightManager<T = {}> {
	#options: hlm.Options<T>

	#ss: CSSStyleSheet

	#id: number

	constructor(
		protected selector: string,
		options?: Partial<
			Omit<hlm.Options<T>, 'scroll' | 'fastTravel' | 'relativeOptions'> & {
				/**
				 * These options are merged with the defaults.
				 * Set to `true` to use all defaults.
				 *
				 * @default false
				 */
				scroll: Partial<hlm.Options<T>['scroll']> | boolean
				/**
				 * These options are merged with the defaults.
				 * Set to `true` to use all defaults.
				 *
				 * @default true
				 */
				fastTravel: Partial<hlm.Options<T>['fastTravel']> | boolean

				/**
				 * Global options to use in "relative-to" mode.
				 *
				 * These options are merged with the defaults
				 */
				relativeOptions: Partial<Omit<GetClosestElementOptions, 'anchor'>>
			}
		>,
	) {
		this.#id = highlighters.push(this)
		this.#options = {
			...defaults,
			...options,
			...(!options || !('scroll' in options) || options.scroll === false
				? {scroll: undefined}
				: {
						scroll: {
							...scrollStrategyDefaults,
							...(options.scroll === true ? {} : options.scroll),
						},
					}),
			...(!options || ('fastTravel' in options && options.fastTravel === false)
				? {fastTravel: undefined}
				: {
						fastTravel: {
							...fastTravelDefaults,
							...(options.fastTravel === true ? {} : options.fastTravel),
						},
					}),
			relativeOptions: {
				...defaultRelativeOptions,
				...(options?.relativeOptions ?? {}),
			},
		}

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

		// if (this.#options.scroll) {
		// 	this.#options.scroll = {
		// 		...scrollStrategyDefaults,
		// 		...this.#options.scroll,
		// 	}
		// }
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
	): hlm.HighlightInfo & T {
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

		const base: hlm.HighlightInfo = {
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
		options?: Partial<hlm.HighlightOptions>,
	): boolean {
		const _options: hlm.HighlightOptions = {
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
		relativeOptions?: Partial<GetClosestElementOptions>

		/**
		 * Only for "relative-to" mode.
		 *
		 * A callback to execute in case no relative element was found.
		 */
		noRelativeCallback?: (info: hlm.HighlightInfo) => void
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
						break
					}
				}

				if (found) {
					const i = elements.indexOf(found)
					this.highlight(i, i, {scroll: undefined})
					return
				}
			}

			this.highlight(this.#options.loop ? len - 1 : 0)
			return
		}

		const currEl = elements[currIndex]!

		if (navigationStyle === 'index-based') {
			const currIsVisible = isInViewport(currEl)

			const currIsBelow =
				currEl.getBoundingClientRect().top > window.innerHeight

			let previousIndex = -1

			if (fastTravelChecks && !currIsVisible && currIsBelow) {
				const candidates = elements.slice(0, currIndex).reverse()
				let found: HTMLElement | undefined

				for (const check of fastTravelChecks) {
					found = candidates.find((el) => visibilityCheck(el, check))

					if (found) {
						break
					}
				}

				if (found) {
					scrollStrategy = undefined
					previousIndex = elements.indexOf(found)
				}
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

		const closest = getClosestElement(
			currEl,
			elements.slice(0, currIndex),
			relativeOptions,
		)

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
	next(options?: {
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
		relativeOptions?: Partial<GetClosestElementOptions>

		/**
		 * Only for "relative-to" mode.
		 *
		 * A callback to execute in case no relative element was found.
		 */
		noRelativeCallback?: (info: hlm.HighlightInfo) => void
	}) {
		const {
			navigationStyle = this.#options.navigationStyle,
			step = 1,
			noRelativeCallback,
		} = options ?? {}

		const relativeOptions: GetClosestElementOptions = {
			...defaultRelativeOptions,
			...this.#options.relativeOptions,
			anchor: Anchor.CENTER_RIGHT,
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
						break
					}
				}

				if (found) {
					const i = elements.indexOf(found)
					this.highlight(i, i, {scroll: undefined})
					return
				}
			}

			this.highlight(0)
			return
		}

		const currEl = elements[currIndex]!

		if (navigationStyle === 'index-based') {
			const currIsVisible = isInViewport(currEl)

			const currIsAbove = currEl.getBoundingClientRect().bottom < 0

			let nextIndex = -1

			if (fastTravelChecks && !currIsVisible && currIsAbove) {
				const candidates = elements.slice(currIndex + 1)
				let found: HTMLElement | undefined

				for (const check of fastTravelChecks) {
					found = candidates.find((el) => visibilityCheck(el, check))

					if (found) {
						break
					}
				}

				if (found) {
					scrollStrategy = undefined
					nextIndex = elements.indexOf(found)
				}
			}

			if (nextIndex === -1) {
				nextIndex = this.#options.loop
					? (currIndex + step) % len
					: Math.min(len - 1, currIndex + step)
			}

			this.highlight(nextIndex, nextIndex, {
				scroll: scrollStrategy,
			})
			return
		}

		const closest = getClosestElement(
			currEl,
			elements.slice(currIndex + 1),
			relativeOptions,
		)

		if (!closest) {
			noRelativeCallback?.(this.getInfo({internal: true}))
			return
		}

		const nextIndex = elements.indexOf(closest)

		this.highlight(nextIndex, nextIndex, {
			scroll: scrollStrategy,
		})
	}

	top(options?: {
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
		relativeOptions?: Partial<GetClosestElementOptions>

		/**
		 * Only for "relative-to" mode.
		 *
		 * A callback to execute in case no relative element was found.
		 */
		noRelativeCallback?: (info: hlm.HighlightInfo) => void
	}) {
		this.previous({
			...options,
			relativeOptions: {
				anchor: Anchor.TOP_CENTER,
				...options?.relativeOptions,
			},
		})
	}

	bottom(options?: {
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
		relativeOptions?: Partial<GetClosestElementOptions>

		/**
		 * Only for "relative-to" mode.
		 *
		 * A callback to execute in case no relative element was found.
		 */
		noRelativeCallback?: (info: hlm.HighlightInfo) => void
	}) {
		this.next({
			...options,
			relativeOptions: {
				anchor: Anchor.BOTTOM_CENTER,
				...options?.relativeOptions,
			},
		})
	}

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

export {ScrollStrategy}
export {Anchor}
