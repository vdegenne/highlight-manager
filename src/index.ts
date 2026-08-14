import {$$} from 'html-vision/queries.js'
import {
	scrollIntoView,
	ScrollStrategy,
	scrollStrategyDefaults,
} from 'html-vision/scroll.js'
import {fastTravelDefaults} from './fast-travel.js'
import {down} from './motions/down.js'
import {next} from './motions/next.js'
import {previous} from './motions/previous.js'
import {up} from './motions/up.js'
import {
	defaultOptions,
	NavigationStyle,
	Options,
	OptionsInput,
	WithMedianBreak,
} from './options.js'
import {
	Anchor,
	defaultRelativeOptions,
	getClosestElement,
	GetClosestElementOptions,
	WithAnchorOption,
	WithRectOverrideOption,
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
	protected _options: Options<T>

	#ss: CSSStyleSheet

	#id: number

	constructor(
		protected selector: string,
		options?: OptionsInput<T>,
	) {
		this.#id = highlighters.push(this)

		this._options = {
			...defaultOptions,
			...options,
			...(!options || !('scroll' in options) /* || options.scroll === false */
				? {scroll: undefined}
				: {
						scroll: {
							...scrollStrategyDefaults,
							.../*options.scroll === true ? {} : */ options.scroll,
						},
					}),
			...(!options ||
			!('fastTravel' in options) /* && options.fastTravel === false*/
				? {fastTravel: undefined}
				: {
						fastTravel: {
							...fastTravelDefaults,
							.../*options.fastTravel === true ? {} : */ options.fastTravel,
						},
					}),
			relativeOptions: {
				...defaultRelativeOptions,
				...(options?.relativeOptions ?? {}),
				dig: {
					...defaultRelativeOptions.dig,
					...options?.relativeOptions?.dig,
				},
			},
		}

		// this.#options = mergeOptions(defaultOptions, options)
		console.log(this._options)

		/* stylesheet */
		this.#ss = new CSSStyleSheet()
		let applyTo: Document | ShadowRoot // element to apply stylesheet to
		if (
			this._options.applyStyleSheetTo === document.documentElement ||
			!(this._options.applyStyleSheetTo instanceof HTMLElement) ||
			this._options.applyStyleSheetTo.shadowRoot === null
		) {
			applyTo = document
		} else {
			applyTo = (this._options.applyStyleSheetTo as HTMLElement).shadowRoot!
		}
		applyTo.adoptedStyleSheets.push(this.#ss)
		// this.#ss.replaceSync(`[highlight] {${css}}`);
		this.replaceCSS(this._options.css)
	}

	replaceCSS(css: string) {
		this._options.css = css
		this.#ss.replaceSync(
			`[highlight${this.#id}] {${css}} [highlight${this.#id}]:hover {${css}} [highlight${this.#id}] * {color: ${this._options.highlightTextColor} !important;}`,
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
			this._options.atomicSelection(el, i),
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
			extra = this._options.getInfoMiddleware?.(base) ?? ({} as T)
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
		this._options.beforeHighlight?.()
		// playClick()

		if (_options.unhighlightAll) {
			this.unhighlightAll(elements)
		}

		const elementsToHighlight = elements.slice(start, end + 1)
		if (elementsToHighlight.length === 0) {
			return false
		}

		const scrollStrategy =
			'scroll' in _options ? _options.scroll : this._options.scroll
		if (scrollStrategy) {
			scrollIntoView(elementsToHighlight[0]!, scrollStrategy)
		}

		elementsToHighlight.forEach((el) =>
			el.setAttribute(`highlight${this.#id}`, ''),
		)
		// elements[index]?.setAttribute('highlight', '');
		if (this._options.focusElementOnHighlight) {
			elementsToHighlight[elementsToHighlight.length - 1]!.focus({
				preventScroll: true,
				// focusVisible: false
			})
		}

		if (this._options.onSelectionChange) {
			this._options.onSelectionChange(this.getInfo({internal: true}))
		}

		return true
	}

	relativeMotion(
		options: DeepPartial<
			GetClosestElementOptions & WithRectOverrideOption & WithMedianBreak
		> &
			WithAnchorOption & {
				// noRelativeCallback?: (info: HighlightInfo) => void
			},
	): boolean {
		const {elements, highlightElement, highlightIndexStart, highlightIndexEnd} =
			this.getInfo({internal: true})

		let currIndex: number
		if (highlightIndexStart !== highlightIndexEnd) {
			if (options.medianBreak) {
				currIndex = Math.floor((highlightIndexStart + highlightIndexEnd) / 2)
			} else {
				switch (options.anchor) {
					case Anchor.TOP_LEFT:
					case Anchor.CENTER_LEFT:
					case Anchor.BOTTOM_LEFT:
						currIndex = highlightIndexStart
						break

					case Anchor.TOP_CENTER:
					case Anchor.CENTER:
					case Anchor.BOTTOM_CENTER:
						if (options.medianBreak === false) {
							// It's in the middle, so we can't really determine.
							// Assume default.
							currIndex = highlightIndexStart
						} else {
							currIndex = Math.floor(
								(highlightIndexStart + highlightIndexEnd) / 2,
							)
						}
						break

					case Anchor.TOP_RIGHT:
					case Anchor.CENTER_RIGHT:
					case Anchor.BOTTOM_RIGHT:
						currIndex = highlightIndexEnd
						break
				}
			}
		} else {
			currIndex = highlightIndexStart
		}

		const orderedElements = elements
			.slice()
			.sort(
				(a, b) =>
					Math.abs(elements.indexOf(a) - currIndex) -
					Math.abs(elements.indexOf(b) - currIndex),
			)

		const found = getClosestElement(highlightElement, orderedElements, {
			...defaultRelativeOptions,
			...this._options.relativeOptions,
			...options,
			dig: {
				...defaultRelativeOptions.dig,
				...this._options.relativeOptions.dig,
				...options?.dig,
			},
		})

		if (found) {
			this.highlight(elements.indexOf(found))
			return true
		}

		// options.noRelativeCallback?.(this.getInfo({internal: true}))
		return false
	}

	/**
	 * Highlight previous element prior to the currently highlighted one.
	 *
	 * It uses the navigation style you set in the global options
	 * unless you override it here.
	 */
	previous = previous.bind(this)
	next = next.bind(this)
	up = up.bind(this)
	down = down.bind(this)

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
		this._options.loop = value
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

export {Anchor, NavigationStyle, ScrollStrategy}
