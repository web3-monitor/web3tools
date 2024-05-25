const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const fetch = require('cross-fetch');
const { Wallet } = require('@project-serum/anchor');
const bs58 = require('bs58');
const wallets = require('./wallets.json');

// 使用的是主网的 rpc 地址，建议使用付费rpc或者自建rpc节点
// 推荐rpc厂商: quicknode: https://www.quicknode.com/?via=whfyy
const connection = new Connection('https://api.mainnet-beta.solana.com/');

const wallet = Keypair.fromSecretKey(bs58.decode(wallets.mainWallet.privateKey));
const SOL_MINT = 'So11111111111111111111111111111111111111112';

/**
 *  使用jupiter v6进行交易
 * @param {*} inputMint 输入币种
 * @param {*} outputMint 输出币种
 * @param {*} amount 输入币种的数量（1sol 是 1000000000， 1usdc 是 1000000，需要注意不同币种的decimal）
 * @param {*} slippageBps 滑点，1 就是 0.01%（万分之一）的滑点
 */
async function swap(inputMint, outputMint, amount, slippageBps) {
    const quoteResponse = await (await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`)).json();
    console.log(quoteResponse);

    // get serialized transactions for the swap
    const { swapTransaction } = await (
        await fetch('https://quote-api.jup.ag/v6/swap', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                quoteResponse,
                userPublicKey: wallet.publicKey.toString(),
                wrapAndUnwrapSol: true,
            })
        })
    ).json();
    // deserialize the transaction
    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    transaction.sign([wallet]);
    const rawTransaction = transaction.serialize()
    const txid = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
        maxRetries: 2
    });

    const commitment = 'finalized'; // 或者 'confirmed' 或者 'processed'
    const confirmationStatus = await connection.confirmTransaction(txid, commitment);
    if (confirmationStatus.value !== null) {
        console.log('Transaction was confirmed');
    } else {
        console.log('Transaction was not confirmed');
    }
    return txid;
}

module.exports = {
    swap
}

// 测试交易：https://solscan.io/tx/3c97Wjw6jqxk46Au4HnjuDSbg253nTyZF3UNypVMniWHxxoLpwF73BYW9FGEhXixEgoZAyCDAs22ijZPUbqVuYbX
// Swapping SOL to USDC with input 0.01 SOL and 0.5% slippage
// swap(SOL_MINT, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 10000000, 50)


//测试交易：https://solscan.io/tx/A6KHf6aXEt7CC3gPJym6PCaTvGkSsd82niwtgbEFYY9dThinmneG7XzB5FZjTvVGwVNfHkFaLrcx9eYGVkMZBv4
// Swapping USDC to SOL with input 1 USDC and 0.5% slippage
// swap('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', SOL_MINT, 1000000, 50)