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

export enum RelativeResolution {
	/**
	 * If the element is off-screen and not in the opposite direction of the motion
	 * use index-based navigation style fallback.
	 * Or else it will dig until it finds an element in the direction of the motion.
	 */
	INDEX_BASED_FALLBACK = 'index-based-fallback',
	/**
	 * Always select the closest element in-screen
	 */
	CLOSEST = 'closest',
}

export interface GetClosestElementOptions {
	/**
	 * Anchor point of the reference element from which to calculate the
	 * distance to candidate elements.
	 *
	 * The default value depends on the motion function being invoked,
	 * For instance, down() will use Anchor.BOTTOM_CENTER value.
	 *
	 * You can always replace the default from here, though not recommended.
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
	 * Repeatedly increase the outer offset when no candidate is found.
	 */
	dig: {
		/**
		 * Number of searches to perform.
		 *
		 * @default 1
		 */
		count: number

		/**
		 * Distance in CSS pixels to add to the outer offset for each
		 * additional search.
		 *
		 * `outerOffset` option overrides this value when set.
		 *
		 * @default 20
		 */
		step: number

		/**
		 * Keep digging until it finds an element, or when it leaves screen.
		 *
		 * Setting this value to true will override the `count` option.
		 *
		 * @default false
		 */
		untilOffscreen: boolean
	}

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
	dig: {count: 1, step: 20, untilOffscreen: false},
	debug: false,
}

export function getAnchorPoint(
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
	options?: DeepPartial<
		GetClosestElementOptions & {
			/**
			 * Use these values to override element rect values.
			 *
			 * This is particularly useful if you want to start finding elements
			 * from another point in space. For example, when the new top should
			 * be the top of the screen while the left and right remain coherent
			 * with the current element's rect values.
			 *
			 * The provided values are merged with the element's rect values.
			 */
			fromRectOverride: {
				left: number
				right: number
				top: number
				bottom: number
			}
		}
	>,
): T | undefined {
	const {anchor, outerOffset, maxDistance, dig, debug, fromRectOverride} = {
		...defaultRelativeOptions,
		...options,
		dig: {
			...defaultRelativeOptions.dig,
			...options?.dig,
		},
	}

	if (dig.untilOffscreen && outerOffset === 0 && dig.step === 0) {
		throw new Error(
			'`dig.untilOffscreen` requires `outerOffset` or `dig.step` to be greater than 0.',
		)
	}

	/*
	 * Note: DOMRect's values are relative to the viewport not the entire document.
	 *		`left` and `top` are typically aliases for `x` and `y`.
	 */
	const elementRect = element.getBoundingClientRect()

	const left = fromRectOverride?.left ?? elementRect.left
	const top = fromRectOverride?.top ?? elementRect.top
	const right = fromRectOverride?.right ?? elementRect.right
	const bottom = fromRectOverride?.bottom ?? elementRect.bottom

	const rect = new DOMRect(left, top, right - left, bottom - top)

	const anchorPoint = getAnchorPoint(rect, anchor)
	const anchorOffset = getAnchorOffset(anchor)

	const candidates = [...elements]

	// DIG
	let attempt = 0
	for (attempt = 0; dig.untilOffscreen || attempt < dig.count; attempt++) {
		const currentOuterOffset = outerOffset + (outerOffset || dig.step) * attempt

		const referencePoint = {
			x: anchorPoint.x + anchorOffset.x * currentOuterOffset,
			y: anchorPoint.y + anchorOffset.y * currentOuterOffset,
		}

		// Stop digging once the reference point leaves the viewport.
		if (
			dig.untilOffscreen &&
			(referencePoint.x < 0 ||
				referencePoint.x > window.innerWidth ||
				referencePoint.y < 0 ||
				referencePoint.y > window.innerHeight)
		) {
			break
		}

		if (debug) {
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

			const debugRect = document.createElement('div')

			Object.assign(debugRect.style, {
				position: 'fixed',
				left: `${rect.left}px`,
				top: `${rect.top}px`,
				width: `${rect.width}px`,
				height: `${rect.height}px`,
				border: '2px solid yellow',
				boxSizing: 'border-box',
				zIndex: '999998',
				pointerEvents: 'none',
				transition: 'opacity 1s ease',
			})

			document.body.append(debugRect, debugPoint)

			function removeDebug() {
				debugPoint.remove()
				debugRect.remove()
				window.removeEventListener('scroll', removeDebug)
			}

			window.addEventListener('scroll', removeDebug, {
				once: true,
			})

			requestAnimationFrame(function () {
				debugPoint.style.opacity = '0'
				debugRect.style.opacity = '0'
			})

			setTimeout(removeDebug, 1300)
		}

		const maxDistanceSquared =
			maxDistance === undefined ? Infinity : maxDistance * maxDistance

		let closestElement: T | undefined
		let closestDistance = maxDistanceSquared

		for (const candidate of candidates) {
			if (candidate === element) continue

			const rect = candidate.getBoundingClientRect()

			const closestX = Math.max(
				rect.left,
				Math.min(referencePoint.x, rect.right),
			)
			const closestY = Math.max(
				rect.top,
				Math.min(referencePoint.y, rect.bottom),
			)

			const dx = referencePoint.x - closestX
			const dy = referencePoint.y - closestY
			const distance = dx * dx + dy * dy

			if (distance < closestDistance) {
				closestDistance = distance
				closestElement = candidate
			}
		}

		if (closestElement) {
			return closestElement
		}
	}

	if (debug && dig.untilOffscreen) {
		console.log(`Dig iterations: ${attempt}`)
	}

	return undefined
}
