export enum Anchor {
	TOP_LEFT,
	TOP_CENTER,
	TOP_RIGHT,
	CENTER_LEFT,
	CENTER,
	CENTER_RIGHT,
	BOTTOM_LEFT,
	BOTTOM_CENTER,
	BOTTOM_RIGHT,
}

export interface GetClosestElementOptions {
	/**
	 * Anchor point of the reference element from which to calculate the
	 * distance to candidate elements.
	 *
	 * @default Anchor.CENTER
	 */
	anchor: Anchor

	/**
	 * Distance in CSS pixels to extend the reference point beyond the
	 * anchor in the direction from the center toward the anchor.
	 *
	 * @default 0
	 */
	outerOffset: number

	/**
	 * Maximum distance in CSS pixels within which a candidate element can be
	 * selected. Candidates beyond this distance are ignored.
	 *
	 * @default Infinity
	 */
	maxDistance: number

	/**
	 * Visually display the calculated reference point for debugging.
	 *
	 * @default false
	 */
	debug: boolean
}

export const defaultRelativeOptions: GetClosestElementOptions = {
	anchor: Anchor.CENTER,
	outerOffset: 0,
	maxDistance: Infinity,
	debug: false,
}

function getAnchorPoint(
	rect: DOMRect,
	anchor: Anchor,
): {
	x: number
	y: number
} {
	switch (anchor) {
		case Anchor.TOP_LEFT:
			return {x: rect.left, y: rect.top}
		case Anchor.TOP_CENTER:
			return {x: rect.left + rect.width / 2, y: rect.top}
		case Anchor.TOP_RIGHT:
			return {x: rect.right, y: rect.top}
		case Anchor.CENTER_LEFT:
			return {x: rect.left, y: rect.top + rect.height / 2}
		case Anchor.CENTER:
			return {
				x: rect.left + rect.width / 2,
				y: rect.top + rect.height / 2,
			}
		case Anchor.CENTER_RIGHT:
			return {x: rect.right, y: rect.top + rect.height / 2}
		case Anchor.BOTTOM_LEFT:
			return {x: rect.left, y: rect.bottom}
		case Anchor.BOTTOM_CENTER:
			return {x: rect.left + rect.width / 2, y: rect.bottom}
		case Anchor.BOTTOM_RIGHT:
			return {x: rect.right, y: rect.bottom}
	}
}

function getAnchorOffset(anchor: Anchor): {
	x: number
	y: number
} {
	switch (anchor) {
		case Anchor.TOP_LEFT:
			return {x: -1, y: -1}
		case Anchor.TOP_CENTER:
			return {x: 0, y: -1}
		case Anchor.TOP_RIGHT:
			return {x: 1, y: -1}
		case Anchor.CENTER_LEFT:
			return {x: -1, y: 0}
		case Anchor.CENTER:
			return {x: 0, y: 0}
		case Anchor.CENTER_RIGHT:
			return {x: 1, y: 0}
		case Anchor.BOTTOM_LEFT:
			return {x: -1, y: 1}
		case Anchor.BOTTOM_CENTER:
			return {x: 0, y: 1}
		case Anchor.BOTTOM_RIGHT:
			return {x: 1, y: 1}
	}
}

export function getClosestElement<T extends Element>(
	element: T,
	elements: Iterable<T>,
	options?: Partial<GetClosestElementOptions>,
): T | undefined {
	const {anchor, outerOffset, maxDistance, debug} = {
		...defaultRelativeOptions,
		...options,
	}

	const rect = element.getBoundingClientRect()
	const anchorPoint = getAnchorPoint(rect, anchor)
	const anchorOffset = getAnchorOffset(anchor)

	const referencePoint = {
		x: anchorPoint.x + anchorOffset.x * outerOffset,
		y: anchorPoint.y + anchorOffset.y * outerOffset,
	}

	if (debug) {
		console.log(referencePoint)

		const debugPoint = document.createElement('div')

		Object.assign(debugPoint.style, {
			position: 'fixed',
			left: `${referencePoint.x}px`,
			top: `${referencePoint.y}px`,
			width: '10px',
			height: '10px',
			borderRadius: '50%',
			background: 'red',
			transform: 'translate(-50%, -50%)',
			zIndex: '999999',
			pointerEvents: 'none',
			transition: 'opacity 1s ease',
		})

		document.body.append(debugPoint)

		function removeDebugPoint() {
			debugPoint.remove()
			window.removeEventListener('scroll', removeDebugPoint)
		}

		window.addEventListener('scroll', removeDebugPoint, {once: true})

		requestAnimationFrame(function () {
			debugPoint.style.opacity = '0'
		})

		setTimeout(removeDebugPoint, 1000)
	}

	const maxDistanceSquared =
		maxDistance === undefined ? Infinity : maxDistance * maxDistance

	let closestElement: T | undefined
	let closestDistance = maxDistanceSquared

	for (const candidate of elements) {
		if (candidate === element) continue

		const rect = candidate.getBoundingClientRect()

		const closestX = Math.max(rect.left, Math.min(referencePoint.x, rect.right))
		const closestY = Math.max(rect.top, Math.min(referencePoint.y, rect.bottom))

		const dx = referencePoint.x - closestX
		const dy = referencePoint.y - closestY
		const distance = dx * dx + dy * dy

		if (distance < closestDistance) {
			closestDistance = distance
			closestElement = candidate
		}
	}

	return closestElement
}
