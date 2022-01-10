/** @param {import('./types/NetscriptDefinitions').NS} ns **/
export async function main(ns) {
	ns.getPurchasedServers();
	ns.getPurchasedServerCost()
	ns.getPurchasedServerMaxRam();
	ns.purchaseProgram()
}