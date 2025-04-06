const startBot = require('./bot');

async function main() {
    try {
        await startBot();
        console.log('Bot started successfully!');
    } catch (error) {
        console.error('Failed to start bot:', error);
        process.exit(1);
    }
}

main();