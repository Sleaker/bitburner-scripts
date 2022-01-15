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
        let script = ns.getRunningScript("control.js");
        if (!script) {
            log.warn("Restarting control.js");
            ns.run("control.js");
        } else {
            ns.print("control.js still running");
        }
        await ns.sleep(1000);
    }
}