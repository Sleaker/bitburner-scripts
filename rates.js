/**
 * @typedef {import('./types/NetscriptDefinitions').NS} NS
 * @typedef {import('./types/NetscriptDefinitions').Server} Server
*/

import { Logger } from "./log.js";
import { findServers } from "./util.js";
import { Zombie } from "./zombie.js";
 
 /**  	
  * This is for testing copied formulas and making sure statistics line up properly, requires Formulas.exe 
  * once 
  * @param {NS} ns
  **/
export async function main(ns) {
    let log = new Logger(ns, false);
    const header = " %(sec)s | %(exp)s ";
    log.info("ExpGained = 3 + (security * 4.53 * .3)");
    
    log.info("");
    let servers = findServers({ns: ns, depth: 5})
        .map(server => new Zombie(server.server, ns, server.depth));
    const format = "%(hostname)15s | %(maxUsefulThreads)3s | %(hackThreads)3s | %(effect)5s | %(hackCalcEffect)5s | %(diff)4s | %(xp)6s | %(myxp)6s | %(xps)6s | %(security)3s | %(currentSecurity)4s | %(level)4s ";
    log.info(format, { hostname: "Name", maxUsefulThreads: "Use", hackThreads: "Thr", effect: "Eff", hackCalcEffect: "CHack", weakenTime: "Weak", diff: "Diff", xp: "XP", myxp: "MyXP", 
        xps: "XPPS", security: "Sec", currentSecurity: "CSec",  level: "Lvl"})
    for (const server of servers) {
        // server.actualWeaken = ns.formulas.hacking.weakenTime(server.server, ns.getPlayer());
        server.xp = ns.formulas.hacking.hackExp(server.server, ns.getPlayer()).toFixed(2);
        server.myxp = (3 + (server.server.baseDifficulty * ns.getPlayer().hacking_exp_mult *  .3)).toFixed(2);
        server.diff = server.server.baseDifficulty;
        server.maxUsefulThreads = Math.floor( 41 / (ns.formulas.hacking.hackPercent(server.server, ns.getPlayer()) * 100));
        server.hackCalcEffect = (100 * ns.formulas.hacking.hackPercent(server.server, ns.getPlayer())).toFixed(2);
        log.info(format, server);
    }

    
    // let test = document.getElementById("clickable");
    // test.style = "display: block; visibility: visible; transform: translate(-10px, -10px);";
    // test.id = "unclickable";
}
