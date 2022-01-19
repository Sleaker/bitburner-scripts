
/**
 * @typedef {import('./types/NetscriptDefinitions').NS} NS
**/

/** @param {NS} ns **/
export async function main(ns) {
    while(true) {
	    await ns.share();
    }
}