class AmountOfAddress {
    constructor(address, amount) {
        this.address = address;
        this.amount = amount;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    sleep,
    AmountOfAddress
};