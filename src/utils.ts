export function sleep(milli: number = 1000) {
	return new Promise((r) => setTimeout(r, milli))
}

export function isInViewport(el: Element) {
	return (
		el.getBoundingClientRect().top >= 0 &&
		el.getBoundingClientRect().bottom <= window.innerHeight
	)
}
