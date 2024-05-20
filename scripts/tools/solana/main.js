const solanaWeb3 = require('@solana/web3.js');
const bs58 = require('bs58');
const fs = require('fs');
const path = require('path');
const solana = require('./solana.js')
const { AmountOfWallet } = require('../../utils');

const wallets = require('./wallets.json');

async function createWallets(num, type = 'bs58') {
    const wallets = await solana.createWallets(parseInt(num), type);
    console.log(wallets);
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
    const filename = `solana-${formattedDate}.json`;
    const data = JSON.stringify(wallets, null, 2);
    fs.writeFileSync(path.join(__dirname, filename), data);
    console.log(`Wallets saved to ${filename}`);
}

async function distributeSol(amount) {
    const mainWallet = bs58.decode(wallets.mainWallet.privateKey);
    const walletsWithAmount = wallets.sonWallets.map(wallet => {
        return new AmountOfWallet(wallet.publicKey, amount);
    });

    let mainBalance = await solana.getSolBalance(new solanaWeb3.PublicKey(wallets.mainWallet.publicKey));
    console.log('mainWalletBalance: ', mainBalance, 'SOL');
    if (mainBalance < amount * walletsWithAmount.length) {
        throw new Error('Insufficient balance of mainWallet');
    }

    const txs = await solana.one2multiSendSol(mainWallet, walletsWithAmount);
    console.log('successfulTxs: ', txs);
    mainBalance = await solana.getSolBalance(new solanaWeb3.PublicKey(wallets.mainWallet.publicKey));
    console.log('mainWalletBalance: ', mainBalance, 'SOL');
}

async function colletSol(amount, type = 'part') {
    feePayer = bs58.decode(wallets.gasWallet.privateKey);
    let walletsWithAmount = [];
    if (type === 'all') {
        walletsWithAmount = wallets.sonWallets.map(wallet => {
            const balance = solana.getSolBalance(new solanaWeb3.PublicKey(wallet.publicKey));
            return new AmountOfWallet(bs58.decode(wallet.privateKey), balance);
        });
    } else if (type === 'part') {
        walletsWithAmount = wallets.sonWallets.map(wallet => {
            return new AmountOfWallet(bs58.decode(wallet.privateKey), amount);
        });
    }
    let mainBalance = await solana.getSolBalance(new solanaWeb3.PublicKey(wallets.mainWallet.publicKey));
    console.log('mainWalletBalance: ', mainBalance, 'SOL');
    const txs = await solana.multi2oneSendSol(walletsWithAmount, wallets.mainWallet.publicKey, feePayer);
    console.log('successfulTxs: ', txs);
    mainBalance = await solana.getSolBalance(new solanaWeb3.PublicKey(wallets.mainWallet.publicKey));
    console.log('mainWalletBalance: ', mainBalance, 'SOL');
}

module.exports = {
    createWallets,
    faucet,
    distributeSol,
    colletSol
}