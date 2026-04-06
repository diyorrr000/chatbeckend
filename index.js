const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

// --- HEALTH CHECK ---
app.get('/ping', (req, res) => {
    res.send('Server is alive! 🚀');
});

// --- FILE STORAGE LOGIC ---
const USERS_FILE = path.join(__dirname, 'users.json');
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

const initFile = (filePath, initialData) => {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2));
    }
};
initFile(USERS_FILE, []);
initFile(MESSAGES_FILE, []);

const readData = (filePath) => JSON.parse(fs.readFileSync(filePath));
const writeData = (filePath, data) => fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

// --- QISQA ID GENERATOR (6 tali raqam) ---
const generateShortId = () => {
    const first = Math.floor(100 + Math.random() * 900);
    const second = Math.floor(100 + Math.random() * 900);
    return `${first}-${second}`;
};

// --- REST API ROUTES ---

app.post('/api/users', (req, res) => {
    try {
        const { firstName, lastName, username, email } = req.body;
        let users = readData(USERS_FILE);

        if (users.find(u => u.username === username)) {
            return res.status(400).json({ message: "Username band!" });
        }

        const newUser = {
            _id: generateShortId(), // Yangi qisqa ID
            firstName,
            lastName,
            username,
            email,
            createdAt: new Date()
        };
        users.push(newUser);
        writeData(USERS_FILE, users);
        res.status(201).json(newUser);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/users/:id', (req, res) => {
    const users = readData(USERS_FILE);
    const user = users.find(u => u._id === req.params.id);
    if (!user) return res.status(404).json({ message: "User topilmadi!" });
    res.json(user);
});

app.get('/api/messages/:user1/:user2', (req, res) => {
    const { user1, user2 } = req.params;
    const messages = readData(MESSAGES_FILE);
    const chatHistory = messages.filter(msg =>
        (msg.senderId === user1 && msg.receiverId === user2) ||
        (msg.senderId === user2 && msg.receiverId === user1)
    );
    res.json(chatHistory);
});

app.get('/api/chats/:userId', (req, res) => {
    const { userId } = req.params;
    const allMessages = readData(MESSAGES_FILE);
    const users = readData(USERS_FILE);

    const userMessages = allMessages.filter(msg => msg.senderId === userId || msg.receiverId === userId)
        .reverse();

    const chatPartners = new Set();
    const uniqueChats = [];

    for (const msg of userMessages) {
        const partnerId = msg.senderId === userId ? msg.receiverId : msg.senderId;
        if (!chatPartners.has(partnerId)) {
            chatPartners.add(partnerId);
            const partner = users.find(u => u._id === partnerId);
            if (partner) {
                uniqueChats.push({ partner, lastMessage: msg.text, timestamp: msg.timestamp });
            }
        }
    }
    res.json(uniqueChats);
});

// --- SOCKET.IO REAL-TIME ---

io.on('connection', (socket) => {
    socket.on('join', (userId) => {
        socket.join(userId);
    });

    socket.on('send_message', (data) => {
        const { senderId, receiverId, text } = data;
        const allMessages = readData(MESSAGES_FILE);

        const newMessage = {
            senderId,
            receiverId,
            text,
            timestamp: new Date()
        };
        allMessages.push(newMessage);
        writeData(MESSAGES_FILE, allMessages);

        io.to(receiverId).emit('receive_message', newMessage);
        io.to(senderId).emit('receive_message', newMessage);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Short-ID Server running on port ${PORT}`));
