/**
 * @typedef {import('./types/NetscriptDefinitions').NS} NS
 */

 import * as log from "./log.js";

/** 	
 *
 * @param {NS} ns
 **/
 export async function main(ns) {
	// initialize our logging system
	log.initialize(ns);
    ns.disableLog("sleep");

	// run the main script
	while(true) {
        if (!ns.scriptRunning("control.js", "home")) {
            log.warn("Restarting control.js");
            ns.run("control.js");
        }
        await ns.sleep(1000);
    }
}