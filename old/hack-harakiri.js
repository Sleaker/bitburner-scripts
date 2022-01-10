/** @param {import('./types/NetscriptDefinitions').NS} ns **/
export async function main(ns) {
	const [threads] = ns.args;
	const target = "harakiri-sushi";
	ns.print("Starting up hack against harakiri-sushi");
	const maxSecurity = 10;
	const minMoney = 80_000_000;
	while (true) {
		if (ns.getServerSecurityLevel(target) > maxSecurity) {
			ns.exec("weaken.js", threads, target);
		} else if (ns.getServerMoneyAvailable(target) < minMoney) {
			ns.exec("grow.js", threads, target);
		} else {
			ns.exec("hack.js", threads, target);
		}
	}
}