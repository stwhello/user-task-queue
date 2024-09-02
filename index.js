const express = require('express');
const { RateLimiterRedis } = require('rate-limiter-flexible');
const Redis = require('ioredis');
const Queue = require('bull');
const fs = require('fs');
const path = require('path');
const cluster = require('cluster');
const os = require('os');

const logFilePath = path.join(__dirname, 'task_logs.txt');
const redisClient = new Redis();
const app = express();
app.use(express.json());

const rateLimiter = new RateLimiterRedis({
    redis: redisClient,
    keyPrefix: 'rateLimiter',
    points: 20, // 20 tasks per minute
    duration: 60, // per 60 seconds (1 minute)
    blockDuration: 1, // 1 second per request block
});

const taskQueues = {};

function getOrCreateQueue(user_id) {
    if (!taskQueues[user_id]) {
        taskQueues[user_id] = new Queue(user_id, {
            redis: { host: '127.0.0.1', port: 6379 },
        });
    }
    return taskQueues[user_id];
}

async function task(user_id) {
    const logMessage = `${user_id}-task completed at-${Date.now()}\n`;
    fs.appendFile(logFilePath, logMessage, (err) => {
        if (err) throw err;
    });
}

app.post('/process-task', async (req, res) => {
    const { user_id } = req.body;

    try {
        await rateLimiter.consume(user_id);

        const userQueue = getOrCreateQueue(user_id);
        userQueue.add({ user_id });

        userQueue.process(async (job, done) => {
            await task(job.data.user_id);
            done();
        });

        res.status(200).send('Task queued for processing');
    } catch (rateLimiterRes) {
        if (rateLimiterRes instanceof Error) {
            res.status(500).send('Internal server error');
        } else {
            const delay = (rateLimiterRes.msBeforeNext + 1000) || 1000;
            setTimeout(async () => {
                const userQueue = getOrCreateQueue(user_id);
                userQueue.add({ user_id });
            }, delay);

            res.status(429).send('Rate limit exceeded. Task will be processed shortly.');
        }
    }
});

const PORT = process.env.PORT || 3000;

if (cluster.isMaster) {
    const numCPUs = os.cpus().length;

    for (let i = 0; i < 2; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
        cluster.fork();
    });
} else {
    app.listen(PORT, () => {
        console.log(`Worker ${process.pid} started`);
    });
}
