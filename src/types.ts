import type {ScrollStrategy} from 'html-vision/scroll.js'
import type {CheckIf} from 'html-vision/visibility.js'
import {GetClosestElementOptions} from './relative-selection.js'

export namespace hlm {
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
		 * TODO: TO IMPLEMENT
		 */
		bothWays?: boolean
	}

	export type NavigationStyle =
		| 'index-based'
		/**
		 * Experimental
		 */
		| 'relative-to'

	export interface Options<T = {}> {
		css: string
		highlightTextColor: string

		/**
		 * @default 'index-based'
		 */
		navigationStyle: NavigationStyle

		/**
		 * Only in "relative-to" mode.
		 */
		relativeOptions: Partial<Omit<GetClosestElementOptions, 'anchor'>>

		/**
		 * @default false
		 */
		loop: boolean
		/**
		 * A function for extra selection if selector is not enough
		 * and need a way to filter elements based on properties.
		 * Return false if you want to keep an element out of the bag.
		 */
		atomicSelection: (element: HTMLElement, i: number) => boolean
		beforeHighlight: (() => void) | undefined
		onSelectionChange: ((info: HighlightInfo) => void) | undefined

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
		scroll: ScrollStrategy | undefined

		/**
		 * If the current highlight is outside the viewport
		 * and we navigate next
		 *
		 * @default Try to highlight fully visible element or partially visible element as a fallback
		 */
		fastTravel: FastTravelOptions | undefined
		/**
		 * If true, the fast travel will select the first fully-visible elemnt in the view.
		 *
		 * @default true
		 *
		 * @deprecated use `fastTravel` instead
		 */
		// fullyVisibleFastTravel: boolean

		/**
		 * Whether to call .focus() on the newly highlighted element or not.
		 *
		 * @default false
		 */
		focusElementOnHighlight: boolean

		getInfoMiddleware?: (info: HighlightInfo) => T
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
}
