const { Command } = require('commander');
const program = new Command();
const solanaJs = require('./scripts/chain/solana/main.js');

const solana = program.command('solana');

solana
    .command('faucet')
    .description('faucet, get test SOL from testnet/devnet faucet')
    .action(async () => {
        try {
            await solanaJs.faucet();
        } catch (error) {
            console.error(error);
        }
    });

solana
    .command('create <num> [type]')
    .description('create wallets')
    .action(async (num, type = 'bs58') => {
        try {
            await solanaJs.createWallets(num, type);
        } catch (error) {
            console.error(error);
        }
    });

solana
    .command('createPretty <prefix> <suffix> <numThreads>')
    .description('create pretty accounts')
    .action(async (prefix, suffix, numThreads) => {
        try {
            await solanaJs.createPrettyAccount(prefix, suffix, numThreads);
        } catch (error) {
            console.error(error);
        }
    });

solana
    .command('distribute <amount>')
    .description('distribute SOL to sonWallets')
    .action(async (amount) => {
        try {
            await solanaJs.distributeSol(amount);
        } catch (error) {
            console.error(error);
        }
    });

solana
    .command('collect <amount> [type]')
    .description('collect SOL from sonWallets, type defaults to "part" if not provided.')
    .action(async (amount, type = 'part') => {
        try {
            await solanaJs.colletSol(amount, type);
        } catch (error) {
            console.error(error);
        }
    });

solana
    .command('distributeSpl <tokenAddress> <amount>')
    .description('distribute SPL token to sonWallets')
    .action(async (tokenAddress, amount) => {
        try {
            await solanaJs.distributeSplToken(tokenAddress, amount);
        } catch (error) {
            console.error(error);
        }
    });


solana
    .command('collectSpl <tokenAddress> <amount> [type]')
    .description('collect SPL token from sonWallets, type defaults to "part" if not provided.')
    .action(async (tokenAddress, amount, type = 'part') => {
        try {
            await solanaJs.collectSplToken(tokenAddress, amount, type);
        } catch (error) {
            console.error(error);
        }
    });

solana
    .command('createSplTokenAccount <tokenAddress>')
    .description('create spl Token address')
    .action(async (tokenAddress) => {
        try {
            await solanaJs.createSplTokenAccount(tokenAddress);
        } catch (error) {
            console.error(error);
        }
    });

solana
    .command('closeSplTokenAccount <tokenAddress>')
    .description('close spl Token address to resume sol to mainWallet')
    .action(async (tokenAddress) => {
        try {
            await solanaJs.closeAccount(tokenAddress);
        } catch (error) {
            console.error(error);
        }
    });






program.parse(process.argv);