import {querySelectorAll} from 'html-vision'
import {isInViewport, IsInViewportPartCheck, sleep} from './utils.js'

interface Info {
	elements: HTMLElement[]
	// /**
	//  * @deprecated Use highlightIndexStart and highlightIndexEnd instead
	//  */
	// highlightIndex: number;
	highlightIndexStart: number
	highlightIndexEnd: number
	///**
	// * @deprecated Use highlightElements instead
	// */
	highlightElements: HTMLElement[]
	/**
	 * First element of highlightElements if there is one
	 */
	highlightElement: HTMLElement | undefined
	highlightContent: string | undefined
}

interface ScrollStrategy {
	/**
	 * @default 'center'
	 */
	whenWhatPartIsHidden: IsInViewportPartCheck
	/**
	 * @default 'smooth'
	 */
	behavior: ScrollBehavior
	/**
	 * @default undefined
	 */
	block: ScrollLogicalPosition | undefined
	/**
	 * @default undefined
	 */
	inline: ScrollLogicalPosition | undefined
}
const scrollStrategyDefaults: ScrollStrategy = {
	whenWhatPartIsHidden: 'center',
	behavior: 'smooth',
	block: undefined,
	inline: undefined,
}

interface Options {
	css: string
	highlightTextColor: string

	/**
	 * @default true
	 */
	loop: boolean
	/**
	 * A function for extra selection if selector is not enough
	 * and need a way to filter elements based on properties.
	 * Return false if you want to keep an element out of the bag.
	 */
	atomicSelection: (element: HTMLElement, i: number) => boolean
	beforeHighlight: (() => void) | undefined
	onSelectionChange: ((info: Info) => void) | undefined

	/**
	 * By default the stylesheet for selection is applied to the main document.
	 * Which means won't highlight elements in shadow doms.
	 * You can target the element to give the stylesheet to.
	 * If the given element has no shadow dom, it will fail silently.
	 */
	applyStyleSheetTo: Document | HTMLElement | ShadowRoot

	/**
	 * Set to at least `{}` to activate scrolling when offscreen
	 *
	 * @default undefined
	 */
	scrollStrategy: Partial<ScrollStrategy> | undefined

	/**
	 * If true, will select the next visible candidate if the highlight is offscreen.
	 *
	 * @default false
	 */
	fastTravel: boolean
}

const defaults: Options = {
	atomicSelection(_element) {
		return true
	},
	// css: 'background-color: #cddc39a1 !important; color: black !important',
	// css: 'background-color: var(--md-sys-color-surface-container-highest) !important; color: var(--md-sys-color-on-surface) !important',
	css: 'background-color: var(--md-sys-color-primary-container) !important; color: var(--md-sys-color-on-primary-container) !important',
	// css: 'background-color: var(--md-sys-color-primary) !important; color: var(--md-sys-color-on-primary) !important',
	// css: 'background-color: var(--md-sys-color-outline-variant) !important; color: var(--md-sys-color-on-surface) !important',
	highlightTextColor: 'var(--md-sys-color-on-primary-container)',
	loop: true,
	beforeHighlight: undefined,
	onSelectionChange: undefined,
	applyStyleSheetTo: document,
	scrollStrategy: undefined,
	fastTravel: false,
}

// Local array of all declared highlighters for id control.
const highlighters: HighLightManager[] = []

let globalBeforeHighlight: (() => void) | undefined
export function setGlobalBeforeHighlight(fct: () => void) {
	globalBeforeHighlight = fct
}

interface HighlightOptions {
	scrollStrategy: Partial<ScrollStrategy> | undefined
}

