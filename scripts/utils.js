class AmountOfWallet {
    constructor(wallet, amount) {
        this.wallet = wallet;
        this.amount = amount;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    sleep,
    AmountOfWallet: AmountOfWallet
};