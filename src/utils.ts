export function sleep(milli: number = 1000) {
	return new Promise((r) => setTimeout(r, milli))
}

// export function isInViewport(el: Element) {
// 	return (
// 		el.getBoundingClientRect().top >= 0 &&
// 		el.getBoundingClientRect().bottom <= window.innerHeight
// 	)
// }

export type IsInViewportPartCheck =
	| 'top'
	| 'center'
	| 'bounding-rect'
	| 'bottom'

export function isInViewport(
	el: HTMLElement,
	partCheck: IsInViewportPartCheck = 'center',
): boolean {
	const rect = el.getBoundingClientRect()
	const viewHeight = window.innerHeight || document.documentElement.clientHeight
	const viewWidth = window.innerWidth || document.documentElement.clientWidth

	switch (partCheck) {
		case 'top':
			return rect.top >= 0 && rect.top <= viewHeight

		case 'bottom':
			return rect.bottom >= 0 && rect.bottom <= viewHeight

		case 'center': {
			const centerY = rect.top + rect.height / 2
			const centerX = rect.left + rect.width / 2
			return (
				centerY >= 0 &&
				centerY <= viewHeight &&
				centerX >= 0 &&
				centerX <= viewWidth
			)
		}

		case 'bounding-rect':
		default:
			return (
				rect.bottom > 0 &&
				rect.right > 0 &&
				rect.top < viewHeight &&
				rect.left < viewWidth
			)
	}
}