export class HighLightManager {
	#cache: Info = {
		elements: [],
		// highlightIndex: -1,
		highlightIndexStart: -1,
		highlightIndexEnd: -1,
		// highlightElement: undefined,
		highlightElements: [],
		highlightElement: undefined,
		highlightContent: undefined,
	}
	#options: Options

	#ss: CSSStyleSheet

	#id: number

	constructor(
		protected selector: string,
		options?: Partial<Options>,
	) {
		this.#id = highlighters.push(this)
		this.#options = {...defaults, ...options}

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
		| PromiseWithResolvers<HTMLElement>
		| undefined

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
				const els = querySelectorAll(this.selector)
				const el = els[index]

				if (el) {
					this.highlight(
						index,
						index,
						true,
						false,
						// TODO: This should be uncommented?
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

	getInfo(cache = false): Info {
		if (cache) {
			return this.#cache
		}
		// console.log(this.selector)
		const elements = querySelectorAll<HTMLElement>(this.selector).filter(
			(el, i) => this.#options.atomicSelection(el, i),
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

		return (this.#cache = {
			elements,
			// highlightIndex,
			highlightIndexStart,
			highlightIndexEnd,
			highlightElements,
			highlightElement: highlightElements[0],
			highlightContent,
		})
	}

	unhighlightAll(elements?: HTMLElement[], cache = true) {
		if (!elements) {
			elements = this.getInfo(cache).elements
		}
		elements.forEach((el) => el.removeAttribute(`highlight${this.#id}`))
	}

	highlightAll(cache = false) {
		const {elements} = this.getInfo(cache)
		this.highlight(0, elements.length - 1, false, cache)
	}
	// alias
	selectAll = this.highlightAll.bind(this)

	/**
	 * @returns {boolean} true if the highlight succeeded, false otherwise.
	 */
	highlight(
		start: number,
		end?: number,
		unhighlightAll = true,
		cache = false,
		options: Partial<HighlightOptions> = {},
	): boolean {
		if (end === undefined) {
			end = start
		}

		if (start > end) {
			return false
			// const tmp = start
			// start = end
			// end = tmp
		}

		const {elements, highlightIndexStart, highlightIndexEnd} =
			this.getInfo(cache)
		// console.log(elements)

		if (highlightIndexStart === start && highlightIndexEnd === end) {
			return false
		}
		// console.log(highlightIndexStart, highlightIndexEnd, start, end)

		const _options: HighlightOptions = {
			scrollStrategy:
				options?.scrollStrategy || this.#options.scrollStrategy
					? {
							...scrollStrategyDefaults,
							...this.#options.scrollStrategy,
							...options?.scrollStrategy,
						}
					: undefined,
		}

		globalBeforeHighlight?.()
		this.#options.beforeHighlight?.()
		// playClick()

		if (unhighlightAll) {
			this.unhighlightAll(elements, cache)
		}

		const elementsToHighlight = elements.slice(start, end + 1)
		if (elementsToHighlight.length === 0) {
			return false
		}

		if (
			_options.scrollStrategy &&
			!isInViewport(
				elementsToHighlight[0]!,
				_options.scrollStrategy.whenWhatPartIsHidden,
			)
		) {
			elementsToHighlight[0]?.scrollIntoView({
				behavior: _options.scrollStrategy.behavior,
				block: _options.scrollStrategy.block,
				inline: _options.scrollStrategy.block,
			})
		}

		elementsToHighlight.forEach((el) =>
			el.setAttribute(`highlight${this.#id}`, ''),
		)
		// elements[index]?.setAttribute('highlight', '');

		if (this.#options.onSelectionChange) {
			this.#options.onSelectionChange(this.getInfo(false))
		}

		return true
	}

	previous(step = 1, cache = false) {
		const {elements, highlightIndexStart, highlightIndexEnd} =
			this.getInfo(cache)

		const len = elements.length
		if (len === 0) {
			this.highlight(-1, -1, true, cache)
			return
		}

		const currIndex =
			highlightIndexStart !== highlightIndexEnd
				? highlightIndexStart
				: highlightIndexStart

		if (currIndex === -1) {
			if (this.#options.fastTravel) {
				const found = [...elements].reverse().find((el) => isInViewport(el))

				if (found) {
					const i = elements.indexOf(found)
					this.highlight(i, i, true, cache)
					return
				}
			}

			this.highlight(len - 1, len - 1, true, cache)
			return
		}

		const currEl = elements[currIndex]
		const currIsVisible = currEl ? isInViewport(currEl) : false

		const currIsBelow = currEl
			? currEl.getBoundingClientRect().top > window.innerHeight
			: false

		let prevIndex = -1

		if (this.#options.fastTravel && !currIsVisible && currIsBelow) {
			const found = elements
				.slice(0, currIndex)
				.reverse()
				.find((el) => isInViewport(el))

			if (found) {
				prevIndex = elements.indexOf(found)
			}
		}

		if (prevIndex === -1) {
			prevIndex = this.#options.loop
				? (currIndex - step + len) % len
				: Math.max(0, currIndex - step)
		}

		this.highlight(prevIndex, prevIndex, true, cache)
	}

	next(step = 1, cache = false) {
		const {elements, highlightIndexStart, highlightIndexEnd} =
			this.getInfo(cache)

		const len = elements.length
		if (len === 0) {
			this.highlight(-1, -1, true, cache)
			return
		}

		const currIndex =
			highlightIndexStart !== highlightIndexEnd
				? highlightIndexEnd
				: highlightIndexEnd

		if (currIndex === -1) {
			if (this.#options.fastTravel) {
				const found = elements.find((el) => isInViewport(el))
				if (found) {
					const i = elements.indexOf(found)
					this.highlight(i, i, true, cache)
					return
				}
			}

			this.highlight(0, 0, true, cache)
			return
		}

		const currEl = elements[currIndex]
		const currIsVisible = currEl ? isInViewport(currEl) : false

		const currIsAbove = currEl
			? currEl.getBoundingClientRect().bottom < 0
			: false

		let nextIndex = -1

		if (this.#options.fastTravel && !currIsVisible && currIsAbove) {
			const found = elements.slice(currIndex + 1).find((el) => isInViewport(el))

			if (found) {
				nextIndex = elements.indexOf(found)
			}
		}

		if (nextIndex === -1) {
			nextIndex = this.#options.loop
				? (currIndex + step) % len
				: Math.min(len - 1, currIndex + step)
		}

		this.highlight(nextIndex, nextIndex, true, cache)
	}

	extendLeftHighlight(step = 1, cache = false) {
		// playClick();
		const {highlightIndexStart, highlightIndexEnd} = this.getInfo(cache)
		const newStart = Math.max(0, highlightIndexStart - step)
		this.highlight(newStart, highlightIndexEnd, false, cache)
	}
	reduceLeftHighlight(step = 1, cache = false) {
		// playClick();
		const {elements, highlightIndexStart, highlightIndexEnd} =
			this.getInfo(cache)
		// TODO: should prob change the min to end index
		const newStart = Math.min(elements.length - 1, highlightIndexStart + step)
		this.highlight(newStart, highlightIndexEnd, true, cache)
	}

	extendRightHighlight(step = 1, cache = false) {
		// playClick();
		const {elements, highlightIndexStart, highlightIndexEnd} =
			this.getInfo(cache)
		const newEnd = Math.min(elements.length - 1, highlightIndexEnd + step)
		this.highlight(highlightIndexStart, newEnd, false, cache)
	}

	reduceRightHighlight(step = 1, cache = false) {
		// playClick();
		const {highlightIndexStart, highlightIndexEnd} = this.getInfo(cache)
		// TODO: should prob change the max to end index
		const newEnd = Math.max(0, highlightIndexEnd - step)
		this.highlight(highlightIndexStart, newEnd, true, cache)
	}
}
