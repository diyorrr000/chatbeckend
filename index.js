require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const User = require('./models/User');
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Will restrict to frontend URL on deploy
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app')
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// --- REST API ROUTES ---

// Create User
app.post('/api/users', async (req, res) => {
    try {
        const { firstName, lastName, username, email } = req.body;
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ message: "Username already taken." });

        const newUser = new User({ firstName, lastName, username, email });
        await newUser.save();
        res.status(201).json(newUser);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get User by ID (Search)
app.get('/api/users/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: "User not found." });
        res.json(user);
    } catch (error) {
        res.status(400).json({ message: "Invalid User ID format." });
    }
});

// Get Message History
app.get('/api/messages/:user1/:user2', async (req, res) => {
    try {
        const { user1, user2 } = req.params;
        const messages = await Message.find({
            $or: [
                { senderId: user1, receiverId: user2 },
                { senderId: user2, receiverId: user1 }
            ]
        }).sort({ timestamp: 1 });
        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get Chat List (Active Conversations)
app.get('/api/chats/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const messages = await Message.find({
            $or: [{ senderId: userId }, { receiverId: userId }]
        }).sort({ timestamp: -1 });

        const chatPartners = new Set();
        const uniqueChats = [];

        for (const msg of messages) {
            const partnerId = msg.senderId.toString() === userId ? msg.receiverId.toString() : msg.senderId.toString();
            if (!chatPartners.has(partnerId)) {
                chatPartners.add(partnerId);
                const partner = await User.findById(partnerId);
                uniqueChats.push({
                    partner,
                    lastMessage: msg.text,
                    timestamp: msg.timestamp
                });
            }
        }
        res.json(uniqueChats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- SOCKET.IO REAL-TIME ---

io.on('connection', (socket) => {
    console.log('User Connected:', socket.id);

    socket.on('join', (userId) => {
        socket.join(userId);
        console.log(`User joined: ${userId}`);
    });

    socket.on('send_message', async (data) => {
        const { senderId, receiverId, text } = data;
        const newMessage = new Message({ senderId, receiverId, text });
        await newMessage.save();

        // Emit to both sender and receiver
        io.to(receiverId).emit('receive_message', newMessage);
        io.to(senderId).emit('receive_message', newMessage);
    });

    socket.on('disconnect', () => {
        console.log('User Disconnected');
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
