export function sleep(milli: number = 1000) {
	return new Promise((r) => setTimeout(r, milli))
}

export type VisibilityCheck =
	| 'top-visible'
	| 'center-visible'
	| 'bottom-visible'
	| 'partially-visible'
	| 'fully-visible'

export type CheckIf = (is: (visibility: VisibilityCheck) => boolean) => boolean

export function checkVisibility(
	el: HTMLElement,
	/**
	 * @default top is not visible
	 */
	checkIf: CheckIf = (is) => !is('top-visible'),
): boolean {
	const rect = el.getBoundingClientRect()
	const viewHeight = window.innerHeight || document.documentElement.clientHeight
	const viewWidth = window.innerWidth || document.documentElement.clientWidth

	function is(visibilityCheck: VisibilityCheck) {
		switch (visibilityCheck) {
			case 'top-visible':
				return rect.top >= 0 && rect.top <= viewHeight

			case 'center-visible': {
				const centerY = rect.top + rect.height / 2
				const centerX = rect.left + rect.width / 2
				return (
					centerY >= 0 &&
					centerY <= viewHeight &&
					centerX >= 0 &&
					centerX <= viewWidth
				)
			}

			case 'bottom-visible':
				return rect.bottom >= 0 && rect.bottom <= viewHeight

			case 'fully-visible':
				return (
					rect.top >= 0 &&
					rect.left >= 0 &&
					rect.bottom <= viewHeight &&
					rect.right <= viewWidth
				)

			case 'partially-visible':
			default:
				return (
					rect.bottom > 0 &&
					rect.right > 0 &&
					rect.top < viewHeight &&
					rect.left < viewWidth
				)
		}
	}

	return checkIf(is)
}

export function isInViewport(el: HTMLElement) {
	return checkVisibility(el, (is) => is('partially-visible'))
}

export interface ScrollStrategy {
	/**
	 * The visibility check to use to determine
	 * whether or not the scroll should be issued.
	 *
	 * @default when top is not visible
	 */
	if: CheckIf
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

	/**
	 * @default 10px
	 */
	yOffsetPx: number
}
export const scrollStrategyDefaults: ScrollStrategy = {
	if: (is) => !is('top-visible'),
	behavior: 'smooth',
	block: undefined,
	inline: undefined,
	yOffsetPx: 10,
}

export function scrollIntoView(
	el: HTMLElement,
	options?: Partial<ScrollStrategy>,
): void {
	const _options = {
		...scrollStrategyDefaults,
		...options,
	}
	const {if: _if, behavior, block, yOffsetPx} = _options

	if (!checkVisibility(el, _if)) {
		return
	}

	const rect = el.getBoundingClientRect()

	let top: number

	switch (block) {
		case 'center':
			top = window.scrollY + rect.top - window.innerHeight / 2 + rect.height / 2
			break

		case 'end':
			top = window.scrollY + rect.bottom - window.innerHeight
			break

		case 'nearest':
			// Simple approximation.
			if (rect.top < 0) {
				top = window.scrollY + rect.top
			} else {
				top = window.scrollY + rect.bottom - window.innerHeight
			}
			break

		case 'start':
		default:
			top = window.scrollY + rect.top
			break
	}

	window.scrollTo({
		top: top - yOffsetPx,
		behavior,
	})
}
