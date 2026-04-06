const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

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

// --- IN-MEMORY DATA ---
let users = []; // [{ _id, firstName, lastName, username, email }]
let messages = []; // [{ senderId, receiverId, text, timestamp }]

// Helper to generate IDs
const generateId = () => Math.random().toString(36).substring(2, 11);

// --- REST API ROUTES ---

// Create User
app.post('/api/users', (req, res) => {
    try {
        const { firstName, lastName, username, email } = req.body;
        const existingUser = users.find(u => u.username === username);
        if (existingUser) return res.status(400).json({ message: "Username band!" });

        const newUser = {
            _id: generateId(),
            firstName,
            lastName,
            username,
            email,
            createdAt: new Date()
        };
        users.push(newUser);
        res.status(201).json(newUser);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get User by ID (Search)
app.get('/api/users/:id', (req, res) => {
    const user = users.find(u => u._id === req.params.id);
    if (!user) return res.status(404).json({ message: "User topilmadi!" });
    res.json(user);
});

// Get Message History
app.get('/api/messages/:user1/:user2', (req, res) => {
    const { user1, user2 } = req.params;
    const chatHistory = messages.filter(msg =>
        (msg.senderId === user1 && msg.receiverId === user2) ||
        (msg.senderId === user2 && msg.receiverId === user1)
    );
    res.json(chatHistory);
});

// Get Chat List
app.get('/api/chats/:userId', (req, res) => {
    const { userId } = req.params;
    const userMessages = messages.filter(msg => msg.senderId === userId || msg.receiverId === userId)
        .reverse(); // Newest first

    const chatPartners = new Set();
    const uniqueChats = [];

    for (const msg of userMessages) {
        const partnerId = msg.senderId === userId ? msg.receiverId : msg.senderId;
        if (!chatPartners.has(partnerId)) {
            chatPartners.add(partnerId);
            const partner = users.find(u => u._id === partnerId);
            if (partner) {
                uniqueChats.push({
                    partner,
                    lastMessage: msg.text,
                    timestamp: msg.timestamp
                });
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
        const newMessage = {
            senderId,
            receiverId,
            text,
            timestamp: new Date()
        };
        messages.push(newMessage);

        io.to(receiverId).emit('receive_message', newMessage);
        io.to(senderId).emit('receive_message', newMessage);
    });
});

const PORT = 5000;
server.listen(PORT, () => console.log(`🚀 No-DB Server running on port ${PORT}`));
