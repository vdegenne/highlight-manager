import {querySelectorAll} from 'html-vision'
import {isInViewport, sleep} from './utils.js'

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
	 * @default false
	 */
	scrollWhenOffscreen: boolean
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
	scrollWhenOffscreen: false,
}

// Local array of all declared highlighters for id control.
const highlighters: HighLightManager[] = []

let globalBeforeHighlight: (() => void) | undefined
export function setGlobalBeforeHighlight(fct: () => void) {
	globalBeforeHighlight = fct
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
					this.highlight(index, index, true, false)
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
			this.#options.scrollWhenOffscreen &&
			!isInViewport(elementsToHighlight[0]!)
		) {
			elementsToHighlight[0]?.scrollIntoView({
				behavior: 'smooth',
				block: 'center',
				inline: 'center',
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

		let previousIndex =
			highlightIndexStart !== highlightIndexEnd
				? highlightIndexStart
				: this.#options.loop
					? (highlightIndexStart - step + len) % len
					: Math.max(0, highlightIndexStart - step)

		this.highlight(previousIndex, previousIndex, true, cache)
	}

	next(step = 1, cache = false) {
		const {elements, highlightIndexStart, highlightIndexEnd} =
			this.getInfo(cache)

		const len = elements.length
		if (len === 0) {
			this.highlight(-1, -1, true, cache)
			return
		}

		let nextIndex =
			highlightIndexStart !== highlightIndexEnd
				? highlightIndexEnd
				: this.#options.loop
					? (highlightIndexEnd + step) % len
					: Math.min(len - 1, highlightIndexEnd + step)

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
