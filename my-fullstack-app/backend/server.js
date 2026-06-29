// This is the backend code for the server.js file in a fullstack application. It sets up an Express server and defines routes for handling CRUD operations on tasks.
//Import Express and other necessary modules
const express = require('express');
const bodyParser = require('body-parser');
const promClient = require('prom-client');

// Create an instance of Express
const app = express();

// Use body-parser middleware to parse JSON request bodies
app.use(bodyParser.json());

//Function to return all tasks. Support query params like ?status=, ?search=
app.get('/tasks', (req, res) => {
    const status = req.query.status;
    const search = req.query.search;
    // Logic to return all tasks based on query params. Each task has id, title, description, status, todo, in-progress, done, createdAt, updatedAt
    res.send('All tasks returned');
});
//Function to create a task (POST /tasks. Task has id, title, description, status, todo, in-progress, done, createdAt, updatedAt)
app.post('/tasks', (req, res) => {
    // Logic to create a task
    const inputData = req.body; // Assuming body-parser middleware is used to parse JSON body
    res.send('Task created');
});

//Function to update a task (PATCH /tasks/:id)
app.patch('/tasks/:id', (req, res) => {
    const taskId = req.params.id;
    // Logic to update a task
    res.send(`Task ${taskId} updated`);
});

//Function to delete a task (DELETE /tasks/:id)
app.delete('/tasks/:id', (req, res) => {
    const taskId = req.params.id;
    // Logic to delete a task
    res.send(`Task ${taskId} deleted`);
});

//Function for Prometheus metrics. This function sets up a Prometheus client to collect metrics about the HTTP requests made to the server. It creates a counter for the total number of HTTP requests, broken down by method and status code. It also collects default metrics and exposes a /metrics endpoint that Prometheus can scrape to gather these metrics.
const collectDefaultMetrics = promClient.collectDefaultMetrics;

// Function to returutn metrics in Prometheus format. This function is used to expose the metrics collected by the Prometheus client in a format that Prometheus can understand. It sets the Content-Type header to the appropriate value and returns the metrics data when a GET request is made to the /metrics endpoint.
app.get('/metrics', async (req, res) => {
    res.set('Content-Type', promClient.register.contentType);
    res.end(await promClient.register.metrics());
});

//Function for HTTP request count, broken down by method and status code. This function is a middleware that increments the request counter for each HTTP request made to the server. It listens for the 'finish' event on the response object and increments the counter with the method and status code of the request.
app.use((req, res, next) => {
    res.on('finish', () => {
        requestCounter.inc({ method: req.method, status: res.statusCode });
    });
    next();
});

//Function for HTTP request duration histogram, broken down by method and status code. This function is a middleware that measures the duration of each HTTP request made to the server. It uses a histogram to record the duration, broken down by method and status code. It listens for the 'finish' event on the response object and records the duration of the request in the histogram.
app.use((req, res, next) => {
    const end = requestDurationHistogram.startTimer();
    res.on('finish', () => {
        end({ method: req.method, status: res.statusCode });
    });
    next();
});

//Function for current number of tasks per status (gauge). This function is a middleware that tracks the current number of tasks in each status (e.g., todo, in-progress, done) using a gauge metric. It updates the gauge with the current count of tasks for each status whenever a request is made to the server.
const taskStatusGauge = new promClient.Gauge({
    name: 'task_status_count',
    help: 'Current number of tasks per status',
    labelNames: ['status']
});

app.use((req, res, next) => {
    // Logic to update the gauge with the current count of tasks for each status
    // For example, you might query your database to get the counts and then set the gauge values accordingly
    // taskStatusGauge.set({ status: 'todo' }, todoCount);
    // taskStatusGauge.set({ status: 'in-progress' }, inProgressCount);
    // taskStatusGauge.set({ status: 'done' }, doneCount);
    next();
});

// Start the server and listen on the specified port and host
const PORT = 5000;
const HOST = '0.0.0.0';
app.listen(PORT, HOST, () => {
    console.log(`Server is running on http://${HOST}:${PORT}`);
});