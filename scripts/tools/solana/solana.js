const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const solanaWeb3 = require('@solana/web3.js');
const splToken = require('@solana/spl-token');
const bs58 = require('bs58');
const { sleep, AmountOfWallet } = require('../../utils');

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
async function createWallets(num, type = 'bs58') {
    console.log('createWallets');
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
        const privateKey = bs58.encode(account.secretKey);
        const privateKeyUint8Array = account.secretKey;
        switch (type) {
            case 'bs58':
                wallets.push({ publicKey, privateKey });
                break;
            case 'uint8':
                wallets.push({ publicKey, privateKeyUint8Array });
                break;
            case 'all':
                wallets.push({ publicKey, privateKey, privateKeyUint8Array });
                break;
        }
    }
    return wallets;
}

function createWalletsWithThreads(prefix, suffix, numThreads) {
    if (isMainThread) {
        // 主线程
        const workers = new Array(numThreads).fill(null).map(() => {
            return new Worker(__filename, {
                workerData: { prefix, suffix }
            });
        });
        let total = 0;

        workers.forEach(worker => {
            worker.on('message', (message) => {
                if (message.type === 'wallet') {
                    console.log('\nFound wallet:', message.data);
                    process.exit(0);
                } else if (message.type === 'num') {
                    total += message.data;
                    process.stdout.write(`\r已经生成地址数: ${total}`);
                }
            });
            worker.on('error', console.error);
        });
    } else {
        // 工作线程
        let counter = 0;
        let reportNum = 100;
        while (true) {
            const account = solanaWeb3.Keypair.generate();
            const publicKey = account.publicKey.toBase58();
            if (++counter % reportNum === 0) {
                parentPort.postMessage({ type: 'num', data: reportNum });
            }
            if ((workerData.prefix === undefined || workerData.prefix.trim() === '' || publicKey.startsWith(workerData.prefix)) && (workerData.suffix === undefined || workerData.suffix.trim() === '' || publicKey.endsWith(workerData.suffix))) {
                const privateKeyBase58 = bs58.encode(account.secretKey);
                const privateKeyUint8Array = account.secretKey;
                parentPort.postMessage({ type: 'wallet', data: { publicKey, privateKeyBase58, privateKeyUint8Array } });
            }
        }
    }
}

/**
 * 
 * @param {*} publicKey solana钱包公钥
 * @returns 返回为sol余额 1 sol = 10^9 lamports
 */
async function getSolBalance(publicKey) {
    const balance = await connection.getBalance(new solanaWeb3.PublicKey(publicKey));
    return balance / solanaWeb3.LAMPORTS_PER_SOL;
}

/**
 * 
 * @param {*} fromPrivateKey 发送者私钥
 * @param {*} toPublicKeys 接收者公钥以及对应的数量，List<AmountOfWallet>
 * @param {*} bacthSize 单条交易发送的地址数量，默认为10
 * @returns 
 */
async function one2multiSendSol(fromPrivateKey, toPublicKeys, bacthSize = 10) {
    if (!Array.isArray(toPublicKeys)) {
        throw new Error('toPublicKeys must be an array');
    }
    toPublicKeys.forEach(item => {
        if (!(item instanceof AmountOfWallet)) {
            throw new Error('Each item in toPublicKeys must be an instance of AmountOfWallet');
        }
    });
    // 单条交易有字节上限，因此限制一条交易中最多发送sol给10个地址
    if (bacthSize > 10) {
        throw new Error('bacthSize must be less than 10');
    }
    const sender = solanaWeb3.Keypair.fromSecretKey(new Uint8Array(fromPrivateKey));
    let num = bacthSize;
    let transaction = new solanaWeb3.Transaction();
    let txs = [];
    let toPubkeys = [];

    for (const item of toPublicKeys) {
        const toAccount = new solanaWeb3.PublicKey(item.wallet);
        toPubkeys.push(item.wallet);
        transaction.add(solanaWeb3.SystemProgram.transfer({
            fromPubkey: sender.publicKey,
            toPubkey: toAccount,
            lamports: item.amount * 1000000000
        }));
        num--;
        if (num === 0) {
            try {
                const signature = await solanaWeb3.sendAndConfirmTransaction(connection, transaction, [sender]);
                console.log('send sol to multi wallet:', toPubkeys, 'successed,', 'transaction:', signature);
                txs.push(signature);
            } catch (error) {
                console.error('send sol to multi wallet:', toPubkeys, 'failed');
            }
            transaction = new solanaWeb3.Transaction();
            num = bacthSize;
            toPubkeys = [];
        }
    }
    if (num > 0 && num < bacthSize) {
        try {
            const signature = await solanaWeb3.sendAndConfirmTransaction(connection, transaction, [sender]);
            console.log('send sol to multi wallet:', toPubkeys, 'successed,', 'transaction:', signature);
            txs.push(signature);
        } catch (error) {
            console.error('send sol to multi wallet:', toPubkeys, 'failed');
        }
    }
    return txs;
}

