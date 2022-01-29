/**
 * @typedef {import('./types/NetscriptDefinitions').NS} NS
 * @typedef {import('./types/NetscriptDefinitions').TIX} TIX
 * @typedef {import('./types/NetscriptDefinitions').Server} Server
 */

// Built upon u/pwillia7 's stock script.
// u/ferrus_aub stock script using simple portfolio algorithm.

/** @param {NS} ns **/
export async function main(ns) {
    // percentage of maximum allowed shares to buy up to
    const maxSharePer = 1.00
    // minimum forecast to purchase into
    const stockBuyPer = 0.60
    // maximum Volatility percentage to target, anything above is too risky
    const MAX_VOLATILITY = 0.05
    // Money to keep in the bank 
    const moneyKeep = 1_000_000_000
    // minimum number of shares to purchase in one operation, help limit number of fees while also performing hacks
    const MIN_SHARE_PURCHASE = 1_000_000; 

    while (true) {
        ns.disableLog('disableLog');
        ns.disableLog('sleep');
        ns.disableLog('getServerMoneyAvailable');
        let stocks = ns.stock.getSymbols()
            .sort((a, b) => ns.stock.getPrice(a) - ns.stock.getPrice(b));
        for (const symbol of stocks) {
            let [longPosition] = ns.stock.getPosition(symbol);
            if (longPosition) {
                //ns.print('Position: ' + stock + ', ')
                sellPositions(symbol, longPosition);
            }
            buyPositions(symbol, longPosition);
        }
        // ns.print('Cycle Complete');
        await ns.sleep(6000);
    }

    /**
     * @param {string} symbol 
     * @param {number} position
     */
    function buyPositions(symbol, position) {
        const maxShares = (ns.stock.getMaxShares(symbol) * maxSharePer) - position;
        // ns.print("MaxShares: " + maxShares);
        // ns.print(ns.stock.getMaxShares(symbol));
        const askPrice = ns.stock.getAskPrice(symbol);
        const forecast = ns.stock.getForecast(symbol);
        const volPer = ns.stock.getVolatility(symbol);
        const playerMoney = ns.getPlayer().money;

        if (forecast >= stockBuyPer && volPer <= MAX_VOLATILITY) {
            let sharesToBuy = Math.min((playerMoney - moneyKeep - 100000) / askPrice, maxShares);
            if (playerMoney - moneyKeep > ns.stock.getPurchaseCost(symbol, MIN_SHARE_PURCHASE, "Long") && sharesToBuy >= MIN_SHARE_PURCHASE) {
                ns.stock.buy(symbol, sharesToBuy);
                // ns.print('Bought: '+ symbol + ' Shares:' + shares);
            }
        }      
    }

        /**
     * @param {string} symbol 
     * @param {number} position
     */
    function sellPositions(symbol, position) {
        let forecast = ns.stock.getForecast(symbol);
        if (forecast < 0.5) {
            ns.stock.sell(symbol, position);
            //ns.print('Sold: '+ stock + '')
        }
    }
}