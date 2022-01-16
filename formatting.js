/**
 * @param {number} money Amount to format
 * @return {string} formatted amount
 */
 export function formatMoney(money, digits = true) {
	const signs = [
		{ val: 1, sign: "", digs: 0 },
		{ val: 1e3, sign: "K", digs: 1 },
		{ val: 1e6, sign: "M", digs: 1 },
		{ val: 1e9, sign: "B", digs: 1 },
		{ val: 1e12, sign: "T", digs: 1 },
		{ val: 1e15, sign: "Q", digs: 1 }
	]
	for (const sign of signs.reverse()) {
		if(money >= sign.val) {
			return (money / sign.val).toFixed(sign.digs) + sign.sign;
		}
	}
	return money === 0 ? money.toFixed(0) : money.toFixed(2);
}