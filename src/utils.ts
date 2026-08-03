export function sleep(milli: number = 1000) {
	return new Promise((r) => setTimeout(r, milli))
}
