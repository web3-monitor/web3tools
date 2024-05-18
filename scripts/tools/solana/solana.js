const solanaWeb3 = require('@solana/web3.js');
const splToken = require('@solana/spl-token');
const bs58 = require('bs58');
const { sleep, AmountOfAddress } = require('../../utils');

// 获取配置文件以及设置rpc网络
const config = require('./config.json');
const rpcUrl = config[config.enableNetwork];
console.log(`Connecting to ${config.enableNetwork}  ${rpcUrl}`);
const connection = new solanaWeb3.Connection(rpcUrl);

/**
 * 
 * @param {*} num 生成钱包的数量
 * @param {*} type 生成私钥的类型, bs58或者uint8或者all, 默认为bs58
 */
async function createWallets(num, type = 'bs58'){
    // 校验参数
    if (!Number.isInteger(num)) {
        throw new Error('num must be an integer');
    }
    if (type !== 'bs58' && type !== 'uint8' && type !== 'all') {
        throw new Error('type must be bs58 or uint8 or all');
    }
    let wallets = [];

    for (let i = 0; i < num; i++) {
        const account = solanaWeb3.Keypair.generate();
        const publicKey = account.publicKey.toBase58();
        const privateKeyBase58 = bs58.encode(account.secretKey);
        const privateKeyUint8Array = account.secretKey;
        switch (type) {
            case 'bs58':
                wallets.push({ publicKey, privateKeyBase58 });
                break;
            case 'uint8':
                wallets.push({ publicKey, privateKeyUint8Array });
                break;
            case 'all':
                wallets.push({ publicKey, privateKeyBase58, privateKeyUint8Array });
                break;
        }
    }
    return accounts;
}

/**
 * 
 * @param {*} publicKey solana钱包公钥
 * @returns 返回为sol余额 1 sol = 10^9 lamports
 */
async function getSolBalance(publicKey) {
    const balance = await connection.getBalance(new solanaWeb3.PublicKey(publicKey));
    return balance/solanaWeb3.LAMPORTS_PER_SOL;
}

/**
 * 
 * @param {*} fromPrivateKey 发送者私钥
 * @param {*} toPublicKeys 接收者公钥以及对应的数量，List<AmountOfAddress>
 * @param {*} bacthSize 单条交易发送的地址数量，默认为10
 * @returns 
 */
async function one2multiSendSol(fromPrivateKey, toPublicKeys, bacthSize = 10) {
    if (!Array.isArray(toPublicKeys)) {
        throw new Error('toPublicKeys must be an array');
    }
    toPublicKeys.forEach(item => {
        if (!(item instanceof AmountOfAddress)) {
            throw new Error('Each item in toPublicKeys must be an instance of AmountOfAddress');
        }
    });
    // 单条交易有字节上限，因此限制一条交易中最多发送sol给10个地址
    if (bacthSize > 10){
        throw new Error('bacthSize must be less than 10');
    }
    const sender = solanaWeb3.Keypair.fromSecretKey(new Uint8Array(senderSecretKey));
    let num = bacthSize;
    let transaction = new solanaWeb3.Transaction();
    let txs = [];

    for(const item of toPublicKeys){
        const toAccount = new solanaWeb3.PublicKey(item.address);
        transaction.add(solanaWeb3.SystemProgram.transfer({
            fromPubkey: sender.publicKey,
            toPubkey: toAccount,
            lamports: item.amount * 1000000000
        }));
        num--;
        if (num === 0){
            const signature = await solanaWeb3.sendAndConfirmTransaction(connection, transaction, [sender]);
            txs.push(signature);
            transaction = new solanaWeb3.Transaction();
            num = bacthSize;
        }
    }
    if (num > 0){
        const signature = await solanaWeb3.sendAndConfirmTransaction(connection, transaction, [sender]);
        txs.push(signature);
    }
    return txs;
}

/**
 * 
 * @param {*} fromPrivateKeys 发送者私钥已经对应发送数量
 * @param {*} toPublicKey 接收者公钥
 * @param {*} feePayer 支付gas费用的私钥
 * @param {*} bacthSize 单条交易发送的地址数量，默认为10
 * @returns 
 */
async function multi2oneSendSol(fromPrivateKeys, toPublicKey, feePayer, bacthSize = 10) {
    if (!Array.isArray(fromPrivateKeys)) {
        throw new Error('fromPrivateKeys must be an array');
    }
    if (fromPrivateKeys.length === 0) {
        throw new Error('fromPrivateKeys must not be empty');
    }
    fromPrivateKeys.forEach(item => {
        if (!(item instanceof AmountOfAddress)) {
            throw new Error('Each item in fromPrivateKeys must be an instance of AmountOfAddress');
        }
    });
    const receiver = new solanaWeb3.PublicKey(toPublicKey);
    const feePayerAccount = solanaWeb3.Keypair.fromSecretKey(new Uint8Array(feePayer));
    let num = bacthSize;
    let senders = [];
    let transaction = new solanaWeb3.Transaction();
    let txs = [];

    for(const item of fromPrivateKeys){
        const sender = solanaWeb3.Keypair.fromSecretKey(new Uint8Array(item.privateKeyUint8Array));
        transaction.add(solanaWeb3.SystemProgram.transfer({
            fromPubkey: sender.publicKey,
            toPubkey: receiver,
            lamports: item.amount * 1000000000
        }));
        senders.push(sender);
        num--;
        if (num === 0){
            const signature = await solanaWeb3.sendAndConfirmTransaction(connection, transaction, [feePayerAccount].concat(senders));
            txs.push(signature);
            transaction = new solanaWeb3.Transaction();
            num = bacthSize;
        }
    }
    if (num > 0){
        const signature = await solanaWeb3.sendAndConfirmTransaction(connection, transaction, [feePayerAccount].concat(senders));
        txs.push(signature);
    }
    return txs;
}
