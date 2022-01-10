/** @param {import('./types/NetscriptDefinitions').NS} ns **/
export async function main(ns) {
	const target = "max-hardware";
	ns.print("Starting up hack against: " + target);
	const maxSecurity = 10;
	const minMoney = 200_000_000;
	while (true) {
		// Ratios: 7 weaken, 36 hack, 57 grow
		if (ns.getServerSecurityLevel(target) > maxSecurity) {
			// reduces security by threads * 0.05
			// takes 60 seconds to run
			// .000_83/sec
			await ns.weaken(target);
		} else if (ns.getServerMoneyAvailable(target) < minMoney) {
			// Raises security by threads * .004
			// takes 45 seconds to run
			// .000_088/sec (19 grows per 2 weaken)
			await ns.grow(target);
		} else {
			// raises security by threads * .002
			// takes 15 seconds to run
			// .000_13/sec (12 hacks per 2 weaken)
			await ns.hack(target);
		}
	}
}