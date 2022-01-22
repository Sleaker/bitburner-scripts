/** @param {import('./types/NetscriptDefinitions').NS} ns **/
export async function main(ns) {
	const target = "harakiri-sushi";
	ns.print("Starting up hack against harakiri-sushi");
	const maxSecurity = 10;
	const minMoney = 80_000_000;
	while (true) {
		if (ns.getServerSecurityLevel(target) > maxSecurity) {
			await ns.weaken(target);
		} else if (ns.getServerMoneyAvailable(target) < minMoney) {
			await ns.grow(target);
		} else {
			await ns.hack(target);
		}
	}
}