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

interface GetClosestElementOptions {
	anchor: Anchor
}

function getAnchorPoint(rect: DOMRect, anchor: Anchor): {x: number; y: number} {
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

export function getClosestElement<T extends Element>(
	element: T,
	elements: Iterable<T>,
	{anchor}: GetClosestElementOptions,
): T | undefined {
	const referencePoint = getAnchorPoint(element.getBoundingClientRect(), anchor)

	let closestElement: T | undefined
	let closestDistance = Infinity

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
