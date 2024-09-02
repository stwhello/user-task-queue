# user-task-queue
# Node.js Task Queuing with Rate Limiting

## Setup
1. Install dependencies: `npm install`
2. Ensure Redis is running on your machine.
3. Start the server: `node index.js`

## API Route
- POST `/process-task`
- Body: `{ "user_id": "123" }`

## Notes
- Rate limit: 1 task per second, 20 tasks per minute per user.
- Exceeding requests will be queued and processed accordingly.
