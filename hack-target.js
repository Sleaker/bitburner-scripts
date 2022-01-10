/** @param {import('./types/NetscriptDefinitions').NS} ns **/
export async function main(ns) {
	if (!ns.args[0]) {
		ns.print("No target host given");
		exit;
	}
	const target = ns.args[0];
	ns.print("Starting up hack against: " + target);
	const maxSecurity = ns.getServerMinSecurityLevel(target) + 5;
	const minMoney = ns.getServerMaxMoney(target) * .75;
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