/**
 * @typedef {import('./types/NetscriptDefinitions').NS} NS
 */

import { formatMoney } from './formatting';
/** 
 * Main script for handling upgrades.
 *
 * @param {NS} ns
 **/
 export async function main(ns) {
	// initialize our logging system
	ns.disableLog("sleep");
	ns.disableLog("getPurchasedServers");
	ns.disableLog("getPurchasedServerCost");

	// TODO: adjust
	const maxPurchasedServers = 4;
	const wantedRam = 2048;
	const cost = ns.getPurchasedServerCost(wantedRam);
	// run the main script
	while(true) {
		// ns.tprint("Cost: " + formatMoney(cost));
		let nextServerNum = ns.getPurchasedServers().length;
		while(nextServerNum < maxPurchasedServers && cost < ns.getPlayer().money) {
			if (ns.purchaseServer("zombie-" + nextServerNum, wantedRam)) {
				ns.print("Purchased new server: zombie-" + nextServerNum + " | " + wantedRam);
				nextServerNum++;
			} else {
				// if we fail to buy a server break out.
				ns.print("Failed to purchase the server, something went wrong.");
				break;
			}
		}
		// TODO: find best way to analyze and purchase hacknet nodes.

		await ns.sleep(30000);
	}
}