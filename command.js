const { Command } = require('commander');
const program = new Command();
const solanaJs = require('./scripts/chain/solana/main.js');

const solana = program.command('solana');

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

program.parse(process.argv);