const solanaWeb3 = require('@solana/web3.js');
const splToken = require('@solana/spl-token');
const bs58 = require('bs58');
const fs = require('fs');
const path = require('path');
const solana = require('./solana.js')
const { AmountOfWallet, sleep } = require('../../utils.js');

const wallets = require('./wallets.json');

async function faucet() {
    const tx = await solana.faucet(wallets.mainWallet.publicKey);
    console.log('tx: ', tx);
}

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

async function createPrettyAccount(prefix, suffix, numThreads) {
    solana.createPrettyAccount(prefix, suffix, numThreads);
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
    console.log('waiting for 20s... wait for the token balance to be updated.');
    await sleep(20000);
    mainBalance = await solana.getSolBalance(new solanaWeb3.PublicKey(wallets.mainWallet.publicKey));
    console.log('mainWalletBalance: ', mainBalance, 'SOL');
}

async function colletSol(amount, type = 'part') {
    feePayer = bs58.decode(wallets.gasWallet.privateKey);
    let walletsWithAmount = [];
    if (type === 'all') {
        walletsWithAmount = await Promise.all(wallets.sonWallets.map(async wallet => {
            const balance = await solana.getSolBalance(new solanaWeb3.PublicKey(wallet.publicKey));
            console.log(wallet.publicKey, 'balance:', balance, 'SOL');
            return new AmountOfWallet(bs58.decode(wallet.privateKey), balance);
        }));
    } else if (type === 'part') {
        walletsWithAmount = wallets.sonWallets.map(wallet => {
            return new AmountOfWallet(bs58.decode(wallet.privateKey), amount);
        });
    }
    let mainBalance = await solana.getSolBalance(new solanaWeb3.PublicKey(wallets.mainWallet.publicKey));
    console.log('mainWalletBalance: ', mainBalance, 'SOL');
    const txs = await solana.multi2oneSendSol(walletsWithAmount, wallets.mainWallet.publicKey, feePayer);
    console.log('successfulTxs: ', txs);
    console.log('waiting for 20s... wait for the token balance to be updated.');
    await sleep(20000);
    mainBalance = await solana.getSolBalance(new solanaWeb3.PublicKey(wallets.mainWallet.publicKey));
    console.log('mainWalletBalance: ', mainBalance, 'SOL');
}

async function distributeSplToken(tokenAddress, amount) {
    const walletsWithAmount = wallets.sonWallets.map(wallet => {
        return new AmountOfWallet(wallet.publicKey, amount);
    });
    const mainWallet = solanaWeb3.Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallets.mainWallet.privateKey)));
    const token = new splToken.Token(solana.connection, new solanaWeb3.PublicKey(tokenAddress), splToken.TOKEN_PROGRAM_ID, mainWallet);
    let mainBalance = (await token.getOrCreateAssociatedAccountInfo(mainWallet.publicKey)).amount / solanaWeb3.LAMPORTS_PER_SOL;

    console.log('mainWallet token balance: ', mainBalance);
    if (mainBalance < amount * walletsWithAmount.length) {
        throw new Error('Insufficient balance of mainWallet');
    }

    const txs = await solana.one2multiSendSplToken(tokenAddress, bs58.decode(wallets.mainWallet.privateKey), walletsWithAmount, 4);
    console.log('successfulTxs: ', txs);
    console.log('waiting for 20s... wait for the token balance to be updated.');
    await sleep(20000);
    mainBalance = (await token.getOrCreateAssociatedAccountInfo(mainWallet.publicKey)).amount / solanaWeb3.LAMPORTS_PER_SOL;
    console.log('mainWallet token balance: ', mainBalance);
}

async function collectSplToken(tokenAddress, amount, type = 'part') {
    let walletsWithAmount = [];
    const token = new splToken.Token(solana.connection, new solanaWeb3.PublicKey(tokenAddress), splToken.TOKEN_PROGRAM_ID, null);
    const feePayer = bs58.decode(wallets.gasWallet.privateKey);
    if (type === 'all') {
        walletsWithAmount = await Promise.all(wallets.sonWallets.map(async wallet => {
            const balance = (await token.getOrCreateAssociatedAccountInfo(new solanaWeb3.PublicKey(wallet.publicKey))).amount / solanaWeb3.LAMPORTS_PER_SOL;
            console.log(wallet.publicKey, 'balance:', balance);
            return new AmountOfWallet(bs58.decode(wallet.privateKey), balance);
        }));
    } else if (type === 'part') {
        walletsWithAmount = wallets.sonWallets.map(wallet => {
            return new AmountOfWallet(bs58.decode(wallet.privateKey), amount);
        });
    }

    let mainBalance = (await token.getOrCreateAssociatedAccountInfo(new solanaWeb3.PublicKey(wallets.mainWallet.publicKey))).amount / solanaWeb3.LAMPORTS_PER_SOL;
    console.log('mainWallet token balance: ', mainBalance);
    const txs = await solana.multi2oneSendSplToken(tokenAddress, walletsWithAmount, wallets.mainWallet.publicKey, feePayer);
    console.log('successfulTxs: ', txs);
    console.log('waiting for 20s... wait for the token balance to be updated.');
    await sleep(20000);
    mainBalance = (await token.getOrCreateAssociatedAccountInfo(new solanaWeb3.PublicKey(wallets.mainWallet.publicKey))).amount / solanaWeb3.LAMPORTS_PER_SOL;
    console.log('mainWallet token balance: ', mainBalance);
}

module.exports = {
    createWallets,
    faucet,
    distributeSol,
    colletSol,
    createPrettyAccount,
    distributeSplToken,
    collectSplToken
}