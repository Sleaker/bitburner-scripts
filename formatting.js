/**
 * @param {number} money Amount to format
 * @return {string} formatted amount
 */
 export function formatMoney(money) {
	const sign = [
		{ v: 1e3, s: "K" },
		{ v: 1e6, s: "M" },
		{ v: 1e9, s: "B" },
		{ v: 1e12, s: "T" },
		{ v: 1e15, s: "Q" }
	]
	let index;
	for (index = sign.length - 1; index > 0; index--) {
		if (money >= sign[index].v) {
			break;
		}
	}
	return (money / sign[index].v).toFixed(2) + sign[index].s;
}