/**
 * 
 * @param {*} fromPrivateKeys 发送者私钥以及对应发送数量
 * @param {*} toPublicKey 接收者公钥
 * @param {*} feePayer 支付gas费用的私钥
 * @param {*} bacthSize 单条交易发送的地址数量，默认为10
 * @returns 
 */
async function multi2oneSendSol(fromPrivateKeys, toPublicKey, feePayer, bacthSize = 8) {
    if (!Array.isArray(fromPrivateKeys)) {
        throw new Error('fromPrivateKeys must be an array');
    }
    if (fromPrivateKeys.length === 0) {
        throw new Error('fromPrivateKeys must not be empty');
    }
    // 单条交易有字节上限，因此限制一条交易中最多从8个地址发送sol
    if (bacthSize > 8) {
        throw new Error('bacthSize must be less than 10');
    }
    fromPrivateKeys.forEach(item => {
        if (!(item instanceof AmountOfWallet)) {
            throw new Error('Each item in fromPrivateKeys must be an instance of AmountOfWallet');
        }
    });
    const receiver = new solanaWeb3.PublicKey(toPublicKey);
    const feePayerAccount = solanaWeb3.Keypair.fromSecretKey(new Uint8Array(feePayer));
    let num = bacthSize;
    let senders = [];
    let transaction = new solanaWeb3.Transaction();
    let txs = [];

    for (const item of fromPrivateKeys) {
        const sender = solanaWeb3.Keypair.fromSecretKey(new Uint8Array(item.wallet));
        transaction.add(solanaWeb3.SystemProgram.transfer({
            fromPubkey: sender.publicKey,
            toPubkey: receiver,
            lamports: item.amount * 1000000000
        }));
        senders.push(sender);
        num--;
        if (num === 0) {
            try {
                const signature = await solanaWeb3.sendAndConfirmTransaction(connection, transaction, [feePayerAccount].concat(senders));
                console.log('collect sol from multi wallet:', senders.map(item => { return item.publicKey.toString(); }), 'successed,', 'transaction:', signature);
                txs.push(signature);
            } catch (error) {
                console.error('collect sol from multi wallet:', senders.map(item => { return item.publicKey.toString(); }), 'failed');
            }
            transaction = new solanaWeb3.Transaction();
            num = bacthSize;
            senders = [];
        }
    }
    if (num > 0 && num < bacthSize) {
        try {
            const signature = await solanaWeb3.sendAndConfirmTransaction(connection, transaction, [feePayerAccount].concat(senders));
            console.log('collect sol from multi wallet:', senders.map(item => { return item.publicKey.toString(); }), 'successed,', 'transaction:', signature);
            txs.push(signature);
        } catch (error) {
            console.error('collect sol from multi wallet:', senders.map(item => { return item.publicKey.toString(); }), 'failed');
        }

    }
    return txs;
}

module.exports = {
    createWallets,
    getSolBalance,
    one2multiSendSol,
    multi2oneSendSol
};