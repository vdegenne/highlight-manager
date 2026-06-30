export function sleep(milli: number = 1000) {
	return new Promise((r) => setTimeout(r, milli))
}

// export function isInViewport(el: Element) {
// 	return (
// 		el.getBoundingClientRect().top >= 0 &&
// 		el.getBoundingClientRect().bottom <= window.innerHeight
// 	)
// }

export function isInViewport(el: HTMLElement, onlyTop = false): boolean {
	const rect = el.getBoundingClientRect()
	const viewHeight = window.innerHeight || document.documentElement.clientHeight
	const viewWidth = window.innerWidth || document.documentElement.clientWidth

	if (onlyTop) {
		return rect.top >= 0 && rect.top <= viewHeight
	}

	return (
		rect.bottom > 0 &&
		rect.right > 0 &&
		rect.top < viewHeight &&
		rect.left < viewWidth
	)
}
