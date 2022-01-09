/** @param {NS} ns **/
export async function main(ns) {
	if (!ns.args[0]) {
		ns.tprintf("ERROR| %s", "Missing arguments, check for runHost");
		exit;
	}
	let eTarget = ns.args[0];
	await ns.scp("simple-hack.js", eTarget);
	// const memNeeded = Math.max(ns.getScriptRam("weaken.js"), ns.getScriptRam("hack.js"), ns.getScriptRam("grow.js"));
	// const controlMem = ns.getScriptRam("hack-harakiri.js");
	// const minMemNeeded = controlMem + memNeeded;
	// if (ns.getServerMaxRam(eTarget) < minMemNeeded) {
	// 	ns.tprint("Server does not have enough memory to run hack control locally");
	// 	exit;
	// }
	let numThreads = Math.floor((ns.getServerMaxRam(eTarget)) / 2.2);
	ns.tprint(eTarget + " will have " + numThreads + " worker threads");
	// kill anything running on the remote system then start up the new script
	ns.killall(eTarget);
	ns.exec('simple-hack.js', eTarget, numThreads);
}