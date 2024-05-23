const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const solanaWeb3 = require('@solana/web3.js');
const splToken = require('@solana/spl-token');
const bs58 = require('bs58');
const { sleep, AmountOfWallet } = require('../../utils');

// 获取配置文件以及设置rpc网络
const config = require('./config.json');
const { Signer } = require('crypto');
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

/**
 * 
 * @param {*} prefix 前缀
 * @param {*} suffix 后缀
 * @param {*} numThreads 线程数量
 */
function createPrettyAccount(prefix, suffix, numThreads) {
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


async function sendTransaction(transaction, sender, receiver, txs, feePayer = []) {
    try {
        const signers = Array.isArray(sender) ? feePayer.concat(sender) : feePayer.concat([sender]);
        const signature = await solanaWeb3.sendAndConfirmTransaction(connection, transaction, signers);
        if (Array.isArray(sender)) {
            console.log('send from wallets:', sender.map(item => { return item.publicKey.toString(); }), 'to wallet:', receiver, 'successed,', 'transaction:', signature);
        } else {
            console.log('send from wallet:', sender.publicKey.toString(), 'to wallets:', receiver, 'successed,', 'transaction:', signature);
        }
        txs.push(signature);
    } catch (error) {
        if (Array.isArray(sender)) {
            console.log('send from wallets:', sender.map(item => { return item.publicKey.toString(); }), 'to wallet:', receiver, 'failed');
        } else {
            console.log('send from wallet:', sender.publicKey.toString(), 'to wallets:', receiver, 'failed');
        }
    }
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
    if (bacthSize > 10) {
        throw new Error('bacthSize must be less than 10');
    }
    const sender = solanaWeb3.Keypair.fromSecretKey(new Uint8Array(fromPrivateKey));
    let num = bacthSize;
    let transaction = new solanaWeb3.Transaction();
    let txs = [];
    let toPubkeys = [];
    let promises = [];

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
            promises.push(sendTransaction(transaction, sender, toPubkeys, txs));
            transaction = new solanaWeb3.Transaction();
            num = bacthSize;
            toPubkeys = [];
        }
    }
    if (num > 0 && num < bacthSize) {
        promises.push(sendTransaction(transaction, sender, toPubkeys, txs));
    }
    await Promise.all(promises);
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
    if (bacthSize > 8) {
        throw new Error('bacthSize must be less than 8');
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
    let promises = [];

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
            promises.push(sendTransaction(transaction, senders, toPublicKey, txs, [feePayerAccount]));
            transaction = new solanaWeb3.Transaction();
            num = bacthSize;
            senders = [];
        }
    }
    if (num > 0 && num < bacthSize) {
        promises.push(sendTransaction(transaction, senders,toPublicKey, txs, [feePayerAccount]));
    }
    await Promise.all(promises);
    return txs;
}

async function one2multiSendSplToken(tokenAddress, fromPrivateKey, toPublicKeys, bacthSize = 10) {
    if (!Array.isArray(toPublicKeys)) {
        throw new Error('toPublicKeys must be an array');
    }
    toPublicKeys.forEach(item => {
        if (!(item instanceof AmountOfWallet)) {
            throw new Error('Each item in toPublicKeys must be an instance of AmountOfWallet');
        }
    });
    if (bacthSize > 10) {
        throw new Error('bacthSize must be less than 10');
    }
    const sender = solanaWeb3.Keypair.fromSecretKey(new Uint8Array(fromPrivateKey));
    const token = new splToken.Token(connection, new solanaWeb3.PublicKey(tokenAddress), splToken.TOKEN_PROGRAM_ID, sender);
    const senderTokenAccountInfo = await token.getOrCreateAssociatedAccountInfo(sender.publicKey);
    let num = bacthSize;
    let transaction = new solanaWeb3.Transaction();
    let txs = [];
    let toPubkeys = [];
    let promises = [];

    for (const item of toPublicKeys) {
        const toAccount = new solanaWeb3.PublicKey(item.wallet);
        const toAccountTokenAccountInfo = await token.getOrCreateAssociatedAccountInfo(toAccount);
        toPubkeys.push(item.wallet);
        transaction.add(
            splToken.Token.createTransferInstruction(
                splToken.TOKEN_PROGRAM_ID,
                senderTokenAccountInfo.address,
                toAccountTokenAccountInfo.address,
                sender.publicKey,
                [],
                solanaWeb3.LAMPORTS_PER_SOL * item.amount
            )
        )
        num--;
        if (num === 0) {
            promises.push(sendTransaction(transaction, sender, toPubkeys, txs));
            transaction = new solanaWeb3.Transaction();
            num = bacthSize;
            toPubkeys = [];
        }
    }
    if (num > 0 && num < bacthSize) {
        promises.push(sendTransaction(transaction, sender, toPubkeys, txs));
    }
    await Promise.all(promises);
    return txs;
}

