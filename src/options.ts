import {fastTravelDefaults, FastTravelOptions} from './fast-travel.js'
import {HighlightInfo, NavigationStyle, ScrollStrategy} from './index.js'
import {
	defaultRelativeOptions,
	GetClosestElementOptions,
} from './relative-selection.js'

export const defaultOptions: Options<any> = {
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

export type OptionsInput<T> = Partial<
	Omit<Options<T>, 'scroll' | 'fastTravel' | 'relativeOptions'>
> & {
	/**
	 * Set to at least `{}` to activate scrolling when offscreen
	 *
	 * @default undefined
	 */
	scroll?: Partial<Options<T>['scroll']>
	/**
	 * If the current highlight is outside the viewport
	 * and we navigate next
	 *
	 * @default Try to highlight fully visible element or partially visible element as a fallback
	 */
	fastTravel?: Partial<FastTravelOptions>
	/**
	 * Only in "relative-to" mode.
	 */
	relativeOptions?: Partial<Omit<GetClosestElementOptions, 'dig'>> & {
		/**
		 * Repeatedly increase the outer offset when no candidate is found.
		 */
		dig?: Partial<GetClosestElementOptions['dig']>
	}
}

export function mergeOptions<T extends object, U extends object>(
	defaults: T,
	overrides?: U,
): T {
	const result: Record<string, any> = {
		...defaults,
	}

	if (!overrides) {
		return result as T
	}

	for (const [key, value] of Object.entries(overrides)) {
		if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
			result[key] = mergeOptions(result[key] ?? {}, value)
		} else if (value !== undefined) {
			result[key] = value
		}
	}

	return result as T
}

export type MotionOptions = {
	/**
	 * Navigation style to use for this call.
	 *
	 * @default this.#options.navigationStyle
	 */
	navigationStyle: NavigationStyle

	/**
	 * Only for "index-based" mode.
	 *
	 * @default 1
	 */
	step: number

	/**
	 * @default this.#options.fastTravel
	 */
	fastTravel: FastTravelOptions | undefined

	/**
	 * Only for "relative-to" mode.
	 */
	relativeOptions: GetClosestElementOptions

	/**
	 * Only for "relative-to" mode.
	 *
	 * A callback to execute in case no relative element was found.
	 */
	noRelativeCallback: ((info: HighlightInfo) => void) | undefined
}

export type MotionOptionsInput = Omit<
	Partial<MotionOptions>,
	'relativeOptions'
> & {
	relativeOptions?: Partial<GetClosestElementOptions>
}
