const express = require('express');
const mqtt = require('mqtt');
const cors = require('cors');
const mysql = require('mysql');

const app = express();
const port = 3001;

// 中间件
app.use(cors());
app.use(express.json());

// MQTT 代理连接
const client = mqtt.connect('mqtt://172.6.0.240:1883');

// MySQL 数据库连接
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'itcast'
});

db.connect((err) => {
    if (err) throw err;
    console.log('Connected to MySQL database');
});

let sensorData = {};
let operationLogs = [];


//订阅sensor/data,control/movement
client.on('connect', () => {
    console.log('Connected to MQTT broker');
    client.subscribe('sensor/data', (err) => {
        if (err) {
            console.error('Failed to subscribe to sensor/data:', err);
        }
    });
    client.subscribe('control/movement', (err) => {
        if (err) {
            console.error('Failed to subscribe to control/movement:', err);
        }
    });
});



client.on('message', (topic, message) => {
    // 解析传感器数据--->device_status
    if (topic === 'sensor/data') {
        const data = message.toString();
        console.log(data);
        const [temperature, pressure, depth] = data.split(', ').map(item => {
            const value = item.split(': ')[1];
            return parseFloat(value);
        });
        sensorData = { temperature, pressure, depth };
        
        const timestamp = new Date();
        db.query('INSERT INTO device_status (temperature, pressure, depth, timestamp) VALUES (?, ?, ?, ?)', 
            [temperature, pressure, depth, timestamp], (err) => {
                if (err) {
                    console.error('Failed to log device status:', err);
                }
        });
    }
    // 控制指令--->operation_logs
    if (topic === 'control/movement') {
        const command = message.toString();
        console.log(`Received movement command: ${command}`);
        
        const timestamp = new Date();
        operationLogs.push({ command, timestamp });
        db.query('INSERT INTO operation_logs (command, timestamp) VALUES (?, ?)', [command, timestamp], (err) => {
            if (err) {
                console.error('Failed to log operation:', err);
            }
        });
    }
});

//get,传回传感器数据
app.get('/data', (req, res) => {
    res.json(sensorData);
});

//get,传回操作日志
app.get('/logs', (req, res) => {
    db.query('SELECT * FROM operation_logs ORDER BY timestamp DESC', (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Database query failed' });
        }
        res.json(results);
    });
});

//post控制指令
app.post('/control', (req, res) => {
    const { direction } = req.body;
    client.publish('control/movement', direction);
    // console.log(direction);
    res.json({ success: true, message: `Command "${direction}" sent` });
});

//get历史
app.get('/history', (req, res) => {
    const page = parseInt(req.query.page) || 1; 
    const limit = parseInt(req.query.limit) || 10; 
    const offset = (page - 1) * limit; 

    db.query('SELECT COUNT(*) AS total FROM device_status', (err, totalResults) => {
        if (err) {
            return res.status(500).json({ error: 'Database query failed' });
        }
        const total = totalResults[0].total;

        db.query('SELECT * FROM device_status ORDER BY timestamp DESC LIMIT ? OFFSET ?', [limit, offset], (err, results) => {
            if (err) {
                return res.status(500).json({ error: 'Database query failed' });
            }
            res.json({ records: results, total }); // 返回记录和总数
        });
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
