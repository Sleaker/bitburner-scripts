/**
 * @typedef {import('./types/NetscriptDefinitions').NS} NS
 */

import { formatMoney } from './formatting';
import { Logger } from './log';
/** 
 * Main script for handling upgrades.
 *
 * @param {NS} ns
 **/
 export async function main(ns) {
	const log = new Logger(ns, false);
	// initialize our logging system
	ns.disableLog("sleep");
	ns.disableLog("getPurchasedServers");
	ns.disableLog("getPurchasedServerCost");

	// TODO: adjust
	const maxPurchasedServers = 12;
	const wantedRam = 4096;
	const cost = ns.getPurchasedServerCost(wantedRam);
	// run the main script
		ns.tprint("Cost: " + formatMoney(cost));
		let nextServerNum = ns.getPurchasedServers().length;
		while(nextServerNum < maxPurchasedServers && cost < ns.getPlayer().money) {
			if (ns.purchaseServer("zombie-" + nextServerNum, wantedRam)) {
				ns.print("Purchased new server: zombie-" + nextServerNum + " | " + wantedRam);
				log.success("Purchased new server: zombie-%(num)s - %(ram)sG", { num: nextServerNum, ram: wantedRam});
				nextServerNum++;
			} else {
				// if we fail to buy a server break out.
				ns.print("Failed to purchase the server, something went wrong.");
				log.error("Failed to purchase a server, something went wrong: %(money)s / %(price)", { money: ns.getPlayer().money, price: cost })
				break;
			}
		}
		// TODO: find best way to analyze and purchase hacknet nodes.
		
		//TODO: make this purchase TOR + programs (requires Source file 4)?

		// await ns.sleep(30000);
	
}