async function multi2oneSendSplToken(tokenAddress, fromPrivateKeys, toPublicKey, feePayer, bacthSize = 7) {
    if (!Array.isArray(fromPrivateKeys)) {
        throw new Error('fromPrivateKeys must be an array');
    }
    if (fromPrivateKeys.length === 0) {
        throw new Error('fromPrivateKeys must not be empty');
    }
    if (bacthSize > 7) {
        throw new Error('bacthSize must be less than 7');
    }
    fromPrivateKeys.forEach(item => {
        if (!(item instanceof AmountOfWallet)) {
            throw new Error('Each item in fromPrivateKeys must be an instance of AmountOfWallet');
        }
    });
    const toAccount = (await splToken.Token.getAssociatedTokenAddress(splToken.ASSOCIATED_TOKEN_PROGRAM_ID, splToken.TOKEN_PROGRAM_ID, new solanaWeb3.PublicKey(tokenAddress), new solanaWeb3.PublicKey(toPublicKey)));
    const feePayerAccount = solanaWeb3.Keypair.fromSecretKey(new Uint8Array(feePayer));

    let num = bacthSize;
    let senders = [];
    let transaction = new solanaWeb3.Transaction();
    let txs = [];
    let promises = [];

    for (const item of fromPrivateKeys) {
        const sender = solanaWeb3.Keypair.fromSecretKey(new Uint8Array(item.wallet));
        const token = new splToken.Token(connection, new solanaWeb3.PublicKey(tokenAddress), splToken.TOKEN_PROGRAM_ID, sender);
        const senderTokenAccountInfo = await token.getOrCreateAssociatedAccountInfo(sender.publicKey);
        transaction.add(
            splToken.Token.createTransferInstruction(
                splToken.TOKEN_PROGRAM_ID,
                senderTokenAccountInfo.address,
                toAccount,
                sender.publicKey,
                [],
                solanaWeb3.LAMPORTS_PER_SOL * item.amount
            )
        )
        senders.push(sender);
        num--;
        if (num === 0) {
            promises.push(sendTransaction(transaction, senders, toPublicKey, txs, [feePayerAccount]));
            transaction = new solanaWeb3.Transaction();
            num = bacthSize;
            senders = [];
        }
    }
    if (num > 0 && num < bacthSize) {
        promises.push(sendTransaction(transaction, senders, toPublicKey, txs, [feePayerAccount]));
    }
    await Promise.all(promises);
    return txs;
}

async function createSplTokenAccount(tokenAddress, privateKeys) {
    if (!Array.isArray(privateKeys)) {
        throw new Error('privateKeys must be an array');
    }
    if (privateKeys.length === 0) {
        throw new Error('privateKeys must not be empty');
    }

    const tasks = privateKeys.map(item => {
        return new Promise(async (resolve, reject) => {
            const wallet = solanaWeb3.Keypair.fromSecretKey(new Uint8Array(item));
            const token = new splToken.Token(connection, new solanaWeb3.PublicKey(tokenAddress), splToken.TOKEN_PROGRAM_ID, wallet);

            for (let i = 0; i < 5; i++) {
                try {
                    const tokenAccount = await token.getOrCreateAssociatedAccountInfo(wallet.publicKey);
                    console.log('create spl token account:', wallet.publicKey.toBase58(), 'successed,', 'token account:', tokenAccount.address.toBase58());
                    resolve();
                    break;
                } catch (error) {
                    if (i === 4) {
                        reject(error);
                    }
                    console.log(wallet.publicKey.toBase58(), 'retrying...', i + 1);
                }
            }
        });
    });

    await Promise.all(tasks);
}

async function closeAccount(tokenAddress, privateKeys, toAccount) {
    if (!Array.isArray(privateKeys)) {
        throw new Error('privateKeys must be an array');
    }
    if (privateKeys.length === 0) {
        throw new Error('privateKeys must not be empty');
    }
    const token = new splToken.Token(connection, new solanaWeb3.PublicKey(tokenAddress), splToken.TOKEN_PROGRAM_ID, null);

    const tasks = privateKeys.map(item => {
        return new Promise(async (resolve, reject) => {
            const wallet = solanaWeb3.Keypair.fromSecretKey(new Uint8Array(item));
            const walletTokenAcccount = await splToken.Token.getAssociatedTokenAddress(splToken.ASSOCIATED_TOKEN_PROGRAM_ID, splToken.TOKEN_PROGRAM_ID, new solanaWeb3.PublicKey(tokenAddress), wallet.publicKey);

            for (let i = 0; i < 5; i++) {
                try {
                    const tx = splToken.Token.createCloseAccountInstruction(splToken.TOKEN_PROGRAM_ID, walletTokenAcccount, wallet.publicKey, wallet.publicKey, []);
                    tx.feePayer = wallet.publicKey;
                    const signature = await solanaWeb3.sendAndConfirmTransaction(connection, new solanaWeb3.Transaction().add(tx), [wallet]);
                    console.log('close account:', wallet.publicKey.toBase58(), 'successed,', 'transaction:', signature);
                    resolve();
                    break;
                } catch (error) {
                    if (i === 4) {
                        reject(error);
                    }
                    console.log(wallet.publicKey.toBase58(), 'retrying...', i + 1);
                }
            }
        });
    });

    await Promise.all(tasks);
}


async function faucet(publicKey) {
    const tx = await connection.requestAirdrop(new solanaWeb3.PublicKey(publicKey), solanaWeb3.LAMPORTS_PER_SOL);
    return tx;
}


module.exports = {
    createWallets,
    getSolBalance,
    one2multiSendSol,
    multi2oneSendSol,
    faucet,
    createPrettyAccount,
    one2multiSendSplToken,
    multi2oneSendSplToken,
    createSplTokenAccount,
    closeAccount,
    connection
};