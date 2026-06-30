export function sleep(milli: number = 1000) {
	return new Promise((r) => setTimeout(r, milli))
}

// export function isInViewport(el: Element) {
// 	return (
// 		el.getBoundingClientRect().top >= 0 &&
// 		el.getBoundingClientRect().bottom <= window.innerHeight
// 	)
// }

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
